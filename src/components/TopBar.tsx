/**
 * 顶栏：品牌 · ⌘K 搜索 · 四个视图 Tab · 数据规模。
 *
 * Tab 是主视图切换的唯一入口：目录树（主）/ 矩阵 / 工作流 / 关系图（可选）。
 * 关系图不再是默认视图——这是这一版的方向修正，不要在 UI 里偷偷改回去。
 */
import { cn } from '../lib/cn';
import type { ViewKey } from '../lib/urlState';
import { SearchIcon } from './icons';
import { Kbd } from './ui';

const VIEW_TABS: readonly { key: ViewKey; label: string; hint: string }[] = [
  { key: 'tree', label: '目录树', hint: '三级钻取 + 作战手册（主视图）' },
  { key: 'matrix', label: '矩阵', hint: '子领域 × 载体 kind 的覆盖率' },
  { key: 'workflow', label: '工作流', hint: '勾选 2–6 条技术，按 upstream 排步骤' },
  { key: 'graph', label: '关系图', hint: '力导向视图，保留为可选的全局鸟瞰' },
];

interface TopBarProps {
  view: ViewKey;
  onView: (view: ViewKey) => void;
  onOpenSearch: () => void;
  searchDisabled?: boolean;
  counts: { nodes: number; edges: number; techniques: number };
  pickCount: number;
}

export function TopBar({ view, onView, onOpenSearch, searchDisabled = false, counts, pickCount }: TopBarProps) {
  return (
    <header className="atlas-edge-glow relative z-20 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-panel/85 px-3 backdrop-blur-sm">
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="brand-mark h-7 w-7 font-mono text-13 font-semibold">B</span>
        <span className="flex flex-col leading-none">
          <span className="text-13 font-semibold tracking-wide text-fg">
            Bin<span className="text-accent-soft">Atlas</span>
          </span>
          <span className="mt-[3px] font-mono text-11 tracking-[0.18em] text-fg-muted">BINARY ATLAS</span>
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        disabled={searchDisabled}
        title={searchDisabled ? '数据未就绪' : '打开搜索（⌘K）'}
        className={cn(
          'ml-2 flex h-8 w-[280px] shrink-0 items-center gap-2 rounded border border-border bg-bg/80 px-2.5 text-left text-12 text-fg-muted',
          'transition-colors enabled:hover:border-accent/45 enabled:hover:text-fg-dim enabled:hover:shadow-[0_0_22px_-12px_rgba(34,211,238,0.9)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <SearchIcon />
        <span className="flex-1 truncate">搜索技术 / 工具 / 载体…</span>
        <Kbd className="shrink-0">⌘K</Kbd>
      </button>

      <nav className="ml-2 flex shrink-0 items-center gap-1" role="tablist" aria-label="视图切换">
        {VIEW_TABS.map((tab) => {
          const active = tab.key === view;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              title={tab.hint}
              onClick={() => onView(tab.key)}
              className={cn('view-tab flex h-7 items-center gap-1.5 px-2.5 text-12', active ? 'font-medium' : 'text-fg-muted')}
              data-active={active}
            >
              <span>{tab.label}</span>
              {tab.key === 'workflow' && pickCount > 0 && (
                <span className="rounded bg-accent/20 px-1 font-mono text-11 leading-4 text-accent-soft">{pickCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3 font-mono text-11 text-fg-muted">
        <span title="技术节点数">
          <span className="text-fg-dim">{counts.techniques}</span> 技术
        </span>
        <span className="h-3 w-px bg-border" aria-hidden />
        <span title="关系边数">
          <span className="text-fg-dim">{counts.edges}</span> 边
        </span>
        <span className="h-3 w-px bg-border" aria-hidden />
        <span title="全部节点数">
          <span className="text-fg-dim">{counts.nodes}</span> 节点
        </span>
      </div>
    </header>
  );
}
