/**
 * 右栏关联的派生：前置/下游以 `nodes.json` 的 `prerequisites` 为主，其余关系从边推。
 *
 * 数据契约（v3 投影）：
 *   `node.prerequisites`  技术的前置技术 id 数组（权威字段）
 *   `A -upstream-> B`     A 是 B 的前置（用于补齐 prerequisites 没覆盖到的 3 条边）
 *   `A -uses-> tool`      A 会用到这个工具
 *   `A -applies_to-> art` A 作用于这个载体
 *   `tech -part_of-> domain` 技术挂在领域下（试点领域没有 parent 时的兜底）
 *
 * 原则：prerequisites 是主来源；upstream 边里没写进 prerequisites 的补在后面，不静默丢；
 * 指向不存在节点的前置 id 单独列进 `missingPrerequisites`，由 UI 标灰。
 */
import type { AtlasData, AtlasNode } from './types';
import type { AtlasTree } from './tree';
import { domainPathOf, techniquesUnder } from './tree';

export interface RelatedNode {
  node: AtlasNode;
  rationale: string;
}

export interface ChildDomain {
  node: AtlasNode;
  count: number;
}

export interface Relations {
  /** 顶级 → 子领域的链（domain 自身包含在内，UI 自己决定是否去掉末项） */
  parentChain: AtlasNode[];
  childDomains: ChildDomain[];
  /** domain 节点：自身及子领域下的全部技术 */
  domainTechniques: AtlasNode[];
  /** 前置技术：prerequisites 为主，upstream 边补齐 */
  prerequisites: RelatedNode[];
  /** prerequisites 里指向不存在节点的 id（引用缺失，标灰显示） */
  missingPrerequisites: string[];
  downstream: RelatedNode[];
  complements: RelatedNode[];
  alternatives: RelatedNode[];
  tools: RelatedNode[];
  /** tool 节点：哪些技术用它 */
  usedBy: RelatedNode[];
  /** artifact 节点：哪些技术 applies_to 它 */
  appliedBy: RelatedNode[];
  /** artifact 节点：哪些技术的 artifacts[] 里声明了它 */
  declaredBy: AtlasNode[];
  artifacts: AtlasNode[];
  partOf: AtlasNode[];
  /** 除了树上的父节点，还归属哪些领域 */
  alsoIn: AtlasNode[];
}

const empty = (): Relations => ({
  parentChain: [],
  childDomains: [],
  domainTechniques: [],
  prerequisites: [],
  missingPrerequisites: [],
  downstream: [],
  complements: [],
  alternatives: [],
  tools: [],
  usedBy: [],
  appliedBy: [],
  declaredBy: [],
  artifacts: [],
  partOf: [],
  alsoIn: [],
});

/** 同一目标可能被多条来源指向：保留第一条有内容的 rationale，不重复列 */
function pushUnique(list: RelatedNode[], node: AtlasNode, rationale: string): void {
  const existing = list.find((item) => item.node.id === node.id);
  if (existing !== undefined) {
    if (existing.rationale === '' && rationale !== '') existing.rationale = rationale;
    return;
  }
  list.push({ node, rationale });
}

export function deriveRelations(node: AtlasNode, data: AtlasData, tree: AtlasTree): Relations {
  const relations = empty();
  const { nodesById } = data;
  const resolve = (id: string): AtlasNode | undefined => nodesById.get(id);

  const upstreamRationale = new Map<string, string>();
  for (const edge of data.edges) {
    if (edge.kind === 'upstream') upstreamRationale.set(`${edge.from}\u0000${edge.to}`, edge.rationale);
  }

  // ---- 前置：prerequisites 为主 ----
  for (const prerequisiteId of node.prerequisites ?? []) {
    const target = resolve(prerequisiteId);
    if (target === undefined) {
      // 不静默丢：引用缺失的 id 单独记录
      relations.missingPrerequisites.push(prerequisiteId);
      continue;
    }
    pushUnique(relations.prerequisites, target, upstreamRationale.get(`${prerequisiteId}\u0000${node.id}`) ?? '');
  }

  // ---- 前置：upstream 边里没写进 prerequisites 的补在后面 ----
  for (const edge of data.edges) {
    if (edge.kind !== 'upstream' || edge.to !== node.id) continue;
    const source = resolve(edge.from);
    if (source !== undefined) pushUnique(relations.prerequisites, source, edge.rationale);
  }

  // ---- 下游：凡是 prerequisites 含当前 id 的技术 ----
  for (const candidate of data.nodes) {
    if (candidate.kind !== 'technique' || candidate.id === node.id) continue;
    if (!(candidate.prerequisites ?? []).includes(node.id)) continue;
    pushUnique(relations.downstream, candidate, upstreamRationale.get(`${node.id}\u0000${candidate.id}`) ?? '');
  }

  // ---- 下游：upstream 边补齐 ----
  for (const edge of data.edges) {
    if (edge.kind !== 'upstream' || edge.from !== node.id) continue;
    const target = resolve(edge.to);
    if (target !== undefined) pushUnique(relations.downstream, target, edge.rationale);
  }

  // ---- 其余关系：仍从边来 ----
  for (const edge of data.edges) {
    if (edge.from === node.id) {
      const target = resolve(edge.to);
      if (target === undefined) continue;
      switch (edge.kind) {
        case 'complements':
          pushUnique(relations.complements, target, edge.rationale);
          break;
        case 'alternative':
          pushUnique(relations.alternatives, target, edge.rationale);
          break;
        case 'uses':
          pushUnique(relations.tools, target, edge.rationale);
          break;
        case 'part_of':
          relations.partOf.push(target);
          break;
        default:
          break;
      }
    }

    if (edge.to === node.id) {
      const source = resolve(edge.from);
      if (source === undefined) continue;
      switch (edge.kind) {
        case 'complements':
          pushUnique(relations.complements, source, edge.rationale);
          break;
        case 'alternative':
          pushUnique(relations.alternatives, source, edge.rationale);
          break;
        case 'uses':
          pushUnique(relations.usedBy, source, edge.rationale);
          break;
        case 'applies_to':
          pushUnique(relations.appliedBy, source, edge.rationale);
          break;
        default:
          break;
      }
    }
  }

  relations.parentChain = domainPathOf(tree, node.id).map((entry) => entry.node);

  const entry = tree.domainsById.get(node.id);
  if (entry !== undefined) {
    relations.childDomains = entry.children.map((child) => ({ node: child.node, count: child.total }));
    relations.domainTechniques = techniquesUnder(entry);
  }

  for (const artifactId of node.artifacts) {
    const artifact = resolve(artifactId);
    if (artifact !== undefined) relations.artifacts.push(artifact);
  }

  if (node.kind === 'artifact') {
    for (const candidate of data.nodes) {
      if (candidate.kind !== 'technique') continue;
      if (candidate.artifacts.includes(node.id)) relations.declaredBy.push(candidate);
    }
  }

  const effectiveParent = node.kind === 'domain' ? node.parent : tree.parentOfTechnique.get(node.id);
  relations.alsoIn = node.domain
    .filter((id) => id !== node.id && id !== effectiveParent)
    .map((id) => resolve(id))
    .filter((item): item is AtlasNode => item !== undefined);

  return relations;
}

/** 未选中节点时的空关系表：避免组件里到处写 null 分支 */
export const EMPTY_RELATIONS: Relations = empty();
