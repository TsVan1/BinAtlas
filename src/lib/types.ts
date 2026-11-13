/**
 * 前端只读数据契约 —— 对应 `public/graph/*.json`。
 *
 * 唯一生产者是 `scripts/lib/graph.ts` 的 `projectGraph()`（`pnpm build` 的第二步），
 * 这里的字段与那份投影一一对应；**本文件不产生数据，只描述数据**。
 * 契约变化时两边必须同步，见 scripts/README.md。
 *
 * v2 新增（目录树 / 作战手册需要的字段）：
 *   `parent`       三级树的父节点（只在 technique 上出现；试点领域的技术靠 part_of 边兜底）
 *   `commands`     命令模板 `{cmd, note?}[]`
 *   `pitfalls`     常见坑
 *   `references`   参考链接
 *
 * v3（投影层补齐，替代此前的旁路表与边推导）：
 *   `artifact_kind` artifact 节点的载体类别（§2.5 的 12 值；不能叫 kind，kind 是节点类型）
 *   `prerequisites` technique 的前置技术 id 数组
 *
 * v4（作战手册补全「照着就能干」的三块，只挂在 technique 上）：
 *   `detail`     详情正文：什么时候用、和相邻技术的边界、代价
 *   `principle`  原理：为什么有效（解释性，不是步骤）
 *   `procedure`  操作步骤（有序）
 *   早期试点技术没有这三个字段 —— 缺失是**正常状态**，组件必须整块不渲染，
 *   不许出现空标题。这里全部声明为可选，就是为了让「缺失」在类型层面就成立。
 */

/** 一条命令模板：`cmd` 是可直接复制的原文，`note` 说明为什么要这么跑 */
export interface AtlasCommand {
  cmd: string;
  note?: string;
}

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
  /** 上级领域 / 子领域 id；构成目录树。没有 parent 的技术靠 `part_of` 边挂载 */
  parent?: string;
  /** 作战手册：命令模板 */
  commands?: AtlasCommand[];
  /** 作战手册：常见坑 */
  pitfalls?: string[];
  /** 作战手册：详情正文（适用场景 / 与相邻技术的边界 / 代价） */
  detail?: string;
  /** 作战手册：原理 —— 为什么有效。解释性文本，与 procedure 的步骤性相对 */
  principle?: string;
  /** 作战手册：操作步骤，有序；每一步是一个可执行动作 */
  procedure?: string[];
  /** 参考链接 */
  references?: string[];
  /** 载体类别（§2.5 枚举）；只出现在 artifact 节点上 */
  artifact_kind?: string;
  /** 前置技术 id；只出现在 technique 节点上 */
  prerequisites?: string[];
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

/**
 * 载体类别索引 —— 从 `nodes.json` 的 `artifact_kind` 现算，**没有任何旁路数据源**。
 *
 * 矩阵的列轴、「关联载体」的类别标签都只认这一份；数据变了会立刻反映，
 * 不存在「旁路文件忘了重新生成」导致的静默漂移。
 */
export interface ArtifactKindTable {
  /** 出现过的类别，按 §2.5 枚举顺序 */
  kinds: string[];
  /** art id → 载体类别 */
  byId: ReadonlyMap<string, string>;
  /** artifact 节点缺 `artifact_kind` 的 id：数据不完整时如实暴露，不猜 */
  missing: string[];
}
