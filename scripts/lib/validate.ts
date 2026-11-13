/**
 * 校验引擎：实现 03-DATA-SCHEMA.md §6 的 V1–V15，外加 4 条明确标注的 EXT-* 扩展检查。
 *
 * 设计原则：
 * - 只报错，不改数据（AGENTS.md：`data/` 只读）。
 * - 一条数据只被一个规则认领：`rationale` 缺失不会同时被 V1 和 V4 报两遍。
 * - 每条 finding 都必须能定位到「文件:行号 + 字段路径」。
 */
import {
  AI_KINDS,
  AI_MATURITY,
  AI_READY,
  ARTIFACT_KINDS,
  COVERAGES,
  ECOSYSTEM_KINDS,
  EDGE_KINDS,
  HEADLESS,
  LAYERS,
  LICENSES,
  MAINTAIN_STATUS,
  NODE_PREFIXES,
  NODE_SCHEMAS,
  PLATFORMS,
  PREFIX_BY_TYPE,
  PROVENANCE_REQUIRED_TYPES,
  TOOL_CATEGORIES,
  TRI_LEVELS,
  EdgeSchema,
  type EdgeKind,
  type NodeType,
} from '../../schema/index.js';
import { formatValue, getAt, type Finding } from './finding.js';
import { loadDataDir, type FileKind, type PathKey } from './source.js';
import { charCount } from './text.js';

// ---------------------------------------------------------------------------
// 结果结构
// ---------------------------------------------------------------------------

export interface DomainStat {
  id: string;
  name: string;
  coverage: string;
  tools: number;
  techniques: number;
  artifactCount: number;
}

export interface Stats {
  nodeCount: number;
  edgeCount: number;
  byType: Record<string, number>;
  edgesByKind: Record<string, number>;
  domains: DomainStat[];
  unverified: { flagged: number; total: number; ratio: number };
  sourceMissing: number;
  tldrShort: number;
  danglingRefs: number;
}

export interface ValidateOptions {
  /** 绝对路径 */
  dataDir: string;
  /** 展示相对路径的基准（一般是 process.cwd()） */
  cwd: string;
  /** 判定 V12 的「今天」，测试可注入 */
  today?: Date;
  /** 是否启用 EXT-* 扩展检查（默认启用） */
  extensions?: boolean;
  /** 把指定规则的 error 降级为 warning（应急开关，不改变判断逻辑） */
  downgrade?: ReadonlySet<string>;
}

export interface ValidateResult {
  dataDir: string;
  findings: Finding[];
  errors: Finding[];
  warnings: Finding[];
  stats: Stats;
  files: { relPath: string; kind: FileKind; count: number }[];
  skipped: string[];
  downgraded: Finding[];
}

// ---------------------------------------------------------------------------
// 内部记录
// ---------------------------------------------------------------------------

interface NodeRecord {
  id: string;
  type: NodeType;
  file: string;
  line: number;
  value: Record<string, unknown>;
  lineOf: (p?: readonly PathKey[]) => number;
}

interface EdgeRecord {
  file: string;
  index: number;
  value: Record<string, unknown>;
  lineOf: (p?: readonly PathKey[]) => number;
  from: string | null;
  to: string | null;
  kind: EdgeKind | null;
}

