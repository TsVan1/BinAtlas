#!/usr/bin/env node
/**
 * `pnpm build` —— 构建入口（CI 用这一条替代原来的 typecheck 兜底）。
 *
 *   1) 类型检查：`tsc --noEmit -p tsconfig.json`，失败即 exit 1。
 *   2) 图数据构建：调用 `scripts/build-graph.ts`（内部先跑与 `pnpm validate`
 *      完全同一套 Zod 校验，有 error 就 exit 1 且不写任何 JSON）。
 *   3) 成功时 exit 0，并打印产物清单。
 *
 * 额外参数会原样转给 build-graph，例如 `pnpm build -- --out dist/graph`。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const passthrough = process.argv.slice(2).filter((a) => a !== '--');

const tscBin = path.join(ROOT, 'node_modules', '.bin', 'tsc');
if (!existsSync(tscBin)) {
  console.error(`✗ 找不到 tsc：${tscBin}\n  请先运行 pnpm install`);
  process.exit(1);
}

console.log('build/1 类型检查  tsc --noEmit -p tsconfig.json');
const tsc = spawnSync(tscBin, ['--noEmit', '-p', 'tsconfig.json'], { cwd: ROOT, stdio: 'inherit' });
if (tsc.error) {
  console.error(`✗ tsc 启动失败：${tsc.error.message}`);
  process.exit(1);
}
if (tsc.status !== 0) {
  console.error(`✗ 类型检查失败（tsc exit ${tsc.status ?? '?'}）`);
  process.exit(1);
}
console.log('✔ 类型检查通过（schema/ + scripts/ + tests/）');
console.log('');

console.log('build/2 数据校验 + 图数据  scripts/build-graph.ts（先跑 validate 的同一套 Zod）');
const graph = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/build-graph.ts', ...passthrough], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (graph.error) {
  console.error(`✗ build-graph 启动失败：${graph.error.message}`);
  process.exit(1);
}
if (graph.status !== 0) {
  console.error(`✗ 图数据构建失败（build-graph exit ${graph.status ?? '?'}）：未产出 JSON，详见上面的报错`);
  process.exit(1);
}

console.log('');
console.log('✔ 构建完成：public/graph/{nodes,edges,index,meta}.json 已更新 → exit 0');
