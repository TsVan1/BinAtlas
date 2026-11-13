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

/**
 * 载体 kind（03-DATA-SCHEMA §2.5 的枚举，顺序即规范里的登记顺序）。
 * 这是**枚举标签**，不是知识数据：矩阵列头靠它排版，新取值原样回显。
 */
export const ARTIFACT_KIND_ORDER = [
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

const ARTIFACT_KIND_LABEL: Readonly<Record<string, string>> = {
  executable: '可执行文件',
  library: '动态库',
  package: '分发包',
  bytecode: '字节码',
  firmware: '固件',
  'kernel-object': '内核模块',
  'runtime-dump': '内存转储',
  capture: '抓包',
  document: '文档',
  script: '脚本',
  shellcode: 'Shellcode',
  container: '容器镜像',
};

/** 列头用的短标签：矩阵一行要放 12 列，长名字会把表撑爆 */
const ARTIFACT_KIND_SHORT: Readonly<Record<string, string>> = {
  executable: '可执行',
  library: '库',
  package: '包',
  bytecode: '字节码',
  firmware: '固件',
  'kernel-object': '内核',
  'runtime-dump': '转储',
  capture: '抓包',
  document: '文档',
  script: '脚本',
  shellcode: 'Shellcode',
  container: '容器',
};

export function artifactKindLabel(kind: string): string {
  return ARTIFACT_KIND_LABEL[kind] ?? kind;
}

export function artifactKindShort(kind: string): string {
  return ARTIFACT_KIND_SHORT[kind] ?? kind;
}

/** 按规范顺序排，未登记的取值排在最后（不让新类型插队） */
export function sortArtifactKinds(kinds: Iterable<string>): string[] {
  const present = new Set(kinds);
  const known = ARTIFACT_KIND_ORDER.filter((kind) => present.has(kind));
  const rest = [...present].filter((kind) => !(ARTIFACT_KIND_ORDER as readonly string[]).includes(kind));
  return [...known, ...rest];
}

