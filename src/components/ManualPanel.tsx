/**
 * 中栏：作战手册。
 *
 * 一条技术 = 定义 + 详情 + 原理 + 命令模板（每条可单独复制）+ 操作步骤 + 常见坑（>2 条折叠）+ 参考链接。
 * 领域节点退化成「领域概览」（子领域 + 技术清单），工具/载体退化成属性卡。
 *
 * 空状态不是一句「请选择」：它给出全局统计和三个下一步动作，避免打开就一片黑。
 *
 * v4：detail / principle / procedure 只有 techniques 才有，且早期试点技术整体缺失。
 * 缺失时**整块不渲染**（返回 null），不留空标题 —— 类型上就是可选字段，组件不猜内容。
 */
import { useState } from 'react';
import { cn } from '../lib/cn';
import { artifactKindLabel, difficultyFieldLabel } from '../lib/enums';
import { DASH } from '../lib/format';
import type { Relations } from '../lib/relations';
import type { AtlasTree } from '../lib/tree';
import type { ArtifactKindTable, AtlasNode } from '../lib/types';
import { ChevronIcon, ExternalIcon } from './icons';
import { CopyButton, CountPill, DifficultyMeter, EmptyBlock, Kbd, KindBadge, SectionHeading } from './ui';

/** detail 超过这个字数就折叠：3 行 clamp 大约就是 200 字上下 */
const DETAIL_CLAMP_CHARS = 300;

/** 操作步骤的序号。用圈码而不是 01/02，和「常见坑」的两位数字编号区分开 */
const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

export interface ManualStats {
  domains: number;
  subdomains: number;
  techniques: number;
  edges: number;
  tools: number;
  artifacts: number;
}

interface ManualPanelProps {
  node: AtlasNode | null;
  relations: Relations;
  tree: AtlasTree;
  kindTable: ArtifactKindTable | null;
  stats: ManualStats;
  onSelect: (id: string) => void;
}

