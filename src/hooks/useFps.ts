/**
 * fps 采样：用 requestAnimationFrame 数帧，每 500ms 更新一次。
 *
 * 诚实说明：这是**浏览器渲染循环的帧率**，不是 Sigma 的 WebGL 绘制次数
 * （静态图上 Sigma 按需绘制，闲置时不会每帧重绘）。它衡量的是「当前这个页面卡不卡」，
 * 底栏 tooltip 里也照这个口径写。
 */
import { useEffect, useState } from 'react';

const SAMPLE_WINDOW_MS = 500;

export function useFps(): number {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let frames = 0;
    let windowStart = performance.now();

    const tick = (now: number): void => {
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= SAMPLE_WINDOW_MS) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        windowStart = now;
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return fps;
}
