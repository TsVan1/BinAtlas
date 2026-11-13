/** 内联图标：不引图标库，避免为几个 12px 图形增加依赖 */
import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function SearchIcon() {
  return (
    <svg {...base}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2 13.5 13.5" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...base}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width={9} height={9} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1.5 5.2 4 7.5 8.5 2.5" />
    </svg>
  );
}

export function WarningIcon() {
  return (
    <svg {...base}>
      <path d="M8 2.5 14 13H2z" />
      <path d="M8 6v3.2" />
      <path d="M8 11.4h.01" />
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg {...base}>
      <path d="M13 8A5 5 0 1 1 11.3 4.3" />
      <path d="M13 2.5V5h-2.5" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...base}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V3.8c0-.7-.6-1.3-1.3-1.3H3.8c-.7 0-1.3.6-1.3 1.3v5.4c0 .7.6 1.3 1.3 1.3h1.7" />
    </svg>
  );
}

/** 树节点的展开箭头：旋转由 CSS 的 .tree-chevron 负责，这里只画形状 */
export function ChevronIcon() {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 2 7 5 3.5 8" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5 7 9" />
      <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

export function DotIcon({ size = 4 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="2" />
    </svg>
  );
}


