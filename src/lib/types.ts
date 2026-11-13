/**
 * 前端只读数据契约 —— 对应 `public/graph/*.json`。
 *
 * 唯一生产者是 `scripts/lib/graph.ts` 的 `projectGraph()`（`pnpm build` 的第二步），
 * 这里的字段与那份投影一一对应；**本文件不产生数据，只描述数据**。
 * 契约变化时两边必须同步，见 scripts/README.md。
 */

/** 节点类型。契约里是 9 类枚举，前端按字符串处理以容忍未来新增类型。 */
export interface AtlasNode {
  id: string;
  kind: string;
  name: string;
  /** 描述全文；tool 的 tldr 在构建期已被落到这里，所以详情面板不必按类型分支 */
  def: string;
  domain: string[];
  artifacts: string[];
  platforms: string[];
  /**
   * 跨类型**归并值**，语义按 kind 不同：
   * domain ← entry_difficulty / technique ← difficulty / tool ← learning_curve。
   * 禁止用它做跨类型排序或统一配色；artifact 等类型没有这个字段。
   */
  difficulty?: number;
  category?: string;
  ai_ready?: string;
  maintain_status?: string;
  license?: string;
  importance?: number;
}

/** 边：构建期投影为 {from, to, kind, rationale}，**没有 id**（graphology 侧自己生成 key） */
export interface AtlasEdge {
  from: string;
  to: string;
  kind: string;
  rationale: string;
  weight?: number;
}

/** index.json：MiniSearch 的索引来源，tldr 契约 ≤80 字 */
export interface SearchDoc {
  id: string;
  name: string;
  aliases: string[];
  kind: string;
  tldr: string;
}

/** meta.json：构建元信息；字段全部按可选处理，缺了也不许白屏 */
export interface GraphMeta {
  builtAt?: string;
  schemaVersion?: string;
  counts?: Record<string, number>;
  warnings?: string[];
}

/** 装载完成后的运行时视图（解析、校验、索引都在这一步做完） */
export interface AtlasData {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  index: SearchDoc[];
  meta: GraphMeta;
  nodesById: ReadonlyMap<string, AtlasNode>;
  /** meta.warnings + 前端装载期发现的问题（悬空边、非法条目、索引回退等） */
  warnings: string[];
}