/** 兼容 zod 3/4 的最小 issue 结构，避免绑死某一版类型 */
interface LooseIssue {
  code: string;
  path: (string | number)[];
  message: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// 字段 → 枚举取值（为了把「期望」写成人类能直接对照的清单）
// ---------------------------------------------------------------------------

const ENUM_BY_FIELD: Record<string, readonly string[]> = {
  license: LICENSES,
  platforms: PLATFORMS,
  headless: HEADLESS,
  ai_ready: AI_READY,
  maintain_status: MAINTAIN_STATUS,
  cost: TRI_LEVELS,
  false_positive_risk: TRI_LEVELS,
  coverage: COVERAGES,
  layer: LAYERS,
  maturity: AI_MATURITY,
  category: TOOL_CATEGORIES,
  switch_cost: ['low', 'medium', 'high'],
  kind: EDGE_KINDS, // 边的 kind；节点 kind 由 ENUM_BY_TYPE_FIELD 覆盖
};

const ENUM_BY_TYPE_FIELD: Partial<Record<NodeType, Record<string, readonly string[]>>> = {
  artifact: { kind: ARTIFACT_KINDS },
  ecosystem: { kind: ECOSYSTEM_KINDS },
  ai: { kind: AI_KINDS },
};

const TYPE_LABEL_CN: Record<string, string> = {
  string: '字符串',
  number: '数字',
  boolean: '布尔',
  array: '数组',
  object: '对象',
  null: 'null',
  integer: '整数',
};

/** 取路径上的最后一个字段名（跳过数组下标） */
function fieldOf(p: readonly PathKey[]): string | null {
  for (let i = p.length - 1; i >= 0; i--) {
    const v = p[i];
    if (typeof v === 'string') return v;
  }
  return null;
}

/** 拼字段路径：base + ['platforms', 0] → tool.upx.platforms[0] */
function fieldLocator(base: string, p: readonly PathKey[]): string {
  let s = base;
  for (const seg of p) {
    s += typeof seg === 'number' ? `[${seg}]` : `.${seg}`;
  }
  return s;
}

const slugOf = (id: unknown): string | null => {
  if (typeof id !== 'string') return null;
  const i = id.indexOf(':');
  return i > 0 ? id.slice(i + 1) : null;
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? (v as Record<string, unknown>) : null;

/** 把 Zod issue 翻成「期望 / 实际」两段中文 */
function describeIssue(issue: LooseIssue, actual: unknown, nodeType: NodeType | null): string {
  const field = fieldOf(issue.path);
  // nodeType === null 表示这是 edges 文件
  const enumFromType = nodeType ? ENUM_BY_TYPE_FIELD[nodeType]?.[field ?? ''] : field === 'kind' ? EDGE_KINDS : undefined;
  const enumFromField = field && field !== 'kind' ? ENUM_BY_FIELD[field] : undefined;
  const enumFromIssue = Array.isArray(issue['values']) ? (issue['values'] as unknown[]).map(String) : undefined;
  const enumValues = enumFromType ?? enumFromIssue ?? enumFromField;

  switch (issue.code) {
    case 'invalid_type': {
      if (actual === undefined) {
        return enumValues && enumValues.length > 0 ? `必填，取值 ${enumValues.join(' | ')}` : '必填字段';
      }
      const expected = typeof issue['expected'] === 'string' ? TYPE_LABEL_CN[issue['expected'] as string] ?? String(issue['expected']) : '正确类型';
      return `类型 ${expected}`;
    }
    case 'invalid_value':
    case 'invalid_enum_value': {
      if (enumValues && enumValues.length > 0) return `枚举值之一：${enumValues.join(' | ')}`;
      return '枚举值之一';
    }
    case 'invalid_format':
    case 'invalid_string':
      return issue.message || '格式不符';
    case 'too_small': {
      const min = typeof issue['minimum'] === 'number' ? issue['minimum'] : '?';
      const origin = typeof issue['origin'] === 'string' ? issue['origin'] : '';
      if (origin === 'array') return `≥${min} 项`;
      if (origin === 'string') return `≥${min} 字`;
      return `≥${min}`;
    }
    case 'too_big': {
      const max = typeof issue['maximum'] === 'number' ? issue['maximum'] : '?';
      const origin = typeof issue['origin'] === 'string' ? issue['origin'] : '';
      if (origin === 'array') return `≤${max} 项`;
      if (origin === 'string') return `≤${max} 字`;
      return `≤${max}`;
    }
    case 'unrecognized_keys':
      return '不含未登记字段（§2.6 的 _ 元字段除外）';
    case 'custom':
      return issue.message || '符合规范';
    default:
      return `符合规范（${issue.code}）`;
  }
}

/** 两个日期之间相差的整月数（用于 V12 的「几个月前」显示） */
function monthsBetween(from: Date, to: Date): number {
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return to.getUTCDate() < from.getUTCDate() ? months - 1 : months;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

export function validate(opts: ValidateOptions): ValidateResult {
  const { dataDir, cwd } = opts;
  const today = opts.today ?? new Date();
  const useExt = opts.extensions !== false;

  const findings: Finding[] = [];
  const add = (f: Finding): void => {
    findings.push(f);
  };

  const loaded = loadDataDir(dataDir, cwd);

  // ---- V1：读不了 / 语法错 / 顶层不是数组 ----
  for (const failure of loaded.failures) {
    add({
      rule: 'V1',
      level: 'error',
      file: failure.relPath,
      line: failure.line,
      locator: failure.locator,
      expected: failure.locator === 'file.kind' ? '可推断的文件名（domains.yaml / data/tools/*.yaml）' : '合法 YAML 数组',
      actual: failure.message,
    });
  }

  const nodeIndex = new Map<string, NodeRecord>();
  const nodeRecords: NodeRecord[] = [];
  const edgeRecords: EdgeRecord[] = [];
  const fileSummary: { relPath: string; kind: FileKind; count: number }[] = [];

  for (const file of loaded.files) {
    fileSummary.push({ relPath: file.relPath, kind: file.kind, count: file.items.length });

    for (const item of file.items) {
      const raw = asRecord(item.value);
      if (raw === null) {
        add({
          rule: 'V1',
          level: 'error',
          file: file.relPath,
          line: item.line(),
          locator: file.kind === 'edges' ? `edge[${item.index}]` : `${file.kind}[${item.index}]`,
          expected: '映射（key: value 形式的一条记录）',
          actual: formatValue(item.value),
        });
        continue;
      }

      const base =
        file.kind === 'edges'
          ? `edge[${item.index}]`
          : (() => {
              const slug = slugOf(raw['id']);
              return slug ? `${file.kind}.${slug}` : `${file.kind}#${item.index}`;
            })();

      const schema = file.kind === 'edges' ? EdgeSchema : NODE_SCHEMAS[file.kind];
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues as unknown as LooseIssue[]) {
          const actual = getAt(raw, issue.path);
          add({
            rule: 'V1',
            level: 'error',
            file: file.relPath,
            line: item.line(issue.path),
            locator: fieldLocator(base, issue.path),
            expected: describeIssue(issue, actual, file.kind === 'edges' ? null : file.kind),
            actual: formatValue(actual),
            path: issue.path,
          });
        }
        // 校验失败也要把「能认出来的部分」收进索引：否则一条边缺个字段会连带 from/to 一起消失
      }

      if (file.kind === 'edges') {
        edgeRecords.push({
          file: file.relPath,
          index: item.index,
          value: raw,
          lineOf: item.line,
          from: typeof raw['from'] === 'string' ? raw['from'] : null,
          to: typeof raw['to'] === 'string' ? raw['to'] : null,
          kind: typeof raw['kind'] === 'string' && (EDGE_KINDS as readonly string[]).includes(raw['kind']) ? (raw['kind'] as EdgeKind) : null,
        });
      } else {
        const id = typeof raw['id'] === 'string' ? raw['id'] : null;
        if (id === null) continue; // 没 id 的节点无法入索引，V1 已报
        const rec: NodeRecord = {
          id,
          type: file.kind,
          file: file.relPath,
          line: item.line(),
          value: raw,
          lineOf: item.line,
        };
        nodeRecords.push(rec);
        if (!nodeIndex.has(id)) nodeIndex.set(id, rec);
      }
    }
  }

  // ---- V2：ID 唯一性与命名规范 ----
  const ID_RE = /^(tool|tech|art|dom|con|fmt|atk|eco|ai):([a-z0-9]+(?:-[a-z0-9]+)*)$/;
  const seenIds = new Map<string, NodeRecord>();
  const seenSlugs = new Map<string, NodeRecord>();
  for (const node of nodeRecords) {
    const m = ID_RE.exec(node.id);
    if (!m) {
      add({
        rule: 'V2',
        level: 'error',
        file: node.file,
        line: node.lineOf(['id']),
        locator: `${node.type}.${slugOf(node.id) ?? '?'}.id`,
        expected: `{prefix}:{slug}，prefix ∈ ${NODE_PREFIXES.join('|')}，slug 为小写 kebab-case`,
        actual: formatValue(node.id),
      });
      continue;
    }
    const [, prefix, slug] = m as unknown as [string, string, string];
    const expectPrefix = PREFIX_BY_TYPE[node.type];
    if (prefix !== expectPrefix) {
      add({
        rule: 'V2',
        level: 'error',
        file: node.file,
        line: node.lineOf(['id']),
        locator: `${node.type}.${slug}.id`,
        expected: `${node.type} 的前缀必须是 ${expectPrefix}:`,
        actual: formatValue(node.id),
      });
    }
    const prevId = seenIds.get(node.id);
    if (prevId) {
      // 重复 ID 只报这一条，不再往下查 slug，避免同一条数据被报两遍
      add({
        rule: 'V2',
        level: 'error',
        file: node.file,
        line: node.lineOf(['id']),
        locator: `${node.type}.${slug}.id`,
        expected: '全局唯一（首次出现：见下）',
        actual: `${node.id}（与 ${prevId.file}:${prevId.line} 重复）`,
      });
      continue;
    }
    seenIds.set(node.id, node);

    // §1：「全局唯一（跨类型也不允许重名）」——slug 也不许跨类型撞车
    const prevSlug = seenSlugs.get(slug);
    if (!prevSlug) {
      seenSlugs.set(slug, node);
    } else if (prevSlug.type !== node.type) {
      add({
        rule: 'V2',
        level: 'error',
        file: node.file,
        line: node.lineOf(['id']),
        locator: `${node.type}.${slug}.id`,
        expected: 'slug 跨类型唯一（§1 别名应放 aliases[]，不进 ID）',
        actual: `${node.id} 与 ${prevSlug.id}（${prevSlug.file}:${prevSlug.line}）重名`,
      });
    }
  }

  // ---- V3：边的 from/to 必须存在于节点库 ----
  for (const edge of edgeRecords) {
    for (const side of ['from', 'to'] as const) {
      const ref = edge[side];
      if (ref === null) continue; // 缺字段由 V1 报
      if (!nodeIndex.has(ref)) {
        add({
          rule: 'V3',
          level: 'error',
          file: edge.file,
          line: edge.lineOf([side]),
          locator: `edge[${edge.index}].${side}`,
          expected: '已存在的节点 ID',
          actual: `${formatValue(ref)}（节点库中无此 ID）`,
        });
      }
    }
  }

  // ---- V4–V7：边按 kind 的条件必填 ----
  for (const edge of edgeRecords) {
    const rationale = edge.value['rationale'];
    const rationaleText = typeof rationale === 'string' ? rationale : null;
    const rationaleCount = rationaleText ? charCount(rationaleText) : 0;
    if (rationaleText === null || rationaleText.trim() === '') {
      add({
        rule: 'V4',
        level: 'error',
        file: edge.file,
        line: edge.lineOf(['rationale']),
        locator: `edge[${edge.index}].rationale`,
        expected: '非空且 ≥15 字',
        actual: formatValue(rationale),
      });
    } else if (rationaleCount < 15) {
      add({
        rule: 'V4',
        level: 'error',
        file: edge.file,
        line: edge.lineOf(['rationale']),
        locator: `edge[${edge.index}].rationale`,
        expected: '≥15 字',
        actual: `${rationaleCount} 字：${formatValue(rationaleText)}`,
      });
    }

    if (edge.kind === 'alternative') {
      if (edge.value['switch_cost'] === undefined) {
        add({
          rule: 'V5',
          level: 'error',
          file: edge.file,
          line: edge.lineOf(['switch_cost']),
          locator: `edge[${edge.index}].switch_cost`,
          expected: '必填（low | medium | high）',
          actual: '缺失（undefined）',
        });
      }
      if (edge.value['tradeoff'] === undefined || (typeof edge.value['tradeoff'] === 'string' && edge.value['tradeoff'].trim() === '')) {
        add({
          rule: 'V5',
          level: 'error',
          file: edge.file,
          line: edge.lineOf(['tradeoff']),
          locator: `edge[${edge.index}].tradeoff`,
          expected: '必填：换过去会失去什么（必须具体）',
          actual: formatValue(edge.value['tradeoff']),
        });
      }
    }

    if (edge.kind === 'supersedes') {
      if (edge.value['since'] === undefined) {
        add({
          rule: 'V6',
          level: 'error',
          file: edge.file,
          line: edge.lineOf(['since']),
          locator: `edge[${edge.index}].since`,
          expected: '必填：年份',
          actual: '缺失（undefined）',
        });
      }
      if (edge.value['reason'] === undefined || (typeof edge.value['reason'] === 'string' && edge.value['reason'].trim() === '')) {
        add({
          rule: 'V6',
          level: 'error',
          file: edge.file,
          line: edge.lineOf(['reason']),
          locator: `edge[${edge.index}].reason`,
          expected: '必填：为什么被取代',
          actual: formatValue(edge.value['reason']),
        });
      }
    }

    if (edge.kind === 'upstream') {
      const order = edge.value['order'];
      if (order === undefined || typeof order !== 'number' || !Number.isFinite(order)) {
        add({
          rule: 'V7',
          level: 'error',
          file: edge.file,
          line: edge.lineOf(['order']),
          locator: `edge[${edge.index}].order`,
          expected: '必填：数字（越小越靠前）',
          actual: formatValue(order),
        });
      }
    }
  }

  // ---- 统计准备：边度数、字段引用 ----
  const degree = new Map<string, number>();
  for (const edge of edgeRecords) {
    for (const ref of [edge.from, edge.to]) {
      if (ref && nodeIndex.has(ref)) degree.set(ref, (degree.get(ref) ?? 0) + 1);
    }
  }

  const ID_LOOKING = new RegExp(`^(?:${NODE_PREFIXES.join('|')}):[a-z0-9]+(?:-[a-z0-9]+)*$`);
  const refCount = new Map<string, number>();
  const dangling: { node: NodeRecord; path: PathKey[]; ref: string }[] = [];

  const walkRefs = (v: unknown, p: PathKey[], node: NodeRecord): void => {
    if (typeof v === 'string') {
      if (ID_LOOKING.test(v)) {
        refCount.set(v, (refCount.get(v) ?? 0) + 1);
        if (!nodeIndex.has(v)) dangling.push({ node, path: p, ref: v });
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walkRefs(item, [...p, i], node));
      return;
    }
    const rec = asRecord(v);
    if (rec) {
      for (const [k, child] of Object.entries(rec)) {
        if (k.startsWith('_')) continue; // §2.6 元字段不参与校验
        walkRefs(child, [...p, k], node);
      }
    }
  };
  for (const node of nodeRecords) {
    for (const [k, v] of Object.entries(node.value)) {
      if (k === 'id' || k.startsWith('_')) continue;
      walkRefs(v, [k], node);
    }
  }

  // ---- V8 / V9 / V9b：工具三件套 ----
  let sourceMissing = 0;
  let tldrShort = 0;
  for (const node of nodeRecords) {
    if (PROVENANCE_REQUIRED_TYPES.has(node.type)) {
      const source = node.value['source'];
      const ok = Array.isArray(source) && source.length > 0;
      if (!ok) {
        sourceMissing += 1;
        add({
          rule: 'V9',
          level: 'error',
          file: node.file,
          line: node.lineOf(['source']),
          locator: `${node.type}.${slugOf(node.id) ?? '?'}.source`,
          expected: '≥1 条可访问链接（§4.5 对 tool/ai/ecosystem 强制）',
          actual: formatValue(source),
        });
      }
      const verified = node.value['verified_at'];
      if (verified === undefined) {
        add({
          rule: 'V9b',
          level: 'error',
          file: node.file,
          line: node.lineOf(['verified_at']),
          locator: `${node.type}.${slugOf(node.id) ?? '?'}.verified_at`,
          expected: '必填 YYYY-MM-DD（§4.5 对 tool/ai/ecosystem 强制）',
          actual: '缺失（undefined）',
        });
      }
    }

    if (node.type === 'tool') {
      const tldr = node.value['tldr'];
      if (typeof tldr === 'string') {
        const n = charCount(tldr);
        if (n < 40) {
          tldrShort += 1;
          add({
            rule: 'V8',
            level: 'error',
            file: node.file,
            line: node.lineOf(['tldr']),
            locator: `tool.${slugOf(node.id) ?? '?'}.tldr`,
            expected: '≥40 字',
            actual: `${n} 字：${formatValue(tldr)}`,
          });
        }
      }
    }
  }

  // ---- V10：prerequisite 无环 ----
  {
    const graph = new Map<string, Set<string>>();
    /** "a\u0000b" → 出处，便于把环指到具体行 */
    const origins = new Map<string, { file: string; line: number; locator: string }>();
    const link = (from: string, to: string, origin: { file: string; line: number; locator: string }): void => {
      const set = graph.get(from) ?? new Set<string>();
      set.add(to);
      graph.set(from, set);
      const key = `${from}\u0000${to}`;
      if (!origins.has(key)) origins.set(key, origin);
    };

    for (const edge of edgeRecords) {
      if (edge.kind !== 'prerequisite' || !edge.from || !edge.to) continue;
      link(edge.from, edge.to, { file: edge.file, line: edge.lineOf(['kind']), locator: `edge[${edge.index}]` });
    }
    for (const node of nodeRecords) {
      const prereqs = node.value['prerequisites'];
      if (!Array.isArray(prereqs)) continue;
      prereqs.forEach((p, i) => {
        if (typeof p !== 'string') return;
        link(p, node.id, {
          file: node.file,
          line: node.lineOf(['prerequisites', i]),
          locator: `${node.type}.${slugOf(node.id) ?? '?'}.prerequisites`,
        });
      });
    }

    const reported = new Set<string>();
    const visit = (start: string): void => {
      const stack: string[] = [];
      const onStack = new Set<string>();
      const done = new Set<string>();
      const dfs = (u: string): string[] | null => {
        stack.push(u);
        onStack.add(u);
        for (const v of graph.get(u) ?? []) {
          if (done.has(v)) continue;
          if (onStack.has(v)) {
            const at = stack.indexOf(v);
            return [...stack.slice(at), v];
          }
          const found = dfs(v);
          if (found) return found;
        }
        stack.pop();
        onStack.delete(u);
        done.add(u);
        return null;
      };
      const cycle = dfs(start);
      if (!cycle) return;
      // 去重键用「环上的节点集合」：从 a 出发和从 b 出发会得到同一个环的两种写法
      const key = [...new Set(cycle)].sort().join('\u0000');
      if (reported.has(key)) return;
      reported.add(key);
      const first = cycle[0]!;
      const origin = origins.get(`${cycle[cycle.length - 2]}\u0000${first}`) ?? origins.get(`${first}\u0000${cycle[1]}`) ?? {
        file: nodeIndex.get(first)?.file ?? 'data/',
        line: nodeIndex.get(first)?.line ?? 0,
        locator: first,
      };
      add({
        rule: 'V10',
        level: 'error',
        file: origin.file,
        line: origin.line,
        locator: origin.locator,
        expected: 'prerequisite 无环（拓扑可排序）',
        actual: `环：${cycle.join(' → ')}`,
      });
    };
    for (const key of [...graph.keys()].sort()) visit(key);
  }

  // ---- V11：非 domain 节点不得孤立 ----
  const orphanRefCount = new Map<string, number>();
  for (const node of nodeRecords) {
    if (node.type === 'domain') continue;
    const deg = degree.get(node.id) ?? 0;
    if (deg > 0) continue;
    orphanRefCount.set(node.id, refCount.get(node.id) ?? 0);
  }
  for (const node of nodeRecords) {
    const refs = orphanRefCount.get(node.id);
    if (refs === undefined) continue;
    add({
      rule: 'V11',
      level: 'warning',
      file: node.file,
      line: node.line,
      locator: `${node.type}.${slugOf(node.id) ?? '?'}`,
      expected: '≥1 条边相连',
      actual: `0 条边（另有 ${refs} 处节点字段引用，不计入边）`,
    });
  }

  // ---- V12：verified_at 超过 18 个月 ----
  {
    const cutoff = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 18);
    for (const node of nodeRecords) {
      const raw = node.value['verified_at'];
      if (typeof raw !== 'string') continue;
      const d = new Date(`${raw}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getTime() >= cutoff.getTime()) continue;
      const months = monthsBetween(d, today);
      add({
        rule: 'V12',
        level: 'warning',
        file: node.file,
        line: node.lineOf(['verified_at']),
        locator: `${node.type}.${slugOf(node.id) ?? '?'}.verified_at`,
        expected: `不早于 ${cutoff.toISOString().slice(0, 10)}（近 18 个月）`,
        actual: `${raw}（约 ${months} 个月前的核验）`,
      });
    }
  }

  // ---- V13：unverified 占比 ----
  const flagged = nodeRecords.filter((n) => n.value['unverified'] === true);
  const ratio = nodeRecords.length === 0 ? 0 : flagged.length / nodeRecords.length;
  if (ratio > 0.15) {
    add({
      rule: 'V13',
      level: 'warning',
      file: 'data/',
      line: 0,
      locator: '全局.unverified',
      expected: '占比 ≤15%',
      actual: `${(ratio * 100).toFixed(1)}%（${flagged.length}/${nodeRecords.length}）`,
    });
  }

  // ---- V14：domain 工具数 ----
  const domainStats: DomainStat[] = [];
  for (const node of nodeRecords) {
    if (node.type !== 'domain') continue;
    const tools = nodeRecords.filter((n) => n.type === 'tool' && Array.isArray(n.value['domain']) && (n.value['domain'] as unknown[]).includes(node.id));
    const techs = nodeRecords.filter((n) => n.type === 'technique' && Array.isArray(n.value['domain']) && (n.value['domain'] as unknown[]).includes(node.id));
    const arts = new Set<string>();
    for (const t of [...tools, ...techs]) {
      const list = (t.value['artifacts'] ?? t.value['typical_artifacts']) as unknown;
      if (Array.isArray(list)) for (const a of list) if (typeof a === 'string') arts.add(a);
    }
    domainStats.push({
      id: node.id,
      name: String(node.value['name'] ?? ''),
      coverage: String(node.value['coverage'] ?? '?'),
      tools: tools.length,
      techniques: techs.length,
      artifactCount: arts.size,
    });
    if (tools.length < 5) {
      add({
        rule: 'V14',
        level: 'warning',
        file: node.file,
        line: node.line,
        locator: `domain.${slugOf(node.id) ?? '?'}`,
        expected: '≥5 个工具（§4.4 coverage=full 的门槛）',
        actual: `${tools.length} 个工具 / ${techs.length} 个技术`,
      });
    }
    if (useExt) {
      const coverage = String(node.value['coverage'] ?? '');
      const content = tools.length + techs.length;
      if (coverage === 'full' && (tools.length < 5 || techs.length < 5)) {
        add({
          rule: 'EXT-COVERAGE',
          level: 'warning',
          file: node.file,
          line: node.lineOf(['coverage']),
          locator: `domain.${slugOf(node.id) ?? '?'}.coverage`,
          expected: 'full 需 ≥5 工具 且 ≥5 技术（§4.4）',
          actual: `full，实际 ${tools.length} 工具 / ${techs.length} 技术`,
        });
      }
      if (coverage === 'stub' && content > 2) {
        add({
          rule: 'EXT-COVERAGE',
          level: 'warning',
          file: node.file,
          line: node.lineOf(['coverage']),
          locator: `domain.${slugOf(node.id) ?? '?'}.coverage`,
          expected: 'stub 表示仅占位（≤2 条内容，§4.4）',
          actual: `stub，实际 ${content} 条内容`,
        });
      }
    }
  }

  // ---- V15：first_release 晚于 verified_at 年份 ----
  for (const node of nodeRecords) {
    const first = node.value['first_release'];
    const verified = node.value['verified_at'];
    if (typeof first !== 'number' || typeof verified !== 'string') continue;
    const year = Number(verified.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    if (first > year) {
      add({
        rule: 'V15',
        level: 'error',
        file: node.file,
        line: node.lineOf(['first_release']),
        locator: `${node.type}.${slugOf(node.id) ?? '?'}.first_release`,
        expected: `≤ ${year}（verified_at 的年份）`,
        actual: String(first),
      });
    }
  }

  // ---- EXT-REF：节点字段里的 ID 引用必须已定义 ----
  if (useExt) {
    for (const { node, path, ref } of dangling) {
      add({
        rule: 'EXT-REF',
        level: 'warning',
        file: node.file,
        line: node.lineOf(path),
        locator: fieldLocator(`${node.type}.${slugOf(node.id) ?? '?'}`, path),
        expected: '已存在的节点 ID（规范未强制，但悬空引用会让视图丢内容）',
        actual: `${formatValue(ref)}（节点库中无此 ID）`,
      });
    }
  }

  // ---- EXT-LEN：§2.1 / §2.5 的字数上限 ----
  if (useExt) {
    for (const node of nodeRecords) {
      const slug = slugOf(node.id) ?? '?';
      const name = node.value['name'];
      const def = node.value['def'];
      const limits: { field: string; max: number; value: unknown }[] =
        node.type === 'domain'
          ? [
              { field: 'name', max: 16, value: name },
              { field: 'def', max: 120, value: def },
            ]
          : node.type === 'artifact'
            ? [
                { field: 'name', max: 20, value: name },
                { field: 'def', max: 120, value: def },
              ]
            : [];
      for (const { field, max, value } of limits) {
        if (typeof value !== 'string') continue;
        const n = charCount(value);
        if (n <= max) continue;
        add({
          rule: 'EXT-LEN',
          level: 'warning',
          file: node.file,
          line: node.lineOf([field]),
          locator: `${node.type}.${slug}.${field}`,
          expected: `≤${max} 字（§${node.type === 'domain' ? '2.1' : '2.5'}）`,
          actual: `${n} 字`,
        });
      }
    }
  }

  // ---- EXT-DIR：§3 语义表里方向写得最死的 5 种边 ----
  if (useExt) {
    const expectFrom: Partial<Record<EdgeKind, NodeType[]>> = {
      uses: ['technique'],
      detects: ['tool'],
      teaches: ['ecosystem'],
      bypasses: ['attack'],
    };
    const expectTo: Partial<Record<EdgeKind, NodeType[]>> = {
      uses: ['tool'],
      detects: ['attack'],
      teaches: ['technique'],
      applies_to: ['artifact'],
    };
    for (const edge of edgeRecords) {
      if (!edge.kind) continue;
      const fromNode = edge.from ? nodeIndex.get(edge.from) : undefined;
      const toNode = edge.to ? nodeIndex.get(edge.to) : undefined;
      const wantFrom = expectFrom[edge.kind];
      if (wantFrom && fromNode && !wantFrom.includes(fromNode.type)) {
        add({
          rule: 'EXT-DIR',
          level: 'warning',
          file: edge.file,
          line: edge.lineOf(['from']),
          locator: `edge[${edge.index}].from`,
          expected: `${edge.kind} 的 from 应为 ${wantFrom.join('/')}（§3 语义表）`,
          actual: `${edge.from}（${fromNode.type}）`,
        });
      }
      const wantTo = expectTo[edge.kind];
      if (wantTo && toNode && !wantTo.includes(toNode.type)) {
        add({
          rule: 'EXT-DIR',
          level: 'warning',
          file: edge.file,
          line: edge.lineOf(['to']),
          locator: `edge[${edge.index}].to`,
          expected: `${edge.kind} 的 to 应为 ${wantTo.join('/')}（§3 语义表）`,
          actual: `${edge.to}（${toNode.type}）`,
        });
      }
    }
  }

  // ---- 降级开关与统计 ----
  const downgrade = opts.downgrade ?? new Set<string>();
  const downgraded: Finding[] = [];
  for (const f of findings) {
    if (f.level === 'error' && downgrade.has(f.rule)) {
      f.level = 'warning';
      downgraded.push(f);
    }
  }

  const byType: Record<string, number> = {};
  for (const node of nodeRecords) byType[node.type] = (byType[node.type] ?? 0) + 1;
  const edgesByKind: Record<string, number> = {};
  for (const edge of edgeRecords) {
    if (edge.kind) edgesByKind[edge.kind] = (edgesByKind[edge.kind] ?? 0) + 1;
  }

  const stats: Stats = {
    nodeCount: nodeRecords.length,
    edgeCount: edgeRecords.length,
    byType,
    edgesByKind,
    domains: domainStats,
    unverified: { flagged: flagged.length, total: nodeRecords.length, ratio },
    sourceMissing,
    tldrShort,
    danglingRefs: dangling.length,
  };

  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));

  return {
    dataDir,
    findings,
    errors: findings.filter((f) => f.level === 'error'),
    warnings: findings.filter((f) => f.level === 'warning'),
    stats,
    files: fileSummary,
    skipped: loaded.skipped,
    downgraded,
  };
}

