/** 画布上的静态叠层：图例、重置按钮、操作提示、0 命中提示（全部静态，不含动效） */
import { cn } from '../lib/cn';
import { ResetIcon } from './icons';

interface LegendItem {
  kind: string;
  label: string;
  color: string;
}

interface CanvasOverlayProps {
  kinds: LegendItem[];
  matched: number;
  total: number;
  onResetView: () => void;
  onClearFilters: () => void;
}

export function CanvasOverlay({ kinds, matched, total, onResetView, onClearFilters }: CanvasOverlayProps) {
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-border bg-panel/85 px-2 py-1.5">
        <ul className="flex flex-col gap-1">
          {kinds.map((item) => (
            <li key={item.kind} className="flex items-center gap-1.5 text-11 text-fg-muted">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="absolute right-3 top-3 z-10">
        <button
          type="button"
          onClick={onResetView}
          className="flex items-center gap-1 rounded border border-border bg-panel/85 px-2 py-1 text-11 text-fg-dim hover:border-border-strong hover:text-fg"
          title="回到首次渲染时的视图"
        >
          <ResetIcon />
          重置视图
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-2.5 left-1/2 z-10 -translate-x-1/2">
        <p className="text-11 text-fg-muted/80">拖拽平移 · 滚轮缩放 · 点击节点查看详情 · 缩放后显示节点名</p>
      </div>

      {matched === 0 && total > 0 && (
        <div className="absolute inset-x-0 top-1/2 z-20 flex justify-center px-4">
          <div className="rounded border border-amber/40 bg-panel px-3 py-2 text-center">
            <p className="text-12 text-amber">当前筛选命中 0 个节点</p>
            <button
              type="button"
              onClick={onClearFilters}
              className={cn('mt-1.5 rounded border border-border-strong px-2 py-0.5 text-11 text-fg-dim hover:text-fg')}
            >
              清除全部筛选
            </button>
          </div>
        </div>
      )}
    </>
  );
}
