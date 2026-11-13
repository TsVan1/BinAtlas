/**
 * 右栏详情抽屉。
 *
 * 两条必须写清楚的诚实说明：
 * 1. `difficulty` 是跨类型归并值，同一数字在不同 kind 下语义不同；
 * 2. 本页所有内容都读自 `public/graph/*.json` 构建产物，不直接读 `data/*.yaml`。
 */
import { cn } from '../lib/cn';
import {
  aiReadyLabel,
  difficultyFieldLabel,
  difficultyNotTracked,
  licenseLabel,
  maintainStatusLabel,
  platformLabel,
} from '../lib/enums';
import { DASH, formatDateTime, orDash } from '../lib/format';
import type { AtlasNode, GraphMeta } from '../lib/types';
import { KindBadge, Kbd } from './ui';

interface DetailDrawerProps {
  node: AtlasNode | null;
  nodesById: ReadonlyMap<string, AtlasNode>;
  meta: GraphMeta;
  warnings: string[];
  totalNodes: number;
  totalEdges: number;
  /** 命中的是画布上被筛选压暗的节点时，如实提示，避免用户以为图坏了 */
  isFilteredOut: boolean;
}

function FactRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <dt className="w-[104px] shrink-0 text-12 text-fg-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-12 text-fg-dim">
        {children}
        {hint !== undefined && <p className="mt-0.5 text-11 leading-snug text-fg-muted/80">{hint}</p>}
      </dd>
    </div>
  );
}

