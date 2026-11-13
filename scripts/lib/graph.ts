/**
 * 图数据编译层 —— `pnpm build-graph` 的实现，也是 `pnpm build` 的第二步。
 *
 * 职责边界（三条硬约定）：
 * 1. **只读 data/**：这里不写任何 YAML，只产出 `public/graph/*.json`。
 * 2. **校验是前置门**：调用方必须先跑 `scripts/lib/validate.ts`（同一套 Zod 定义）；
 *    本层再用同一批 schema 做一次 `safeParse` 兜底 —— 任何一条失败都**不写文件**，
 *    宁可没有产物，也不产出坏 JSON。
 * 3. **字段精简**：`nodes.json` 只保留渲染层真正要用的字段；`pricing` /
 *    `latest_version` / `headless` 等明细留在 YAML 里，需要时扩展投影表，不要顺手全塞。
 *
 * 这一层的输出就是前端契约（`public/graph/{nodes,edges,index,meta}.json`），
 * 改动字段等于改前端契约，必须同步 `scripts/README.md` 与 `SCHEMA_VERSION`。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AI_READY,
  EDGE_KINDS,
  EdgeSchema,
  LICENSES,
  MAINTAIN_STATUS,
  NODE_SCHEMAS,
  NODE_TYPES,
  PLATFORMS,
  SCHEMA_VERSION,
  TOOL_CATEGORIES,
  type EdgeKind,
  type NodeType,
} from '../../schema/index.js';
import { loadDataDir, type FileKind } from './source.js';
import { displayWidth, pad } from './text.js';

// ---------------------------------------------------------------------------
// 0. 取值小工具：raw 是 unknown，逐个字段收窄，不用 any
// ---------------------------------------------------------------------------

export const readRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? (v as Record<string, unknown>) : null;

export const readString = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

export const readNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export const readBoolean = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

export const readStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** 从枚举常量里取值：未登记的值退回 undefined（Zod 已保证不会发生，这里只做类型收窄） */
function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

// ---------------------------------------------------------------------------
// 1. 装载：data/**​/*.yaml → 带来源行号的原始记录
// ---------------------------------------------------------------------------

export interface CompiledNode {
  id: string;
  kind: NodeType;
  /** 展示用相对路径 */
  file: string;
  /** 记录起始行（1-based） */
  line: number;
  /** YAML 解出的原始映射；投影时按字段读取，不做深拷贝 */
  raw: Record<string, unknown>;
}

export interface CompiledEdge {
  file: string;
  /** 1-based，在文件内的序号（与校验报告的 edge[i] 对齐） */
  index: number;
  line: number;
  raw: Record<string, unknown>;
}

export interface CompileError {
  file: string;
  line: number;
  locator: string;
  message: string;
}

export interface CompiledFile {
  relPath: string;
  kind: FileKind;
  count: number;
}

export interface CompileResult {
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  files: CompiledFile[];
  /** 空目录 / 不存在的目录（不是错误） */
  skipped: string[];
  /** 正常数据这里必须为空：有内容就说明 validate 与 build 之间出现了分歧 */
  errors: CompileError[];
}

export interface CompileOptions {
  /** 绝对路径 */
  dataDir: string;
  /** 展示相对路径的基准（一般是 process.cwd()） */
  cwd: string;
}

const slugOf = (id: unknown): string => {
  if (typeof id !== 'string') return '?';
  const i = id.indexOf(':');
  return i > 0 ? id.slice(i + 1) : id;
};

/** 把 Zod issue 压成一行可定位的说明（只取前 3 条，避免刷屏） */
function zodMessage(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  const shown = issues.slice(0, 3).map((i) => {
    const where = i.path.map(String).filter(Boolean).join('.');
    return where === '' ? i.message : `${where}：${i.message}`;
  });
  const more = issues.length > shown.length ? `；另有 ${issues.length - shown.length} 条` : '';
  return `${shown.join('；')}${more}`;
}

/**
 * 装载 + 逐条 Zod 复检。不写任何文件，纯函数（除读盘外无副作用）。
 */
