/**
 * 覆盖率统计层 —— `pnpm stats` 的实现。
 *
 * 只读 data/（通过 compileGraph 装载），产出两份报告：
 *   reports/coverage.json —— 机器读（CI 对比、后续看板）
 *   reports/coverage.md   —— 人读（每次扩数据后扫一眼）
 *
 * 门槛全部来自 03-DATA-SCHEMA.md §4.4 与 `_internal/01-MASTER-PROMPT.md` §11，
 * 集中放在 THRESHOLDS，禁止在渲染函数里散落魔法数字。
 */
import {
  AI_READY,
  ARTIFACT_KINDS,
  MAINTAIN_STATUS,
  NODE_TYPES,
  PROVENANCE_REQUIRED_TYPES,
  SCHEMA_VERSION,
  type NodeType,
} from '../../schema/index.js';
import {
  readBoolean,
  readString,
  readStringArray,
  type CompileResult,
  type CompiledNode,
} from './graph.js';
import { charCount, displayWidth, pad } from './text.js';

// ---------------------------------------------------------------------------
// 门槛（与规范对齐，改这里等于改验收口径）
// ---------------------------------------------------------------------------

export const THRESHOLDS = {
  /** §4.4 coverage=full：该领域 ≥5 工具 */
  toolsPerDomain: 5,
  /** §4.4 coverage=full：该领域 ≥5 技术 */
  techniquesPerDomain: 5,
  /** §4.4 coverage=full：矩阵中该领域的组合覆盖 ≥30% */
  matrixCoverage: 0.3,
  /** V13：unverified 占比 ≤15% */
  unverifiedMax: 0.15,
  /** §11：「tldr 少于 40 字的节点占比 < 10%」 */
  tldrShortMax: 0.1,
  /** V8：tool.tldr ≥40 字 */
  tldrMinChars: 40,
} as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

// ---------------------------------------------------------------------------
// 报告结构（= coverage.json 的 schema）
// ---------------------------------------------------------------------------

export interface RatioStat {
  numerator: number;
  denominator: number;
  /** 分母为 0 时为 null（不是 0，避免把「没有数据」误读成「达标」） */
  ratio: number | null;
  threshold: number;
  pass: boolean | null;
}

export interface DomainCoverage {
  id: string;
  name: string;
  /** 数据里自报的 coverage（full/partial/stub） */
  coverage: string;
  tools: number;
  techniques: number;
  /** 该领域工具+技术引用的去重载体数 */
  artifacts: number;
  matrix: { filled: number; total: number; ratio: number | null };
  /** 低于门槛的人读条目；空数组 = 达标 */
  belowThreshold: string[];
  /** coverage 自报值与实际内容矛盾时的说明 */
  coverageMismatch: string | null;
}

export interface MatrixRow {
  technique: string;
  name: string;
  domains: string[];
  /** kind → 该技术 artifacts[] 里属于该 kind 的载体条数 */
  cells: Record<ArtifactKind, number>;
}

export interface CoverageMatrix {
  columns: ArtifactKind[];
  rows: MatrixRow[];
  filled: number;
  total: number;
  ratio: number | null;
  /** 覆盖为 0 的格子（行=技术 id，列=载体 kind），机器读用 */
  zeroCells: { technique: string; kind: ArtifactKind }[];
}

export interface MaintainItem {
  id: string;
  name: string;
  status: 'stale' | 'abandoned';
  category: string | null;
  license: string | null;
  verified_at: string | null;
}

