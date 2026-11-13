/**
 * 数据装载层：`public/graph/*.json` → 运行时 `AtlasData`。
 *
 * 三条原则：
 * 1. **文件不存在**不是崩溃，是可解释的错误（`AtlasDataError.kind === 'missing'`），
 *    UI 会显示「请先运行 pnpm build」。这是 gitignored 构建产物的正常状态。
 * 2. **解析期不信任任何字段**：类型不对就降级或跳过，并记进 warnings，绝不 throw 到白屏。
 * 3. **不补数据**：缺字段就是缺，不猜默认值。
 */
import type { AtlasCommand, AtlasData, AtlasEdge, AtlasNode, GraphMeta, SearchDoc } from './types';
import { truncate } from './format';

/** 构建产物目录；BASE_URL 跟随 Vite 的 base 配置（默认 /） */
const GRAPH_DIR = `${import.meta.env.BASE_URL}graph/`;

export type AtlasFile = 'nodes.json' | 'edges.json' | 'index.json' | 'meta.json';

export type AtlasErrorKind = 'missing' | 'malformed' | 'network';

export class AtlasDataError extends Error {
  readonly kind: AtlasErrorKind;
  readonly file: AtlasFile;

  constructor(kind: AtlasErrorKind, file: AtlasFile, detail: string) {
    super(detail);
    this.name = 'AtlasDataError';
    this.kind = kind;
    this.file = file;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const readFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** 命令模板：`cmd` 为空的条目直接丢（复制按钮没有可复制的内容） */
function parseCommands(raw: unknown): AtlasCommand[] {
  if (!Array.isArray(raw)) return [];

  const items: AtlasCommand[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const cmd = readString(entry['cmd']).trim();
    if (cmd === '') continue;
    const note = readString(entry['note']).trim();
    items.push(note === '' ? { cmd } : { cmd, note });
  }
  return items;
}

const readNonEmptyStrings = (value: unknown): string[] =>
  readStringArray(value).filter((item) => item.trim() !== '');

async function readJson(file: AtlasFile, signal: AbortSignal): Promise<unknown> {
  const url = `${GRAPH_DIR}${file}`;
  let response: Response;

  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AtlasDataError('network', file, `请求 ${url} 失败：dev server 没起来或地址不对`);
  }

  if (response.status === 404) {
    throw new AtlasDataError('missing', file, `找不到 ${url}`);
  }
  if (!response.ok) {
    throw new AtlasDataError('malformed', file, `${url} 返回 HTTP ${response.status}`);
  }

  const text = await response.text();
  // Vite 的 SPA 兜底会把不存在的资源回成 index.html，用 HTML 特征识别「文件根本不存在」
  if (text.trimStart().startsWith('<')) {
    throw new AtlasDataError('missing', file, `${url} 返回的是 HTML，说明构建产物不存在`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AtlasDataError('malformed', file, `${url} 不是合法 JSON`);
  }
}

interface ParseResult<T> {
  items: T[];
  dropped: number;
}

function parseNodes(raw: unknown): ParseResult<AtlasNode> {
  if (!Array.isArray(raw)) {
    throw new AtlasDataError('malformed', 'nodes.json', 'nodes.json 的根节点不是数组');
  }

  const items: AtlasNode[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const entry of raw) {
    if (!isRecord(entry)) {
      dropped += 1;
      continue;
    }

    const id = readString(entry['id']).trim();
    const kind = readString(entry['kind']).trim();
    const name = readString(entry['name']).trim();

    if (id === '' || kind === '' || name === '' || seen.has(id)) {
      dropped += 1;
      continue;
    }
    seen.add(id);

    const node: AtlasNode = {
      id,
      kind,
      name,
      def: readString(entry['def']),
      domain: readStringArray(entry['domain']),
      artifacts: readStringArray(entry['artifacts']),
      platforms: readStringArray(entry['platforms']),
    };

    const difficulty = readFiniteNumber(entry['difficulty']);
    if (difficulty !== undefined) node.difficulty = difficulty;
    const importance = readFiniteNumber(entry['importance']);
    if (importance !== undefined) node.importance = importance;

    const category = readString(entry['category']).trim();
    if (category !== '') node.category = category;
    const aiReady = readString(entry['ai_ready']).trim();
    if (aiReady !== '') node.ai_ready = aiReady;
    const maintainStatus = readString(entry['maintain_status']).trim();
    if (maintainStatus !== '') node.maintain_status = maintainStatus;
    const license = readString(entry['license']).trim();
    if (license !== '') node.license = license;

    // v2：目录树父节点 + 作战手册三件套
    const parent = readString(entry['parent']).trim();
    if (parent !== '') node.parent = parent;

    const commands = parseCommands(entry['commands']);
    if (commands.length > 0) node.commands = commands;

    const pitfalls = readNonEmptyStrings(entry['pitfalls']);
    if (pitfalls.length > 0) node.pitfalls = pitfalls;

    // v4：作战手册的详情 / 原理 / 操作步骤。试点技术没有这三块，缺了就当没有
    const detail = readString(entry['detail']).trim();
    if (detail !== '') node.detail = detail;

    const principle = readString(entry['principle']).trim();
    if (principle !== '') node.principle = principle;

    const procedure = readNonEmptyStrings(entry['procedure']);
    if (procedure.length > 0) node.procedure = procedure;

    const references = readNonEmptyStrings(entry['references']);
    if (references.length > 0) node.references = references;

    // v3：载体类别 + 前置技术（投影层已保证取值，这里仍然容忍缺失）
    const artifactKind = readString(entry['artifact_kind']).trim();
    if (artifactKind !== '') node.artifact_kind = artifactKind;

    const prerequisites = readNonEmptyStrings(entry['prerequisites']);
    if (prerequisites.length > 0) {
      node.prerequisites = [...new Set(prerequisites)];
    }

    items.push(node);
  }

  return { items, dropped };
}

function parseEdges(raw: unknown, nodeIds: ReadonlySet<string>): ParseResult<AtlasEdge> & { dangling: number } {
  if (!Array.isArray(raw)) {
    throw new AtlasDataError('malformed', 'edges.json', 'edges.json 的根节点不是数组');
  }

  const items: AtlasEdge[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  let dangling = 0;

  for (const entry of raw) {
    if (!isRecord(entry)) {
      dropped += 1;
      continue;
    }

    const from = readString(entry['from']).trim();
    const to = readString(entry['to']).trim();
    if (from === '' || to === '') {
      dropped += 1;
      continue;
    }
    // 端点缺失的边不渲染（否则 graphology 会在 addEdge 时抛错），但要如实计数
    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      dangling += 1;
      continue;
    }
    if (from === to) {
      dropped += 1;
      continue;
    }

    const kind = readString(entry['kind']).trim() || 'unknown';
    const dedupeKey = `${from}\u0000${to}\u0000${kind}`;
    if (seen.has(dedupeKey)) {
      dropped += 1;
      continue;
    }
    seen.add(dedupeKey);

    const edge: AtlasEdge = { from, to, kind, rationale: readString(entry['rationale']) };
    const weight = readFiniteNumber(entry['weight']);
    if (weight !== undefined) edge.weight = weight;

    items.push(edge);
  }

  return { items, dropped, dangling };
}

function parseIndex(raw: unknown): ParseResult<SearchDoc> {
  if (!Array.isArray(raw)) {
    throw new AtlasDataError('malformed', 'index.json', 'index.json 的根节点不是数组');
  }

  const items: SearchDoc[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const entry of raw) {
    if (!isRecord(entry)) {
      dropped += 1;
      continue;
    }

    const id = readString(entry['id']).trim();
    const name = readString(entry['name']).trim();
    if (id === '' || name === '' || seen.has(id)) {
      dropped += 1;
      continue;
    }
    seen.add(id);

    items.push({
      id,
      name,
      aliases: readStringArray(entry['aliases']),
      kind: readString(entry['kind']).trim(),
      tldr: readString(entry['tldr']),
    });
  }

  return { items, dropped };
}

function parseMeta(raw: unknown): GraphMeta {
  if (!isRecord(raw)) return {};

  const meta: GraphMeta = {};
  const builtAt = readString(raw['builtAt']);
  if (builtAt !== '') meta.builtAt = builtAt;
  const schemaVersion = readString(raw['schemaVersion']);
  if (schemaVersion !== '') meta.schemaVersion = schemaVersion;

  const counts = raw['counts'];
  if (isRecord(counts)) {
    const parsed: Record<string, number> = {};
    for (const [key, value] of Object.entries(counts)) {
      if (typeof value === 'number' && Number.isFinite(value)) parsed[key] = value;
    }
    meta.counts = parsed;
  }

  const warnings = raw['warnings'];
  if (Array.isArray(warnings)) {
    meta.warnings = warnings.filter((item): item is string => typeof item === 'string');
  }

  return meta;
}

/** 索引缺失时的兜底：用节点自身字段拼出可搜索条目（别名不可得，如实记进 warnings） */
function fallbackIndex(nodes: AtlasNode[]): SearchDoc[] {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    aliases: [],
    kind: node.kind,
    tldr: truncate(node.def, 80),
  }));
}