export function compileGraph(opts: CompileOptions): CompileResult {
  const loaded = loadDataDir(opts.dataDir, opts.cwd);
  const nodes: CompiledNode[] = [];
  const edges: CompiledEdge[] = [];
  const errors: CompileError[] = [];
  const files: CompiledFile[] = loaded.files.map((f) => ({ relPath: f.relPath, kind: f.kind, count: f.items.length }));

  for (const file of loaded.files) {
    for (const item of file.items) {
      const raw = readRecord(item.value);
      const baseLocator = file.kind === 'edges' ? `edge[${item.index}]` : `${file.kind}[${item.index}]`;
      if (raw === null) {
        errors.push({
          file: file.relPath,
          line: item.line(),
          locator: baseLocator,
          message: '记录不是映射（应为 key: value 形式）',
        });
        continue;
      }

      if (file.kind === 'edges') {
        const parsed = EdgeSchema.safeParse(raw);
        if (!parsed.success) {
          errors.push({
            file: file.relPath,
            line: item.line(),
            locator: baseLocator,
            message: zodMessage(parsed.error.issues),
          });
          continue;
        }
        edges.push({ file: file.relPath, index: item.index, line: item.line(), raw });
        continue;
      }

      const parsed = NODE_SCHEMAS[file.kind].safeParse(raw);
      const locator = `${file.kind}.${slugOf(raw['id'])}`;
      if (!parsed.success) {
        errors.push({ file: file.relPath, line: item.line(), locator, message: zodMessage(parsed.error.issues) });
        continue;
      }
      const id = readString(raw['id']);
      if (id === undefined) {
        errors.push({ file: file.relPath, line: item.line(), locator, message: '缺 id（Zod 应已拦截）' });
        continue;
      }
      nodes.push({ id, kind: file.kind, file: file.relPath, line: item.line(), raw });
    }
  }

  return { nodes, edges, files, skipped: loaded.skipped, errors };
}

// ---------------------------------------------------------------------------
// 2. 投影：只保留渲染层要用的字段（前端契约）
// ---------------------------------------------------------------------------

export type PlatformValue = (typeof PLATFORMS)[number];
export type ToolCategoryValue = (typeof TOOL_CATEGORIES)[number];
export type AiReadyValue = (typeof AI_READY)[number];
export type MaintainStatusValue = (typeof MAINTAIN_STATUS)[number];
export type LicenseValue = (typeof LICENSES)[number];

/**
 * `nodes.json` 的一条。可选字段只在数据里真的有时出现（保持文件小）。
 *
 * 注意 `difficulty` 是**跨类型归并**字段：
 *   technique/concept/attack → `difficulty`
 *   tool                     → `learning_curve`
 *   domain                   → `entry_difficulty`
 * 三者量纲一致（1–5，§4.3），但语义不同（工具是学习曲线，领域是入门难度）。
 */
export interface GraphNode {
  id: string;
  kind: NodeType;
  name: string;
  def: string;
  /** 所属领域 ID；`domain` 节点自引用（`[自己的 id]`），便于按领域筛图 */
  domain: string[];
  /** 关联载体 ID（矩阵视图的轴） */
  artifacts: string[];
  /** 平台；没有这一维度的类型写空数组，保证前端不用做 undefined 判断 */
  platforms: PlatformValue[];
  category?: ToolCategoryValue;
  difficulty?: number;
  ai_ready?: AiReadyValue;
  maintain_status?: MaintainStatusValue;
  license?: LicenseValue;
  /** 实时层/后续批次可能写入的重要度；没有就不输出 */
  importance?: number;
  /** 上级领域/子领域 ID；构成目录树（§2.1） */
  parent?: string;
  /** 作战手册：命令模板（§2.2） */
  commands?: { cmd: string; note?: string }[];
  /** 作战手册：常见坑（§2.2） */
  pitfalls?: string[];
  /** 参考链接（§2.2） */
  references?: string[];
  /** artifact 专属：载体类别（§2.5 的 kind 枚举）。不能叫 kind，会与节点类型冲突 */
  artifact_kind?: string;
  /** technique 专属：前置技术 ID（§2.2）。前置/下游面板与工作流排序都依赖它 */
  prerequisites?: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** 非空（V4 已强制）；直接跑本层时会退化到空字符串并写进 meta.warnings */
  rationale: string;
  weight?: number;
}

export interface SearchEntry {
  id: string;
  name: string;
  /** data 里的 aliases + name_en（英文检索用），去重 */
  aliases: string[];
  kind: NodeType;
  /** ≤80 字：tool 用 tldr，其余从 def 收敛 */
  tldr: string;
}

