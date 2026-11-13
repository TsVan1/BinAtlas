/**
 * 图谱渲染的错误边界：WebGL 初始化失败（无 GPU、上下文丢失、驱动黑名单）时，
 * 中栏降级成一段可读的说明，而不是整页白屏。
 *
 * 只包住画布：筛选与详情不依赖 WebGL，不该被一起拖死。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class GraphErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留原始堆栈给开发者看，不吞错
    console.error('图谱渲染失败', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-[560px] rounded-lg border border-border bg-panel p-5">
          <h2 className="text-16 font-semibold text-fg">图谱渲染失败</h2>
          <p className="mt-2 text-13 leading-relaxed text-fg-dim">
            数据已装载成功，但 WebGL 画布初始化失败。常见原因是浏览器禁用了硬件加速，
            或当前环境没有可用的 GPU 上下文。
          </p>
          <ul className="mt-2 space-y-1 text-12 text-fg-muted">
            <li>· 在浏览器设置里开启「使用硬件加速」后重启浏览器</li>
            <li>· 换用 Chrome / Edge 等支持 WebGL 2 的浏览器</li>
            <li>· 左侧筛选与右侧详情不依赖 WebGL，数据本身是可用的</li>
          </ul>
          <div className="mt-3 rounded border border-border bg-bg px-3 py-2">
            <p className="text-11 text-fg-muted">错误信息</p>
            <p className="mt-1 break-all font-mono text-11 text-amber">{error.message}</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded border border-border-strong bg-panel-raised px-3 py-1.5 text-12 text-fg hover:border-accent hover:text-accent"
          >
            重新加载页面
          </button>
        </div>
      </div>
    );
  }
}
