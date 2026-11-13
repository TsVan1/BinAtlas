/**
 * 左栏：三级目录树（顶级领域 → 子领域 → 技术）。
 *
 * 键盘模型（ARIA tree 的实用子集，容器聚焦 + aria-activedescendant）：
 *   ↑/↓ 移动 · → 展开或进入子级 · ← 折叠或回到父级 · Enter 选中 · Home/End 首尾
 * 展开状态、选中状态都由上层持有，这里只负责「把当前游标画出来」。
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';
import type { TreeRow } from '../lib/tree';
import { ChevronIcon, CloseIcon, DotIcon, SearchIcon } from './icons';
import { CountPill, DifficultyMeter, Kbd } from './ui';

interface DomainTreeProps {
  rows: TreeRow[];
  selectedId: string | null;
  /** 选中节点到根的领域链：用来给祖先行画一条「当前路径」 */
  activePath: ReadonlySet<string>;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  stats: { domains: number; subdomains: number; techniques: number };
  /** 矩阵点格子跳过来时的筛选说明；null = 没有筛选 */
  filterLabel: string | null;
  onClearFilter: () => void;
  /** 当前可见技术数（过滤后） */
  visibleTechniques: number;
}

const rowDomId = (uid: string): string => `tree-item-${uid.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

export function DomainTree({
  rows,
  selectedId,
  activePath,
  query,
  onQueryChange,
  onSelect,
  onToggle,
  onExpandAll,
  onCollapseAll,
  stats,
  filterLabel,
  onClearFilter,
  visibleTechniques,
}: DomainTreeProps) {
  const [cursorUid, setCursorUid] = useState<string>('');
  const listRef = useRef<HTMLDivElement | null>(null);
  /**
   * 已经成功把游标落到哪条选中项上。
   * 只记「选中 id」不够：首帧时目标行可能还没渲染（它的父领域还没展开），
   * 等展开后行才出现——必须在行出现的这一次再追一次，否则游标会停在树上方的祖先行。
   */
  const syncedSelection = useRef<string | null | undefined>(undefined);

  const cursorIndex = rows.findIndex((row) => row.uid === cursorUid);

  useEffect(() => {
    if (rows.length === 0) {
      if (cursorUid !== '') setCursorUid('');
      return;
    }

    const selectedRow = selectedId === null ? undefined : rows.find((row) => row.id === selectedId);

    if (selectedRow !== undefined && syncedSelection.current !== selectedId) {
      syncedSelection.current = selectedId;
      if (selectedRow.uid !== cursorUid) setCursorUid(selectedRow.uid);
      return;
    }

    if (cursorIndex !== -1) return;
    const fallback = selectedRow ?? rows[0];
    if (fallback !== undefined && fallback.uid !== cursorUid) setCursorUid(fallback.uid);
  }, [rows, selectedId, cursorIndex, cursorUid]);



  // 游标移动时保持可见：键盘走位不该把选中项挪到视口外。
  // 只滚树容器本身——scrollIntoView 会连带滚 window，深链进入时会把顶栏顶出视口。
  useEffect(() => {
    if (cursorUid === '') return;
    const container = listRef.current;
    const row = document.getElementById(rowDomId(cursorUid));
    if (container === null || row === null) return;

    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom) return;

    // 最小滚动：只把行推进视口边缘，保留它上方的祖先链（居中会把顶级领域顶出屏幕）
    if (rowRect.bottom > containerRect.bottom) {
      container.scrollTop += rowRect.bottom - containerRect.bottom + 6;
    } else {
      container.scrollTop += rowRect.top - containerRect.top - 6;
    }
  }, [cursorUid]);

  const moveCursor = (index: number): void => {
    if (rows.length === 0) return;
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[clamped];
    if (row !== undefined) setCursorUid(row.uid);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = cursorIndex >= 0 ? rows[cursorIndex] : undefined;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveCursor(cursorIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveCursor(cursorIndex - 1);
        break;
      case 'ArrowRight': {
        if (current === undefined) return;
        event.preventDefault();
        if (current.type === 'domain') {
          if (!current.expanded) onToggle(current.id);
          else moveCursor(cursorIndex + 1);
        }
        break;
      }
      case 'ArrowLeft': {
        if (current === undefined) return;
        event.preventDefault();
        if (current.type === 'domain' && current.expanded) {
          onToggle(current.id);
          break;
        }
        for (let index = cursorIndex - 1; index >= 0; index -= 1) {
          const candidate = rows[index];
          if (candidate !== undefined && candidate.type === 'domain' && candidate.depth < current.depth) {
            setCursorUid(candidate.uid);
            break;
          }
        }
        break;
      }
      case 'Enter':
      case ' ':
        if (current === undefined) return;
        event.preventDefault();
        onSelect(current.id);
        if (current.type === 'domain') onToggle(current.id);
        break;
      case 'Home':
        event.preventDefault();
        moveCursor(0);
        break;
      case 'End':
        event.preventDefault();
        moveCursor(rows.length - 1);
        break;
      default:
        break;
    }
  };

  const handleRowActivate = (row: TreeRow): void => {
    setCursorUid(row.uid);
    onSelect(row.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-11 uppercase tracking-[0.16em] text-fg-muted">目录索引</h2>
          <span className="font-mono text-11 text-fg-muted">
            <span className="text-accent-soft">{stats.domains}</span> 领域 ·{' '}
            <span className="text-accent-soft">{stats.subdomains}</span> 子领域 ·{' '}
            <span className="text-fg-dim">{stats.techniques}</span> 技术
          </span>
        </div>

        <div className="mt-2 flex h-7 items-center gap-1.5 rounded border border-border bg-bg px-2 transition-colors focus-within:border-accent/55 focus-within:shadow-[0_0_18px_-10px_rgba(34,211,238,0.9)]">
          <span className="shrink-0 text-fg-muted">
            <SearchIcon />
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query !== '') {
                event.stopPropagation();
                onQueryChange('');
              }
            }}
            placeholder="筛选领域 / 技术…"
            aria-label="筛选目录树"
            className="h-full min-w-0 flex-1 bg-transparent text-12 text-fg outline-none placeholder:text-fg-muted"
          />
          {query !== '' && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="清除筛选关键词"
              className="shrink-0 text-fg-muted hover:text-fg"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onExpandAll}
            className="rounded border border-border bg-panel-raised px-1.5 py-0.5 text-11 text-fg-dim transition-colors hover:border-accent/40 hover:text-accent-soft"
          >
            展开全部
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="rounded border border-border bg-panel-raised px-1.5 py-0.5 text-11 text-fg-dim transition-colors hover:border-accent/40 hover:text-accent-soft"
          >
            折叠全部
          </button>
          <span className="ml-auto font-mono text-11 text-fg-muted">
            {query !== '' || filterLabel !== null ? `命中 ${visibleTechniques}` : ''}
          </span>
        </div>

        {filterLabel !== null && (
          <button
            type="button"
            onClick={onClearFilter}
            className="group mt-1.5 flex w-full items-center gap-1.5 rounded border border-accent/30 bg-accent/8 px-2 py-1 text-left text-11 text-accent-soft"
            title="清除矩阵筛选，回到完整目录树"
          >
            <span className="font-mono text-11 text-accent">⌁</span>
            <span className="min-w-0 flex-1 truncate">{filterLabel}</span>
            <span className="shrink-0 text-fg-muted group-hover:text-fg">
              <CloseIcon />
            </span>
          </button>
        )}
      </div>

      <div
        ref={listRef}
        role="tree"
        aria-label="领域目录树"
        aria-activedescendant={cursorUid === '' ? undefined : rowDomId(cursorUid)}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="min-h-0 flex-1 overflow-y-auto border-t border-border/70 pb-2 outline-none focus-visible:bg-accent/[0.03]"
      >
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-12 text-fg-dim">没有匹配的条目</p>
            <p className="mt-1 text-11 text-fg-muted">换个关键词，或清除筛选后重试</p>
          </div>
        ) : (
          rows.map((row) => {
            const selected = row.id === selectedId;
            const onPath = !selected && activePath.has(row.id);
            const isCursor = row.uid === cursorUid;

            return (
              <div
                key={row.uid}
                id={rowDomId(row.uid)}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={selected}
                aria-expanded={row.type === 'domain' ? row.expanded : undefined}
                data-selected={selected}
                data-onpath={onPath}
                data-cursor={isCursor}
                tabIndex={-1}
                onClick={() => handleRowActivate(row)}
                onDoubleClick={() => {
                  if (row.type === 'domain') onToggle(row.id);
                }}
                className={cn(
                  'tree-row h-[26px] cursor-pointer pr-2',
                  row.type === 'domain' ? 'text-fg-dim' : 'text-fg-dim/90',
                  selected && 'text-fg',
                )}
                style={{ paddingLeft: 6 + row.depth * 14 }}
                title={
                  row.type === 'domain'
                    ? `${row.name} · 汇总 ${row.total} 条技术`
                    : `${row.name} · ${row.node.id} · ${row.node.commands?.length ?? 0} 条命令模板`
                }
              >
                {row.type === 'domain' ? (
                  <button
                    type="button"
                    aria-label={row.expanded ? `折叠 ${row.name}` : `展开 ${row.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setCursorUid(row.uid);
                      onToggle(row.id);
                    }}
                    className={cn(
                      'grid h-4 w-4 shrink-0 place-items-center rounded text-fg-muted hover:bg-white/5 hover:text-accent',
                      row.expandable ? 'visible' : 'invisible',
                    )}
                  >
                    <span className="tree-chevron" data-open={row.expanded}>
                      <ChevronIcon />
                    </span>
                  </button>
                ) : (
                  <span className={cn('grid h-4 w-4 shrink-0 place-items-center', selected ? 'text-accent' : 'text-fg-muted/70')}>
                    <DotIcon size={selected ? 5 : 3} />
                  </span>
                )}

                <span
                  className={cn(
                    'tree-name min-w-0 flex-1 truncate text-12',
                    row.type === 'domain' ? (row.depth === 0 ? 'font-medium text-fg' : 'text-fg-dim') : '',
                    selected && 'text-fg',
                  )}
                >
                  {row.name}
                </span>

                {row.type === 'domain' ? (
                  <span className="flex shrink-0 items-center gap-1">
                    {row.expandable && (
                      <CountPill
                        value={row.count}
                        tone={selected ? 'accent' : 'default'}
                        title={row.count === row.total ? `共 ${row.total} 条技术` : `命中 ${row.count} / 共 ${row.total} 条`}
                      />
                    )}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="opacity-50 transition-opacity group-hover:opacity-100">
                      <DifficultyMeter value={row.node.difficulty} />
                    </span>
                    {(row.node.commands?.length ?? 0) > 0 && (
                      <span
                        className="font-mono text-11 text-fg-muted"
                        title={`${row.node.commands?.length ?? 0} 条命令模板`}
                      >
                        ${row.node.commands?.length}
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-1.5 text-11 text-fg-muted">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </span>
          <span>移动</span>
          <span className="flex items-center gap-1">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
          </span>
          <span>展开/折叠</span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>Enter</Kbd>打开
          </span>
        </div>
      </div>
    </div>
  );
}