export interface CoverageReport {
  generatedAt: string;
  schemaVersion: string;
  dataDir: string;
  totals: {
    nodes: number;
    edges: number;
    byKind: Record<NodeType, number>;
    domain: number;
    technique: number;
    tool: number;
    artifact: number;
  };
  domains: DomainCoverage[];
  matrix: CoverageMatrix;
  provenance: {
    unverified: RatioStat;
    tldrShort: RatioStat & { minChars: number; toolsWithTldr: number };
    sourceMissing: { count: number; ids: string[] };
    verifiedAtMissing: { count: number; ids: string[] };
  };
  aiReady: {
    distribution: Record<string, number>;
    /** 没有 ai_ready 字段的节点（技术上只有 tool 有这一维） */
    unset: number;
    applicable: number;
  };
  maintainStatus: {
    distribution: Record<string, number>;
    unset: number;
    abandonedOrStale: MaintainItem[];
  };
  thresholds: typeof THRESHOLDS;
  gaps: string[];
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const zeroRecord = <K extends string>(keys: readonly K[]): Record<K, number> => {
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = 0;
  return out;
};

export const formatPercent = (ratio: number | null, digits = 1): string =>
  ratio === null ? '—' : `${(ratio * 100).toFixed(digits)}%`;

const nameOf = (node: CompiledNode): string => readString(node.raw['name']) ?? node.id;

const ratioStat = (numerator: number, denominator: number, threshold: number): RatioStat => {
  const ratio = denominator === 0 ? null : numerator / denominator;
  return { numerator, denominator, ratio, threshold, pass: ratio === null ? null : ratio <= threshold };
};

// ---------------------------------------------------------------------------
// 计算
// ---------------------------------------------------------------------------

export interface ComputeOptions {
  now: Date;
  /** 展示用数据目录，默认 data/ */
  dataLabel?: string;
}

export function computeCoverage(compiled: CompileResult, opts: ComputeOptions): CoverageReport {
  const nodes = compiled.nodes;
  const edges = compiled.edges;

  const byKind = zeroRecord(NODE_TYPES);
  for (const node of nodes) byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;

  const domains = nodes.filter((n) => n.kind === 'domain');
  const techniques = nodes.filter((n) => n.kind === 'technique');
  const tools = nodes.filter((n) => n.kind === 'tool');
  const artifacts = nodes.filter((n) => n.kind === 'artifact');

  /** 载体 id → kind；矩阵要靠它把 art: 引用翻译成列 */
  const artifactKind = new Map<string, ArtifactKind>();
  for (const art of artifacts) {
    const kind = readString(art.raw['kind']);
    if (kind !== undefined && (ARTIFACT_KINDS as readonly string[]).includes(kind)) {
      artifactKind.set(art.id, kind as ArtifactKind);
    }
  }

  // ---- 技术 × 载体 kind 矩阵 ----
  const matrixRows: MatrixRow[] = techniques.map((t) => {
    const cells = zeroRecord(ARTIFACT_KINDS);
    for (const artId of readStringArray(t.raw['artifacts'])) {
      const kind = artifactKind.get(artId);
      if (kind === undefined) continue; // 悬空/未知 kind：不计入（EXT-REF 会单独报警告）
      cells[kind] = (cells[kind] ?? 0) + 1;
    }
    return {
      technique: t.id,
      name: nameOf(t),
      domains: readStringArray(t.raw['domain']),
      cells,
    };
  });
  const rowsByTechnique = new Map(matrixRows.map((r) => [r.technique, r]));

  let filled = 0;
  const zeroCells: { technique: string; kind: ArtifactKind }[] = [];
  for (const row of matrixRows) {
    for (const kind of ARTIFACT_KINDS) {
      if ((row.cells[kind] ?? 0) > 0) filled += 1;
      else zeroCells.push({ technique: row.technique, kind });
    }
  }
  const matrixTotal = matrixRows.length * ARTIFACT_KINDS.length;
  const matrix: CoverageMatrix = {
    columns: [...ARTIFACT_KINDS],
    rows: matrixRows,
    filled,
    total: matrixTotal,
    ratio: matrixTotal === 0 ? null : filled / matrixTotal,
    zeroCells,
  };

  // ---- 各领域 ----
  const domainCoverage: DomainCoverage[] = domains.map((domain) => {
    const domainTools = tools.filter((t) => readStringArray(t.raw['domain']).includes(domain.id));
    const domainTechs = techniques.filter((t) => readStringArray(t.raw['domain']).includes(domain.id));
    const artifactIds = new Set<string>();
    for (const node of [...domainTools, ...domainTechs]) {
      for (const artId of readStringArray(node.raw['artifacts'])) artifactIds.add(artId);
    }

    const rows = domainTechs
      .map((t) => rowsByTechnique.get(t.id))
      .filter((r): r is MatrixRow => r !== undefined);
    const filledCells = rows.reduce(
      (sum, row) => sum + ARTIFACT_KINDS.filter((kind) => (row.cells[kind] ?? 0) > 0).length,
      0,
    );
    const totalCells = rows.length * ARTIFACT_KINDS.length;
    const matrixRatio = totalCells === 0 ? null : filledCells / totalCells;

    const below: string[] = [];
    if (domainTools.length < THRESHOLDS.toolsPerDomain) {
      below.push(`工具 ${domainTools.length} < ${THRESHOLDS.toolsPerDomain}`);
    }
    if (domainTechs.length < THRESHOLDS.techniquesPerDomain) {
      below.push(`技术 ${domainTechs.length} < ${THRESHOLDS.techniquesPerDomain}`);
    }
    if (artifactIds.size === 0) below.push('载体 0（矩阵没有可覆盖对象）');
    if (matrixRatio !== null && matrixRatio < THRESHOLDS.matrixCoverage) {
      below.push(`组合覆盖 ${formatPercent(matrixRatio)} < ${formatPercent(THRESHOLDS.matrixCoverage, 0)}`);
    }

    const selfReported = readString(domain.raw['coverage']) ?? 'unknown';
    let coverageMismatch: string | null = null;
    if (selfReported === 'full' && (domainTools.length < THRESHOLDS.toolsPerDomain || domainTechs.length < THRESHOLDS.techniquesPerDomain)) {
      coverageMismatch = `标 full，实际 ${domainTools.length} 工具 / ${domainTechs.length} 技术（§4.4 要求各 ≥5）`;
    } else if (selfReported === 'stub' && domainTools.length + domainTechs.length > 2) {
      coverageMismatch = `标 stub，实际 ${domainTools.length + domainTechs.length} 条内容（§4.4 stub = ≤2 条）`;
    }

    return {
      id: domain.id,
      name: nameOf(domain),
      coverage: selfReported,
      tools: domainTools.length,
      techniques: domainTechs.length,
      artifacts: artifactIds.size,
      matrix: { filled: filledCells, total: totalCells, ratio: matrixRatio },
      belowThreshold: below,
      coverageMismatch,
    };
  });

  // ---- 出处与可信度 ----
  const flaggedUnverified = nodes.filter((n) => readBoolean(n.raw['unverified']) === true);
  const toolsWithTldrList = tools.filter((t) => readString(t.raw['tldr']) !== undefined);
  const shortTldr = tools.filter((t) => {
    const tldr = readString(t.raw['tldr']);
    return tldr === undefined || charCount(tldr) < THRESHOLDS.tldrMinChars;
  });

  const needsProvenance = nodes.filter((n) => PROVENANCE_REQUIRED_TYPES.has(n.kind));
  const sourceMissingIds = needsProvenance
    .filter((n) => readStringArray(n.raw['source']).length === 0)
    .map((n) => n.id);
  const verifiedAtMissingIds = needsProvenance
    .filter((n) => readString(n.raw['verified_at']) === undefined)
    .map((n) => n.id);

  // ---- ai_ready 分布 ----
  const aiReadyDistribution = zeroRecord(AI_READY);
  let aiReadyApplicable = 0;
  for (const node of nodes) {
    const value = readString(node.raw['ai_ready']);
    if (value === undefined) continue;
    if ((AI_READY as readonly string[]).includes(value)) {
      aiReadyDistribution[value as (typeof AI_READY)[number]] += 1;
      aiReadyApplicable += 1;
    }
  }

  // ---- maintain_status 分布 + 待维护清单 ----
  const maintainDistribution = zeroRecord(MAINTAIN_STATUS);
  let maintainApplicable = 0;
  const abandonedOrStale: MaintainItem[] = [];
  for (const node of nodes) {
    const value = readString(node.raw['maintain_status']);
    if (value === undefined || !(MAINTAIN_STATUS as readonly string[]).includes(value)) continue;
    maintainDistribution[value as (typeof MAINTAIN_STATUS)[number]] += 1;
    maintainApplicable += 1;
    if (value === 'stale' || value === 'abandoned') {
      abandonedOrStale.push({
        id: node.id,
        name: nameOf(node),
        status: value,
        category: readString(node.raw['category']) ?? null,
        license: readString(node.raw['license']) ?? null,
        verified_at: readString(node.raw['verified_at']) ?? null,
      });
    }
  }
  abandonedOrStale.sort((a, b) => a.id.localeCompare(b.id));

  const unverified = ratioStat(flaggedUnverified.length, nodes.length, THRESHOLDS.unverifiedMax);
  const tldrShort: RatioStat & { minChars: number; toolsWithTldr: number } = {
    ...ratioStat(shortTldr.length, tools.length, THRESHOLDS.tldrShortMax),
    minChars: THRESHOLDS.tldrMinChars,
    toolsWithTldr: toolsWithTldrList.length,
  };

  // ---- gap 清单 ----
  const gaps: string[] = [];
  if (edges.length === 0) {
    gaps.push('边库为空（0 条）：技术前置 / 工具归属关系都未建立，图谱只能渲染孤岛，P1 阶段的第一优先级');
  }
  if (tools.length === 0) {
    gaps.push('工具库为空（0 条）：license / maintain_status / ai_ready 三个维度暂时无数据可统计');
  }
  const domainsBelowTools = domainCoverage.filter((d) => d.tools < THRESHOLDS.toolsPerDomain);
  if (domainsBelowTools.length > 0) {
    gaps.push(
      `${domainsBelowTools.length}/${domainCoverage.length} 个领域工具数 < ${THRESHOLDS.toolsPerDomain}：${domainsBelowTools
        .map((d) => `${d.id}(${d.tools})`)
        .join(' · ')}`,
    );
  }
  const domainsBelowTech = domainCoverage.filter((d) => d.techniques < THRESHOLDS.techniquesPerDomain);
  if (domainsBelowTech.length > 0) {
    gaps.push(
      `${domainsBelowTech.length}/${domainCoverage.length} 个领域技术数 < ${THRESHOLDS.techniquesPerDomain}：${domainsBelowTech
        .map((d) => `${d.id}(${d.techniques})`)
        .join(' · ')}`,
    );
  }
  const emptyKindColumns = ARTIFACT_KINDS.filter((kind) => ![...artifactKind.values()].includes(kind));
  if (emptyKindColumns.length > 0) {
    gaps.push(`载体 kind 尚无条目（矩阵整列为 0）：${emptyKindColumns.join(' · ')}`);
  }
  if (matrix.ratio !== null) {
    gaps.push(`技术×载体 组合覆盖 ${formatPercent(matrix.ratio)}（${filled}/${matrixTotal} 格），0 覆盖 ${zeroCells.length} 格`);
  }
  if (unverified.ratio !== null && unverified.ratio > THRESHOLDS.unverifiedMax) {
    gaps.push(`unverified 占比 ${formatPercent(unverified.ratio)} 超过 ${formatPercent(THRESHOLDS.unverifiedMax, 0)}（V13）`);
  }
  if (tldrShort.ratio !== null && tldrShort.ratio > THRESHOLDS.tldrShortMax) {
    gaps.push(`tldr 不足 ${THRESHOLDS.tldrMinChars} 字的工具占比 ${formatPercent(tldrShort.ratio)} 超过 ${formatPercent(THRESHOLDS.tldrShortMax, 0)}`);
  }
  if (sourceMissingIds.length > 0) gaps.push(`${sourceMissingIds.length} 个 tool/ai/ecosystem 缺 source（V9）`);
  if (verifiedAtMissingIds.length > 0) gaps.push(`${verifiedAtMissingIds.length} 个 tool/ai/ecosystem 缺 verified_at（V16）`);

  return {
    generatedAt: opts.now.toISOString(),
    schemaVersion: SCHEMA_VERSION,
    dataDir: opts.dataLabel ?? 'data/',
    totals: {
      nodes: nodes.length,
      edges: edges.length,
      byKind,
      domain: byKind.domain,
      technique: byKind.technique,
      tool: byKind.tool,
      artifact: byKind.artifact,
    },
    domains: domainCoverage,
    matrix,
    provenance: {
      unverified,
      tldrShort,
      sourceMissing: { count: sourceMissingIds.length, ids: sourceMissingIds },
      verifiedAtMissing: { count: verifiedAtMissingIds.length, ids: verifiedAtMissingIds },
    },
    aiReady: {
      distribution: aiReadyDistribution,
      unset: nodes.length - aiReadyApplicable,
      applicable: aiReadyApplicable,
    },
    maintainStatus: {
      distribution: maintainDistribution,
      unset: nodes.length - maintainApplicable,
      abandonedOrStale,
    },
    thresholds: THRESHOLDS,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// 人读版：coverage.md
// ---------------------------------------------------------------------------

const checkMark = (pass: boolean | null): string => (pass === null ? '—（无数据）' : pass ? '✔ 达标' : '✘ 超标');

const kindCell = (count: number): string => (count > 0 ? String(count) : '·');

/** Markdown 表格里 `|` 会拆列，正文必须转义 */
const mdText = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderCoverageMarkdown(report: CoverageReport): string {
  const out: string[] = [];
  const { totals, matrix, provenance, aiReady, maintainStatus } = report;

  out.push('# BinAtlas · 覆盖率报告');
  out.push('');
  out.push(`> 机器可读版：\`reports/coverage.json\`（同一次运行产出）`);
  out.push(`> 生成时间 ${report.generatedAt} · 数据规范 schema ${report.schemaVersion}`);
  out.push(
    `> 数据源 \`${report.dataDir}\` · 节点 ${totals.nodes} · 边 ${totals.edges} · 门槛与判定标准见 \`03-DATA-SCHEMA.md\` §4.4 与 V8/V13`,
  );
  out.push('');
  out.push('## 1. 总览');
  out.push('');
  out.push('| 指标 | 数值 |');
  out.push('| --- | --- |');
  out.push(`| 节点 | ${totals.nodes} |`);
  out.push(`| 边 | ${totals.edges} |`);
  out.push(`| 领域 / 技术 / 载体 / 工具 | ${totals.domain} / ${totals.technique} / ${totals.artifact} / ${totals.tool} |`);
  out.push(`| 技术×载体 组合覆盖 | ${formatPercent(matrix.ratio)}（${matrix.filled}/${matrix.total}） |`);
  out.push(`| unverified 占比 | ${formatPercent(provenance.unverified.ratio)}（${provenance.unverified.numerator}/${provenance.unverified.denominator}） |`);
  out.push('');
  out.push('## 2. 领域覆盖');
  out.push('');
  out.push(
    `门槛（§4.4）：工具 ≥${THRESHOLDS.toolsPerDomain} · 技术 ≥${THRESHOLDS.techniquesPerDomain} · 矩阵组合覆盖 ≥${formatPercent(THRESHOLDS.matrixCoverage, 0)}。`,
  );
  out.push('');
  out.push('| 领域 | 名称 | 工具 | 技术 | 载体 | 矩阵覆盖 | coverage | 结论 |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const d of report.domains) {
    const verdict = d.belowThreshold.length === 0 && d.coverageMismatch === null ? '达标' : `低于门槛：${[...d.belowThreshold, ...(d.coverageMismatch ? [d.coverageMismatch] : [])].join('；')}`;
    out.push(
      `| \`${d.id}\` | ${mdText(d.name)} | ${d.tools} | ${d.techniques} | ${d.artifacts} | ${formatPercent(d.matrix.ratio)}（${d.matrix.filled}/${d.matrix.total}） | ${d.coverage} | ${mdText(verdict)} |`,
    );
  }
  const belowRows = report.domains.filter((d) => d.belowThreshold.length > 0 || d.coverageMismatch !== null);
  out.push('');
  out.push('> 同一工具/技术可同时属于多个领域（`domain[]` 是多值），所以各领域「工具」列之和会大于工具总数。');
  out.push('');
  out.push(`**低于门槛的领域：${belowRows.length}/${report.domains.length}**`);
  if (belowRows.length === 0) {
    out.push('');
    out.push('（无）');
  } else {
    out.push('');
    for (const d of belowRows) out.push(`- \`${d.id}\`：${[...d.belowThreshold, ...(d.coverageMismatch ? [d.coverageMismatch] : [])].join('；')}`);
  }
  out.push('');

  out.push('## 3. 技术 × 载体 组合覆盖矩阵');
  out.push('');
  out.push(
    `行 = 技术（\`data/techniques.yaml\`），列 = 载体 kind 的 ${ARTIFACT_KINDS.length} 个枚举值（\`schema/enums.ts\` 的 \`ARTIFACT_KINDS\`）。`,
  );
  out.push(
    '单元格 = 该技术 `artifacts[]` 里属于该 kind 的载体条数；`·` 表示 **0 覆盖**。列用全枚举而非「当前出现过的 kind」，保证跨批次可比。',
  );
  out.push('');
  out.push(`| 技术 | 领域 | ${ARTIFACT_KINDS.map((k) => `\`${k}\``).join(' | ')} | 覆盖列数 |`);
  out.push(`| --- | --- | ${ARTIFACT_KINDS.map(() => '---').join(' | ')} | --- |`);
  for (const row of report.matrix.rows) {
    const cells = ARTIFACT_KINDS.map((kind) => kindCell(row.cells[kind] ?? 0));
    const covered = ARTIFACT_KINDS.filter((kind) => (row.cells[kind] ?? 0) > 0).length;
    out.push(`| ${mdText(row.name)} | ${row.domains.map((d) => d.replace('dom:', '')).join(' · ')} | ${cells.join(' | ')} | ${covered}/${ARTIFACT_KINDS.length} |`);
  }
  out.push('');
  out.push(`**覆盖为 0 的格子：${matrix.zeroCells.length}/${matrix.total}**（上表 \`·\`；完整清单见 \`coverage.json\` 的 \`matrix.zeroCells\`）`);
  out.push('');
  const byKindZero = ARTIFACT_KINDS.map((kind) => ({
    kind,
    zero: matrix.rows.filter((r) => (r.cells[kind] ?? 0) === 0).length,
  })).filter((k) => k.zero > 0);
  if (byKindZero.length > 0) {
    out.push('按列聚合（每个 kind 有多少技术没覆盖）：');
    out.push('');
    for (const { kind, zero } of byKindZero) out.push(`- \`${kind}\`：${zero}/${matrix.rows.length} 个技术未覆盖`);
    out.push('');
  }

  out.push('## 4. 出处与可信度');
  out.push('');
  out.push('| 指标 | 实际 | 门槛 | 结论 |');
  out.push('| --- | --- | --- | --- |');
  out.push(
    `| unverified 占比 | ${formatPercent(provenance.unverified.ratio)}（${provenance.unverified.numerator}/${provenance.unverified.denominator}） | ≤${formatPercent(THRESHOLDS.unverifiedMax, 0)} | ${checkMark(provenance.unverified.pass)} |`,
  );
  out.push(
    `| tldr 不足 ${THRESHOLDS.tldrMinChars} 字 | ${formatPercent(provenance.tldrShort.ratio)}（${provenance.tldrShort.numerator}/${provenance.tldrShort.denominator} 个工具） | <${formatPercent(THRESHOLDS.tldrShortMax, 0)} | ${checkMark(provenance.tldrShort.pass)} |`,
  );
  out.push(`| source 缺失（tool/ai/ecosystem） | ${provenance.sourceMissing.count} | 0 | ${provenance.sourceMissing.count === 0 ? '✔ 达标' : '✘ 超标'} |`);
  out.push(
    `| verified_at 缺失（tool/ai/ecosystem） | ${provenance.verifiedAtMissing.count} | 0 | ${provenance.verifiedAtMissing.count === 0 ? '✔ 达标' : '✘ 超标'} |`,
  );
  out.push('');
  if (provenance.tldrShort.denominator === 0) {
    out.push('> tldr 只对 `tool` 强制（V8）；本轮工具数为 0，占比记为「无数据」而不是 0%。');
    out.push('');
  }
  if (provenance.sourceMissing.ids.length > 0) {
    out.push(`缺 source：${provenance.sourceMissing.ids.map((id) => `\`${id}\``).join(' · ')}`);
    out.push('');
  }
  if (provenance.verifiedAtMissing.ids.length > 0) {
    out.push(`缺 verified_at：${provenance.verifiedAtMissing.ids.map((id) => `\`${id}\``).join(' · ')}`);
    out.push('');
  }

  out.push('## 5. maintain_status = abandoned / stale');
  out.push('');
  out.push(
    `分布：${MAINTAIN_STATUS.map((k) => `${k} ${maintainStatus.distribution[k] ?? 0}`).join(' · ')}` +
      `（另有 ${maintainStatus.unset} 个节点没有该字段：maintain_status 只有 tool 这一维）`,
  );
  out.push('');
  if (maintainStatus.abandonedOrStale.length === 0) {
    out.push('（无：当前没有 `stale` / `abandoned` 的工具）');
  } else {
    out.push('| 工具 | 名称 | 状态 | 类目 | license | verified_at |');
    out.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of maintainStatus.abandonedOrStale) {
      out.push(
        `| \`${item.id}\` | ${mdText(item.name)} | ${item.status} | ${item.category ?? '—'} | ${item.license ?? '—'} | ${item.verified_at ?? '—'} |`,
      );
    }
  }
  out.push('');

  out.push('## 6. ai_ready 分布');
  out.push('');
  out.push(
    `| 取值 | 说明（§4.2） | 工具数 | 占已标注比例 |`,
  );
  out.push('| --- | --- | --- | --- |');
  const AI_LABEL: Record<string, string> = {
    mcp: '有可用 MCP server',
    api: '有稳定 Python/REST/CLI 接口',
    plugin: '仅宿主 GUI 插件',
    none: '纯 GUI，无程序化入口',
  };
  for (const key of AI_READY) {
    const count = aiReady.distribution[key] ?? 0;
    const share = aiReady.applicable === 0 ? '—' : formatPercent(count / aiReady.applicable);
    out.push(`| \`${key}\` | ${AI_LABEL[key] ?? ''} | ${count} | ${share} |`);
  }
  out.push(`| （未标注） | 工具以外的节点 | ${aiReady.unset} | — |`);
  out.push('');

  out.push('## 7. 待办（gap）');
  out.push('');
  if (report.gaps.length === 0) out.push('（无）');
  else for (const gap of report.gaps) out.push(`- ${gap}`);
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 终端摘要
// ---------------------------------------------------------------------------

