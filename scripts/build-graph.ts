#!/usr/bin/env node
/**
 * BinAtlas 图数据构建 CLI —— `pnpm build-graph`。
 *
 * 流程（任何一步失败都不写文件）：
 *   1) validate：与 `pnpm validate` 完全同一套函数与 Zod 定义；
 *   2) compile ：装载 + 逐条 safeParse 兜底；
 *   3) project ：投影成前端契约的 4 份产物；
 *   4) write   ：一次性写 public/graph/{nodes,edges,index,meta}.json。
 *
 * 数据为空是**合法状态**（data/edges 现在就是空的）：输出空数组 + meta.warnings 说明，exit 0。
 *
 * 退出码：0 = 成功；1 = 校验/编译失败（无产物）；2 = 用法错误。
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  compileGraph,
  formatBuildReport,
  projectGraph,
  writeGraph,
  type CompileResult,
} from './lib/graph.js';
import { formatFinding } from './lib/finding.js';
import { displayPath } from './lib/text.js';
import { validate } from './lib/validate.js';

interface CliArgs {
  data: string;
  out: string;
  help: boolean;
}

const USAGE = `用法：pnpm build-graph [选项]

把 data/**/*.yaml 编译成 public/graph/{nodes,edges,index,meta}.json。

选项
  --data <dir>   数据目录，默认 ./data
  --out <dir>    输出目录，默认 ./public/graph
  --help         显示本帮助

退出码：0 成功 · 1 校验/编译失败（不产出任何 JSON） · 2 用法错误
数据为空（例如 data/edges/ 无记录）不算失败：输出空数组并在 meta.json 的 warnings[] 里注明。`;

function parseArgs(argv: string[]): CliArgs | { error: string } {
  const args: CliArgs = { data: 'data', out: 'public/graph', help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--':
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--data': {
        const v = argv[++i];
        if (!v) return { error: '--data 需要一个目录参数' };
        args.data = v;
        break;
      }
      case '--out': {
        const v = argv[++i];
        if (!v) return { error: '--out 需要一个目录参数' };
        args.out = v;
        break;
      }
      default:
        return { error: `未知参数：${a}` };
    }
  }
  return args;
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(`✗ ${parsed.error}\n\n${USAGE}`);
    return 2;
  }
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }

  const cwd = process.cwd();
  const dataDir = path.resolve(cwd, parsed.data);
  const outDir = path.resolve(cwd, parsed.out);
  const dataLabel = `${displayPath(dataDir, cwd)}/`;
  const outLabel = `${displayPath(outDir, cwd)}/`;

  if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) {
    console.error(`✗ data 目录不存在或不是目录：${dataDir}`);
    return 1;
  }

  // ---- 1. 校验门：任何 error 都不写文件 ----
  const validation = validate({ dataDir, cwd });
  if (validation.errors.length > 0) {
    console.error(`✗ 校验失败：${validation.errors.length} 个 error，未写出任何 JSON`);
    for (const f of validation.errors) console.error(`  ${formatFinding(f)}`);
    console.error('  修完再跑：pnpm validate（明细）→ pnpm build-graph');
    return 1;
  }
  console.log(`校验 通过 · 0 error / ${validation.warnings.length} warning（同一套 Zod，明细用 pnpm validate）`);

  // ---- 2. 编译：与 validate 同批 schema 再兜一次 ----
  const compiled: CompileResult = compileGraph({ dataDir, cwd });
  if (compiled.errors.length > 0) {
    console.error(`✗ 编译失败：${compiled.errors.length} 条记录无法通过 Zod 复检，未写出任何 JSON`);
    for (const err of compiled.errors) console.error(`  [compile] ${err.file}:${err.line} · ${err.locator} · ${err.message}`);
    return 1;
  }

  // ---- 3–4. 投影 + 落盘 ----
  const model = projectGraph(compiled, { now: new Date() });
  const outputs = writeGraph(model, outDir);

  console.log(
    formatBuildReport({
      model,
      outputs,
      dataLabel,
      outDirLabel: outLabel,
      validation: { errors: 0, warnings: validation.warnings.length },
    }),
  );
  return 0;
}

process.exitCode = main();
