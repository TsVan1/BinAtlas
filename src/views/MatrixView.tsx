/**
 * Tab 2：交叉矩阵。
 *
 * 行 = 子领域（含 3 个没有子领域的试点领域，行标签会注明「直挂」），
 * 列 = 载体 kind，值 = 该子领域下覆盖这种载体的技术数。
 *
 * 点格子 → 回目录树并筛出这批技术（URL 里带上 dom + akind，可分享）。
 *
 * 列类别直接来自 `nodes.json` 的 `artifact_kind`（投影层已补齐），没有旁路表可漂移；
 * 若某个载体缺这个字段，矩阵把它算进 unknown 列并在第 11 类「未归类」里显示。
 */
import { Fragment, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { CountPill, Kbd } from '../components/ui';
import { cn } from '../lib/cn';
import { cellKey, type MatrixModel, type MatrixUnit } from '../lib/matrix';
import { mixHex } from '../lib/palette';

interface MatrixViewProps {
  model: MatrixModel;
  onOpenCell: (unitId: string, kind: string) => void;
  onSelectDomain: (domainId: string) => void;
}

interface HoverState {
  unit: MatrixUnit;
  kind: string;
  label: string;
  count: number;
  techniques: string[];
  x: number;
  y: number;
}

interface UnitGroup {
  topId: string;
  topName: string;
  units: MatrixUnit[];
  techniqueCount: number;
}

/** 热度：低值也看得见（幂次压平），高值接近霓虹青 */
function heatStyle(count: number, max: number): CSSProperties {
  if (count === 0) return {};
  const ratio = max <= 1 ? 1 : Math.min(1, count / max);
  const t = Math.pow(ratio, 0.62);
  const background = mixHex('#0b2f38', '#22d3ee', 0.16 + 0.84 * t);
  const text = t > 0.55 ? '#03202a' : '#c9f6ff';
  const glow = 0.18 + 0.5 * t;
  return {
    backgroundColor: background,
    color: text,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,${(0.06 + 0.12 * t).toFixed(2)}), 0 0 ${(8 + 16 * t).toFixed(0)}px -6px rgba(34,211,238,${glow.toFixed(2)})`,
  };
}

function groupUnits(units: MatrixUnit[]): UnitGroup[] {
  const groups: UnitGroup[] = [];
  for (const unit of units) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.topId === unit.topId) {
      last.units.push(unit);
      last.techniqueCount += unit.techniqueCount;
    } else {
      groups.push({ topId: unit.topId, topName: unit.topName, units: [unit], techniqueCount: unit.techniqueCount });
    }
  }
  return groups;
}

export function MatrixView({ model, onOpenCell, onSelectDomain }: MatrixViewProps) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const groups = useMemo(() => groupUnits(model.units), [model.units]);

  if (model.columns.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <MatrixHeader model={model} />
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="max-w-[480px] text-center text-12 leading-relaxed text-fg-muted">
            矩阵没有可画的列：当前技术没有声明任何载体（<span className="font-mono">artifacts[]</span> 为空），
            或者载体节点缺少 <span className="font-mono">artifact_kind</span>。
            数据补齐后本页会自动恢复，不需要重新生成任何旁路文件。
          </p>
        </div>
      </div>
    );
  }

  const totalColumns = model.columns.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MatrixHeader model={model} />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto px-4 pb-3">
          <div className="flex justify-center">
            <table className="w-max border-separate border-spacing-[1px]">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 w-[196px] border-b border-border bg-panel px-2 py-1 text-left text-11 font-normal text-fg-muted"
                  >
                    子领域 / 载体 kind
                  </th>
                  {model.columns.map((column) => (
                    <th
                      key={column.kind}
                      scope="col"
                      title={`${column.label}（${column.coverage}/${model.units.length} 个子领域有覆盖）`}
                      className="sticky top-0 z-20 w-[58px] border-b border-border bg-panel px-1 py-1 text-center font-normal"
                    >
                      <span className="block truncate text-11 text-fg-dim">{column.short}</span>
                      <span className="mt-0.5 block font-mono text-11 text-fg-muted">{column.coverage}</span>
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="sticky top-0 z-20 w-[44px] border-b border-border bg-panel px-1 py-1 text-center text-11 font-normal text-fg-muted"
                    title="该子领域的技术总数"
                  >
                    技术
                  </th>
                </tr>
              </thead>

              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.topId}>
                    {group.units.length > 1 && (
                      <tr>
                        <td colSpan={totalColumns + 2} className="px-1 pb-0 pt-0.5">
                          <div className="flex items-baseline gap-2 border-l-2 border-accent/45 pl-1.5">
                            <span className="text-11 text-accent/80">{group.topName}</span>
                            <span className="font-mono text-11 text-fg-muted">
                              {group.units.length} 子领域 · {group.techniqueCount} 技术
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {group.units.map((unit) => (
                      <tr key={unit.id}>
                        <th
                          scope="row"
                          className="sticky left-0 z-10 w-[196px] border-l-2 border-l-border/40 bg-panel px-2 py-0 text-left font-normal"
                          style={{ height: 22 }}
                        >
                          <span className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectDomain(unit.id)}
                              title={unit.flat ? `${unit.name}（技术直挂，无子领域）` : unit.name}
                              className="min-w-0 max-w-[150px] truncate text-12 text-fg-dim transition-colors hover:text-accent-soft"
                            >
                              {unit.name}
                            </button>
                            {unit.flat && (
                              <span className="shrink-0 rounded border border-border px-1 font-mono text-11 text-fg-muted">直挂</span>
                            )}
                          </span>
                        </th>

                        {model.columns.map((column) => {
                          const cell = model.cells.get(cellKey(unit.id, column.kind));
                          const count = cell?.count ?? 0;
                          const style = heatStyle(count, model.max);

                          return (
                            <td key={column.kind} className="w-[58px] p-0 align-middle">
                              <button
                                type="button"
                                disabled={count === 0}
                                aria-label={`${unit.name} × ${column.label}：${count} 条技术`}
                                data-zero={count === 0}
                                className={cn('matrix-cell', count === 0 ? 'cursor-default' : 'cursor-pointer')}
                                style={style}
                                onClick={() => count > 0 && onOpenCell(unit.id, column.kind)}
                                onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => {
                                  setHover({
                                    unit,
                                    kind: column.kind,
                                    label: column.label,
                                    count,
                                    techniques: cell?.techniques ?? [],
                                    x: event.clientX,
                                    y: event.clientY,
                                  });
                                }}
                                onMouseMove={(event: MouseEvent<HTMLButtonElement>) => {
                                  setHover((current) =>
                                    current === null ? current : { ...current, x: event.clientX, y: event.clientY },
                                  );
                                }}
                                onMouseLeave={() => setHover(null)}
                                onFocus={(event) => {
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  setHover({
                                    unit,
                                    kind: column.kind,
                                    label: column.label,
                                    count,
                                    techniques: cell?.techniques ?? [],
                                    x: rect.right,
                                    y: rect.top,
                                  });
                                }}
                                onBlur={() => setHover(null)}
                              >
                                {count === 0 ? '' : count}
                              </button>
                            </td>
                          );
                        })}

                        <td className="px-1 text-center font-mono text-11 text-fg-muted">{unit.techniqueCount}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="flex w-[250px] shrink-0 flex-col border-l border-border bg-panel/40">
          <div className="border-b border-border px-3 py-2">
            <h3 className="text-11 uppercase tracking-[0.14em] text-fg-muted">载体覆盖排行</h3>
            <p className="mt-0.5 text-11 text-fg-muted">有多少个子领域用到了这种载体</p>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
            {[...model.columns]
              .sort((a, b) => b.coverage - a.coverage)
              .map((column) => {
                const ratio = model.units.length === 0 ? 0 : column.coverage / model.units.length;
                return (
                  <div key={column.kind}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-11 text-fg-dim" title={column.label}>
                        {column.label}
                      </span>
                      <span className="shrink-0 font-mono text-11 text-fg-muted">
                        {column.coverage}/{model.units.length}
                      </span>
                    </div>
                    <div className="mt-0.5 h-[4px] overflow-hidden rounded-full bg-panel-raised">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(3, Math.round(ratio * 100))}%`,
                          background: `linear-gradient(90deg, ${mixHex('#0b2f38', '#22d3ee', 0.5)}, #22d3ee)`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="border-t border-border px-3 py-2 text-11 leading-relaxed text-fg-muted">
            {model.units.length} 个子领域 × {model.columns.length} 类载体 · 覆盖{' '}
            <span className="font-mono text-fg-dim">{model.coveredCells}</span>/{model.totalCells} 格
          </div>
        </aside>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-1.5 text-11 text-fg-muted">
        <span>点格子 → 目录树筛出这批技术</span>
        <span className="text-fg-muted/50">·</span>
        <span className="flex items-center gap-1">
          <Kbd>悬停</Kbd> 看技术名单
        </span>
        {model.missingKinds.length > 0 && (
          <span className="text-amber">{model.missingKinds.length} 个载体缺 artifact_kind，已归入「未归类」</span>
        )}
        <span className="ml-auto font-mono">峰值 {model.max} 条 / 格</span>
      </div>

      {hover !== null && <HoverCard hover={hover} />}
    </div>
  );
}

