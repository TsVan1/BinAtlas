/** 复用的小展示件：节点类型色点/徽标、键帽提示 */
import type { ReactNode } from 'react';
import { kindStyle } from '../lib/palette';
import { cn } from '../lib/cn';

export function KindDot({ kind, size = 7 }: { kind: string; size?: number }) {
  const style = kindStyle(kind);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: style.color }}
    />
  );
}

export function KindBadge({ kind }: { kind: string }) {
  const style = kindStyle(kind);
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-border bg-panel-raised px-1.5 py-0.5 text-11 text-fg-dim">
      <KindDot kind={kind} />
      <span>{style.label}</span>
      <span className="font-mono text-fg-muted">{kind}</span>
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded border border-border bg-panel-raised px-1 py-px font-mono text-11 text-fg-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function SectionHeading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between px-0.5">
      <h3 className="text-11 uppercase tracking-wider text-fg-muted">{children}</h3>
      {right}
    </div>
  );
}