export interface GraphMeta {
  builtAt: string;
  schemaVersion: string;
  /** 契约里的 5 个桶；其他节点类型（concept/format/…）见 nodes.json */
  counts: {
    domain: number;
    technique: number;
    artifact: number;
    tool: number;
    edge: number;
  };
  warnings: string[];
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  index: SearchEntry[];
  meta: GraphMeta;
}

/** index.json 摘要上限（契约：≤80 字） */
export const INDEX_SUMMARY_MAX = 80;

/** 难度字段按类型归并，见 GraphNode.difficulty 的注释 */
const DIFFICULTY_FIELD: Partial<Record<NodeType, string>> = {
  domain: 'entry_difficulty',
  technique: 'difficulty',
  tool: 'learning_curve',
  concept: 'difficulty',
  attack: 'difficulty',
};

function projectNode(node: CompiledNode): GraphNode {
  const raw = node.raw;
  const out: GraphNode = {
    id: node.id,
    kind: node.kind,
    name: readString(raw['name']) ?? '',
    /**
     * §2.3 的 tool 没有 `def` 字段，长描述放在 `tldr`；这里统一落到 `def`，
     * 让详情面板不必按类型分支（tool 的 def 就是 tldr 全文，index.json 里另有 ≤80 字摘要）。
     */
    def: readString(raw['def']) ?? readString(raw['tldr']) ?? '',
    domain: node.kind === 'domain' ? [node.id] : readStringArray(raw['domain']),
    artifacts: readStringArray(raw['artifacts']),
    platforms: readStringArray(raw['platforms']).filter((p): p is PlatformValue =>
      (PLATFORMS as readonly string[]).includes(p),
    ),
  };

  const difficultyField = DIFFICULTY_FIELD[node.kind];
  if (difficultyField !== undefined) {
    const score = readNumber(raw[difficultyField]);
    if (score !== undefined) out.difficulty = score;
  }

  const category = pickEnum(raw['category'], TOOL_CATEGORIES);
  if (category !== undefined) out.category = category;
  const aiReady = pickEnum(raw['ai_ready'], AI_READY);
  if (aiReady !== undefined) out.ai_ready = aiReady;
  const maintainStatus = pickEnum(raw['maintain_status'], MAINTAIN_STATUS);
  if (maintainStatus !== undefined) out.maintain_status = maintainStatus;
  const license = pickEnum(raw['license'], LICENSES);
  if (license !== undefined) out.license = license;
  const importance = readNumber(raw['importance']);
  if (importance !== undefined) out.importance = importance;

  // §2.1 子领域：parent 指向上级 domain
  const parent = readString(raw['parent']);
  if (parent !== undefined) out.parent = parent;

  // §2.2 作战手册三件套
  const rawCommands = raw['commands'];
  if (Array.isArray(rawCommands)) {
    const cmds: { cmd: string; note?: string }[] = [];
    for (const c of rawCommands) {
      if (c === null || typeof c !== 'object') continue;
      const rec = c as Record<string, unknown>;
      const cmd = readString(rec['cmd']);
      if (cmd === undefined) continue;
      const note = readString(rec['note']);
      cmds.push(note === undefined ? { cmd } : { cmd, note });
    }
    if (cmds.length > 0) out.commands = cmds;
  }
  const pitfalls = readStringArray(raw['pitfalls']);
  if (pitfalls.length > 0) out.pitfalls = pitfalls;
  const references = readStringArray(raw['references']);
  if (references.length > 0) out.references = references;

  // §2.5 artifact 的载体类别：raw.kind 是「类别」，与 GraphNode.kind「节点类型」不是一回事
  if (node.kind === 'artifact') {
    const ak = readString(raw['kind']);
    if (ak !== undefined) out.artifact_kind = ak;
  }

  // §2.2 technique 的前置技术
  if (node.kind === 'technique') {
    const pre = readStringArray(raw['prerequisites']);
    if (pre.length > 0) out.prerequisites = pre;
  }

  return out;
}

function projectEdge(edge: CompiledEdge): GraphEdge {
  const kind = pickEnum(edge.raw['kind'], EDGE_KINDS);
  if (kind === undefined) throw new Error(`edge[${edge.index}] 的 kind 非法（${edge.file}）`);
  const out: GraphEdge = {
    from: readString(edge.raw['from']) ?? '',
    to: readString(edge.raw['to']) ?? '',
    kind,
    rationale: readString(edge.raw['rationale']) ?? '',
  };
  const weight = readNumber(edge.raw['weight']);
  if (weight !== undefined) out.weight = weight;
  return out;
}

