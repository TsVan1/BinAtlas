/**
 * 目录树派生：`nodes.json` 的 parent/part_of → 三级树（顶级领域 → 子领域 → 技术）。
 *
 * 两条必须写死的映射规则（数据现状，不是设计选择）：
 * 1. 178 条主技术的 `parent` 指向子领域，直接可用；
 * 2. 15 条试点领域的技术**没有 parent**，靠 `part_of` 边挂到顶级领域。
 *    不兜底的话这 15 条永远进不了树，等于凭空丢数据。
 *
 * 汇总条数（顶级 40 = 其下 5 个子领域之和）在这里算，UI 只负责显示。
 */
import type { AtlasData, AtlasNode } from './types';

export interface DomainEntry {
  node: AtlasNode;
  /** 0 = 顶级领域，1 = 子领域（当前数据只有两级领域） */
  depth: number;
  /** 含子级的汇总技术数 */
  total: number;
  /** 直接挂在自身下的技术（试点领域是 0 级直挂） */
  ownTechniques: AtlasNode[];
  children: DomainEntry[];
  parentId: string | null;
  /** 所属顶级领域 id；自身是顶级时等于自己的 id */
  topId: string;
}

export interface AtlasTree {
  roots: DomainEntry[];
  domainsById: Map<string, DomainEntry>;
  /** 技术 id → 挂载到的领域 id（parent ?? part_of） */
  parentOfTechnique: Map<string, string>;
  /** 全部技术（无论是否成功挂载） */
  techniques: AtlasNode[];
  /** 既没有 parent 也没有 part_of 的技术：树里放不下，但不许静默消失 */
  orphans: AtlasNode[];
  totalTechniques: number;
}

const compareText = (a: string, b: string): number => a.localeCompare(b, 'zh-Hans-CN');

/** 技术排序：先有命令模板的（可上手的），再按名字，保证每次刷新一致 */
function compareTechniques(a: AtlasNode, b: AtlasNode): number {
  const ca = a.commands?.length ?? 0;
  const cb = b.commands?.length ?? 0;
  if (ca === 0 !== (cb === 0)) return ca === 0 ? 1 : -1;
  return compareText(a.name, b.name);
}

/** 顶级领域排序：技术多的先出现（主领域在前，试点领域在后） */
function compareDomains(a: DomainEntry, b: DomainEntry): number {
  if (a.total !== b.total) return b.total - a.total;
  return compareText(a.node.name, b.node.name);
}

export function buildTree(data: AtlasData): AtlasTree {
  const domains = data.nodes.filter((node) => node.kind === 'domain');
  const domainIds = new Set(domains.map((domain) => domain.id));

  const partOfTarget = new Map<string, string>();
  for (const edge of data.edges) {
    if (edge.kind === 'part_of' && !partOfTarget.has(edge.from)) partOfTarget.set(edge.from, edge.to);
  }

  const techniques = data.nodes.filter((node) => node.kind === 'technique');
  const techniquesByParent = new Map<string, AtlasNode[]>();
  const parentOfTechnique = new Map<string, string>();
  const orphans: AtlasNode[] = [];

  for (const technique of techniques) {
    const declared = technique.parent;
    const parent =
      declared !== undefined && domainIds.has(declared)
        ? declared
        : partOfTarget.get(technique.id) !== undefined && domainIds.has(partOfTarget.get(technique.id) as string)
          ? (partOfTarget.get(technique.id) as string)
          : null;

    if (parent === null) {
      orphans.push(technique);
      continue;
    }

    parentOfTechnique.set(technique.id, parent);
    const bucket = techniquesByParent.get(parent);
    if (bucket === undefined) techniquesByParent.set(parent, [technique]);
    else bucket.push(technique);
  }

  const childrenByParent = new Map<string, AtlasNode[]>();
  for (const domain of domains) {
    const parent = domain.parent;
    if (parent === undefined || !domainIds.has(parent)) continue;
    const bucket = childrenByParent.get(parent);
    if (bucket === undefined) childrenByParent.set(parent, [domain]);
    else bucket.push(domain);
  }

  const domainsById = new Map<string, DomainEntry>();

  const buildEntry = (node: AtlasNode, depth: number, topId: string, parentId: string | null): DomainEntry => {
    const ownTechniques = [...(techniquesByParent.get(node.id) ?? [])].sort(compareTechniques);
    // 领域层级只有两级：第三层一定收口成技术，不再递归子领域
    const childNodes = depth === 0 ? [...(childrenByParent.get(node.id) ?? [])] : [];
    const children = childNodes
      .map((child) => buildEntry(child, depth + 1, depth === 0 ? child.id : topId, node.id))
      .sort(compareDomains);

    const total = ownTechniques.length + children.reduce((sum, child) => sum + child.total, 0);
    const entry: DomainEntry = { node, depth, total, ownTechniques, children, parentId, topId };
    domainsById.set(node.id, entry);
    return entry;
  };

  const rootNodes = domains.filter((domain) => domain.parent === undefined || !domainIds.has(domain.parent));
  const roots = rootNodes.map((node) => buildEntry(node, 0, node.id, null)).sort(compareDomains);

  return {
    roots,
    domainsById,
    parentOfTechnique,
    techniques,
    orphans,
    totalTechniques: techniques.length,
  };
}

