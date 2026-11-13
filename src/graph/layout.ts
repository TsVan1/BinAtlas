/**
 * graphology 建图 + 一次性力导向布局。
 *
 * 边界：
 * - 布局只算**一次**（首次装载后固定），不跑动画、不随筛选重排。
 *   筛选是「压暗非命中」，不是「重新布局」——位置是空间记忆，不能每次都挪。
 * - 边的端点在装载期已校验；这里再做一次防御，因为 graphology 遇到
 *   未知端点会 throw，一个坏边不应该让整张图消失。
 * - 布局随机初始位置用固定种子的 PRNG：同一份数据每次刷新得到同一张图，
 *   否则用户每次回来都要重新认路。
 */
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { kindStyle } from '../lib/palette';
import type { AtlasData } from '../lib/types';

export interface AtlasNodeAttrs {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  kind: string;
  name: string;
  [attribute: string]: unknown;
}

export interface AtlasEdgeAttrs {
  kind: string;
  [attribute: string]: unknown;
}

export type AtlasGraph = Graph<AtlasNodeAttrs, AtlasEdgeAttrs>;

/** 固定种子（mulberry32）：布局可复现，不随刷新漂移 */
const LAYOUT_SEED = 0x5eed1a7;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把布局结果缩放到固定尺度（最大跨度 100 单位）：
 *  这样相机 ratio 的含义与数据规模解耦，标签阈值不会因为节点变多而失灵 */
function normalizePositions(graph: AtlasGraph): void {
  if (graph.order === 0) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  graph.forEachNode((_node, attributes) => {
    minX = Math.min(minX, attributes.x);
    maxX = Math.max(maxX, attributes.x);
    minY = Math.min(minY, attributes.y);
    maxY = Math.max(maxY, attributes.y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const extent = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = 100 / extent;

  graph.forEachNode((node, attributes) => {
    graph.setNodeAttribute(node, 'x', (attributes.x - centerX) * scale);
    graph.setNodeAttribute(node, 'y', (attributes.y - centerY) * scale);
  });
}

export function buildAtlasGraph(data: AtlasData): AtlasGraph {
  const graph = new Graph<AtlasNodeAttrs, AtlasEdgeAttrs>({
    multi: false,
    type: 'directed',
    allowSelfLoops: false,
  });

  const random = mulberry32(LAYOUT_SEED);

  for (const node of data.nodes) {
    const style = kindStyle(node.kind);
    // 极坐标撒点：避免所有节点从同一点出发（FA2 对完全重合的初始位置不友好）
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 100;

    graph.addNode(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size: style.size,
      color: style.color,
      label: node.name,
      kind: node.kind,
      name: node.name,
    });
  }

  for (const edge of data.edges) {
    if (edge.from === edge.to) continue;
    if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) continue;
    // multi: false：同一对端点重复加边会抛 UsageGraphError
    if (graph.hasEdge(edge.from, edge.to)) continue;
    graph.addEdge(edge.from, edge.to, { kind: edge.kind });
  }

  if (graph.order > 1) {
    forceAtlas2.assign(graph, {
      iterations: 260,
      settings: {
        gravity: 1.2,
        scalingRatio: 14,
        slowDown: 2,
        adjustSizes: true,
        barnesHutOptimize: graph.order > 250,
        edgeWeightInfluence: 0,
      },
    });
  }

  normalizePositions(graph);
  return graph;
}
