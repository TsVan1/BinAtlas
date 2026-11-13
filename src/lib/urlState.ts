/**
 * 视图状态 ↔ URL hash。
 *
 * 为什么要这个：主视图是「钻取」出来的状态（展开哪层、选中哪条、矩阵点了哪格），
 * 不落到 URL 上就没法分享、没法刷新恢复——也没法让 headless 截图直达某一个状态。
 *
 * 编码（全部可选，只有非默认值才写进 hash）：
 *   #v=tree&sel=tech:amsi-scan-boundary&dom=dom:av-evasion-static&akind=executable&pick=id1,id2
 */
export const VIEW_KEYS = ['tree', 'matrix', 'workflow', 'graph'] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

export interface UrlState {
  view: ViewKey;
  /** 当前选中节点 id */
  sel: string | null;
  /** 目录树过滤：只显示该领域下的技术（矩阵点格子后跳转用） */
  domain: string | null;
  /** 目录树过滤：只显示覆盖该载体 kind 的技术 */
  akind: string | null;
  /** 工作流勾选的技术（2–6 个） */
  pick: string[];
}

export const DEFAULT_URL_STATE: UrlState = {
  view: 'tree',
  sel: null,
  domain: null,
  akind: null,
  pick: [],
};

function asView(value: string | null): ViewKey {
  return (VIEW_KEYS as readonly string[]).includes(value ?? '') ? (value as ViewKey) : 'tree';
}

export function readUrlState(hash: string = window.location.hash): UrlState {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);

  const pick = (params.get('pick') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');

  return {
    view: asView(params.get('v')),
    sel: params.get('sel'),
    domain: params.get('dom'),
    akind: params.get('akind'),
    pick: [...new Set(pick)],
  };
}

export function toHash(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.view !== 'tree') params.set('v', state.view);
  if (state.sel !== null) params.set('sel', state.sel);
  if (state.domain !== null) params.set('dom', state.domain);
  if (state.akind !== null) params.set('akind', state.akind);
  if (state.pick.length > 0) params.set('pick', state.pick.join(','));

  const query = params.toString();
  return query === '' ? '' : `#${query}`;
}

/** 用 replaceState 写 hash：不产生历史堆栈，也不触发页面滚动 */
export function writeUrlState(state: UrlState): void {
  const hash = toHash(state);
  const next = `${window.location.pathname}${window.location.search}${hash}`;
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history.replaceState(null, '', next);
}