/** 空白压成单空格并去掉首尾：摘要不能带换行（搜索高亮会错位） */
const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

function truncateSummary(s: string, max: number): { text: string; truncated: boolean } {
  const chars = Array.from(s);
  if (chars.length <= max) return { text: s, truncated: false };
  return { text: `${chars.slice(0, Math.max(0, max - 1)).join('')}…`, truncated: true };
}

function buildSearchEntry(node: CompiledNode): { entry: SearchEntry; truncated: boolean } {
  const raw = node.raw;
  const aliases: string[] = [];
  const push = (v: string | undefined): void => {
    const clean = v?.trim();
    if (clean !== undefined && clean !== '' && !aliases.includes(clean)) aliases.push(clean);
  };
  for (const alias of readStringArray(raw['aliases'])) push(alias);
  push(readString(raw['name_en']));

  const source = collapse(readString(raw['tldr']) ?? readString(raw['def']) ?? '');
  const { text, truncated } = truncateSummary(source, INDEX_SUMMARY_MAX);

  return {
    entry: {
      id: node.id,
      name: readString(raw['name']) ?? '',
      aliases,
      kind: node.kind,
      tldr: text,
    },
    truncated,
  };
}

const KIND_ORDER = new Map<NodeType, number>(NODE_TYPES.map((t, i) => [t, i]));

const cmpText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 先按类型（§2 顺序）再按 id：产物稳定，diff 才有意义 */
function cmpNode(a: { kind: NodeType; id: string }, b: { kind: NodeType; id: string }): number {
  const ka = KIND_ORDER.get(a.kind) ?? 99;
  const kb = KIND_ORDER.get(b.kind) ?? 99;
  return ka !== kb ? ka - kb : cmpText(a.id, b.id);
}

function cmpEdge(a: GraphEdge, b: GraphEdge): number {
  return cmpText(a.from, b.from) || cmpText(a.to, b.to) || cmpText(a.kind, b.kind);
}

export interface ProjectOptions {
  /** 写进 meta.builtAt；测试可注入固定时间 */
  now: Date;
}

/**
 * 把编译结果投影成 4 份产物（不写盘）。纯函数：同样的输入 + 同样的 now 得到同样的字节。
 */
