/**
 * Sigma.js v3 渲染器封装（ADR-2）。
 *
 * 职责：把「选中 / 筛选 / 缩放」三件事翻译成 nodeReducer 的输出，
 * 不持有业务状态（选中 id 与命中集合都由 props 传入）。
 *
 * 静态阶段刻意不做的事：斥力动画、涟漪、入场生长、AI 脉冲。
 * 标签可见性用 camera.ratio 阈值控制（不是按节点尺寸），避免初始视图糊成一片。
 */
import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import Sigma from 'sigma';
import { LABEL_VISIBLE_RATIO, SELECTED_SCALE, UI, dimColor, kindStyle } from '../lib/palette';
import type { AtlasEdgeAttrs, AtlasGraph, AtlasNodeAttrs } from './layout';

export interface GraphHandle {
  /** 把相机移到某个节点并放大到标签可见 */
  focusNode: (id: string) => void;
  /** 回到首次渲染时的视图 */
  resetView: () => void;
}

interface GraphCanvasProps {
  graph: AtlasGraph;
  selectedId: string | null;
  /** 命中筛选的节点 id 集合；未命中的压暗并隐藏标签 */
  matchedIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  handleRef: RefObject<GraphHandle | null>;
}

interface ViewState {
  selectedId: string | null;
  matched: ReadonlySet<string>;
  labelsVisible: boolean;
}

interface CameraSnapshot {
  x: number;
  y: number;
  angle: number;
  ratio: number;
}

const EMPTY_SELECTION = new Set<string>();

export function GraphCanvas({ graph, selectedId, matchedIds, onSelect, handleRef }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma<AtlasNodeAttrs, AtlasEdgeAttrs> | null>(null);
  const initialCameraRef = useRef<CameraSnapshot | null>(null);
  const viewRef = useRef<ViewState>({
    selectedId: null,
    matched: EMPTY_SELECTION,
    labelsVisible: false,
  });
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // 选中/筛选变化：只刷新渲染，不重建图、不重排布局
  useEffect(() => {
    viewRef.current = { ...viewRef.current, selectedId, matched: matchedIds };
    sigmaRef.current?.refresh();
  }, [selectedId, matchedIds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const renderer = new Sigma<AtlasNodeAttrs, AtlasEdgeAttrs>(graph, container, {
      renderLabels: true,
      // 自己按相机比例控制标签，关掉 Sigma 自带的小尺寸剔除
      labelRenderedSizeThreshold: 0,
      labelFont: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif',
      labelSize: 12,
      labelWeight: '500',
      labelColor: { color: UI.fg },
      defaultNodeColor: UI.fgDim,
      defaultEdgeColor: '#202A35',
      // 有边时按契约渲染成实线；当前 edges.json 为空数组，这里只是先保底
      hideEdgesOnMove: true,
      enableEdgeEvents: false,
      zIndex: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 6,
      nodeReducer: (node, attributes) => {
        const view = viewRef.current;
        const style = kindStyle(attributes.kind);
        const isSelected = view.selectedId === node;
        const isMatched = view.matched.has(node);
        const showLabel = isSelected || (isMatched && view.labelsVisible);

        // 必须展开 attributes：Sigma v3 的 reducer 是「整体替换」而不是合并，
        // 少带 x/y 会直接抛 "could not find a valid position"（见 sigma addNode 注释）。
        return {
          ...attributes,
          color: isSelected ? UI.accent : isMatched ? style.color : dimColor(style.color),
          size: isSelected ? style.size * SELECTED_SCALE : style.size,
          label: showLabel ? attributes.label : null,
          zIndex: isSelected ? 2 : 0,
        };
      },
      edgeReducer: (edge, attributes) => {
        const view = viewRef.current;
        const active = view.matched.has(graph.source(edge)) && view.matched.has(graph.target(edge));
        // 同样要展开：边不要求 x/y，但少字段会被 applyEdgeDefaults 覆盖成默认值
        return {
          ...attributes,
          color: active ? UI.borderStrong : '#141B23',
          size: active ? 1 : 0.6,
        };
      },
    });

    sigmaRef.current = renderer;

    const camera = renderer.getCamera();
    let labelsVisible = viewRef.current.labelsVisible;

    const syncLabelVisibility = (ratio: number): void => {
      const next = ratio <= LABEL_VISIBLE_RATIO;
      if (next === labelsVisible) return;
      labelsVisible = next;
      viewRef.current.labelsVisible = next;
      renderer.refresh();
    };

    const onCameraUpdated = (state: { ratio: number }): void => syncLabelVisibility(state.ratio);
    camera.on('updated', onCameraUpdated);

    // 首帧后相机才算完成自适应，此时才能记下「初始视图」用于重置
    const onFirstRender = (): void => {
      initialCameraRef.current = { x: camera.x, y: camera.y, angle: camera.angle, ratio: camera.ratio };
      viewRef.current.labelsVisible = camera.ratio <= LABEL_VISIBLE_RATIO;
      labelsVisible = viewRef.current.labelsVisible;
      renderer.off('afterRender', onFirstRender);
      renderer.refresh();
    };
    renderer.on('afterRender', onFirstRender);

    renderer.on('clickNode', ({ node }) => onSelectRef.current(node));
    renderer.on('clickStage', () => onSelectRef.current(null));
    renderer.on('enterNode', () => {
      container.style.cursor = 'pointer';
    });
    renderer.on('leaveNode', () => {
      container.style.cursor = '';
    });

    const resizeObserver = new ResizeObserver(() => renderer.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      renderer.kill();
      sigmaRef.current = null;
    };
  }, [graph]);

  useImperativeHandle(
    handleRef,
    () => ({
      focusNode: (id: string) => {
        const renderer = sigmaRef.current;
        if (!renderer || !graph.hasNode(id)) return;
        // 相机坐标是「归一化后的 framed graph 坐标」（约 [-1,1]），
        // 不是 graphology 里的原始 x/y；读错空间会导致聚焦到图外、画布一片空。
        const display = renderer.getNodeDisplayData(id);
        if (!display) return;
        // ratio 0.45 一定小于标签阈值，聚焦后名字可见
        renderer.getCamera().setState({ x: display.x, y: display.y, ratio: 0.45 });
      },
      resetView: () => {
        const renderer = sigmaRef.current;
        const initial = initialCameraRef.current;
        if (!renderer || !initial) return;
        renderer.getCamera().setState(initial);
      },
    }),
    [graph],
  );

  return <div ref={containerRef} className="atlas-grid absolute inset-0" aria-label="知识图谱画布" />;
}
