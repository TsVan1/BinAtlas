/**
 * BinAtlas 枚举与常量
 * 唯一依据：03-DATA-SCHEMA.md 第 1、2、3、5 节。
 * 这里出现的每个取值都必须在规范里有出处，禁止在此处「顺手加一个」。
 */

/**
 * 数据规范版本（对应 03-DATA-SCHEMA.md）。
 *
 * 递增规则：**破坏性字段变更**（删字段、改枚举取值、改语义）→ major；
 * 只加可选字段 → minor。产物写进 `public/graph/meta.json` 的 `schemaVersion`，
 * 前端可据此拒绝加载与代码不匹配的旧产物，而不是渲染出一堆 undefined。
 */
export const SCHEMA_VERSION = '1.0.0';

/** §1 ID 前缀：只能是 9 个之一 */
export const NODE_PREFIXES = ['tool', 'tech', 'art', 'dom', 'con', 'fmt', 'atk', 'eco', 'ai'] as const;
export type NodePrefix = (typeof NODE_PREFIXES)[number];

/** §2 节点类型（9 种） */
export const NODE_TYPES = [
  'domain',
  'technique',
  'tool',
  'concept',
  'format',
  'attack',
  'ecosystem',
  'ai',
  'artifact',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** §2 类型 → §1 前缀，一一对应（V2 用） */
export const PREFIX_BY_TYPE: Readonly<Record<NodeType, NodePrefix>> = {
  domain: 'dom',
  technique: 'tech',
  tool: 'tool',
  concept: 'con',
  format: 'fmt',
  attack: 'atk',
  ecosystem: 'eco',
  ai: 'ai',
  artifact: 'art',
};

/** 文件名/目录名 → 节点类型（data/tools/packers.yaml 与 data/tools.yaml 都认） */
export const NODE_TYPE_BY_NAME: Readonly<Record<string, NodeType>> = {
  domain: 'domain',
  domains: 'domain',
  technique: 'technique',
  techniques: 'technique',
  tool: 'tool',
  tools: 'tool',
  concept: 'concept',
  concepts: 'concept',
  format: 'format',
  formats: 'format',
  attack: 'attack',
  attacks: 'attack',
  ecosystem: 'ecosystem',
  ecosystems: 'ecosystem',
  ai: 'ai',
  artifact: 'artifact',
  artifacts: 'artifact',
};

/** §3 12 种边 */
export const EDGE_KINDS = [
  'prerequisite',
  'uses',
  'applies_to',
  'part_of',
  'alternative',
  'complements',
  'supersedes',
  'upstream',
  'detects',
  'bypasses',
  'implemented_in',
  'teaches',
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** §2.3 / §5 22 个工具类目 */
export const TOOL_CATEGORIES = [
  'disassemblers',
  'debuggers',
  'instrumentation',
  'symbolic',
  'fuzzers',
  'analysis-frameworks',
  'binary-formats',
  'packers',
  'detection-rules',
  'sandboxes',
  'firmware',
  'mobile',
  'kernel',
  'memory-forensics',
  'network-protocol',
  'crypto',
  'game-security',
  'ai-x-re',
  'binary-similarity',
  'visualization',
  'doc-malware',
  'environment',
] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/** §2.3 / §2.5 平台枚举 */
export const PLATFORMS = ['win', 'linux', 'mac', 'android', 'ios', 'hardware', 'web'] as const;

/** §2.3 license */
export const LICENSES = ['oss', 'commercial', 'freeware', 'mixed', 'unknown'] as const;

/** §2.3 headless */
export const HEADLESS = ['yes', 'partial', 'no'] as const;

/** §2.3 + §4.2 ai_ready */
export const AI_READY = ['none', 'api', 'plugin', 'mcp'] as const;

/** §2.3 + §4.1 maintain_status */
export const MAINTAIN_STATUS = ['active', 'stale', 'abandoned', 'unknown'] as const;

/** §2.2 成本 / 误报风险 */
export const TRI_LEVELS = ['low', 'medium', 'high'] as const;

/** §2.1 + §4.4 coverage */
export const COVERAGES = ['full', 'partial', 'stub'] as const;

/** §2.4 concept.layer */
export const LAYERS = ['user', 'kernel', 'hardware'] as const;

/** §2.4 ecosystem.kind（中文取值，规范里就是这么写的） */
export const ECOSYSTEM_KINDS = ['书籍', '课程', '靶场', '会议', '社区', '论文', '数据集', '合集'] as const;

/** §2.4 ai.kind */
export const AI_KINDS = ['mcp', 'plugin', 'model', 'dataset', 'benchmark'] as const;

/** §2.4 ai.maturity */
export const AI_MATURITY = ['experimental', 'usable', 'production'] as const;

/** §2.5 artifact.kind（新增取值必须先在规范里登记） */
export const ARTIFACT_KINDS = [
  'executable',
  'library',
  'package',
  'bytecode',
  'firmware',
  'kernel-object',
  'runtime-dump',
  'capture',
  'document',
  'script',
  'shellcode',
  'container',
] as const;

/** 1-5 分的字段（§4.3） */
export const SCORE_FIELDS = new Set(['entry_difficulty', 'difficulty', 'learning_curve']);

/**
 * §4.5：source / verified_at 强制适用的节点类型。
 * 注意 §2.4 的 ecosystem / ai 示例里都没有这两个字段，与 §4.5 冲突；
 * 校验器按 §4.5（专讲适用范围的一节）执行，见 README 与交付报告。
 */
export const PROVENANCE_REQUIRED_TYPES: ReadonlySet<NodeType> = new Set(['tool', 'ai', 'ecosystem']);

/** §2.6 Overlay 元字段：以 _ 开头，一律忽略，不参与任何校验 */
export const isMetaField = (key: string): boolean => key.startsWith('_');
