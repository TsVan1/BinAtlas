#!/usr/bin/env node
/**
 * `pnpm build` —— 阶段现状（如实汇报，不伪造成功）：
 *
 *   1) 类型检查：真实执行 `tsc --noEmit`，失败即 exit 1 并打印 tsc 原始报错。
 *   2) 图数据构建（public/graph/{nodes,edges,index,meta}.json）：**本阶段未实现**，
 *      默认显式打印「未实现」并以 exit 1 退出 —— 不让下游误以为产物已经存在。
 *      确认只需要类型检查时，加 `--allow-incomplete`（仅供临时 CI 使用）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowIncomplete = process.argv.slice(2).includes('--allow-incomplete');

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

console.log('build/2 图数据    public/graph/{nodes,edges,index,meta}.json');
if (allowIncomplete) {
  console.log('⚠ 未实现：图数据构建被 --allow-incomplete 跳过（产物不存在，下游不可依赖）');
  process.exit(0);
}
console.error('✗ 未实现：图数据构建（scripts/build-graph.ts 尚未编写）');
console.error('  本阶段交付范围只到校验层；需要临时跑通类型检查请用：pnpm build -- --allow-incomplete');
process.exit(1);
