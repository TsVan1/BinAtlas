/** 复用的小展示件：类型色点、计数、难度条、复制按钮、键帽 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { copyText } from '../lib/clipboard';
import { COPY_FEEDBACK_MS } from '../motion/tokens';
import { kindStyle } from '../lib/palette';
import { CheckIcon, CopyIcon } from './icons';

export function KindDot({ kind, size = 7 }: { kind: string; size?: number }) {
  const style = kindStyle(kind);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: style.color, boxShadow: `0 0 8px -1px ${style.color}` }}
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

export function SectionHeading({
  children,
  right,
  tone = 'muted',
}: {
  children: ReactNode;
  right?: ReactNode;
  tone?: 'muted' | 'accent';
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
      <h3
        className={cn(
          'flex items-center gap-1.5 text-11 uppercase tracking-[0.14em]',
          tone === 'accent' ? 'text-accent-soft' : 'text-fg-muted',
        )}
      >
        <span aria-hidden className={cn('h-[3px] w-[3px] rounded-full', tone === 'accent' ? 'bg-accent' : 'bg-fg-muted')} />
        {children}
      </h3>
      {right}
    </div>
  );
}

/** 汇总计数胶囊：树节点、面板标题都用它，数字永远等宽 */
export function CountPill({
  value,
  tone = 'default',
  title,
}: {
  value: number | string;
  tone?: 'default' | 'accent' | 'dim';
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-[16px] min-w-[18px] items-center justify-center rounded px-1 font-mono text-11 leading-none',
        tone === 'accent' && 'border border-accent/30 bg-accent/10 text-accent-soft',
        tone === 'default' && 'border border-border bg-panel-raised text-fg-dim',
        tone === 'dim' && 'text-fg-muted',
      )}
    >
      {value}
    </span>
  );
}

const DIFFICULTY_COLOR = ['', 'bg-lime', 'bg-lime', 'bg-amber', 'bg-magenta', 'bg-magenta'];

/** 1–5 难度：五段条。数值缺失时显示「—」，不猜一个默认难度 */
export function DifficultyMeter({ value, withLabel = false }: { value: number | undefined; withLabel?: boolean }) {
  if (value === undefined) {
    return <span className="font-mono text-11 text-fg-muted">—</span>;
  }

  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-1.5" title={`难度 ${filled} / 5`}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn(
              'w-[3px] rounded-[1px] transition-colors',
              step <= filled ? DIFFICULTY_COLOR[filled] : 'bg-border-strong/70',
            )}
            style={{ height: `${4 + step * 2}px` }}
          />
        ))}
      </span>
      {withLabel && <span className="font-mono text-11 text-fg-dim">{filled}/5</span>}
      {withLabel ? null : <span className="sr-only">难度 {filled} / 5</span>}
    </span>
  );
}

/** 复制按钮：成功/失败都如实反馈，1.4s 后复位 */
export function CopyButton({
  text,
  label = '复制',
  className,
  onCopied,
}: {
  text: string;
  label?: string;
  className?: string;
  onCopied?: () => void;
}) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const handleClick = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.stopPropagation();
    const ok = await copyText(text);
    setState(ok ? 'ok' : 'fail');
    if (ok) onCopied?.();
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-copied={state === 'ok'}
      title={state === 'fail' ? '剪贴板不可用，请手动选中复制' : `复制到剪贴板`}
      className={cn(
        'cmd-copy inline-flex h-6 shrink-0 items-center gap-1 rounded border border-border bg-panel-raised px-1.5 font-mono text-11 text-fg-dim',
        'hover:border-accent/45 hover:text-accent-soft',
        className,
      )}
    >
      {state === 'ok' ? <CheckIcon /> : <CopyIcon />}
      <span>{state === 'ok' ? '已复制' : state === 'fail' ? '复制失败' : label}</span>
    </button>
  );
}

export function EmptyBlock({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-border-strong/70 bg-panel/40 px-3 py-3">
      <p className="text-12 text-fg-dim">{title}</p>
      {hint !== undefined && <p className="mt-1 text-11 leading-relaxed text-fg-muted">{hint}</p>}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}