export function formatCoverageSummary(report: CoverageReport): string {
  const { totals, matrix, provenance } = report;
  const out: string[] = [];

  out.push(`BinAtlas 覆盖率报告 · ${report.dataDir}`);
  out.push(
    `节点 ${totals.nodes}（领域 ${totals.domain} · 技术 ${totals.technique} · 载体 ${totals.artifact} · 工具 ${totals.tool}）· 边 ${totals.edges}`,
  );
  out.push(
    `技术×载体 组合覆盖 ${formatPercent(matrix.ratio)}（${matrix.filled}/${matrix.total}）· 0 覆盖 ${matrix.zeroCells.length} 格`,
  );
  out.push('');

  out.push(`领域覆盖（门槛 工具≥${THRESHOLDS.toolsPerDomain} · 技术≥${THRESHOLDS.techniquesPerDomain} · 矩阵≥${formatPercent(THRESHOLDS.matrixCoverage, 0)}）`);
  const idWidth = Math.max(18, ...report.domains.map((d) => displayWidth(d.id))) + 2;
  out.push(`  ${pad('domain', idWidth)}${pad('工具', 6)}${pad('技术', 6)}${pad('载体', 6)}${pad('矩阵', 9)}${pad('coverage', 10)}结论`);
  for (const d of report.domains) {
    const verdict =
      d.belowThreshold.length === 0 && d.coverageMismatch === null
        ? '达标'
        : `${d.belowThreshold.join('；')}${d.coverageMismatch ? `；${d.coverageMismatch}` : ''}`;
    out.push(
      `  ${pad(d.id, idWidth)}${pad(String(d.tools), 6)}${pad(String(d.techniques), 6)}${pad(String(d.artifacts), 6)}` +
        `${pad(formatPercent(d.matrix.ratio), 9)}${pad(d.coverage, 10)}${verdict}`,
    );
  }
  out.push('');

  out.push(
    `出处  unverified ${provenance.unverified.numerator}/${provenance.unverified.denominator}（${formatPercent(provenance.unverified.ratio)}，≤${formatPercent(THRESHOLDS.unverifiedMax, 0)} ${checkMark(provenance.unverified.pass)}）` +
      ` · tldr<${THRESHOLDS.tldrMinChars} 字 ${provenance.tldrShort.numerator}/${provenance.tldrShort.denominator}（${formatPercent(provenance.tldrShort.ratio)}）` +
      ` · source 缺失 ${provenance.sourceMissing.count} · verified_at 缺失 ${provenance.verifiedAtMissing.count}`,
  );
  out.push(
    `维护  abandoned ${report.maintainStatus.distribution.abandoned ?? 0} · stale ${report.maintainStatus.distribution.stale ?? 0}` +
      ` · active ${report.maintainStatus.distribution.active ?? 0} · unknown ${report.maintainStatus.distribution.unknown ?? 0}` +
      `（另有 ${report.maintainStatus.unset} 个非工具节点没有该字段）`,
  );
  out.push(
    `AI    mcp ${report.aiReady.distribution.mcp ?? 0} · api ${report.aiReady.distribution.api ?? 0}` +
      ` · plugin ${report.aiReady.distribution.plugin ?? 0} · none ${report.aiReady.distribution.none ?? 0}` +
      `（已标注 ${report.aiReady.applicable} / 未标注 ${report.aiReady.unset}）`,
  );
  out.push('');

  out.push(`待办 ${report.gaps.length} 条`);
  for (const gap of report.gaps) out.push(`  · ${gap}`);
  return out.join('\n');
}
