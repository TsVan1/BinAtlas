/**
 * Facet 过滤：三个维度 kind / license / ai_ready。
 *
 * 语义（写死在这里，UI 只负责展示）：
 * - **同维度多选 = 或**（否则选两类会直接得到 0 条）
 * - **跨维度 = 且**（同时满足各维度条件）
 * - 缺失字段归入「未标注」哨兵值，不是「没有」也不是空集合
 * - 计数在「应用了其它维度筛选后」的池子里算，所以计数为 0 的项可以安全禁用
 */
import type { AtlasNode } from './types';
import { PRIMARY_KINDS, kindStyle } from './palette';
import { AI_READY_ORDER, LICENSE_ORDER, aiReadyLabel, licenseLabel } from './enums';

/** 缺失字段的哨兵值：不会与任何真实枚举值冲突 */
export const UNLABELED = '__unlabeled__';

export type FacetKey = 'kind' | 'license' | 'ai_ready';

export interface FacetFilters {
  kind: ReadonlySet<string>;
  license: ReadonlySet<string>;
  ai_ready: ReadonlySet<string>;
}

export const FACET_KEYS = ['kind', 'license', 'ai_ready'] as const satisfies readonly FacetKey[];

export const EMPTY_FILTERS: FacetFilters = {
  kind: new Set<string>(),
  license: new Set<string>(),
  ai_ready: new Set<string>(),
};

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  selected: boolean;
  disabled: boolean;
  /** 仅 kind 维度有色点 */
  color?: string;
}

export interface FacetSection {
  key: FacetKey;
  title: string;
  hint: string;
  options: FacetOption[];
  /** 该维度已选中的选项数 */
  active: number;
}

const FACET_DIMENSIONS: readonly { key: FacetKey; title: string; hint: string }[] = [
  { key: 'kind', title: '节点类型', hint: '四类固定；同组多选为「或」，跨组为「且」' },
  { key: 'license', title: '许可证', hint: '缺失该字段的条目记为「未标注」' },
  { key: 'ai_ready', title: 'AI 就绪', hint: '「未标注」≠「没有 AI 支持」' },
];

export function facetValue(node: AtlasNode, key: FacetKey): string | undefined {
  switch (key) {
    case 'kind':
      return node.kind;
    case 'license':
      return node.license;
    case 'ai_ready':
      return node.ai_ready;
    default:
      return undefined;
  }
}

/** 空值统一落到「未标注」桶里 */
export function facetBucket(node: AtlasNode, key: FacetKey): string {
  const value = facetValue(node, key);
  return value === undefined || value === '' ? UNLABELED : value;
}

function matchesDimension(node: AtlasNode, filters: FacetFilters, key: FacetKey): boolean {
  const selected = filters[key];
  return selected.size === 0 || selected.has(facetBucket(node, key));
}

/**
 * 是否命中筛选。`skip` 用于算 facet 计数：统计某一维度时要忽略该维度自身的选择，
 * 否则勾上「工具」后其它类型会全部显示 0，用户没法再加选。
 */
export function matchesFilters(node: AtlasNode, filters: FacetFilters, skip?: FacetKey): boolean {
  for (const key of FACET_KEYS) {
    if (key === skip) continue;
    if (!matchesDimension(node, filters, key)) return false;
  }
  return true;
}

export function filterNodes(nodes: readonly AtlasNode[], filters: FacetFilters): AtlasNode[] {
  return nodes.filter((node) => matchesFilters(node, filters));
}

export function countMatches(nodes: readonly AtlasNode[], filters: FacetFilters): number {
  return filterNodes(nodes, filters).length;
}

export function isFilterActive(filters: FacetFilters): boolean {
  return FACET_KEYS.some((key) => filters[key].size > 0);
}

export function activeFilterCount(filters: FacetFilters): number {
  return FACET_KEYS.reduce((total, key) => total + filters[key].size, 0);
}

export function toggleFilter(filters: FacetFilters, key: FacetKey, value: string): FacetFilters {
  const next = new Set(filters[key]);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return { ...filters, [key]: next };
}

export function clearFilters(): FacetFilters {
  return { kind: new Set<string>(), license: new Set<string>(), ai_ready: new Set<string>() };
}

function labelFor(key: FacetKey, value: string): string {
  if (value === UNLABELED) return '未标注';
  switch (key) {
    case 'kind':
      return kindStyle(value).label;
    case 'license':
      return licenseLabel(value);
    case 'ai_ready':
      return aiReadyLabel(value);
    default:
      return value;
  }
}

/** 选项全集：kind 固定四类（外加数据里出现的其它类型），其余维度取实际出现的值 + 「未标注」 */
function optionUniverse(nodes: readonly AtlasNode[], key: FacetKey): string[] {
  if (key === 'kind') {
    const present = new Set(nodes.map((node) => node.kind));
    const extras = [...present]
      .filter((kind) => !(PRIMARY_KINDS as readonly string[]).includes(kind))
      .sort((a, b) => a.localeCompare(b));
    return [...PRIMARY_KINDS, ...extras];
  }

  const values = new Set<string>();
  for (const node of nodes) {
    const value = facetValue(node, key);
    if (value !== undefined && value !== '') values.add(value);
  }

  // 显式标成 readonly string[]：否则两个元组类型联合后 includes 的参数会被收窄成 never
  const order: readonly string[] = key === 'license' ? LICENSE_ORDER : AI_READY_ORDER;
  const known = order.filter((value) => values.has(value));
  const rest = [...values].filter((value) => !order.includes(value)).sort((a, b) => a.localeCompare(b));

  return [...known, ...rest, UNLABELED];
}

export function buildFacetSections(nodes: readonly AtlasNode[], filters: FacetFilters): FacetSection[] {
  const pools: Record<FacetKey, AtlasNode[]> = {
    kind: nodes.filter((node) => matchesFilters(node, filters, 'kind')),
    license: nodes.filter((node) => matchesFilters(node, filters, 'license')),
    ai_ready: nodes.filter((node) => matchesFilters(node, filters, 'ai_ready')),
  };

  return FACET_DIMENSIONS.map((dimension) => {
    const selected = filters[dimension.key];
    const pool = pools[dimension.key];

    const options = optionUniverse(nodes, dimension.key).map((value): FacetOption => {
      const count = pool.filter((node) => facetBucket(node, dimension.key) === value).length;
      const isSelected = selected.has(value);
      return {
        value,
        label: labelFor(dimension.key, value),
        count,
        selected: isSelected,
        // 计数为 0 的置灰禁用；但已选项永远可点，否则用户无法取消
        disabled: count === 0 && !isSelected,
        ...(dimension.key === 'kind' ? { color: kindStyle(value).color } : {}),
      };
    });

    return {
      key: dimension.key,
      title: dimension.title,
      hint: dimension.hint,
      options,
      active: selected.size,
    };
  });
}
