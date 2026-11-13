/**
 * Vite 配置 —— 前端（A7 主图谱）唯一的构建入口。
 *
 * 边界：
 * - 只服务 `src/` + `index.html`，不碰 `scripts/`（数据构建走 `pnpm build`，与本文件无关）。
 * - `public/` 原样复制进 `dist/`，所以 `public/graph/*.json`（gitignored 构建产物）
 *   在 `pnpm build:web` 时会被自动打进产物；缺文件时前端走「请先运行 pnpm build」降级提示。
 * - 端口固定 5173 + strictPort：冒烟测试脚本按这个地址验证，被占用时宁可报错也不要偷换端口。
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
});
