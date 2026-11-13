/** 底栏：数据规模 · 当前选中 · 告警 · fps / schema / 构建时间 */
import { useFps } from '../hooks/useFps';
import { formatDateTime, orDash } from '../lib/format';
import type { GraphMeta } from '../lib/types';
import type { ViewKey } from '../lib/urlState';

const VIEW_LABEL: Readonly<Record<ViewKey, string>> = {
  tree: '目录树',
  matrix: '矩阵',
  workflow: '工作流',
  graph: '关系图',
};

interface StatusBarProps {
  view: ViewKey;
  nodeCount: number;
  edgeCount: number;
  techniqueCount: number;
  domainCount: number;
  selectedName: string | null;
  meta: GraphMeta;
  warnings: string[];
}

export function StatusBar({
  view,
  nodeCount,
  edgeCount,
  techniqueCount,
  domainCount,
  selectedName,
  meta,
  warnings,
}: StatusBarProps) {
  const fps = useFps();

  return (
    <footer className="relative z-10 flex h-7 shrink-0 items-center gap-3 border-t border-border bg-panel px-3 text-11 text-fg-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-[3px] w-[3px] rounded-full bg-accent shadow-[0_0_8px_rgba(34,211,238,0.9)]" aria-hidden />
        <span className="text-accent-soft">{VIEW_LABEL[view]}</span>
      </span>

      <span className="h-3 w-px bg-border" aria-hidden />

      <span>
        领域 <span className="font-mono text-fg-dim">{domainCount}</span>
      </span>
      <span>
        技术 <span className="font-mono text-fg-dim">{techniqueCount}</span>
      </span>
      <span>
        节点 <span className="font-mono text-fg-dim">{nodeCount}</span>
      </span>
      <span>
        边 <span className="font-mono text-fg-dim">{edgeCount}</span>
      </span>

      {selectedName !== null && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden />
          <span className="max-w-[280px] truncate">
            选中 <span className="text-fg-dim">{selectedName}</span>
          </span>
        </>
      )}

      {warnings.length > 0 && (
        <span className="text-amber" title={warnings.join('\n')}>
          ⚠ 数据告警 {warnings.length}
        </span>
      )}

      <span className="ml-auto" title="浏览器渲染循环帧率（requestAnimationFrame），不是 Sigma 的绘制次数">
        fps <span className="font-mono text-fg-dim">{fps}</span>
      </span>
      <span title="public/graph/meta.json 的 schemaVersion">schema {orDash(meta.schemaVersion)}</span>
      <span title="public/graph/meta.json 的 builtAt">构建 {formatDateTime(meta.builtAt)}</span>
    </footer>
  );
}
