/** 底栏：节点数 · 边数 · 命中数 · fps（+ 数据告警与 schema 版本） */
import { useFps } from '../hooks/useFps';
import { formatDateTime, orDash } from '../lib/format';
import type { GraphMeta } from '../lib/types';

interface StatusBarProps {
  nodeCount: number;
  edgeCount: number;
  matchedCount: number;
  meta: GraphMeta;
  warnings: string[];
}

export function StatusBar({ nodeCount, edgeCount, matchedCount, meta, warnings }: StatusBarProps) {
  const fps = useFps();

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-panel px-4 text-11 text-fg-muted">
      <span>
        节点 <span className="font-mono text-fg-dim">{nodeCount}</span>
      </span>
      <span>
        边 <span className="font-mono text-fg-dim">{edgeCount}</span>
      </span>
      <span>
        命中{' '}
        <span className={matchedCount === nodeCount ? 'font-mono text-fg-dim' : 'font-mono text-accent'}>
          {matchedCount}
        </span>{' '}
        / {nodeCount}
      </span>

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