export function projectGraph(compiled: CompileResult, opts: ProjectOptions): GraphModel {
  const nodes = compiled.nodes.map(projectNode).sort(cmpNode);
  const edges = compiled.edges.map(projectEdge).sort(cmpEdge);

  let truncatedSummaries = 0;
  const index = compiled.nodes
    .map((node) => {
      const { entry, truncated } = buildSearchEntry(node);
      if (truncated) truncatedSummaries += 1;
      return entry;
    })
    .sort(cmpNode);

  const byKind = {} as Record<NodeType, number>;
  for (const kind of NODE_TYPES) byKind[kind] = 0;
  for (const node of nodes) byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;

  const counts: GraphMeta['counts'] = {
    domain: byKind.domain,
    technique: byKind.technique,
    artifact: byKind.artifact,
    tool: byKind.tool,
    edge: edges.length,
  };

  const warnings: string[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  if (compiled.files.length === 0) {
    warnings.push('`data/` 下没有任何 YAML 文件：nodes / edges / index 均为空数组');
  }
  if (counts.edge === 0) {
    warnings.push('边库为空（`data/edges/` 无记录）：edges.json 输出空数组，图谱暂时只有孤岛节点');
  }
  if (counts.tool === 0) {
    warnings.push('工具库为空（`data/tools/` 无记录）：category / license / ai_ready / maintain_status 维度暂时无数据');
  }
  if (truncatedSummaries > 0) {
    warnings.push(`${truncatedSummaries} 条搜索摘要超过 ${INDEX_SUMMARY_MAX} 字，已在 index.json 中截断`);
  }
  const missingDef = nodes.filter((n) => n.def === '').length;
  if (missingDef > 0) {
    warnings.push(`${missingDef} 个节点既没有 def 也没有 tldr（ecosystem 等类型本来就没有描述字段），nodes.json 中写为空字符串`);
  }
  const extraKinds = NODE_TYPES.filter(
    (kind) => kind !== 'domain' && kind !== 'technique' && kind !== 'artifact' && kind !== 'tool' && byKind[kind] > 0,
  );
  if (extraKinds.length > 0) {
    const detail = extraKinds.map((k) => `${k} ${byKind[k]}`).join(' · ');
    warnings.push(`nodes.json 含 meta.counts 未覆盖的类型：${detail}（counts 只统计契约里的 5 类）`);
  }
  const emptyRationale = edges.filter((e) => e.rationale === '').length;
  if (emptyRationale > 0) {
    warnings.push(`${emptyRationale} 条边的 rationale 为空（V4 本应拦截），edges.json 中写为空字符串`);
  }
  const dangling = edges.filter((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to)).length;
  if (dangling > 0) {
    warnings.push(`${dangling} 条边指向不存在的节点（V3 本应拦截）：前端按 id 建邻接表时会丢边`);
  }

  return {
    nodes,
    edges,
    index,
    meta: {
      builtAt: opts.now.toISOString(),
      schemaVersion: SCHEMA_VERSION,
      counts,
      warnings,
    },
  };
}

// ---------------------------------------------------------------------------
// 3. 落盘：一次性写 4 个文件，打印大小与条数
// ---------------------------------------------------------------------------

export const GRAPH_FILE_NAMES = ['nodes.json', 'edges.json', 'index.json', 'meta.json'] as const;
export type GraphFileName = (typeof GRAPH_FILE_NAMES)[number];

export interface OutputFile {
  file: GraphFileName;
  /** 记录条数；meta.json 固定为 1 */
  count: number;
  bytes: number;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * 序列化：明细用紧凑 JSON（前端一次 fetch，省一半体积），meta 用 2 空格缩进（人要看警告）。
 * 每个文件结尾补一个换行，避免编辑器/工具链的 no-newline-at-EOF 噪音。
 */
export function serializeGraph(model: GraphModel): Record<GraphFileName, string> {
  return {
    'nodes.json': `${JSON.stringify(model.nodes)}\n`,
    'edges.json': `${JSON.stringify(model.edges)}\n`,
    'index.json': `${JSON.stringify(model.index)}\n`,
    'meta.json': `${JSON.stringify(model.meta, null, 2)}\n`,
  };
}

function countOf(file: GraphFileName, model: GraphModel): number {
  switch (file) {
    case 'nodes.json':
      return model.nodes.length;
    case 'edges.json':
      return model.edges.length;
    case 'index.json':
      return model.index.length;
    case 'meta.json':
      return 1;
  }
}

/** 写盘。调用前必须已经确认校验通过 —— 这里不做二次判断。 */
export function writeGraph(model: GraphModel, outDir: string): OutputFile[] {
  const serialized = serializeGraph(model);
  mkdirSync(outDir, { recursive: true });
  const outputs: OutputFile[] = [];
  for (const file of GRAPH_FILE_NAMES) {
    const text = serialized[file];
    writeFileSync(path.join(outDir, file), text, 'utf8');
    outputs.push({ file, count: countOf(file, model), bytes: Buffer.byteLength(text, 'utf8') });
  }
  return outputs;
}

export interface BuildReportInput {
  model: GraphModel;
  outputs: OutputFile[];
  dataLabel: string;
  outDirLabel: string;
  validation: { errors: number; warnings: number };
}

/** 构建报告（终端输出）；`pnpm build-graph` 与 `pnpm build` 共用，保证两处说法一致 */
export function formatBuildReport(input: BuildReportInput): string {
  const { model, outputs, dataLabel, outDirLabel, validation } = input;
  const out: string[] = [];
  const nameWidth = Math.max(...outputs.map((o) => displayWidth(o.file))) + 2;
  const totalBytes = outputs.reduce((sum, o) => sum + o.bytes, 0);

  out.push(`图数据构建 · ${dataLabel} → ${outDirLabel}`);
  for (const o of outputs) {
    out.push(`  ${pad(o.file, nameWidth)}${String(o.count).padStart(4)} 条  ${formatBytes(o.bytes).padStart(9)}`);
  }
  out.push(
    `  合计 ${outputs.length} 个文件 · ${formatBytes(totalBytes)}` +
      `（节点 ${model.nodes.length} · 边 ${model.edges.length} · 索引 ${model.index.length}）`,
  );
  out.push(`  校验 ${validation.errors} error / ${validation.warnings} warning（同一套 Zod；有 error 不写出任何文件）`);

  if (model.meta.warnings.length > 0) {
    out.push(`  警告 ${model.meta.warnings.length} 条（同时写入 meta.json 的 warnings[]）`);
    for (const warning of model.meta.warnings) out.push(`    · ${warning}`);
  }
  return out.join('\n');
}
