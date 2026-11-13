/**
 * 工作流派生：勾选 2–6 条技术 → 按 `upstream` 边做拓扑排序。
 *
 * 依赖来源（v3 投影）：
 * - 主来源是 `nodes.json` 的 `prerequisites`（175/193 条技术有）；
 * - 再用 `edges.upstream` 补齐 prerequisites 没覆盖到的边（当前数据有 3 条）；
 *   两者按 (from,to) 合并去重，边上的 rationale 优先展示。
 * - 前置指向不存在的节点时标为「引用缺失」，不静默丢。
 *
 * 环检测：Kahn 排不完就说明有环，用 DFS 把环上的节点捞出来对用户点名，不静默丢弃。
 */
import type { AtlasData, AtlasNode } from './types';

export interface WorkflowEdge {
  from: string;
  to: string;
  rationale: string;
}

export interface MissingDependency {
  id: string;
  name: string;
  /** false = 选中的前置 id 在节点表里不存在（悬空引用），要如实标注 */
  known: boolean;
}

export interface WorkflowStep {
  node: AtlasNode;
  /** 1-based 步骤号 */
  index: number;
  /** 依赖的步骤号（可能为空） */
  requires: number[];
  /** 未勾选的前置技术 */
  missing: MissingDependency[];
  commandCount: number;
  pitfallCount: number;
  /** 落在环上，排序结果不可信 */
  inCycle: boolean;
}

export interface WorkflowPlan {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  /** 环上的节点 id，首尾相接（无环为 null） */
  cycle: string[] | null;
  /** 环上节点名，按环顺序（末项重复首项） */
  cycleNames: string[];
  /** 因环而无法排序的节点（环 + 环的后继） */
  unordered: string[];
  /** 所选技术之间是否存在前置关系（prerequisites ∪ upstream） */
  hasEdges: boolean;
  /** 选中的技术里有几成没登记任何命令 */
  emptyCommandCount: number;
}

export const WORKFLOW_MIN = 2;
export const WORKFLOW_MAX = 6;

