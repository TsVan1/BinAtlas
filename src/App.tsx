/**
 * 应用装配层：数据 → 目录树 / 矩阵 / 工作流 / 关系图。
 *
 * 布局（最小 1280×800，基准 1440×900）：
 *   顶栏 52px · 内容区自适应（目录树视图 = 300px 树 + 中栏手册 + 320px 关联）· 底栏 28px
 *
 * 状态所有权：视图、选中、树过滤、工作流勾选都在这里，并同步到 URL hash
 * （刷新可恢复、链接可分享、headless 截图可直达）。子组件只收 props，不反向持有业务状态。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataErrorState, EmptyDataState, LoadingState } from './components/DataState';
import { DomainTree } from './components/DomainTree';
import { ManualPanel } from './components/ManualPanel';
import { RelationPanel } from './components/RelationPanel';
import { SearchPalette } from './components/SearchPalette';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { buildAtlasGraph, type AtlasGraph } from './graph/layout';
import { buildArtifactKinds } from './lib/artifactKinds';
import { artifactKindLabel } from './lib/enums';
import { buildMatrix } from './lib/matrix';
import { EMPTY_RELATIONS, deriveRelations } from './lib/relations';
import { buildSearchIndex } from './lib/search';
import {
  allDomainIds,
  buildTree,
  domainPathOf,
  expandChainFor,
  flattenFocused,
  flattenTree,
  techniquesUnder,
  type TreeRow,
} from './lib/tree';
import type { AtlasData, AtlasNode } from './lib/types';
import { readUrlState, writeUrlState, type UrlState, type ViewKey } from './lib/urlState';
import { useAtlasData } from './lib/useAtlasData';
import { WORKFLOW_MAX } from './lib/workflow';
import { GraphView } from './views/GraphView';
import { MatrixView } from './views/MatrixView';
import { WorkflowView } from './views/WorkflowView';

export default function App() {
  const { state, reload } = useAtlasData();

  const [nav, setNav] = useState<UrlState>(() => readUrlState());
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);

  const data = state.status === 'ready' ? state.data : null;
  const tree = useMemo(() => (data === null ? null : buildTree(data)), [data]);
  const searchIndex = useMemo(() => (data === null ? null : buildSearchIndex(data.index)), [data]);
  // 载体类别直接来自 nodes.json 的 artifact_kind，没有任何旁路数据源
  const kindTable = useMemo(() => (data === null ? null : buildArtifactKinds(data.nodes)), [data]);
  const matrix = useMemo(
    () => (tree === null || kindTable === null ? null : buildMatrix(tree, kindTable)),
    [tree, kindTable],
  );

  const graphCache = useRef<{ data: AtlasData; graph: AtlasGraph } | null>(null);
  const graph = useMemo<AtlasGraph | null>(() => {
    if (data === null || nav.view !== 'graph') return null;
    if (graphCache.current !== null && graphCache.current.data === data) return graphCache.current.graph;
    const built = buildAtlasGraph(data);
    graphCache.current = { data, graph: built };
    return built;
  }, [data, nav.view]);

  // ---- URL hash 单一写入口 ----
  const navigate = useCallback((patch: Partial<UrlState>) => {
    setNav((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    writeUrlState(nav);
  }, [nav]);

  // 地址栏里手动改 hash / 浏览器前进后退时跟着走。
  // 注意 writeUrlState 用的是 replaceState，不会触发 hashchange，所以这里不会自激。
  useEffect(() => {
    const onHashChange = (): void => setNav(readUrlState());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // ---- 首次进入：没有深链选中项时展开全部顶级领域；带选中项时只展开它的路径 ----
  // 深链（#sel=...）多半来自搜索或矩阵跳转，用户要的是「这条技术在哪」，
  // 把其它领域一起摊开只会把选中项挤出视口。
  const treeInitialized = useRef(false);
  useEffect(() => {
    if (tree === null || treeInitialized.current) return;
    treeInitialized.current = true;
    const chain = nav.sel === null ? [] : expandChainFor(tree, nav.sel);
    setExpanded(chain.length > 0 ? new Set(chain) : new Set(tree.roots.map((root) => root.node.id)));
  }, [tree, nav.sel]);

  // ---- 选中项：自动展开它的领域链 ----
  useEffect(() => {
    if (tree === null || nav.sel === null) return;
    const chain = expandChainFor(tree, nav.sel);
    if (chain.length === 0) return;
    setExpanded((prev) => {
      if (chain.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of chain) next.add(id);
      return next;
    });
  }, [tree, nav.sel]);

  // ---- hash 里带了已经不存在的 id：清掉，别让界面停在一个虚构选中项上 ----
  useEffect(() => {
    if (data === null) return;
    if (nav.sel !== null && !data.nodesById.has(nav.sel)) {
      setNav((prev) => ({ ...prev, sel: null }));
    }
    setNav((prev) => {
      const valid = prev.pick.filter((id) => data.nodesById.get(id)?.kind === 'technique');
      return valid.length === prev.pick.length ? prev : { ...prev, pick: valid };
    });
  }, [data, nav.sel]);

  // ---- 领域过滤指向一个不存在的领域：清掉 ----
  useEffect(() => {
    if (tree === null || nav.domain === null) return;
    if (!tree.domainsById.has(nav.domain)) {
      setNav((prev) => ({ ...prev, domain: null, akind: null }));
    }
  }, [tree, nav.domain]);

  // ---- 可见行 ----
  const rows = useMemo<TreeRow[]>(() => {
    if (tree === null) return [];

    if (nav.domain !== null) {
      const kind = nav.akind;
      const accept =
        kind !== null && kindTable !== null
          ? (node: AtlasNode) => node.artifacts.some((id) => kindTable.byId.get(id) === kind)
          : undefined;
      return flattenFocused(tree, { domainId: nav.domain, accept, query });
    }

    return flattenTree(tree, { expanded, query });
  }, [tree, nav.domain, nav.akind, kindTable, expanded, query]);

  const visibleTechniques = useMemo(() => rows.filter((row) => row.type === 'technique').length, [rows]);
  const selectedNode = data !== null && nav.sel !== null ? (data.nodesById.get(nav.sel) ?? null) : null;
  const relations = useMemo(
    () => (data === null || tree === null || selectedNode === null ? EMPTY_RELATIONS : deriveRelations(selectedNode, data, tree)),
    [data, tree, selectedNode],
  );

  const activePath = useMemo(() => {
    if (tree === null || nav.sel === null) return new Set<string>();
    return new Set(domainPathOf(tree, nav.sel).map((entry) => entry.node.id));
  }, [tree, nav.sel]);

  const stats = useMemo(() => {
    const nodes = data?.nodes ?? [];
    return {
      domains: tree?.roots.length ?? 0,
      subdomains: tree === null ? 0 : [...tree.domainsById.values()].filter((entry) => entry.depth === 1).length,
      techniques: nodes.filter((node) => node.kind === 'technique').length,
      edges: data?.edges.length ?? 0,
      tools: nodes.filter((node) => node.kind === 'tool').length,
      artifacts: nodes.filter((node) => node.kind === 'artifact').length,
      nodes: nodes.length,
    };
  }, [data, tree]);

  const filterLabel = useMemo(() => {
    if (nav.domain === null || tree === null) return null;
    const name = tree.domainsById.get(nav.domain)?.node.name ?? nav.domain;
    return nav.akind === null ? name : `${name} × ${artifactKindLabel(nav.akind)}`;
  }, [nav.domain, nav.akind, tree]);

  // ---- 交互 ----
  const handleSelect = useCallback(
    (id: string) => {
      navigate({ view: 'tree', sel: id, domain: null, akind: null });
      setPaletteOpen(false);
    },
    [navigate],
  );

  const handleTreeSelect = useCallback(
    (id: string) => {
      navigate({ sel: id });
    },
    [navigate],
  );

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (tree === null) return;
    setExpanded(new Set(allDomainIds(tree)));
  }, [tree]);

  const handleCollapseAll = useCallback(() => setExpanded(new Set()), []);

  const handleView = useCallback(
    (view: ViewKey) => {
      navigate({ view });
    },
    [navigate],
  );

  const handleMatrixCell = useCallback(
    (unitId: string, kind: string) => {
      if (tree === null) return;
      const entry = tree.domainsById.get(unitId);
      const first =
        entry === undefined || kindTable === null
          ? undefined
          : techniquesUnder(entry).find((technique) =>
              technique.artifacts.some((id) => kindTable.byId.get(id) === kind),
            );
      navigate({ view: 'tree', domain: unitId, akind: kind, sel: first?.id ?? unitId });
    },
    [tree, kindTable, navigate],
  );

  const handleTogglePick = useCallback((id: string) => {
    setNav((prev) => {
      if (prev.pick.includes(id)) return { ...prev, pick: prev.pick.filter((item) => item !== id) };
      if (prev.pick.length >= WORKFLOW_MAX) return prev;
      return { ...prev, pick: [...prev.pick, id] };
    });
  }, []);

  const handleClearPicks = useCallback(() => navigate({ pick: [] }), [navigate]);

  const handlePickFromSearch = useCallback(
    (id: string) => {
      handleSelect(id);
    },
    [handleSelect],
  );

  // ---- 全局快捷键 ----
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen]);

  const dataReady = state.status === 'ready' && state.data.nodes.length > 0;
  const warnings = useMemo(() => {
    const base = data?.warnings ?? [];
    if (kindTable !== null && kindTable.missing.length > 0) {
      return [...base, `${kindTable.missing.length} 个载体缺 artifact_kind（矩阵会显示为「未归类」）`];
    }
    return base;
  }, [data, kindTable]);

  return (
    <div className="atlas-shell relative flex h-screen min-w-[1280px] flex-col overflow-hidden text-fg">
      <TopBar
        view={nav.view}
        onView={handleView}
        onOpenSearch={() => setPaletteOpen(true)}
        searchDisabled={!dataReady}
        counts={{ nodes: stats.nodes, edges: stats.edges, techniques: stats.techniques }}
        pickCount={nav.pick.length}
      />

      <div className="relative z-10 flex min-h-0 flex-1">
        {state.status === 'loading' && (
          <div className="flex-1">
            <LoadingState />
          </div>
        )}
        {state.status === 'error' && (
          <div className="flex-1">
            <DataErrorState error={state.error} onRetry={reload} />
          </div>
        )}
        {state.status === 'ready' && state.data.nodes.length === 0 && (
          <div className="flex-1">
            <EmptyDataState />
          </div>
        )}

        {dataReady && data !== null && tree !== null && nav.view === 'tree' && (
          <>
            <aside className="w-[300px] shrink-0 border-r border-border bg-panel/55" aria-label="目录树">
              <DomainTree
                rows={rows}
                selectedId={nav.sel}
                activePath={activePath}
                query={query}
                onQueryChange={setQuery}
                onSelect={handleTreeSelect}
                onToggle={handleToggle}
                onExpandAll={handleExpandAll}
                onCollapseAll={handleCollapseAll}
                stats={{ domains: stats.domains, subdomains: stats.subdomains, techniques: stats.techniques }}
                filterLabel={filterLabel}
                onClearFilter={() => navigate({ domain: null, akind: null })}
                visibleTechniques={visibleTechniques}
              />
            </aside>

            <main className="min-w-0 flex-1 bg-bg/30" aria-label="作战手册">
              <ManualPanel
                node={selectedNode}
                relations={relations}
                tree={tree}
                kindTable={kindTable}
                stats={{
                  domains: stats.domains,
                  subdomains: stats.subdomains,
                  techniques: stats.techniques,
                  edges: stats.edges,
                  tools: stats.tools,
                  artifacts: stats.artifacts,
                }}
                onSelect={handleSelect}
              />
            </main>

            <aside className="w-[320px] shrink-0 border-l border-border bg-panel/55" aria-label="关联">
              <RelationPanel node={selectedNode} relations={relations} kindTable={kindTable} onSelect={handleSelect} />
            </aside>
          </>
        )}

        {dataReady && matrix !== null && nav.view === 'matrix' && (
          <main className="min-w-0 flex-1" aria-label="交叉矩阵">
            <MatrixView model={matrix} onOpenCell={handleMatrixCell} onSelectDomain={handleSelect} />
          </main>
        )}

        {dataReady && data !== null && tree !== null && nav.view === 'workflow' && (
          <main className="min-w-0 flex-1" aria-label="工作流">
            <WorkflowView
              data={data}
              tree={tree}
              selectedIds={nav.pick}
              onToggle={handleTogglePick}
              onClear={handleClearPicks}
              onOpenInTree={handleSelect}
            />
          </main>
        )}

        {dataReady && data !== null && nav.view === 'graph' && graph !== null && (
          <main className="min-w-0 flex-1" aria-label="关系图">
            <GraphView
              data={data}
              graph={graph}
              selectedId={nav.sel}
              onSelect={(id) => navigate({ sel: id })}
              onOpenInTree={handleSelect}
            />
          </main>
        )}
      </div>

      <StatusBar
        view={nav.view}
        nodeCount={stats.nodes}
        edgeCount={stats.edges}
        techniqueCount={stats.techniques}
        domainCount={stats.domains}
        selectedName={selectedNode?.name ?? null}
        meta={data?.meta ?? {}}
        warnings={warnings}
      />

      <SearchPalette
        open={paletteOpen}
        index={searchIndex}
        totalNodes={stats.nodes}
        onClose={() => setPaletteOpen(false)}
        onPick={handlePickFromSearch}
      />
    </div>
  );
}
