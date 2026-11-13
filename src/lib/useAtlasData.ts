/**
 * 数据装载的 React 封装：loading / ready / error 三态 + 手动重试。
 */
import { useCallback, useEffect, useState } from 'react';
import { AtlasDataError, loadAtlas } from './data';
import type { AtlasData } from './types';

export type AtlasLoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: AtlasData }
  | { status: 'error'; error: AtlasDataError };

function toAtlasError(error: unknown): AtlasDataError {
  if (error instanceof AtlasDataError) return error;
  const detail = error instanceof Error ? error.message : String(error);
  return new AtlasDataError('network', 'nodes.json', `装载图谱数据失败：${detail}`);
}

export function useAtlasData(): { state: AtlasLoadState; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AtlasLoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    loadAtlas(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', error: toAtlasError(error) });
      },
    );

    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, reload };
}
