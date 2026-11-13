/**
 * 右栏：关联。
 *
 * 前置/下游以 `nodes.json` 的 `prerequisites` 为主（v3 投影），`upstream` 边只做补齐；
 * 工具/载体/替代/互补仍从 `edges.json` 推。没有关系的条目要**说出为什么没有**，
 * 而不是留一块空白；前置指向不存在的节点时标灰 + 「引用缺失」，不静默丢。
 */
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { artifactKindLabel } from '../lib/enums';
import type { RelatedNode, Relations } from '../lib/relations';
import type { ArtifactKindTable, AtlasNode } from '../lib/types';
import { CountPill, EmptyBlock, KindDot, SectionHeading } from './ui';

interface RelationPanelProps {
  node: AtlasNode | null;
  relations: Relations;
  kindTable: ArtifactKindTable | null;
  onSelect: (id: string) => void;
}

function MissingRefRow({ id }: { id: string }) {
  return (
    <li className="flex items-center gap-2 rounded px-1.5 py-1 text-11 text-fg-muted/70">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-muted/40" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono line-through decoration-fg-muted/40">{id}</span>
      <span className="shrink-0 rounded border border-border px-1 py-px text-11 text-fg-muted">引用缺失</span>
    </li>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="px-3 py-2.5">
      <SectionHeading right={<CountPill value={count} tone={count > 0 ? 'default' : 'dim'} />}>{title}</SectionHeading>
      {children}
    </section>
  );
}

