/**
 * 展示层的格式化小工具。原则：数据缺失时显示「—」或原样回显，
 * 绝不猜一个看起来漂亮的假值。
 */

export const DASH = '—';

/** ISO 时间 → `YYYY-MM-DD HH:mm`（本地时区）；坏值原样返回，不假装解析成功 */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 空串/undefined 一律显示破折号 */
export function orDash(value: string | undefined | null): string {
  return value === undefined || value === null || value.trim() === '' ? DASH : value;
}

/** 按字符（不是字节）截断，用于 tldr 之类的短摘要 */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(0, max - 1)).join('')}…`;
}

/** ISO 时间原样给 <time datetime> 用 */
export function toDateTimeAttr(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
