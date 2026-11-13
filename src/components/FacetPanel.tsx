/**
 * 左栏 Facet 面板：三个维度、实时计数、多选。
 * 计数与禁用逻辑全部来自 `lib/facets.ts`，这里只做渲染。
 */
import { cn } from '../lib/cn';
import type { FacetKey, FacetSection } from '../lib/facets';
import { CheckIcon } from './icons';

interface FacetPanelProps {
  sections: FacetSection[];
  total: number;
  matched: number;
  filterActive: boolean;
  onToggle: (key: FacetKey, value: string) => void;
  onClear: () => void;
}

export function FacetPanel({ sections, total, matched, filterActive, onToggle, onClear }: FacetPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-12 font-medium text-fg-dim">筛选</h2>
          <span className="font-mono text-11 text-fg-muted">
            命中 <span className={filterActive ? 'text-accent' : 'text-fg-dim'}>{matched}</span> / {total}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!filterActive}
          className={cn(
            'mt-2 w-full rounded border border-border px-2 py-1 text-11',
            'enabled:text-fg-dim enabled:hover:border-border-strong enabled:hover:text-fg',
            'disabled:cursor-not-allowed disabled:text-fg-muted/60',
          )}
        >
          清除全部筛选
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {sections.map((section) => (
          <section key={section.key} className="mb-3.5">
            <div className="mb-1 flex items-baseline justify-between px-1">
              <h3 className="text-11 uppercase tracking-wider text-fg-muted">{section.title}</h3>
              {section.active > 0 && (
                <span className="rounded bg-accent/15 px-1 font-mono text-11 text-accent">{section.active}</span>
              )}
            </div>

            <ul>
              {section.options.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => onToggle(section.key, option.value)}
                    disabled={option.disabled}
                    aria-pressed={option.selected}
                    title={option.disabled ? '与当前其它筛选无交集' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-12',
                      option.selected ? 'bg-accent/10 text-fg' : 'text-fg-dim',
                      option.disabled
                        ? 'cursor-not-allowed opacity-40'
                        : 'hover:bg-panel-raised',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-3 w-3 shrink-0 place-items-center rounded-sm border',
                        option.selected ? 'border-accent bg-accent/20 text-accent' : 'border-border-strong',
                      )}
                    >
                      {option.selected && <CheckIcon />}
                    </span>
                    {option.color !== undefined && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: option.color }}
                      />
                    )}
                    <span className="flex-1 truncate">{option.label}</span>
                    <span className="font-mono text-11 text-fg-muted">{option.count}</span>
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-1 px-1 text-11 leading-snug text-fg-muted/80">{section.hint}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
