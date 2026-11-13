/**
 * Tab 3：工作流编排。
 *
 * 勾选 2–6 条技术 → 按 prerequisites ∪ upstream 边拓扑排序 → 步骤卡（序号 + 名称 + 该步命令数）。
 * 三件必须显式处理的事：
 *   1. 依赖环：Kahn 排不完就把环上的节点点名，不静默；
 *   2. 没有依赖：所选技术之间确实没有前置关系时，按勾选顺序输出并说明；
 *   3. 前置未选：把缺失的前置列出来并支持一键补选，而不是给出一个看着完整其实残缺的顺序。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import type { AtlasTree } from '../lib/tree';
import { techniquesUnder } from '../lib/tree';
import type { AtlasData, AtlasNode } from '../lib/types';
import { buildWorkflow, WORKFLOW_MAX, WORKFLOW_MIN, type WorkflowPlan, type WorkflowStep } from '../lib/workflow';
import { CheckIcon, CloseIcon, SearchIcon } from '../components/icons';
import { DifficultyMeter, Kbd } from '../components/ui';

interface WorkflowViewProps {
  data: AtlasData;
  tree: AtlasTree;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  /** 跳到目录树并打开这条技术 */
  onOpenInTree: (id: string) => void;
}

export function WorkflowView({ data, tree, selectedIds, onToggle, onClear, onOpenInTree }: WorkflowViewProps) {
  const [query, setQuery] = useState('');
  const plan = useMemo(() => buildWorkflow(selectedIds, data), [selectedIds, data]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const atMax = selectedIds.length >= WORKFLOW_MAX;
  const needle = query.trim().toLowerCase();

  const pickerRef = useRef<HTMLDivElement | null>(null);
  const didScrollToSelection = useRef(false);

  // 深链带着 pick 进来时，把左栏滚到已选项所在分组：否则 193 行列表永远从第一条开始
  useEffect(() => {
    if (didScrollToSelection.current || selectedIds.length === 0) return;
    const container = pickerRef.current;
    const target = container?.querySelector<HTMLElement>('[data-picked="true"]');
    if (container === null || container === undefined || target === null || target === undefined) return;
    didScrollToSelection.current = true;
    // 只滚左栏容器：scrollIntoView 会连带滚 window，把顶栏顶出视口（截图里吃过一次亏）
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    container.scrollTop += targetRect.top - containerRect.top - (container.clientHeight - targetRect.height) / 2;
  }, [selectedIds]);

  const groups = useMemo(
    () =>
      tree.roots
        .map((root) => ({
          root,
          techniques: techniquesUnder(root).filter(
            (technique) =>
              needle === '' ||
              technique.name.toLowerCase().includes(needle) ||
              technique.id.toLowerCase().includes(needle),
          ),
        }))
        .filter((group) => group.techniques.length > 0),
    [tree, needle],
  );

  const domainLabelOf = (technique: AtlasNode): string => {
    const parentId = tree.parentOfTechnique.get(technique.id);
    return parentId === undefined ? '未挂载' : (tree.domainsById.get(parentId)?.node.name ?? parentId);
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-border bg-panel/50">
        <div className="shrink-0 border-b border-border px-3 pb-2 pt-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-11 uppercase tracking-[0.16em] text-fg-muted">选择技术</h1>
            <span className="font-mono text-11">
              <span className={cn(selectedIds.length >= WORKFLOW_MIN ? 'text-accent-soft' : 'text-fg-muted')}>
                {selectedIds.length}
              </span>
              <span className="text-fg-muted"> / {WORKFLOW_MAX}</span>
            </span>
          </div>
          <p className="mt-0.5 text-11 text-fg-muted">勾选 {WORKFLOW_MIN}–{WORKFLOW_MAX} 条，按 prerequisites ∪ upstream 排序</p>

          <div className="mt-2 flex h-7 items-center gap-1.5 rounded border border-border bg-bg px-2 focus-within:border-accent/55">
            <span className="text-fg-muted">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="筛选技术名…"
              aria-label="筛选工作流候选技术"
              className="h-full min-w-0 flex-1 bg-transparent text-12 text-fg outline-none placeholder:text-fg-muted"
            />
            {query !== '' && (
              <button type="button" onClick={() => setQuery('')} aria-label="清除筛选" className="text-fg-muted hover:text-fg">
                <CloseIcon />
              </button>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="font-mono text-11 text-fg-muted">已选</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {selectedIds.map((id) => {
                  const node = data.nodesById.get(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onToggle(id)}
                      title={`移除 ${node?.name ?? id}`}
                      className="inline-flex max-w-[150px] items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-px text-11 text-accent-soft transition-colors hover:border-magenta/40 hover:text-magenta"
                    >
                      <span className="truncate">{node?.name ?? id}</span>
                      <span aria-hidden className="shrink-0 text-fg-muted">×</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onClear}
                className="shrink-0 rounded border border-border px-1.5 py-px text-11 text-fg-muted transition-colors hover:border-magenta/40 hover:text-magenta"
              >
                清空
              </button>
            </div>
          )}
        </div>

        <div ref={pickerRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {groups.map((group) => (
            <div key={group.root.node.id} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 py-1">
                <span className="text-11 text-accent/70">{group.root.node.name}</span>
                <span className="font-mono text-11 text-fg-muted">{group.techniques.length}</span>
              </div>
              {group.techniques.map((technique) => {
                const checked = selectedSet.has(technique.id);
                const disabled = !checked && atMax;
                return (
                  <button
                    key={technique.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    data-picked={checked}
                    disabled={disabled}
                    title={disabled ? `最多选 ${WORKFLOW_MAX} 条` : technique.name}
                    onClick={() => onToggle(technique.id)}
                    className={cn(
                      'group flex w-full items-center gap-2 px-3 py-[5px] text-left transition-colors',
                      checked ? 'bg-accent/[0.08]' : 'hover:bg-white/[0.035]',
                      disabled && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors',
                        checked ? 'border-accent bg-accent text-bg' : 'border-border-strong text-transparent',
                      )}
                      aria-hidden
                    >
                      {checked && <CheckIcon />}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate text-12', checked ? 'text-fg' : 'text-fg-dim')}>
                      {technique.name}
                    </span>
                    <span className="font-mono text-11 text-fg-muted">${technique.commands?.length ?? 0}</span>
                    <DifficultyMeter value={technique.difficulty} />
                  </button>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="px-3 py-6 text-center text-12 text-fg-muted">没有匹配的技术</p>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
          <h2 className="text-16 font-semibold tracking-tight text-fg">执行序列</h2>
          <span className="text-11 text-fg-muted">依赖 = prerequisites ∪ upstream 边；A → B 表示 A 必须先于 B</span>
          <div className="ml-auto flex items-center gap-2 font-mono text-11 text-fg-muted">
            <span>{plan.steps.length} 步</span>
            <span className="text-fg-muted/50">·</span>
            <span>{plan.edges.length} 条依赖</span>
            {plan.cycle !== null && <span className="text-magenta">环 {plan.cycle.length - 1}</span>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {selectedIds.length < WORKFLOW_MIN ? (
            <div className="mx-auto mt-10 max-w-[520px] rounded border border-dashed border-border-strong/70 bg-panel/40 px-5 py-6">
              <p className="text-13 text-fg-dim">勾选 {WORKFLOW_MIN}–{WORKFLOW_MAX} 条技术开始编排</p>
              <ul className="mt-2 space-y-1.5 text-12 leading-relaxed text-fg-muted">
                <li>· 左栏按领域分组列出全部技术，点一行即勾选</li>
                <li>· 排序依据是 <span className="font-mono text-fg-dim">prerequisites</span> 加 <span className="font-mono text-fg-dim">upstream</span> 边（合并去重）：A 是 B 的前置，A 就排在 B 前</li>
                <li>· 现有 193 条技术里 175 条有 prerequisites；没有的那些按入口条目处理，不会凭空造依赖</li>
              </ul>
              <div className="mt-3 flex items-center gap-1.5 text-11 text-fg-muted">
                <Kbd>⌘K</Kbd> 先搜一条技术，再用右栏「在目录树中打开」看它的细节
              </div>
            </div>
          ) : (
            <>
              {plan.cycle !== null && <CycleBanner names={plan.cycleNames} />}

              {plan.cycle === null && !plan.hasEdges && (
                <div className="mb-3 rounded border border-border bg-panel/60 px-3 py-2 text-12 leading-relaxed text-fg-dim">
                  <span className="text-amber">所选技术之间没有前置关系</span>
                  （prerequisites 与 upstream 边都没指向彼此），当前按勾选顺序输出。这是数据现状，不是算法降级。
                </div>
              )}

              {plan.emptyCommandCount > 0 && (
                <p className="mb-2 px-1 text-11 text-fg-muted">
                  {plan.emptyCommandCount} 条所选技术在数据里没有命令模板，步骤卡标为 <span className="text-amber/80">无命令模板</span>。
                </p>
              )}

              <ol className="space-y-0">
                {plan.steps.map((step, index) => (
                  <StepCard
                    key={step.node.id}
                    step={step}
                    last={index === plan.steps.length - 1}
                    domainLabel={domainLabelOf(step.node)}
                    canAdd={selectedIds.length < WORKFLOW_MAX}
                    onAdd={onToggle}
                    onOpen={onOpenInTree}
                  />
                ))}
              </ol>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <DependencyPanel plan={plan} data={data} />
                <ChecklistPanel plan={plan} selectedCount={selectedIds.length} />
              </div>

              <AssetPanel plan={plan} data={data} />
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-1.5 text-11 text-fg-muted">
          前置关系来自 <span className="font-mono">nodes.json · prerequisites</span> 与{' '}
          <span className="font-mono">edges.upstream</span>（合并去重）
          <span className="mx-1.5 text-fg-muted/50">·</span>
          引用缺失的前置会标灰，不会被悄悄丢掉
        </div>
      </section>
    </div>
  );
}

function AssetPanel({ plan, data }: { plan: WorkflowPlan; data: AtlasData }) {
  const stepIds = new Set(plan.steps.map((step) => step.node.id));

  const tools = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const edge of data.edges) {
      if (edge.kind !== 'uses' || !stepIds.has(edge.from) || seen.has(edge.to)) continue;
      const tool = data.nodesById.get(edge.to);
      if (tool === undefined) continue;
      seen.add(edge.to);
      out.push(tool.name);
    }
    return out;
  }, [data.edges, data.nodesById, stepIds]);

  const artifacts = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const step of plan.steps) {
      for (const id of step.node.artifacts) {
        if (seen.has(id)) continue;
        const artifact = data.nodesById.get(id);
        seen.add(id);
        out.push(artifact?.name ?? id);
      }
    }
    return out;
  }, [plan.steps, data.nodesById]);

  if (tools.length === 0 && artifacts.length === 0) return null;

  return (
    <section className="mt-3 rounded border border-border bg-panel/40 px-3 py-2">
      <h3 className="text-11 uppercase tracking-[0.14em] text-fg-muted">本流程关联资产</h3>
      <div className="mt-1 grid grid-cols-2 gap-4">
        <div>
          <p className="text-11 text-fg-muted">工具 <span className="font-mono">{tools.length}</span></p>
          {tools.length === 0 ? (
            <p className="mt-0.5 text-11 text-fg-muted">所选技术没有登记 uses 工具</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1">
              {tools.map((tool) => (
                <span key={tool} className="rounded border border-border bg-panel-raised px-1.5 py-px text-11 text-fg-dim">
                  {tool}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-11 text-fg-muted">载体 <span className="font-mono">{artifacts.length}</span></p>
          {artifacts.length === 0 ? (
            <p className="mt-0.5 text-11 text-fg-muted">所选技术没有登记载体</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1">
              {artifacts.map((artifact) => (
                <span key={artifact} className="rounded border border-border bg-panel-raised px-1.5 py-px text-11 text-fg-dim">
                  {artifact}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DependencyPanel({ plan, data }: { plan: WorkflowPlan; data: AtlasData }) {
  // 按「下游步骤号 → 上游步骤号」排序：读起来是一条从入口到出口的链，而不是边表的插入顺序
  const stepIndex = new Map(plan.steps.map((step) => [step.node.id, step.index] as const));
  const orderedEdges = [...plan.edges].sort(
    (a, b) =>
      (stepIndex.get(a.to) ?? 99) - (stepIndex.get(b.to) ?? 99) ||
      (stepIndex.get(a.from) ?? 99) - (stepIndex.get(b.from) ?? 99),
  );

  return (
    <section className="rounded border border-border bg-panel/40 px-3 py-2">
      <h3 className="text-11 uppercase tracking-[0.14em] text-fg-muted">本次依赖边</h3>
      {plan.edges.length === 0 ? (
        <p className="mt-1 text-11 leading-relaxed text-fg-muted">
          所选技术之间没有前置关系（prerequisites 与 upstream 边都没指向彼此），顺序只由勾选次序决定。
          要看到真正的排序，沿一条已有的前置链多选几步。
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-border/60">
          {orderedEdges.map((edge) => (
            <li key={`${edge.from}-${edge.to}`} className="py-1">
              <p className="text-11 text-fg-dim">
                <span className="text-accent/80">{data.nodesById.get(edge.from)?.name ?? edge.from}</span>
                <span className="mx-1 text-fg-muted">→</span>
                <span>{data.nodesById.get(edge.to)?.name ?? edge.to}</span>
              </p>
              {edge.rationale !== '' && (
                <p className="mt-0.5 line-clamp-2 text-11 leading-snug text-fg-muted">{edge.rationale}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 py-[3px]">
      <span className={cn('mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full', ok ? 'bg-lime' : 'bg-amber')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-11 text-fg-dim">{label}</span>
          <span className={cn('font-mono text-11', ok ? 'text-lime/80' : 'text-amber')}>{detail}</span>
        </span>
      </span>
    </div>
  );
}

function ChecklistPanel({ plan, selectedCount }: { plan: WorkflowPlan; selectedCount: number }) {
  const missingCount = plan.steps.reduce((sum, step) => sum + step.missing.length, 0);

  return (
    <section className="rounded border border-border bg-panel/40 px-3 py-2">
      <h3 className="text-11 uppercase tracking-[0.14em] text-fg-muted">编排检查</h3>
      <CheckRow ok={plan.cycle === null} label="依赖环" detail={plan.cycle === null ? '无' : `${plan.cycle.length - 1} 个节点成环`} />
      <CheckRow ok={plan.cycle === null} label="拓扑顺序" detail={plan.cycle === null ? '可信' : '不可用'} />
      <CheckRow ok={missingCount === 0} label="前置未选" detail={missingCount === 0 ? '无' : `${missingCount} 条`} />
      <CheckRow
        ok={plan.emptyCommandCount === 0}
        label="缺命令模板"
        detail={plan.emptyCommandCount === 0 ? '无' : `${plan.emptyCommandCount}/${selectedCount} 步`}
      />
      <p className="mt-1.5 border-t border-border/60 pt-1.5 text-11 leading-relaxed text-fg-muted">
        检查项全部来自数据本身：环来自 prerequisites/upstream，缺命令来自 commands[]。这里不替数据打圆场。
      </p>
    </section>
  );
}

function CycleBanner({ names }: { names: string[] }) {
  return (
    <div className="mb-3 rounded border border-magenta/40 bg-magenta/[0.07] px-3 py-2">
      <p className="text-12 font-medium text-magenta">检测到依赖环，无法给出可信顺序</p>
      <p className="mt-1 font-mono text-11 leading-relaxed text-fg-dim">{names.join(' → ')}</p>
      <p className="mt-1 text-11 text-fg-muted">
        环上的节点已排到最后并单独标出；请先确认这条环是数据错误，还是两道工序确实互为前置。
      </p>
    </div>
  );
}

function StepCard({
  step,
  last,
  domainLabel,
  canAdd,
  onAdd,
  onOpen,
}: {
  step: WorkflowStep;
  last: boolean;
  domainLabel: string;
  canAdd: boolean;
  onAdd: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <li className="step-in relative pl-9" style={{ ['--step-index' as string]: step.index - 1 }}>
      {!last && <span aria-hidden className="step-rail absolute left-[11px] top-7 h-[calc(100%-10px)] w-px" />}

      <span
        className={cn(
          'absolute left-0 top-1.5 grid h-6 w-6 place-items-center rounded-full border font-mono text-11',
          step.inCycle
            ? 'border-magenta/50 bg-magenta/10 text-magenta'
            : 'border-accent/40 bg-panel text-accent-soft shadow-[0_0_16px_-6px_rgba(34,211,238,0.8)]',
        )}
      >
        {step.index}
      </span>

      <div
        className={cn(
          'mb-2 rounded border px-3 py-2',
          step.inCycle ? 'border-magenta/35 bg-magenta/[0.05]' : 'border-border bg-panel/60',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(step.node.id)}
            className="text-13 font-medium text-fg transition-colors hover:text-accent-soft"
            title="在目录树中打开"
          >
            {step.node.name}
          </button>
          {step.inCycle && (
            <span className="rounded border border-magenta/40 px-1 font-mono text-11 text-magenta">环上</span>
          )}
          <span className="ml-auto flex items-center gap-2 font-mono text-11 text-fg-muted">
            <span title="该步的命令模板条数">
              {step.commandCount === 0 ? (
                <span className="text-amber/80">无命令模板</span>
              ) : (
                <>
                  <span className="text-fg-dim">{step.commandCount}</span> 命令
                </>
              )}
            </span>
            <span className="text-fg-muted/50">·</span>
            <span>{step.pitfallCount} 坑</span>
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-11 text-fg-muted">
          <span>{domainLabel}</span>
          <span className="flex items-center gap-1">
            {/* 「难度」只在视觉上出现；读屏由 DifficultyMeter 自带的 sr-only 播报，避免念两遍 */}
            <span aria-hidden>难度</span>
            <DifficultyMeter value={step.node.difficulty} />
          </span>
          {step.requires.length > 0 && (
            <span className="text-accent/80">
              依赖 {step.requires.map((index) => `#${index}`).join(' ')}
            </span>
          )}
          {step.requires.length === 0 && !step.inCycle && <span className="text-fg-muted">无前置</span>}
        </div>

        {step.missing.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-border/60 pt-1.5">
            <span className="text-11 text-amber">前置未选：</span>
            {step.missing.map((missing) =>
              missing.known ? (
                <button
                  key={missing.id}
                  type="button"
                  disabled={!canAdd}
                  title={canAdd ? `把「${missing.name}」加入编排` : `最多选 ${WORKFLOW_MAX} 条`}
                  onClick={() => onAdd(missing.id)}
                  className="rounded border border-amber/35 bg-amber/[0.08] px-1.5 py-px text-11 text-amber transition-colors enabled:hover:border-amber/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ＋ {missing.name}
                </button>
              ) : (
                <span key={missing.id} className="rounded border border-border px-1.5 py-px font-mono text-11 text-fg-muted">
                  {missing.id}（未收录）
                </span>
              ),
            )}
          </div>
        )}
      </div>
    </li>
  );
}