export function buildWorkflow(selectedIds: readonly string[], data: AtlasData): WorkflowPlan {
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const id of selectedIds) {
    if (seen.has(id)) continue;
    const node = data.nodesById.get(id);
    if (node === undefined || node.kind !== 'technique') continue;
    seen.add(id);
    selected.push(id);
  }

  const edges: WorkflowEdge[] = [];
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>(selected.map((id) => [id, 0] as const));
  const edgeRationale = new Map<string, string>();
  const pairKey = (from: string, to: string): string => `${from}\u0000${to}`;

  for (const edge of data.edges) {
    if (edge.kind === 'upstream') edgeRationale.set(pairKey(edge.from, edge.to), edge.rationale);
  }

  /** 合并同一对依赖：prerequisites 与 upstream 边可能指向同一条，rationale 优先取边上的 */
  const addDependency = (from: string, to: string, rationale: string): void => {
    if (from === to || !seen.has(from) || !seen.has(to)) return;
    if (edges.some((existing) => existing.from === from && existing.to === to)) return;
    edges.push({ from, to, rationale: rationale !== '' ? rationale : (edgeRationale.get(pairKey(from, to)) ?? '') });
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
    const bucket = outgoing.get(from);
    if (bucket === undefined) outgoing.set(from, [to]);
    else bucket.push(to);
  };

  // 主来源：prerequisites
  for (const id of selected) {
    const node = data.nodesById.get(id);
    if (node === undefined) continue;
    for (const prerequisiteId of node.prerequisites ?? []) {
      addDependency(prerequisiteId, id, '');
    }
  }

  // 补齐：upstream 边（两者都选中才算一条选中的依赖）
  for (const edge of data.edges) {
    if (edge.kind !== 'upstream') continue;
    if (!seen.has(edge.from) || !seen.has(edge.to)) continue;
    addDependency(edge.from, edge.to, edge.rationale);
  }

  // Kahn：按勾选顺序取入度为 0 的节点，保证同一份选择每次得到同一个顺序
  const remaining = new Set(selected);
  const order: string[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const id of selected) {
      if (!remaining.has(id)) continue;
      if ((indegree.get(id) ?? 0) > 0) continue;
      order.push(id);
      remaining.delete(id);
      for (const next of outgoing.get(id) ?? []) {
        indegree.set(next, (indegree.get(next) ?? 1) - 1);
      }
      progressed = true;
      break;
    }
  }

  const cycle = remaining.size > 0 ? findCycle([...remaining], selected, outgoing) : null;
  const unordered = remaining.size > 0 ? [...remaining].sort((a, b) => selected.indexOf(a) - selected.indexOf(b)) : [];
  const inCycle = new Set(cycle ?? []);

  // 环上的节点排在最后：顺序不可信，但必须让用户看见它们
  const orderedIds = [...order, ...unordered];
  const stepNumberOf = new Map<string, number>(orderedIds.map((id, index) => [id, index + 1] as const));

  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const bucket = incoming.get(edge.to);
    if (bucket === undefined) incoming.set(edge.to, [edge.from]);
    else bucket.push(edge.from);
  }

  const steps: WorkflowStep[] = [];
  let emptyCommandCount = 0;

  for (const id of orderedIds) {
    const node = data.nodesById.get(id);
    if (node === undefined) continue;

    const requires: number[] = [];
    for (const from of incoming.get(id) ?? []) {
      const index = stepNumberOf.get(from);
      if (index !== undefined) requires.push(index);
    }

    // 前置未选：prerequisites ∪ upstream 边里所有不在本次勾选里的来源
    const missing: MissingDependency[] = [];
    const seenMissing = new Set<string>();
    const pushMissing = (sourceId: string): void => {
      if (seen.has(sourceId) || seenMissing.has(sourceId)) return;
      seenMissing.add(sourceId);
      const source = data.nodesById.get(sourceId);
      missing.push({ id: sourceId, name: source?.name ?? sourceId, known: source !== undefined });
    };

    for (const prerequisiteId of node.prerequisites ?? []) pushMissing(prerequisiteId);
    for (const edge of data.edges) {
      if (edge.kind !== 'upstream' || edge.to !== id) continue;
      pushMissing(edge.from);
    }

    const commandCount = node.commands?.length ?? 0;
    if (commandCount === 0) emptyCommandCount += 1;

    steps.push({
      node,
      index: steps.length + 1,
      requires: requires.sort((a, b) => a - b),
      missing,
      commandCount,
      pitfallCount: node.pitfalls?.length ?? 0,
      inCycle: inCycle.has(id),
    });
  }

  return {
    steps,
    edges,
    cycle,
    cycleNames: (cycle ?? []).map((id) => data.nodesById.get(id)?.name ?? id),
    unordered,
    hasEdges: edges.length > 0,
    emptyCommandCount,
  };
}

/** 在选中的子图里找一条环（DFS 三色标记），返回首尾相接的节点链 */
function findCycle(nodes: string[], selection: string[], outgoing: Map<string, string[]>): string[] | null {
  const inRemaining = new Set(nodes);
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    color.set(id, 1);
    stack.push(id);

    for (const next of outgoing.get(id) ?? []) {
      if (!inRemaining.has(next)) continue;
      const state = color.get(next) ?? 0;
      if (state === 1) {
        const start = stack.indexOf(next);
        return [...stack.slice(start), next];
      }
      if (state === 0) {
        const found = visit(next);
        if (found !== null) return found;
      }
    }

    stack.pop();
    color.set(id, 2);
    return null;
  };

  for (const id of [...nodes].sort((a, b) => selection.indexOf(a) - selection.indexOf(b))) {
    if ((color.get(id) ?? 0) !== 0) continue;
    const found = visit(id);
    if (found !== null) return found;
  }

  return null;
}
