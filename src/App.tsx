/**
 * 三栏布局的装配层：数据 → 图 → 筛选 → 选中 → 搜索。
 *
 * 布局（最小 1280×800，基准 1440×900）：
 *   顶栏 48px / 左栏 260px · 中栏自适应 · 右栏 360px / 底栏 28px
 *
 * 状态所有权：选中 id、facet 过滤、命令面板开关都在这里；
 * 画布只接收 props，不反向持有业务状态。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasOverlay } from './components/CanvasOverlay';
import { DataErrorState, EmptyDataState, LoadingState } from './components/DataState';
import { DetailDrawer } from './components/DetailDrawer';
import { FacetPanel } from './components/FacetPanel';
import { GraphErrorBoundary } from './components/GraphErrorBoundary';
import { SearchPalette } from './components/SearchPalette';
import { StatusBar } from './components/StatusBar';
import { TopBar, type BreadcrumbItem } from './components/TopBar';
import { GraphCanvas, type GraphHandle } from './graph/GraphCanvas';
import { buildAtlasGraph } from './graph/layout';
import { buildSearchIndex } from './lib/search';
import {
  EMPTY_FILTERS,
  buildFacetSections,
  clearFilters,
  filterNodes,
  isFilterActive,
  toggleFilter,
  type FacetFilters,
  type FacetKey,
} from './lib/facets';
import { PRIMARY_KINDS, kindStyle } from './lib/palette';
import { useAtlasData } from './lib/useAtlasData';

export default function App() {
  const { state, reload } = useAtlasData();
  const [filters, setFilters] = useState<FacetFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const graphRef = useRef<GraphHandle | null>(null);

  const data = state.status === 'ready' ? state.data : null;

  const graph = useMemo(() => (data ? buildAtlasGraph(data) : null), [data]);
  const searchIndex = useMemo(() => (data ? buildSearchIndex(data.index) : null), [data]);

  const matchedIds = useMemo<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    if (!data) return ids;
    for (const node of filterNodes(data.nodes, filters)) ids.add(node.id);
    return ids;
  }, [data, filters]);

  const sections = useMemo(() => (data ? buildFacetSections(data.nodes, filters) : []), [data, filters]);

  const selectedNode = data && selectedId !== null ? (data.nodesById.get(selectedId) ?? null) : null;

  const breadcrumb: BreadcrumbItem[] = useMemo(() => {
    if (!selectedNode) return [{ label: '图谱' }, { label: '全部节点' }];
    return [
      { label: '图谱' },
      { label: kindStyle(selectedNode.kind).label },
      { label: selectedNode.name },
    ];
  }, [selectedNode]);

  const legendKinds = useMemo(() => {
    if (!data) return [];
    const present = new Set(data.nodes.map((node) => node.kind));
    const extras = [...present]
      .filter((kind) => !(PRIMARY_KINDS as readonly string[]).includes(kind))
      .sort((a, b) => a.localeCompare(b));
    return [...PRIMARY_KINDS.filter((kind) => present.has(kind)), ...extras].map((kind) => {
      const style = kindStyle(kind);
      return { kind, label: style.label, color: style.color };
    });
  }, [data]);

  // 重载后选中的节点可能已不存在：清掉，避免抽屉里挂着一个不存在的 id
  useEffect(() => {
    if (state.status === 'ready' && selectedId !== null && !state.data.nodesById.has(selectedId)) {
      setSelectedId(null);
    }
  }, [state, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === 'Escape') {
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen]);

  const handleToggleFilter = useCallback((key: FacetKey, value: string) => {
    setFilters((current) => toggleFilter(current, key, value));
  }, []);

  const handleClearFilters = useCallback(() => setFilters(clearFilters()), []);

  const handlePickFromSearch = useCallback((id: string) => {
    setSelectedId(id);
    setPaletteOpen(false);
    graphRef.current?.focusNode(id);
  }, []);

  const handleResetView = useCallback(() => graphRef.current?.resetView(), []);

  const totalNodes = data?.nodes.length ?? 0;
  const totalEdges = data?.edges.length ?? 0;
  const matchedCount = data ? matchedIds.size : 0;
  const warnings = data?.warnings ?? [];
  const meta = data?.meta ?? {};
  const dataReady = state.status === 'ready';

  return (
    <div className="flex h-screen min-w-[1280px] flex-col overflow-hidden bg-bg text-fg">
      <TopBar
        breadcrumb={breadcrumb}
        onOpenSearch={() => setPaletteOpen(true)}
        searchDisabled={!dataReady}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="w-[260px] shrink-0 border-r border-border bg-panel" aria-label="筛选面板">
          {data ? (
            <FacetPanel
              sections={sections}
              total={totalNodes}
              matched={matchedCount}
              filterActive={isFilterActive(filters)}
              onToggle={handleToggleFilter}
              onClear={handleClearFilters}
            />
          ) : (
            <div className="px-3 py-3 text-11 text-fg-muted">数据就绪后启用筛选</div>
          )}
        </aside>

        <main className="relative min-w-0 flex-1 overflow-hidden">
          {state.status === 'loading' && <LoadingState />}
          {state.status === 'error' && <DataErrorState error={state.error} onRetry={reload} />}
          {state.status === 'ready' && state.data.nodes.length === 0 && <EmptyDataState />}
          {state.status === 'ready' && state.data.nodes.length > 0 && graph !== null && (
            <GraphErrorBoundary>
              <GraphCanvas
                graph={graph}
                selectedId={selectedId}
                matchedIds={matchedIds}
                onSelect={setSelectedId}
                handleRef={graphRef}
              />
              <CanvasOverlay
                kinds={legendKinds}
                matched={matchedCount}
                total={totalNodes}
                onResetView={handleResetView}
                onClearFilters={handleClearFilters}
              />
            </GraphErrorBoundary>
          )}
        </main>

        <aside className="w-[360px] shrink-0 border-l border-border bg-panel" aria-label="详情面板">
          {data ? (
            <DetailDrawer
              node={selectedNode}
              nodesById={data.nodesById}
              meta={data.meta}
              warnings={warnings}
              totalNodes={totalNodes}
              totalEdges={totalEdges}
              isFilteredOut={selectedNode !== null && !matchedIds.has(selectedNode.id)}
            />
          ) : (
            <div className="px-4 py-3 text-11 text-fg-muted">数据就绪后启用详情</div>
          )}
        </aside>
      </div>

      <StatusBar
        nodeCount={totalNodes}
        edgeCount={totalEdges}
        matchedCount={matchedCount}
        meta={meta}
        warnings={warnings}
      />

      <SearchPalette
        open={paletteOpen}
        index={searchIndex}
        totalNodes={totalNodes}
        onClose={() => setPaletteOpen(false)}
        onPick={handlePickFromSearch}
      />
    </div>
  );
}
