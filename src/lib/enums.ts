/**
 * 枚举值的中文标签（来源：schema/enums.ts 的取值表）。
 * 未知值原样返回——宁可显示 `weird-value`，也不显示一个假装认识的词。
 */

export const LICENSE_ORDER = ['oss', 'commercial', 'freeware', 'mixed', 'unknown'] as const;
export const AI_READY_ORDER = ['none', 'api', 'plugin', 'mcp'] as const;

const LICENSE_LABEL: Readonly<Record<string, string>> = {
  oss: '开源',
  commercial: '商业',
  freeware: '免费软件',
  mixed: '混合',
  unknown: '未知',
};

const AI_READY_LABEL: Readonly<Record<string, string>> = {
  none: '无',
  api: 'API',
  plugin: '插件',
  mcp: 'MCP',
};

const MAINTAIN_STATUS_LABEL: Readonly<Record<string, string>> = {
  active: '维护中',
  stale: '停滞',
  abandoned: '已弃用',
  unknown: '未知',
};

const PLATFORM_LABEL: Readonly<Record<string, string>> = {
  win: 'Windows',
  linux: 'Linux',
  mac: 'macOS',
  android: 'Android',
  ios: 'iOS',
  hardware: '硬件',
  web: 'Web',
};

export function licenseLabel(value: string): string {
  return LICENSE_LABEL[value] ?? value;
}

export function aiReadyLabel(value: string): string {
  return AI_READY_LABEL[value] ?? value;
}

export function maintainStatusLabel(value: string): string {
  return MAINTAIN_STATUS_LABEL[value] ?? value;
}

export function platformLabel(value: string): string {
  return PLATFORM_LABEL[value] ?? value;
}

/**
 * `difficulty` 是**跨类型归并值**：同一个数字在不同 kind 下指的不是一回事。
 * 详情面板必须按 kind 标注它到底来自哪个字段，否则用户会拿「工具学习曲线 4」
 * 去和「域名入门难度 4」比较，那是错的。
 */
export function difficultyFieldLabel(kind: string): string {
  switch (kind) {
    case 'domain':
      return '入门难度 entry_difficulty';
    case 'technique':
      return '难度 difficulty';
    case 'tool':
      return '学习曲线 learning_curve';
    default:
      return '难度 difficulty';
  }
}

/** 哪些类型压根没有难度字段（契约现状，不是数据缺失） */
export function difficultyNotTracked(kind: string): boolean {
  return kind === 'artifact';
}
