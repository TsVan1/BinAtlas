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

/** 相对 cwd 的展示路径；跨盘/跨根时退回绝对路径 */
export function displayPath(absPath: string, cwd: string): string {
  const rel = path.relative(cwd, absPath);
  if (rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return absPath;
  return rel.split(path.sep).join('/');
}
