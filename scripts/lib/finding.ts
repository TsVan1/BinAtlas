/**
 * 校验结果的统一数据结构与输出格式。
 *
 * 输出格式（硬约束，见 03-DATA-SCHEMA.md §6 与任务书）：
 *   {文件}:{行号} · {字段路径} · 期望{期望} · 实际 {实际}
 * 例：data/tools/packers.yaml:42 · tool.upx.source · 期望非空 · 实际 null
 *
 * 行首额外加 [V4] 这样的规则编号前缀，便于 CI 里定位是哪条规则；
 * 前缀不破坏上面的四段式，文件:行号 仍是第一个可定位字段。
 */

export type Level = 'error' | 'warning';

export interface Finding {
  /** V1–V15 或 EXT-*（规范未覆盖、校验器额外加的检查） */
  rule: string;
  level: Level;
  /** 展示用路径：相对 cwd，便于在编辑器里点开 */
  file: string;
  /** 1-based；全局性结论没有行号，用 0 表示「不针对某一行」 */
  line: number;
  /** 字段路径：tool.upx.source / edge[3].rationale / art.pe32 */
  locator: string;
  expected: string;
  actual: string;
  /** 结构化时的原始路径，方便未来 --json 输出 */
  path?: (string | number)[];
}

/** 规则编号 → 人类可读标题（汇总用） */
export const RULE_TITLES: Readonly<Record<string, string>> = {
  V1: 'YAML 语法 / Zod schema',
  V2: 'ID 唯一性与命名规范',
  V3: '边引用完整性（from/to 必须存在）',
  V4: '边 rationale 非空且 ≥15 字',
  V5: 'alternative 必须 switch_cost + tradeoff',
  V6: 'supersedes 必须 since + reason',
  V7: 'upstream 必须 order',
  V8: 'tool.tldr ≥40 字',
  V9: 'tool/ai/ecosystem 的 source 非空（§4.5）',
  V16: 'tool/ai/ecosystem 缺 verified_at（§4.5）',
  V10: 'prerequisite 无环',
  V11: '非 domain 节点必须被引用（边或节点字段）',
  V12: 'verified_at 超过 18 个月',
  V13: 'unverified 占比 ≤15%',
  V14: 'domain 工具数 ≥5',
  V15: 'first_release 不得晚于 verified_at 年份',
  V17: '已废弃字段（typical_artifacts 出现即 error，§6.2）',
  'EXT-REF': '节点字段里的 ID 引用必须已定义（规范未覆盖）',
  'EXT-LEN': 'name / def 字数上限（§2.1 §2.5）',
  'EXT-COVERAGE': 'coverage 取值与 §4.4 标准自相矛盾',
  'EXT-DIR': '边方向与 §3 语义表不符',
};

/** 拼一行可定位输出 */
export function formatFinding(f: Finding): string {
  const where = f.line > 0 ? `${f.file}:${f.line}` : f.file;
  return `[${f.rule}] ${where} · ${f.locator} · 期望${f.expected} · 实际 ${f.actual}`;
}

/** 把任意 YAML 值格式化成简短可读文本（实际值那一栏） */
export function formatValue(v: unknown, max = 60): string {
  if (v === undefined) return '缺失（undefined）';
  if (v === null) return 'null';
  if (typeof v === 'string') {
    const shown = v.length > max ? `${v.slice(0, max)}…` : v;
    if (v === '') return '""（空字符串）';
    if (v.trim() === '' && v !== '') return `"${shown}"（全是空白）`;
    return JSON.stringify(shown);
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]（空数组）';
    const shown = JSON.stringify(v);
    return shown.length > max ? `${shown.slice(0, max)}…` : shown;
  }
  const shown = JSON.stringify(v);
  return shown.length > max ? `${shown.slice(0, max)}…` : shown;
}

/** 取嵌套值：getAt(obj, ['a', 0, 'b']) */
export function getAt(obj: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key as string];
  }
  return cur;
}
