/**
 * Tab 4：关系图（可选视图）。
 *
 * 这一版**不再把力导向图当主视图**：它的价值只剩「鸟瞰整体密度」。
 * 画布本身复用 `GraphCanvas`（Sigma.js），这里只补一层外壳：图例、重置视角、
 * 选中节点卡片（可以把节点带回目录树）。
 */
import { useMemo, useRef } from 'react';
import { GraphErrorBoundary } from '../components/GraphErrorBoundary';
import { ResetIcon } from '../components/icons';
import { GraphCanvas, type GraphHandle } from '../graph/GraphCanvas';
import type { AtlasGraph } from '../graph/layout';
import { PRIMARY_KINDS, kindStyle } from '../lib/palette';
import type { AtlasData } from '../lib/types';

interface GraphViewProps {
  data: AtlasData;
  graph: AtlasGraph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenInTree: (id: string) => void;
}

export function GraphView({ data, graph, selectedId, onSelect, onOpenInTree }: GraphViewProps) {
  const handleRef = useRef<GraphHandle | null>(null);
  const matchedIds = useMemo(() => new Set(data.nodes.map((node) => node.id)), [data.nodes]);

  const legend = useMemo(() => {
    const present = new Set(data.nodes.map((node) => node.kind));
    const extras = [...present].filter((kind) => !(PRIMARY_KINDS as readonly string[]).includes(kind));
    return [...PRIMARY_KINDS.filter((kind) => present.has(kind)), ...extras].map((kind) => ({
      kind,
      label: kindStyle(kind).label,
      color: kindStyle(kind).color,
      count: data.nodes.filter((node) => node.kind === kind).length,
    }));
  }, [data.nodes]);

  const selectedNode = selectedId === null ? null : (data.nodesById.get(selectedId) ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <div>
          <h1 className="text-16 font-semibold tracking-tight text-fg">关系图</h1>
          <p className="text-11 text-fg-muted">可选视图：全局鸟瞰，不作为导航主路径</p>
        </div>

        <div className="ml-4 flex flex-wrap items-center gap-2">
          {legend.map((item) => (
            <span key={item.kind} className="inline-flex items-center gap-1.5 text-11 text-fg-muted">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color, boxShadow: `0 0 8px -1px ${item.color}` }}
                aria-hidden
              />
              {item.label}
              <span className="font-mono text-fg-dim">{item.count}</span>
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => handleRef.current?.resetView()}
          className="ml-auto inline-flex items-center gap-1.5 rounded border border-border bg-panel-raised px-2 py-1 text-11 text-fg-dim transition-colors hover:border-accent/40 hover:text-accent-soft"
        >
          <ResetIcon />
          重置视角
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <GraphErrorBoundary>
          <GraphCanvas graph={graph} selectedId={selectedId} matchedIds={matchedIds} onSelect={onSelect} handleRef={handleRef} />
        </GraphErrorBoundary>

        <div className="pointer-events-none absolute left-3 top-3 rounded border border-border bg-panel/70 px-2 py-1 text-11 text-fg-muted backdrop-blur-sm">
          滚轮缩放 · 拖拽平移 · 点节点高亮
        </div>

        {selectedNode !== null && (
          <div className="absolute bottom-3 left-3 w-[320px] rounded border border-accent/30 bg-panel/90 p-2.5 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.95)] backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-11 text-fg-muted">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: kindStyle(selectedNode.kind).color }}
                  aria-hidden
                />
                {kindStyle(selectedNode.kind).label}
              </span>
              <span className="truncate font-mono text-11 text-fg-muted">{selectedNode.id}</span>
            </div>
            <p className="mt-1 truncate text-13 text-fg">{selectedNode.name}</p>
            <p className="mt-0.5 line-clamp-2 text-11 leading-relaxed text-fg-muted">{selectedNode.def}</p>
            <button
              type="button"
              onClick={() => onOpenInTree(selectedNode.id)}
              className="mt-2 inline-flex items-center gap-1.5 rounded border border-accent/35 bg-accent/[0.08] px-2 py-1 text-11 text-accent-soft transition-colors hover:border-accent/60"
            >
              在目录树中打开
              <span className="font-mono text-fg-muted">→</span>
            </button>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 right-3 text-11 text-fg-muted">
          {data.nodes.length} 节点 · {data.edges.length} 边
        </div>
      </div>
    </div>
  );
}
