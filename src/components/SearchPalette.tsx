/**
 * 搜命令面板（⌘K）：MiniSearch 索引来自 index.json。
 * 输入即筛，回车选中第一个结果并聚焦到该节点；无结果给建议而不是空白。
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';
import { searchNodes, type SearchIndex, type SearchHit } from '../lib/search';
import { truncate } from '../lib/format';
import { kindStyle } from '../lib/palette';
import { CloseIcon, SearchIcon } from './icons';
import { KindDot, Kbd } from './ui';

interface SearchPaletteProps {
  open: boolean;
  index: SearchIndex | null;
  totalNodes: number;
  onClose: () => void;
  onPick: (id: string) => void;
}

export function SearchPalette({ open, index, totalNodes, onClose, onPick }: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const results = useMemo<SearchHit[]>(() => (index ? searchNodes(index, query, 8) : []), [index, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    // 打开后立刻可输入：命令面板的价值在于不用先点输入框
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[activeIndex] ?? results[0];
      if (hit) onPick(hit.id);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-bg/45" />
      <div
        className="atlas-glass relative mx-auto mt-[12vh] w-[580px] overflow-hidden rounded-lg border border-border-strong shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="text-fg-muted">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索节点名或别名…"
            aria-label="搜索节点"
            className="h-6 flex-1 bg-transparent text-13 text-fg outline-none placeholder:text-fg-muted"
          />
          <Kbd>Esc</Kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭搜索"
            className="text-fg-muted hover:text-fg-dim"
          >
            <CloseIcon />
          </button>
        </div>

        {query.trim() === '' ? (
          <div className="px-3 py-4 text-12 text-fg-muted">
            输入节点名或英文别名，回车聚焦到第一个结果。
            <div className="mt-2 text-11 text-fg-muted/80">
              索引覆盖 {totalNodes} 条记录（来自 public/graph/index.json）
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-4">
            <p className="text-13 text-fg-dim">没有匹配项</p>
            <ul className="mt-2 space-y-1 text-12 text-fg-muted">
              <li>· 换一个关键词，或只输入名字的前两个字</li>
              <li>· 当前索引覆盖 {totalNodes} 条，这条可能还没收录</li>
              <li>· 也可以清空搜索，直接在画布上点击节点</li>
            </ul>
          </div>
        ) : (
          <ul ref={listRef} className="max-h-[46vh] overflow-y-auto py-1">
            {results.map((hit, index) => {
              const style = kindStyle(hit.kind);
              const active = index === activeIndex;
              return (
                <li key={hit.id}>
                  <button
                    type="button"
                    data-active={active}
                    onClick={() => onPick(hit.id)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'flex w-full items-start gap-2.5 px-3 py-1.5 text-left',
                      active ? 'bg-accent/10' : 'hover:bg-panel-raised',
                    )}
                  >
                    <span className="mt-1">
                      <KindDot kind={hit.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-13 text-fg">{hit.name}</span>
                        <span className="shrink-0 text-11 text-fg-muted">{style.label}</span>
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-11 text-fg-muted">{hit.id}</span>
                      {hit.tldr !== '' && (
                        <span className="mt-0.5 block truncate text-11 text-fg-muted/80">{truncate(hit.tldr, 46)}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-11 text-fg-muted">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> 选择
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> 聚焦
          </span>
          <span className="ml-auto">{results.length > 0 ? `${results.length} 个结果` : ''}</span>
        </div>
      </div>
    </div>
  );
}
