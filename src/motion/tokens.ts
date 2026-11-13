/**
 * 动效 token（06-MOTION-SPEC §1.5 的唯一代码副本）。
 *
 * 组件里不写裸时长/裸贝塞尔：CSS 侧用 `var(--dur-*)` / `var(--ease-*)`，
 * TS 侧（需要算时间的地方）从这里取。改节奏只改两处：本文件 + index.css 的同名变量。
 */

export const duration = {
  instant: 80,
  fast: 120,
  base: 200,
  slow: 320,
  ritual: 560,
} as const;

export const easing = {
  enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
  state: 'cubic-bezier(0.4, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.7, 0, 0.84, 0)',
} as const;

export const spring = {
  soft: { stiffness: 220, damping: 28 },
  snappy: { stiffness: 420, damping: 34 },
} as const;

/** 复制成功的反馈保持时长（ms）：够看清「已复制」，又不至于挡着下一次操作 */
export const COPY_FEEDBACK_MS = 1400;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
