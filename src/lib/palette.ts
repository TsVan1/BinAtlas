/**
 * 视觉 token 的**代码侧**副本（颜色/尺寸/阈值）。
 *
 * 为什么 CSS 里已经有一份还要这一份：Sigma 用 WebGL 画节点，颜色和大小是
 * 逐节点传给渲染器的数字，Tailwind 类名到不了 canvas。两边取值同源
 * （06-MOTION-SPEC §1），改色必须同时改 `src/index.css` 的 @theme。
 */

export const UI = {
  bg: '#06080B',
  panel: '#0B0F14',
  border: '#1A222C',
  borderStrong: '#2A3542',
  fg: '#E6EDF3',
  fgDim: '#8B98A5',
  fgMuted: '#5A6673',
  accent: '#22D3EE',
  magenta: '#F472B6',
  amber: '#FBBF24',
  lime: '#A3E635',
} as const;

export interface KindStyle {
  key: string;
  /** 中文类型名，UI 与面包屑共用 */
  label: string;
  /** 节点色（§1.2 色相，hex 与 HSL 等值） */
  color: string;
  /** 固定基准尺寸（像素）：只按 kind 给，**不用 difficulty** */
  size: number;
}

/** §1.2 的九类色相；当前数据里只有前四类，其余先登记好备用 */
const KIND_COLOR: Readonly<Record<string, string>> = {
  domain: '#8594A3',
  artifact: '#3CC2DD',
  technique: '#2BCA95',
  tool: '#F59E0B',
  concept: '#A578E2',
  format: '#697BD3',
  attack: '#E7556E',
  ecosystem: '#F0B042',
  ai: '#99D742',
};

const KIND_LABEL: Readonly<Record<string, string>> = {
  domain: '领域',
  technique: '技术',
  tool: '工具',
  artifact: '载体',
  concept: '概念',
  format: '格式',
  attack: '攻击',
  ecosystem: '生态',
  ai: 'AI',
};

/** 基准尺寸：领域是结构骨架，给最大；技术与载体次之；工具数量最多，给最小 */
const KIND_SIZE: Readonly<Record<string, number>> = {
  domain: 12,
  technique: 8,
  tool: 6.5,
  artifact: 6.5,
};

/** 本阶段数据里的四类；facet 面板按这个顺序展示，其余类型出现时自动追加 */
export const PRIMARY_KINDS = ['domain', 'technique', 'tool', 'artifact'] as const;

const FALLBACK: KindStyle = { key: 'unknown', label: '其他', color: UI.fgDim, size: 6 };

export function kindStyle(kind: string): KindStyle {
  return {
    key: kind,
    label: KIND_LABEL[kind] ?? kind,
    color: KIND_COLOR[kind] ?? FALLBACK.color,
    size: KIND_SIZE[kind] ?? FALLBACK.size,
  };
}

/** 选中放大倍数（静态：只放大，不做涟漪/脉冲） */
export const SELECTED_SCALE = 1.8;

/**
 * 标签显示阈值：camera.ratio ≤ 0.8 时显示 name。
 * ratio 是「视野宽度 / 全图宽度」，越小越放大；初始适配视图 ratio ≈ 1，
 * 所以默认不显示标签（57 个标签叠在初始视图上只会糊成一片）。
 */
export const LABEL_VISIBLE_RATIO = 0.8;

/** 未命中筛选的节点：向底色混合，保留位置记忆（G2 的静态替代做法） */
const DIM_AMOUNT = 0.86;

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.trim().replace(/^#/, '');
  if (hex.length === 3) {
    const r = hex.slice(0, 1);
    const g = hex.slice(1, 2);
    const b = hex.slice(2, 3);
    return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16) };
  }
  if (hex.length === 6) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  return { r: 139, g: 152, b: 165 };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((n) => clampByte(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** a→b 线性混合，t=0 取 a，t=1 取 b */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const k = Math.max(0, Math.min(1, t));
  return toHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

/** 未命中筛选的节点色（不做透明度：WebGL 颜色只给 hex 最稳） */
export function dimColor(color: string): string {
  return mixHex(color, UI.bg, DIM_AMOUNT);
}
