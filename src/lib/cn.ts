/** 条件拼接 className：避免在模板字符串里堆三元表达式 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ');
}