export function allDomainIds(tree: AtlasTree): string[] {
  return [...tree.domainsById.keys()];
}

/** 某节点所属的领域链（顶级 → 子领域）；技术返回其挂载链，领域返回自身链 */
export function domainPathOf(tree: AtlasTree, nodeId: string): DomainEntry[] {
  const entry = tree.domainsById.get(nodeId);
  if (entry !== undefined) {
    const path: DomainEntry[] = [];
    let cursor: DomainEntry | undefined = entry;
    while (cursor !== undefined) {
      path.unshift(cursor);
      cursor = cursor.parentId === null ? undefined : tree.domainsById.get(cursor.parentId);
    }
    return path;
  }

  const parentId = tree.parentOfTechnique.get(nodeId);
  return parentId === undefined ? [] : domainPathOf(tree, parentId);
}

/** 选中某节点时需要自动展开的领域 id 集合（不含技术自身） */
export function expandChainFor(tree: AtlasTree, nodeId: string): string[] {
  return domainPathOf(tree, nodeId).map((entry) => entry.node.id);
}

/** 领域下所有技术（含子领域），中间栏的「领域概览」用 */
export function techniquesUnder(entry: DomainEntry): AtlasNode[] {
  const out: AtlasNode[] = [...entry.ownTechniques];
  for (const child of entry.children) out.push(...techniquesUnder(child));
  return out;
}

// ---------------------------------------------------------------------------
// 扁平化：树 → 可见行（键盘上下移动、搜索过滤、展开状态都只作用在这一层）
// ---------------------------------------------------------------------------

export interface TreeRow {
  /** 稳定 key：`d:<domainId>` / `t:<techniqueId>` */
  uid: string;
  id: string;
  name: string;
  depth: number;
  type: 'domain' | 'technique';
  /** 显示用计数：过滤时是命中数，否则是汇总数 */
  count: number;
  /** 未过滤时的汇总数（过滤态下用来显示 `命中/总数`） */
  total: number;
  expandable: boolean;
  expanded: boolean;
  node: AtlasNode;
}

export interface FlattenOptions {
  expanded: ReadonlySet<string>;
  query: string;
}

const normalize = (text: string): string => text.trim().toLowerCase();

function techniqueMatches(node: AtlasNode, needle: string): boolean {
  if (needle === '') return true;
  return (
    node.name.toLowerCase().includes(needle) ||
    node.id.toLowerCase().includes(needle) ||
    node.def.toLowerCase().includes(needle)
  );
}

function domainSelfMatches(node: AtlasNode, needle: string): boolean {
  return needle !== '' && (node.name.toLowerCase().includes(needle) || node.id.toLowerCase().includes(needle));
}

/**
 * 生成当前可见行。搜索时忽略展开状态（全开），并只保留有命中的分支；
 * 计数重算为命中数，父节点不会因为过滤而显示一个假的汇总值。
 */