function MatrixHeader({ model }: { model: MatrixModel }) {
  return (
    <div className="flex shrink-0 items-end gap-4 border-b border-border px-4 py-2.5">
      <div>
        <h1 className="text-16 font-semibold tracking-tight text-fg">交叉矩阵</h1>
        <p className="mt-0.5 text-11 text-fg-muted">
          行 = 子领域 · 列 = 载体 kind · 值 = 覆盖该载体的技术数（同一条技术只计一次）
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2 text-11 text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-[10px] w-[18px] rounded-[2px] border border-border-strong"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(139,152,165,.35) 0 1px, transparent 1px 4px)' }}
            aria-hidden
          />
          0 = 无覆盖
        </span>
        <span className="ml-1">低</span>
        <span
          className="inline-block h-[8px] w-[88px] rounded-full"
          style={{ background: `linear-gradient(90deg, ${mixHex('#0b2f38', '#22d3ee', 0.16)}, #22d3ee)` }}
          aria-hidden
        />
        <span>高</span>
        <CountPill value={model.max} tone="accent" title="单格最大技术数" />
      </div>
    </div>
  );
}

function HoverCard({ hover }: { hover: HoverState }) {
  const width = 268;
  const left = Math.max(8, Math.min(hover.x + 14, window.innerWidth - width - 12));
  const top = Math.max(8, Math.min(hover.y + 14, window.innerHeight - 150));

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded border border-accent/35 bg-panel/95 p-2.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9)] backdrop-blur-sm"
      style={{ left, top, width }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-12 text-fg">{hover.unit.name}</p>
        <span className="shrink-0 font-mono text-11 text-accent-soft">{hover.kind}</span>
      </div>
      <p className="mt-1 text-11 text-fg-muted">
        {hover.label} ·{' '}
        {hover.count === 0 ? (
          <span className="text-fg-muted">该子领域没有覆盖这种载体的技术</span>
        ) : (
          <span className="text-fg-dim">
            <span className="font-mono text-accent-soft">{hover.count}</span> 条技术覆盖
          </span>
        )}
      </p>
      {hover.techniques.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-border/70 pt-1.5">
          {hover.techniques.slice(0, 5).map((name) => (
            <li key={name} className="truncate text-11 text-fg-dim">
              · {name}
            </li>
          ))}
          {hover.techniques.length > 5 && (
            <li className="text-11 text-fg-muted">… 另有 {hover.techniques.length - 5} 条</li>
          )}
        </ul>
      )}
      {hover.count > 0 && <p className="mt-1.5 text-11 text-accent/80">点击 → 目录树筛出</p>}
    </div>
  );
}
