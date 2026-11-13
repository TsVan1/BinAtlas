/**
 * 顶栏：⌘K 搜索入口 · 面包屑 · 视图 Tab。
 * 视图 Tab 里只有「图谱」可用，其余按阶段表置灰（P5 组合视图才接）。
 */
import { cn } from '../lib/cn';
import { Kbd } from './ui';
import { SearchIcon } from './icons';

export interface BreadcrumbItem {
  label: string;
  mono?: boolean;
}

interface ViewTab {
  key: string;
  label: string;
  enabled: boolean;
  hint: string;
}

const VIEW_TABS: readonly ViewTab[] = [
  { key: 'graph', label: '图谱', enabled: true, hint: '主图谱视图（当前阶段）' },
  { key: 'matrix', label: '矩阵', enabled: false, hint: '组合视图 · 下一阶段（P5）' },
  { key: 'pipeline', label: '流水线', enabled: false, hint: '组合视图 · 下一阶段（P5）' },
  { key: 'timeline', label: '时间轴', enabled: false, hint: '组合视图 · 下一阶段（P5）' },
  { key: 'compare', label: '对比', enabled: false, hint: '组合视图 · 下一阶段（P5）' },
];

interface TopBarProps {
  breadcrumb: BreadcrumbItem[];
  onOpenSearch: () => void;
  searchDisabled?: boolean;
}

export function TopBar({ breadcrumb, onOpenSearch, searchDisabled = false }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
      <div className="flex shrink-0 items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded border border-border-strong bg-panel-raised font-mono text-12 text-accent">
          B
        </span>
        <span className="text-13 font-semibold tracking-wide text-fg">BinAtlas</span>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        disabled={searchDisabled}
        title={searchDisabled ? '数据未就绪' : '打开搜索（⌘K）'}
        className={cn(
          'flex h-8 w-[300px] shrink-0 items-center gap-2 rounded border border-border bg-bg px-2.5 text-left text-12',
          'text-fg-muted enabled:hover:border-border-strong enabled:hover:text-fg-dim',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <SearchIcon />
        <span className="flex-1 truncate">搜索节点、工具、技术…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav aria-label="面包屑" className="flex min-w-0 items-center gap-1.5 text-12">
        {breadcrumb.map((item, index) => (
          <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden className="text-fg-muted/60">
                /
              </span>
            )}
            <span
              className={cn(
                'truncate',
                index === breadcrumb.length - 1 ? 'text-fg-dim' : 'text-fg-muted',
                item.mono && 'font-mono text-11',
              )}
            >
              {item.label}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-0.5" role="tablist" aria-label="视图切换">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.enabled}
            disabled={!tab.enabled}
            title={tab.hint}
            className={cn(
              'rounded px-2 py-1 text-12',
              tab.enabled
                ? 'bg-panel-raised text-accent'
                : 'cursor-not-allowed text-fg-muted/70',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
}
