/**
 * 文本口径与路径格式化的小工具。
 */
import path from 'node:path';

/**
 * 「字」的计数口径：去掉所有空白后的 Unicode 码点数。
 * 规范只说「≥40 字 / ≤120 字」，没写标点与空白算不算。
 * 选择「非空白码点」是因为：中文按 1 字、英文按 1 字符，换行符与缩进不该充数。
 */
export function charCount(s: string): number {
  return Array.from(String(s).replace(/\s+/g, '')).length;
}

/**
 * 终端里的显示宽度：CJK / 全角字符按 2 列算，其余按 1 列。
 * `pad()` 依赖它，否则中文表头的列会歪。
 */
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

/** 按显示宽度右补空格（表格对齐用） */
export function pad(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)));
}

/** 相对 cwd 的展示路径；跨盘/跨根时退回绝对路径 */
export function displayPath(absPath: string, cwd: string): string {
  const rel = path.relative(cwd, absPath);
  if (rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return absPath;
  return rel.split(path.sep).join('/');
}