function NodeLink({
  node,
  rationale,
  badge,
  onSelect,
}: {
  node: AtlasNode;
  rationale?: string;
  badge?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      title={rationale !== undefined && rationale !== '' ? rationale : node.def}
      className="group flex w-full items-start gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-accent/[0.07]"
    >
      <span className="mt-[5px] shrink-0">
        <KindDot kind={node.kind} size={5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-12 text-fg-dim group-hover:text-fg">{node.name}</span>
          {badge !== undefined && <span className="shrink-0 font-mono text-11 text-fg-muted">{badge}</span>}
        </span>
        {rationale !== undefined && rationale !== '' && (
          <span className="mt-0.5 line-clamp-2 block text-11 leading-snug text-fg-muted">{rationale}</span>
        )}
      </span>
    </button>
  );
}

function RelatedList({ items, onSelect }: { items: RelatedNode[]; onSelect: (id: string) => void }) {
  return (
    <ul className="space-y-px">
      {items.map((item) => (
        <li key={item.node.id}>
          <NodeLink node={item.node} rationale={item.rationale} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-1.5 py-1 text-11 leading-relaxed text-fg-muted">{children}</p>;
}

export function RelationPanel({ node, relations, kindTable, onSelect }: RelationPanelProps) {
  if (node === null) {
    return (
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-border px-3 py-2.5">
          <h2 className="text-11 uppercase tracking-[0.16em] text-fg-muted">关联</h2>
        </header>
        <div className="flex-1 px-3 py-4">
          <p className="text-12 text-fg-dim">未选中节点</p>
          <p className="mt-1 text-11 leading-relaxed text-fg-muted">
            选中左侧的技术后，这里显示它的所属领域、前置/下游技术、关联工具与载体。
          </p>
        </div>
      </div>
    );
  }

  const isTechnique = node.kind === 'technique';
  const isTool = node.kind === 'tool';
  const isArtifact = node.kind === 'artifact';

  const artifactUsers: RelatedNode[] = [
    ...relations.appliedBy,
    ...relations.declaredBy
      .filter((technique) => !relations.appliedBy.some((item) => item.node.id === technique.id))
      .map((technique) => ({ node: technique, rationale: '该技术的 artifacts[] 声明了这个载体' })),
  ];

  const chain = relations.parentChain;
  const parentChain = node.kind === 'domain' ? chain.slice(0, -1) : chain;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="text-11 uppercase tracking-[0.16em] text-fg-muted">关联</h2>
        <span className="truncate font-mono text-11 text-fg-muted" title={node.id}>
          {node.id}
        </span>
      </header>

      <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
        <Section title="所属领域" count={parentChain.length}>
          {parentChain.length === 0 ? (
            <EmptyNote>顶级领域，没有上级。</EmptyNote>
          ) : (
            <div className="flex flex-wrap gap-1 px-1.5">
              {parentChain.map((item, index) => (
                <span key={item.id} className="flex items-center gap-1">
                  {index > 0 && <span className="text-fg-muted/50">/</span>}
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className="rounded border border-border bg-panel-raised px-1.5 py-0.5 text-11 text-fg-dim transition-colors hover:border-accent/40 hover:text-accent-soft"
                  >
                    {item.name}
                  </button>
                </span>
              ))}
            </div>
          )}
        </Section>

        {relations.childDomains.length > 0 && (
          <Section title="子领域" count={relations.childDomains.length}>
            <ul className="space-y-px">
              {relations.childDomains.map((child) => (
                <li key={child.node.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(child.node.id)}
                    className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-accent/[0.07]"
                  >
                    <KindDot kind="domain" size={5} />
                    <span className="min-w-0 flex-1 truncate text-12 text-fg-dim group-hover:text-fg">{child.node.name}</span>
                    <span className="shrink-0 font-mono text-11 text-fg-muted">{child.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(isTechnique || relations.prerequisites.length > 0) && (
          <Section title="前置技术" count={relations.prerequisites.length + relations.missingPrerequisites.length}>
            {relations.prerequisites.length === 0 && relations.missingPrerequisites.length === 0 ? (
              <EmptyNote>没有登记前置技术：这是一条入口条目（入口条目本来就不需要先修）。</EmptyNote>
            ) : (
              <ul className="space-y-px">
                {relations.prerequisites.map((item) => (
                  <li key={item.node.id}>
                    <NodeLink node={item.node} rationale={item.rationale} onSelect={onSelect} />
                  </li>
                ))}
                {relations.missingPrerequisites.map((id) => (
                  <MissingRefRow key={id} id={id} />
                ))}
              </ul>
            )}
          </Section>
        )}

        {(isTechnique || relations.downstream.length > 0) && (
          <Section title="下游技术" count={relations.downstream.length}>
            {relations.downstream.length === 0 ? (
              <EmptyNote>
                没有下游：当前技术库里没有任何技术的 prerequisites 指向它（可能是链尾，也可能只是还没人把它写成前置）。
              </EmptyNote>
            ) : (
              <RelatedList items={relations.downstream} onSelect={onSelect} />
            )}
          </Section>
        )}

        {relations.complements.length > 0 && (
          <Section title="互补技术" count={relations.complements.length}>
            <RelatedList items={relations.complements} onSelect={onSelect} />
          </Section>
        )}

        {relations.alternatives.length > 0 && (
          <Section title="替代技术" count={relations.alternatives.length}>
            <RelatedList items={relations.alternatives} onSelect={onSelect} />
          </Section>
        )}

        {isTool && (
          <Section title="使用该工具的技术" count={relations.usedBy.length}>
            {relations.usedBy.length === 0 ? (
              <EmptyNote>没有技术登记 uses 指向这个工具。</EmptyNote>
            ) : (
              <RelatedList items={relations.usedBy} onSelect={onSelect} />
            )}
          </Section>
        )}

        {isArtifact && (
          <Section title="覆盖该载体的技术" count={artifactUsers.length}>
            {artifactUsers.length === 0 ? (
              <EmptyNote>没有技术声明或作用于这个载体。</EmptyNote>
            ) : (
              <RelatedList items={artifactUsers} onSelect={onSelect} />
            )}
          </Section>
        )}

        {!isTool && !isArtifact && (
          <Section title="关联工具" count={relations.tools.length}>
            {relations.tools.length === 0 ? (
              <EmptyBlock
                title="该方向工具待补"
                hint={
                  isTechnique
                    ? '当前数据没有为这条技术登记 uses 边。工具关系目前只覆盖试点领域，主领域的技术→工具映射还没补。'
                    : '该节点没有登记工具关系。'
                }
              />
            ) : (
              <RelatedList items={relations.tools} onSelect={onSelect} />
            )}
          </Section>
        )}

        {node.artifacts.length > 0 && (
          <Section title="关联载体" count={node.artifacts.length}>
            <div className="flex flex-wrap gap-1 px-1.5">
              {node.artifacts.map((id) => {
                const target = relations.artifacts.find((artifact) => artifact.id === id);
                const kind = kindTable?.byId.get(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => target !== undefined && onSelect(target.id)}
                    disabled={target === undefined}
                    title={target?.name ?? `${id}（节点表里没有这条载体）`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded border border-border bg-panel-raised px-1.5 py-0.5 text-11 text-fg-dim',
                      target !== undefined && 'transition-colors hover:border-accent/40 hover:text-accent-soft',
                      target === undefined && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <span>{target?.name ?? id}</span>
                    {kind !== undefined && <span className="font-mono text-11 text-fg-muted">{artifactKindLabel(kind)}</span>}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {(relations.partOf.length > 0 || relations.alsoIn.length > 0) && (
          <Section title="其他归属" count={relations.partOf.length + relations.alsoIn.length}>
            <ul className="space-y-px">
              {relations.partOf.map((item) => (
                <li key={`part-${item.id}`}>
                  <NodeLink node={item} badge="part_of" onSelect={onSelect} />
                </li>
              ))}
              {relations.alsoIn.map((item) => (
                <li key={`also-${item.id}`}>
                  <NodeLink node={item} badge="domain[]" onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <footer className="shrink-0 border-t border-border px-3 py-1.5 text-11 text-fg-muted">
        前置来自 <span className="font-mono">nodes.json · prerequisites</span>（upstream 边补齐）· 其余关系来自{' '}
        <span className="font-mono">edges.json</span>
      </footer>
    </div>
  );
}