export function flattenTree(tree: AtlasTree, options: FlattenOptions): TreeRow[] {
  const needle = normalize(options.query);
  const filtering = needle !== '';

  const techMatch = new Map<string, boolean>();
  if (filtering) {
    for (const technique of tree.techniques) techMatch.set(technique.id, techniqueMatches(technique, needle));
  }

  const matchedTotal = new Map<string, number>();

  const computeMatched = (entry: DomainEntry): number => {
    if (!filtering) return entry.total;
    if (domainSelfMatches(entry.node, needle)) {
      matchedTotal.set(entry.node.id, entry.total);
      return entry.total;
    }
    let count = entry.ownTechniques.filter((technique) => techMatch.get(technique.id) === true).length;
    for (const child of entry.children) count += computeMatched(child);
    matchedTotal.set(entry.node.id, count);
    return count;
  };

  const rows: TreeRow[] = [];

  const pushTechnique = (technique: AtlasNode, depth: number): void => {
    rows.push({
      uid: `t:${technique.id}`,
      id: technique.id,
      name: technique.name,
      depth,
      type: 'technique',
      count: 1,
      total: 1,
      expandable: false,
      expanded: false,
      node: technique,
    });
  };

  const walk = (entry: DomainEntry): void => {
    const matched = filtering ? (matchedTotal.get(entry.node.id) ?? 0) : entry.total;
    const selfMatch = filtering && domainSelfMatches(entry.node, needle);
    if (filtering && matched === 0 && !selfMatch) return;

    const open = filtering || options.expanded.has(entry.node.id);

    rows.push({
      uid: `d:${entry.node.id}`,
      id: entry.node.id,
      name: entry.node.name,
      depth: entry.depth,
      type: 'domain',
      count: filtering ? matched : entry.total,
      total: entry.total,
      expandable: entry.children.length > 0 || entry.ownTechniques.length > 0,
      expanded: open,
      node: entry.node,
    });

    if (!open) return;

    for (const child of entry.children) walk(child);

    const own = filtering && !selfMatch ? entry.ownTechniques.filter((technique) => techMatch.get(technique.id) === true) : entry.ownTechniques;
    for (const technique of own) pushTechnique(technique, entry.depth + 1);
  };

  for (const root of tree.roots) computeMatched(root);
  for (const root of tree.roots) walk(root);
  if (filtering) {
    // 挂载失败的技术不该在搜索里消失：单列在树末尾，depth 1 保持可点
    for (const orphan of tree.orphans) {
      if (techMatch.get(orphan.id) === true) pushTechnique(orphan, 1);
    }
  }

  return rows;
}

export interface FocusedOptions {
  /** 只看这个领域（矩阵点格子跳转时传入） */
  domainId: string;
  /** 额外的技术过滤条件，例如「覆盖 executable 载体」 */
  accept?: (node: AtlasNode) => boolean;
  query: string;
}

/**
 * 聚焦模式：只渲染某个领域的祖先链 + 它下面的技术。
 *
 * 与 `flattenTree` 分开的原因是语义不同：聚焦时「展开状态」没有意义（就两行祖先链），
 * 计数要按 accept + query 重算，否则用户会看到「8 条」但实际上只筛出 3 条。
 */
export function flattenFocused(tree: AtlasTree, options: FocusedOptions): TreeRow[] {
  const entry = tree.domainsById.get(options.domainId);
  if (entry === undefined) return [];

  const path = domainPathOf(tree, options.domainId);
  const needle = normalize(options.query);
  const matched = techniquesUnder(entry).filter(
    (technique) =>
      (options.accept === undefined || options.accept(technique)) &&
      (needle === '' || techniqueMatches(technique, needle)),
  );

  const rows: TreeRow[] = [];

  for (const step of path) {
    rows.push({
      uid: `d:${step.node.id}`,
      id: step.node.id,
      name: step.node.name,
      depth: step.depth,
      type: 'domain',
      count: matched.length,
      total: step.total,
      expandable: true,
      expanded: true,
      node: step.node,
    });
  }

  for (const technique of matched) {
    rows.push({
      uid: `t:${technique.id}`,
      id: technique.id,
      name: technique.name,
      depth: path.length,
      type: 'technique',
      count: 1,
      total: 1,
      expandable: false,
      expanded: false,
      node: technique,
    });
  }

  return rows;
}