/** 关联对象：显示 id + 解出的名字；解不出来就明说「未收录」，不静默吞掉 */
function RelationList({
  ids,
  nodesById,
  emptyText,
}: {
  ids: string[];
  nodesById: ReadonlyMap<string, AtlasNode>;
  emptyText: string;
}) {
  if (ids.length === 0) {
    return <p className="text-12 text-fg-muted">{emptyText}</p>;
  }

  return (
    <ul className="space-y-0.5">
      {ids.map((id) => {
        const target = nodesById.get(id);
        return (
          <li key={id} className="flex items-baseline gap-2 text-12">
            <span className="shrink-0 font-mono text-11 text-fg-muted">{id}</span>
            {target ? (
              <span className="truncate text-fg-dim">{target.name}</span>
            ) : (
              <span className="shrink-0 text-11 text-amber">未收录</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3">
      <h3 className="mb-1.5 text-11 uppercase tracking-wider text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

function DataSourceNote({ meta, totalNodes, totalEdges }: { meta: GraphMeta; totalNodes: number; totalEdges: number }) {
  return (
    <div className="border-t border-border px-4 py-3 text-11 leading-relaxed text-fg-muted">
      <p>
        数据来源：<span className="font-mono">data/</span> 下的 YAML 经{' '}
        <span className="font-mono">pnpm build</span> 编译为{' '}
        <span className="font-mono">public/graph/*.json</span>，本页只读这些产物，不直接读 YAML。
      </p>
      <p className="mt-1">
        本次构建：{formatDateTime(meta.builtAt)} · schema {orDash(meta.schemaVersion)} · 节点 {totalNodes} · 边{' '}
        {totalEdges}
      </p>
    </div>
  );
}

function WarningsBlock({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mt-3 rounded border border-amber/30 bg-amber/5 px-2.5 py-2">
      <h3 className="text-11 font-medium text-amber">数据构建告警 {warnings.length} 条</h3>
      <ul className="mt-1 space-y-1 text-11 leading-snug text-fg-muted">
        {warnings.map((warning, index) => (
          <li key={`${index}-${warning.slice(0, 12)}`}>· {warning}</li>
        ))}
      </ul>
    </div>
  );
}

export function DetailDrawer({
  node,
  nodesById,
  meta,
  warnings,
  totalNodes,
  totalEdges,
  isFilteredOut,
}: DetailDrawerProps) {
  if (!node) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-2.5">
          <h2 className="text-12 font-medium text-fg-dim">详情</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="text-13 text-fg-dim">未选中节点</p>
          <ul className="mt-2 space-y-2 text-12 text-fg-muted">
            <li className="flex items-start gap-2">
              <Kbd>点击</Kbd>
              <span>画布上的节点查看完整定义与关联</span>
            </li>
            <li className="flex items-start gap-2">
              <Kbd>⌘K</Kbd>
              <span>搜索并直接聚焦到某个节点</span>
            </li>
            <li className="flex items-start gap-2">
              <Kbd>筛选</Kbd>
              <span>左栏多选把范围缩小，命中数实时更新</span>
            </li>
          </ul>

          <dl className="mt-4 space-y-1 border-t border-border pt-3 text-12">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">节点</dt>
              <dd className="font-mono text-fg-dim">{totalNodes}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">边</dt>
              <dd className="font-mono text-fg-dim">{totalEdges}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">构建于</dt>
              <dd className="font-mono text-11 text-fg-dim">{formatDateTime(meta.builtAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">schema</dt>
              <dd className="font-mono text-11 text-fg-dim">{orDash(meta.schemaVersion)}</dd>
            </div>
          </dl>

          <WarningsBlock warnings={warnings} />
        </div>
      </div>
    );
  }

  const difficulty = node.difficulty;
  const platforms = node.platforms;
  const isDomainSelfRef = node.kind === 'domain' && node.domain.length === 1 && node.domain[0] === node.id;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <KindBadge kind={node.kind} />
          <span className="truncate font-mono text-11 text-fg-muted" title={node.id}>
            {node.id}
          </span>
        </div>
        <h2 className="mt-1.5 text-16 font-semibold leading-snug text-fg">{node.name}</h2>
        {isFilteredOut && (
          <p className="mt-1 text-11 text-amber">当前筛选未命中该节点（画布上已压暗），清除筛选可恢复高亮</p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          {node.def.trim() === '' ? (
            <p className="text-12 text-fg-muted">（该节点没有描述字段）</p>
          ) : (
            <p className="whitespace-pre-wrap text-13 leading-relaxed text-fg-dim">{node.def}</p>
          )}
        </div>

        <Section title="属性">
          <dl className="divide-y divide-border/60">
            <FactRow label="许可证">{node.license ? licenseLabel(node.license) : DASH}</FactRow>
            <FactRow label="AI 就绪">{node.ai_ready ? aiReadyLabel(node.ai_ready) : DASH}</FactRow>
            <FactRow label="维护状态">
              {node.maintain_status ? maintainStatusLabel(node.maintain_status) : DASH}
            </FactRow>
            <FactRow
              label={difficultyFieldLabel(node.kind)}
              hint={
                difficultyNotTracked(node.kind)
                  ? `${node.kind} 类型在数据规范里没有难度字段（契约现状，不是抓取失败）`
                  : '跨类型归并值：不同 kind 语义不同，不可横向比较'
              }
            >
              {difficulty === undefined ? DASH : `${difficulty} / 5`}
            </FactRow>
            <FactRow label="平台">
              {platforms.length === 0 ? (
                DASH
              ) : (
                <span className="flex flex-wrap gap-1">
                  {platforms.map((platform) => (
                    <span
                      key={platform}
                      className="rounded border border-border bg-panel-raised px-1.5 py-px text-11 text-fg-dim"
                    >
                      {platformLabel(platform)}
                    </span>
                  ))}
                </span>
              )}
            </FactRow>
            {node.category !== undefined && <FactRow label="工具类目">{node.category}</FactRow>}
          </dl>
        </Section>

        <Section title="关联领域">
          {isDomainSelfRef ? (
            <p className="text-12 text-fg-muted">自引用：domain 节点的领域就是它自己</p>
          ) : (
            <RelationList
              ids={node.domain}
              nodesById={nodesById}
              emptyText={node.kind === 'artifact' ? '该类型不记录所属领域（契约现状）' : '无'}
            />
          )}
        </Section>

        <Section title="关联载体">
          <RelationList
            ids={node.artifacts}
            nodesById={nodesById}
            emptyText={node.kind === 'artifact' ? '该类型不记录关联载体（契约现状）' : '无'}
          />
        </Section>

        <Section title="关联 ID（本阶段纯展示，不跳转）">
          <dl className="space-y-2">
            <div>
              <dt className="mb-0.5 font-mono text-11 text-fg-muted">domain[]</dt>
              <dd className={cn('font-mono text-11 text-fg-dim', node.domain.length === 0 && 'text-fg-muted')}>
                {node.domain.length === 0 ? DASH : node.domain.join(', ')}
              </dd>
            </div>
            <div>
              <dt className="mb-0.5 font-mono text-11 text-fg-muted">artifacts[]</dt>
              <dd className={cn('font-mono text-11 text-fg-dim', node.artifacts.length === 0 && 'text-fg-muted')}>
                {node.artifacts.length === 0 ? DASH : node.artifacts.join(', ')}
              </dd>
            </div>
          </dl>
        </Section>

        <DataSourceNote meta={meta} totalNodes={totalNodes} totalEdges={totalEdges} />
      </div>
    </div>
  );
}
