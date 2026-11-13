/**
 * BinAtlas 边定义（§3）
 *
 * 注意：`rationale` / `switch_cost` / `tradeoff` / `since` / `reason` / `order`
 * 这些「按 kind 条件必填」的字段故意不在 Zod 里强制，
 * 而是交给 V4–V7 各自的规则报告 —— 否则一条边缺 rationale 会被 V1 与 V4 报两遍。
 */
import { z } from 'zod';
import { EDGE_KINDS } from './enums.js';

const nonEmptyText = z.string().refine((s) => s.trim().length > 0, '期望非空');

export const EdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.enum(EDGE_KINDS),
    /** V4 管：非空且 ≥15 字 */
    rationale: nonEmptyText.optional(),
    /** 0-1，关系强度（§3） */
    weight: z.number().min(0).max(1).optional(),
    /** V5 管：alternative 必填 */
    switch_cost: z.enum(['low', 'medium', 'high']).optional(),
    tradeoff: nonEmptyText.optional(),
    /** V6 管：supersedes 必填 */
    since: z.union([z.number().int(), z.string().min(1)]).optional(),
    reason: nonEmptyText.optional(),
    /** V7 管：upstream 必填 */
    order: z.number().finite().optional(),
  })
  .passthrough();

export type Edge = z.infer<typeof EdgeSchema>;