export async function loadAtlas(signal: AbortSignal): Promise<AtlasData> {
  const [nodesRaw, edgesRaw, indexRaw, metaRaw] = await Promise.all([
    readJson('nodes.json', signal),
    readJson('edges.json', signal),
    readJson('index.json', signal),
    readJson('meta.json', signal),
  ]);

  const nodesResult = parseNodes(nodesRaw);
  const nodes = nodesResult.items;
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));

  const edgesResult = parseEdges(edgesRaw, new Set(nodesById.keys()));

  let indexResult = parseIndex(indexRaw);
  // 索引里指向不存在节点的条目会让搜索选中一个画布上没有的 id，直接剔除
  const orphanIndex = indexResult.items.filter((doc) => !nodesById.has(doc.id)).length;
  let index = indexResult.items.filter((doc) => nodesById.has(doc.id));

  const meta = parseMeta(metaRaw);
  const warnings: string[] = [...(meta.warnings ?? [])];

  if (nodesResult.dropped > 0) {
    warnings.push(`nodes.json 有 ${nodesResult.dropped} 条记录缺少 id/kind/name 或 id 重复，已跳过`);
  }
  if (edgesResult.dangling > 0) {
    warnings.push(`edges.json 有 ${edgesResult.dangling} 条边的端点不在节点表里，已跳过（不渲染悬空边）`);
  }
  if (edgesResult.dropped > 0) {
    warnings.push(`edges.json 有 ${edgesResult.dropped} 条边缺少端点、重复或为自环，已跳过`);
  }
  if (indexResult.dropped > 0 || orphanIndex > 0) {
    warnings.push(`index.json 有 ${indexResult.dropped + orphanIndex} 条索引记录无效或指向不存在的节点，已跳过`);
  }
  if (nodes.length === 0) {
    warnings.push('nodes.json 为空数组：知识库里还没有节点');
  }

  // 索引为空但节点有数据：搜索降级为节点名匹配（无别名、无 tldr 排名）
  if (index.length === 0 && nodes.length > 0) {
    index = fallbackIndex(nodes);
    indexResult = { items: index, dropped: indexResult.dropped };
    warnings.push('index.json 为空：搜索已降级为「节点名/描述」匹配，别名不可用');
  }
  if (index.length !== nodes.length && nodes.length > 0) {
    warnings.push(`index.json 覆盖 ${index.length} 条，与节点数 ${nodes.length} 不一致：未建索引的节点只能按画布点击发现`);
  }

  return {
    nodes,
    edges: edgesResult.items,
    index,
    meta,
    nodesById,
    warnings,
  };
}
