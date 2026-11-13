/**
 * BinAtlas 节点 Zod 定义
 * 依据：03-DATA-SCHEMA.md §2.1–§2.5 的字段表；§2.2 / §2.4 没有字段表，
 * 必填字段由该节示例 + 文中强调项推出（不确定的地方见交付报告的「表述模糊」一节）。
 *
 * 两条贯穿全文件的约定：
 * 1. 所有对象一律 loose：§2.6 的 `_` 开头元字段注入合并视图后不得报错。
 * 2. `source` / `verified_at` 不在这里强制 —— §4.5 按节点类型决定是否强制，
 *    由校验器 V9 / V16 负责，避免同一处缺字段被 V1 和 V9 重复报两遍。
 */
import { z } from 'zod';
import {
  AI_KINDS,
  AI_MATURITY,
  AI_READY,
  ARTIFACT_KINDS,
  COVERAGES,
  ECOSYSTEM_KINDS,
  HEADLESS,
  LAYERS,
  LICENSES,
  MAINTAIN_STATUS,
  NODE_PREFIXES,
  PLATFORMS,
  TOOL_CATEGORIES,
  TRI_LEVELS,
} from './enums.js';

/** 保留未知字段（含 §2.6 的 _ 元字段） */
const loose = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

/** `{prefix}:{slug}`，slug 为小写 kebab-case（§1） */
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const idOf = (...prefixes: readonly string[]) => z.string().regex(new RegExp(`^(?:${prefixes.join('|')}):${SLUG}$`), 'ID 必须形如 {prefix}:{slug}，slug 全小写 kebab-case');

const anyRefId = idOf(...NODE_PREFIXES);
const domRefId = idOf('dom');
const artRefId = idOf('art');
const fmtRefId = idOf('fmt');
const prereqRefId = idOf('con', 'tech');

/** 1-5 分（§4.3）；YAML 里写成 3.0 也算整数 */
const score = z.number().int().min(1).max(5);

/** verified_at 形态 `YYYY-MM-DD`（§2.3 写明），并校验是真实存在的日期 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'verified_at 必须是 YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'verified_at 不是真实存在的日期');

const nonEmptyText = z.string().refine((s) => s.trim().length > 0, '期望非空');

/** 所有节点共有：id + name + 可选别名 */
const base = {
  id: z.string().min(1),
  name: nonEmptyText,
  aliases: z.array(nonEmptyText).optional(),
  /** §2.1–§2.5 之外的公共可选字段：内部编排里约定的「不确定」标记 */
  unverified: z.boolean().optional(),
};

const provenanceShape = {
  source: z.array(nonEmptyText).optional(),
  verified_at: isoDate.optional(),
};

/** §2.1 domain */
export const DomainSchema = loose({
  ...base,
  name_en: nonEmptyText,
  def: nonEmptyText,
  artifacts: z.array(artRefId).min(1),
  entry_difficulty: score,
  coverage: z.enum(COVERAGES),
  note: z.string().optional(),
});

/** §2.2 technique */
export const TechniqueSchema = loose({
  ...base,
  name_en: nonEmptyText,
  domain: z.array(domRefId).min(1),
  def: nonEmptyText,
  difficulty: score,
  /** §2.2 字段表：必填，但允许为空数组 */
  prerequisites: z.array(prereqRefId),
  artifacts: z.array(artRefId).min(1),
  outputs: z.array(nonEmptyText).min(1),
  cost: z.enum(TRI_LEVELS),
  false_positive_risk: z.enum(TRI_LEVELS),
  note: z.string().optional(),
});

/** §2.3 tool */
export const ToolSchema = loose({
  ...base,
  category: z.enum(TOOL_CATEGORIES),
  domain: z.array(domRefId).min(1),
  artifacts: z.array(artRefId).min(1),
  license: z.enum(LICENSES),
  pricing: z.string().optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  oss: z.boolean().optional(),
  learning_curve: score,
  maintain_status: z.enum(MAINTAIN_STATUS),
  /** 不确定写 null，不要猜（§2.3） */
  first_release: z.number().int().min(1950).max(2100).nullable().optional(),
  latest_version: z.string().optional(),
  url: nonEmptyText,
  ...provenanceShape,
  headless: z.enum(HEADLESS),
  ai_ready: z.enum(AI_READY),
  tldr: nonEmptyText,
  note: z.string().optional(),
});

/** §2.4 concept */
export const ConceptSchema = loose({
  ...base,
  def: nonEmptyText,
  difficulty: score,
  layer: z.enum(LAYERS),
  related_formats: z.array(fmtRefId).optional(),
  ...provenanceShape,
});

/** §2.4 format（必填字段见 §2.7 字段表：name def platforms[]） */
export const FormatSchema = loose({
  ...base,
  def: nonEmptyText,
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  /** §2.7 标注 parsers[] → tool: */
  parsers: z.array(idOf('tool')).optional(),
  ...provenanceShape,
});

/** §2.4 attack（必填字段见 §2.7：name def targets[] difficulty） */
export const AttackSchema = loose({
  ...base,
  def: nonEmptyText,
  targets: z.array(artRefId),
  countermeasures: z.array(anyRefId).optional(),
  difficulty: score,
  ...provenanceShape,
});

/** §2.4 ecosystem（必填字段见 §2.7：covers[] free；source/verified_at 由 V9/V16 兜） */
export const EcosystemSchema = loose({
  ...base,
  kind: z.enum(ECOSYSTEM_KINDS),
  url: nonEmptyText,
  covers: z.array(idOf('tech')),
  free: z.boolean(),
  ...provenanceShape,
});

/** §2.4 ai */
export const AiSchema = loose({
  ...base,
  kind: z.enum(AI_KINDS),
  host_tool: idOf('tool').optional(),
  def: nonEmptyText,
  maturity: z.enum(AI_MATURITY),
  url: nonEmptyText,
  ...provenanceShape,
});

/** §2.5 artifact */
export const ArtifactSchema = loose({
  ...base,
  kind: z.enum(ARTIFACT_KINDS),
  def: nonEmptyText,
  platforms: z.array(z.enum(PLATFORMS)).min(1).optional(),
  ...provenanceShape,
});

/** 类型 → Zod schema */
export const NODE_SCHEMAS = {
  domain: DomainSchema,
  technique: TechniqueSchema,
  tool: ToolSchema,
  concept: ConceptSchema,
  format: FormatSchema,
  attack: AttackSchema,
  ecosystem: EcosystemSchema,
  ai: AiSchema,
  artifact: ArtifactSchema,
} as const;