function Breadcrumb({ chain, onSelect }: { chain: AtlasNode[]; onSelect: (id: string) => void }) {
  if (chain.length === 0) return null;
  return (
    <nav aria-label="所属领域" className="flex min-w-0 items-center gap-1 text-11">
      {chain.map((item, index) => (
        <span key={item.id} className="flex min-w-0 items-center gap-1">
          {index > 0 && <span className="text-fg-muted/60">/</span>}
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="max-w-[220px] truncate text-fg-muted transition-colors hover:text-accent-soft"
          >
            {item.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-11 text-fg-muted">
      <span>{label}</span>
      <span className="font-mono text-12 text-fg-dim">{value}</span>
    </span>
  );
}

/** 常见坑：超过 2 条时折叠；按节点 id 重置展开状态 */
function PitfallSection({ node }: { node: AtlasNode }) {
  const pitfalls = node.pitfalls ?? [];
  const [expanded, setExpanded] = useState(false);

  if (pitfalls.length === 0) {
    return (
      <section className="manual-section">
        <SectionHeading right={<CountPill value={0} tone="dim" />}>常见坑</SectionHeading>
        <EmptyBlock title="暂无常见坑记录" hint="数据里这条技术没有登记 pitfalls，不代表没有坑，只代表还没人写下来。" />
      </section>
    );
  }

  const collapsible = pitfalls.length > 2;
  const visible = collapsible && !expanded ? pitfalls.slice(0, 2) : pitfalls;
  const hidden = pitfalls.length - visible.length;

  return (
    <section className="manual-section">
      <SectionHeading right={<CountPill value={pitfalls.length} />}>常见坑</SectionHeading>
      <ul className="divide-y divide-border/50 rounded border border-border bg-panel/50">
        {visible.map((pitfall, index) => (
          <li key={`${index}-${pitfall.slice(0, 12)}`} className="flex items-start gap-2.5 px-2.5 py-2">
            <span className="mt-[1px] w-4 shrink-0 font-mono text-11 text-amber/80">{String(index + 1).padStart(2, '0')}</span>
            <p className="min-w-0 flex-1 text-12 leading-relaxed text-fg-dim">{pitfall}</p>
          </li>
        ))}
      </ul>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 inline-flex items-center gap-1 text-11 text-fg-muted transition-colors hover:text-accent-soft"
        >
          <span className={cn('inline-block transition-transform', expanded && 'rotate-[-90deg]')} aria-hidden>
            <ChevronIcon />
          </span>
          {expanded ? '收起' : `展开剩余 ${hidden} 条`}
        </button>
      )}
    </section>
  );
}

/** 详情：普通正文段落。>200 字折叠成 3 行，给「展开全文」；不做复制按钮，选中即可复制 */
function DetailSection({ node }: { node: AtlasNode }) {
  const [expanded, setExpanded] = useState(false);
  const detail = node.detail ?? '';
  if (detail === '') return null;

  const collapsible = detail.length > DETAIL_CLAMP_CHARS;
  const clamped = collapsible && !expanded;

  return (
    <section className="manual-section">
      <SectionHeading right={<span className="font-mono text-11 text-fg-muted">{detail.length} 字</span>}>详情</SectionHeading>
      <p className={cn('max-w-[82ch] text-13 leading-[1.75] text-fg-dim', clamped && 'line-clamp-3')}>{detail}</p>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-1.5 inline-flex items-center gap-1 text-11 text-fg-muted transition-colors hover:text-accent-soft"
        >
          <span className={cn('inline-block transition-transform', expanded && 'rotate-[-90deg]')} aria-hidden>
            <ChevronIcon />
          </span>
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </section>
  );
}

/**
 * 原理：解释「为什么有效」，不是可执行动作。
 * 左侧霓虹竖线 + 略暗背景 + 内发光，和命令行（可复制）、步骤（可执行）在视觉上分层。
 */
function PrincipleSection({ node }: { node: AtlasNode }) {
  const principle = node.principle ?? '';
  if (principle === '') return null;

  return (
    <section className="manual-section">
      <SectionHeading tone="accent" right={<span className="font-mono text-11 text-fg-muted">为什么有效</span>}>
        原理
      </SectionHeading>
      <div className="principle-block">
        <p className="max-w-[82ch] text-13 leading-[1.8] text-fg-dim">{principle}</p>
      </div>
    </section>
  );
}

/** 操作步骤：有序，圈码序号走等宽字体，左侧一条轨道线把步骤串起来 */
function ProcedureSection({ node }: { node: AtlasNode }) {
  const procedure = node.procedure ?? [];
  if (procedure.length === 0) return null;

  return (
    <section className="manual-section">
      <SectionHeading right={<CountPill value={procedure.length} />}>操作步骤</SectionHeading>
      <ol className="manual-steps">
        {procedure.map((step, index) => (
          <li key={`${index}-${step.slice(0, 12)}`} className="manual-step">
            <span className="manual-step-glyph" aria-hidden>
              {CIRCLED_NUMBERS[index] ?? String(index + 1)}
            </span>
            <p className="min-w-0 flex-1 text-12 leading-[1.7] text-fg-dim">{step}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CommandSection({ node }: { node: AtlasNode }) {
  const commands = node.commands ?? [];

  if (commands.length === 0) {
    return (
      <section className="manual-section">
        <SectionHeading right={<CountPill value={0} tone="dim" />}>命令模板</SectionHeading>
        <EmptyBlock
          title="该条目暂无命令模板"
          hint="数据里这条技术没有登记 commands。先看「常见坑」和参考链接建立判断，再去右栏找上下游技术补全上下文。"
        />
      </section>
    );
  }

  const all = commands.map((command) => command.cmd).join('\n');

  return (
    <section className="manual-section">
      <SectionHeading
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-11 text-fg-muted">{commands.length} 条</span>
            {commands.length > 1 && <CopyButton text={all} label="复制全部" />}
          </div>
        }
      >
        命令模板
      </SectionHeading>

      <div className="space-y-1.5">
        {commands.map((command, index) => (
          <div key={`${index}-${command.cmd}`} className="cmd-row">
            <div className="flex items-start gap-2 px-2.5 py-2">
              <span className="mt-[3px] w-4 shrink-0 font-mono text-11 text-fg-muted">{index + 1}</span>
              <span className="mt-[3px] shrink-0 font-mono text-11 text-accent" aria-hidden>
                $
              </span>
              <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-12 leading-relaxed text-fg">
                {command.cmd}
              </code>
              <CopyButton text={command.cmd} />
            </div>
            {command.note !== undefined && command.note !== '' && (
              <div className="border-t border-border/50 px-2.5 py-1.5 pl-[38px] text-11 leading-relaxed text-fg-muted">
                {command.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ReferenceSection({ node }: { node: AtlasNode }) {
  const references = node.references ?? [];
  if (references.length === 0) return null;

  return (
    <section className="manual-section">
      <SectionHeading right={<CountPill value={references.length} />}>参考链接</SectionHeading>
      <ul className="space-y-1">
        {references.map((url) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-start gap-2 rounded border border-border bg-panel/50 px-2.5 py-1.5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
              title={url}
            >
              <span className="mt-[3px] shrink-0 text-fg-muted group-hover:text-accent">
                <ExternalIcon />
              </span>
              <span className="min-w-0 flex-1 break-all font-mono text-11 leading-relaxed text-fg-dim group-hover:text-accent-soft">
                {url}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SiblingSection({ node, tree, onSelect }: { node: AtlasNode; tree: AtlasTree; onSelect: (id: string) => void }) {
  const parentId = tree.parentOfTechnique.get(node.id);
  const entry = parentId === undefined ? undefined : tree.domainsById.get(parentId);
  const siblings = (entry?.ownTechniques ?? []).filter((technique) => technique.id !== node.id);
  if (siblings.length === 0) return null;

  return (
    <section className="manual-section">
      <SectionHeading right={<CountPill value={siblings.length} tone="dim" />}>
        同{entry?.depth === 0 ? '领域' : '子领域'}其它技术
      </SectionHeading>
      <div className="grid grid-cols-2 gap-1">
        {siblings.map((technique) => (
          <button
            key={technique.id}
            type="button"
            onClick={() => onSelect(technique.id)}
            className="group flex items-center gap-2 rounded border border-border/70 bg-panel/40 px-2 py-1 text-left transition-colors hover:border-accent/35 hover:bg-accent/[0.05]"
          >
            <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-kind-technique/60" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-11 text-fg-dim group-hover:text-fg">{technique.name}</span>
            <span className="shrink-0 font-mono text-11 text-fg-muted">${technique.commands?.length ?? 0}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TechniqueManual({
  node,
  relations,
  tree,
  onSelect,
}: {
  node: AtlasNode;
  relations: Relations;
  tree: AtlasTree;
  onSelect: (id: string) => void;
}) {
  const chain = relations.parentChain.length > 0 ? relations.parentChain : [];
  const commandCount = node.commands?.length ?? 0;
  const pitfallCount = node.pitfalls?.length ?? 0;
  const referenceCount = node.references?.length ?? 0;
  const procedureCount = node.procedure?.length ?? 0;

  return (
    <>
      <header className="border-b border-border/70 px-6 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <Breadcrumb chain={chain} onSelect={onSelect} />
          <span className="shrink-0 font-mono text-11 text-fg-muted" title={node.id}>
            {node.id}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-20 font-semibold leading-tight tracking-tight text-fg">{node.name}</h1>
          <DifficultyMeter value={node.difficulty} withLabel />
          <span className="rounded border border-kind-technique/30 bg-kind-technique/10 px-1.5 py-px text-11 text-kind-technique">
            技术
          </span>
        </div>

        <p className="mt-2 max-w-[76ch] text-13 leading-relaxed text-fg-dim">
          {node.def.trim() === '' ? '（该条目没有描述字段）' : node.def}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-2">
          <StatChip label="命令" value={commandCount} />
          {procedureCount > 0 && <StatChip label="步骤" value={procedureCount} />}
          <StatChip label="常见坑" value={pitfallCount} />
          <StatChip label="参考" value={referenceCount} />
          <StatChip label="关联工具" value={relations.tools.length} />
        </div>
      </header>

      <div className="space-y-5 px-6 py-4">
        <DetailSection node={node} />
        <PrincipleSection node={node} />
        <CommandSection node={node} />
        <ProcedureSection node={node} />
        <PitfallSection key={node.id} node={node} />
        <ReferenceSection node={node} />
        <SiblingSection node={node} tree={tree} onSelect={onSelect} />
      </div>
    </>
  );
}

function DomainOverview({ node, relations, onSelect }: { node: AtlasNode; relations: Relations; onSelect: (id: string) => void }) {
  const isTop = relations.childDomains.length > 0;
  const techniques = relations.domainTechniques;

  return (
    <>
      <header className="border-b border-border/70 px-6 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <Breadcrumb chain={relations.parentChain.slice(0, -1)} onSelect={onSelect} />
          <span className="shrink-0 font-mono text-11 text-fg-muted">{node.id}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <h1 className="text-20 font-semibold leading-tight tracking-tight text-fg">{node.name}</h1>
          <span className="rounded border border-kind-domain/40 bg-kind-domain/10 px-1.5 py-px text-11 text-kind-domain">
            {isTop ? '顶级领域' : '子领域'}
          </span>
        </div>
        <p className="mt-2 max-w-[76ch] text-13 leading-relaxed text-fg-dim">
          {node.def.trim() === '' ? '（该领域没有描述字段）' : node.def}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-2">
          <StatChip label="子领域" value={relations.childDomains.length} />
          <StatChip label="技术" value={techniques.length} />
          <StatChip label="工具" value={relations.tools.length} />
          <span className="ml-auto font-mono text-11 text-fg-muted">
            入门难度 = {node.difficulty ?? DASH}
          </span>
        </div>
      </header>

      <div className="space-y-5 px-6 py-4">
        {relations.childDomains.length > 0 && (
          <section>
            <SectionHeading right={<CountPill value={relations.childDomains.length} />}>子领域</SectionHeading>
            <div className="grid grid-cols-2 gap-1.5">
              {relations.childDomains.map((child) => (
                <button
                  key={child.node.id}
                  type="button"
                  onClick={() => onSelect(child.node.id)}
                  className="group flex items-center gap-2 rounded border border-border bg-panel/50 px-2.5 py-1.5 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.05]"
                >
                  <span className="min-w-0 flex-1 truncate text-12 text-fg-dim group-hover:text-fg">{child.node.name}</span>
                  <CountPill value={child.count} tone="dim" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeading right={<CountPill value={techniques.length} />}>技术清单</SectionHeading>
          <ul className="divide-y divide-border/50 rounded border border-border bg-panel/40">
            {techniques.map((technique) => (
              <li key={technique.id}>
                <button
                  type="button"
                  onClick={() => onSelect(technique.id)}
                  className="group flex w-full items-center gap-2 px-2.5 py-[5px] text-left transition-colors hover:bg-accent/[0.06]"
                >
                  <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-kind-technique/70" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-12 text-fg-dim group-hover:text-fg">{technique.name}</span>
                  <DifficultyMeter value={technique.difficulty} />
                  <span className="w-8 shrink-0 text-right font-mono text-11 text-fg-muted" title="命令模板条数">
                    ${technique.commands?.length ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function EntityDetail({ node, relations, onSelect }: { node: AtlasNode; relations: Relations; onSelect: (id: string) => void }) {
  const declaredBy = relations.declaredBy;
  const users = relations.usedBy;

  return (
    <>
      <header className="border-b border-border/70 px-6 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <KindBadge kind={node.kind} />
          <span className="shrink-0 font-mono text-11 text-fg-muted">{node.id}</span>
        </div>
        <h1 className="mt-2 text-20 font-semibold leading-tight tracking-tight text-fg">{node.name}</h1>
        <p className="mt-2 max-w-[76ch] text-13 leading-relaxed text-fg-dim">
          {node.def.trim() === '' ? '（该条目没有描述字段）' : node.def}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-2">
          <StatChip label="归属领域" value={relations.parentChain.length} />
          <StatChip label="关联技术" value={users.length + declaredBy.length} />
          <span className="ml-auto font-mono text-11 text-fg-muted">
            {difficultyFieldLabel(node.kind)} = {node.difficulty ?? DASH}
          </span>
        </div>
      </header>

      <div className="space-y-5 px-6 py-4">
        {(users.length > 0 || declaredBy.length > 0) && (
          <section>
            <SectionHeading right={<CountPill value={users.length + declaredBy.length} />}>引用它的技术</SectionHeading>
            <ul className="divide-y divide-border/50 rounded border border-border bg-panel/40">
              {users.map((item) => (
                <li key={item.node.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.node.id)}
                    className="group flex w-full items-center gap-2 px-2.5 py-[5px] text-left hover:bg-accent/[0.06]"
                  >
                    <span className="min-w-0 flex-1 truncate text-12 text-fg-dim group-hover:text-fg">{item.node.name}</span>
                    <span className="shrink-0 font-mono text-11 text-fg-muted">uses</span>
                  </button>
                </li>
              ))}
              {declaredBy.map((technique) => (
                <li key={`declared-${technique.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(technique.id)}
                    className="group flex w-full items-center gap-2 px-2.5 py-[5px] text-left hover:bg-accent/[0.06]"
                  >
                    <span className="min-w-0 flex-1 truncate text-12 text-fg-dim group-hover:text-fg">{technique.name}</span>
                    <span className="shrink-0 font-mono text-11 text-fg-muted">artifacts[]</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionHeading>类型说明</SectionHeading>
          <EmptyBlock
            title={`${node.kind} 类型没有命令模板`}
            hint="命令模板只挂在 technique 上。工具与载体用在「矩阵」和「关系图」里，看的是覆盖关系而不是操作步骤。"
          />
        </section>
      </div>
    </>
  );
}

function ManualEmpty({ stats, tree, onSelect }: { stats: ManualStats; tree: AtlasTree; onSelect: (id: string) => void }) {
  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="w-full max-w-[620px]">
        <div className="flex items-center gap-2 text-11 uppercase tracking-[0.2em] text-accent/80">
          <span className="h-px w-8 bg-gradient-to-r from-accent/80 to-transparent" aria-hidden />
          BinAtlas · 作战手册
        </div>
        <h1 className="mt-2 text-28 font-semibold leading-tight tracking-tight text-fg">
          先把方向钉住，再谈手法
        </h1>
        <p className="mt-2 max-w-[54ch] text-13 leading-relaxed text-fg-dim">
          左侧是三层目录：顶级领域 → 子领域 → 技术。每条技术展开成可复制的命令模板、常见坑与参考链接。
          没有「一屏看完所有关系」的野心，只有逐层钻取的耐心。
        </p>

        <dl className="mt-5 grid grid-cols-4 gap-2">
          {[
            { label: '领域', value: stats.domains },
            { label: '子领域', value: stats.subdomains },
            { label: '技术', value: stats.techniques },
            { label: '关系边', value: stats.edges },
          ].map((item) => (
            <div key={item.label} className="rounded border border-border bg-panel/60 px-2.5 py-2">
              <dt className="text-11 text-fg-muted">{item.label}</dt>
              <dd className="mt-0.5 font-mono text-20 leading-none text-accent-soft">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 space-y-2">
          {tree.roots.slice(0, 4).map((root) => (
            <button
              key={root.node.id}
              type="button"
              onClick={() => onSelect(root.node.id)}
              className="group flex w-full items-center gap-2 rounded border border-border bg-panel/40 px-2.5 py-1.5 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.05]"
            >
              <span className="min-w-0 flex-1 truncate text-12 text-fg-dim group-hover:text-fg">{root.node.name}</span>
              <span className="font-mono text-11 text-fg-muted">{root.children.length} 子领域</span>
              <CountPill value={root.total} tone="accent" />
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-11 text-fg-muted">
          <span className="flex items-center gap-1.5">
            <Kbd>⌘K</Kbd> 搜索并直达
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> 在树里移动
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>矩阵</Kbd> 看方向 × 载体
          </span>
        </div>
      </div>
    </div>
  );
}

export function ManualPanel({ node, relations, tree, kindTable, stats, onSelect }: ManualPanelProps) {
  if (node === null) {
    return (
      <div className="h-full overflow-y-auto">
        <ManualEmpty stats={stats} tree={tree} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div key={node.id} className="fade-up">
        {node.kind === 'technique' && (
          <TechniqueManual node={node} relations={relations} tree={tree} onSelect={onSelect} />
        )}
        {node.kind === 'domain' && <DomainOverview node={node} relations={relations} onSelect={onSelect} />}
        {node.kind !== 'technique' && node.kind !== 'domain' && (
          <EntityDetail node={node} relations={relations} onSelect={onSelect} />
        )}

        <footer className="mt-2 border-t border-border/60 px-6 py-2 text-11 text-fg-muted">
          <span className="font-mono">public/graph/nodes.json</span>
          <span className="mx-1.5 text-fg-muted/50">·</span>
          本页不直接读 <span className="font-mono">data/</span>，只消费构建产物
          {node.artifacts.length > 0 && (
            <>
              <span className="mx-1.5 text-fg-muted/50">·</span>
              载体：
              {kindTable === null
                ? `${node.artifacts.length} 个（数据未装载）`
                : [...new Set(node.artifacts.map((id) => kindTable.byId.get(id) ?? 'unknown'))]
                    .map((kind) => (kind === 'unknown' ? '未归类' : artifactKindLabel(kind)))
                    .join(' / ')}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
