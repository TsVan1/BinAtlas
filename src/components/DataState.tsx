/**
 * 数据未就绪的三种表面：加载中 / 错误 / 空库。
 * 核心要求：构建产物缺失时给出「请先运行 pnpm build」，绝不白屏。
 */
import type { AtlasDataError } from '../lib/data';

export function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-12 text-fg-muted">加载图谱数据…</p>
    </div>
  );
}

interface DataErrorStateProps {
  error: AtlasDataError;
  onRetry: () => void;
}

export function DataErrorState({ error, onRetry }: DataErrorStateProps) {
  const missing = error.kind === 'missing';

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-[560px] rounded-lg border border-border bg-panel p-5">
        <h2 className="text-16 font-semibold text-fg">{missing ? '图谱数据缺失' : '图谱数据读取失败'}</h2>

        <p className="mt-2 text-13 leading-relaxed text-fg-dim">
          {missing
            ? 'public/graph 下没有构建产物。前端不会自己造数据，需要先跑一次数据构建。'
            : '构建产物存在但无法解析，先看下面的具体原因。'}
        </p>

        {missing && (
          <>
            <div className="mt-3 rounded border border-border bg-bg px-3 py-2">
              <p className="text-11 text-fg-muted">在项目根目录执行</p>
              <pre className="mt-1 font-mono text-12 text-accent">pnpm build</pre>
            </div>
            <p className="mt-2 text-12 text-fg-muted">
              等 <span className="font-mono">public/graph/*.json</span> 生成后再点「重试」。
            </p>
          </>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="rounded border border-border-strong bg-panel-raised px-3 py-1.5 text-12 text-fg hover:border-accent hover:text-accent"
          >
            重试
          </button>
          <span className="font-mono text-11 text-fg-muted">{error.file}</span>
        </div>

        <p className="mt-3 break-all text-11 leading-relaxed text-fg-muted">{error.message}</p>
      </div>
    </div>
  );
}

export function EmptyDataState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-[560px] rounded-lg border border-border bg-panel p-5">
        <h2 className="text-16 font-semibold text-fg">知识库还没有节点</h2>
        <p className="mt-2 text-13 leading-relaxed text-fg-dim">
          构建产物正常，但 <span className="font-mono text-12">nodes.json</span> 是空数组。
          先往 <span className="font-mono text-12">data/</span> 里加 YAML 条目，再重新构建。
        </p>
        <div className="mt-3 rounded border border-border bg-bg px-3 py-2">
          <pre className="font-mono text-12 text-accent">pnpm build</pre>
        </div>
      </div>
    </div>
  );
}
