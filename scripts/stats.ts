#!/usr/bin/env node
/**
 * BinAtlas 覆盖率统计 CLI —— `pnpm stats`。
 *
 * 只读 data/，同时产出两份：
 *   reports/coverage.json —— 机器读（CI 对比、看板）
 *   reports/coverage.md   —— 人读（每次扩数据后扫一眼）
 *
 * 数据先过校验门：有 error 就不出报告 —— 用坏数据算出来的覆盖率比没有更危险。
 *
 * 退出码：0 = 成功；1 = 校验/编译失败（不写报告）；2 = 用法错误。
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatFinding } from './lib/finding.js';
import { compileGraph, formatBytes } from './lib/graph.js';
import { computeCoverage, formatCoverageSummary, renderCoverageMarkdown } from './lib/stats.js';
import { displayPath } from './lib/text.js';
import { validate } from './lib/validate.js';

interface CliArgs {
  data: string;
  out: string;
  help: boolean;
}

const USAGE = `用法：pnpm stats [选项]

统计 data/ 的覆盖率，产出 reports/coverage.json（机器读）与 reports/coverage.md（人读）。

选项
  --data <dir>   数据目录，默认 ./data
  --out <dir>    报告目录，默认 ./reports
  --help         显示本帮助

内容包括：各领域工具/技术/载体数与门槛判定、技术×载体 kind 组合覆盖矩阵（标出 0 覆盖）、
unverified / tldr / source 比例、maintain_status=abandoned|stale 清单、ai_ready 分布。
退出码：0 成功 · 1 校验失败（不写报告） · 2 用法错误`;

function parseArgs(argv: string[]): CliArgs | { error: string } {
  const args: CliArgs = { data: 'data', out: 'reports', help: false };
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

  if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) {
    console.error(`✗ data 目录不存在或不是目录：${dataDir}`);
    return 1;
  }

  const validation = validate({ dataDir, cwd });
  if (validation.errors.length > 0) {
    console.error(`✗ 校验失败：${validation.errors.length} 个 error，未生成报告（坏数据算出的覆盖率没有意义）`);
    for (const f of validation.errors) console.error(`  ${formatFinding(f)}`);
    return 1;
  }

  const compiled = compileGraph({ dataDir, cwd });
  if (compiled.errors.length > 0) {
    console.error(`✗ 编译失败：${compiled.errors.length} 条记录无法通过 Zod 复检，未生成报告`);
    for (const err of compiled.errors) console.error(`  [compile] ${err.file}:${err.line} · ${err.locator} · ${err.message}`);
    return 1;
  }

  const report = computeCoverage(compiled, { now: new Date(), dataLabel: `${displayPath(dataDir, cwd)}/` });
  const markdown = renderCoverageMarkdown(report);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'coverage.json');
  const mdPath = path.join(outDir, 'coverage.md');
  writeFileSync(jsonPath, json, 'utf8');
  writeFileSync(mdPath, markdown, 'utf8');

  console.log(`校验 通过 · 0 error / ${validation.warnings.length} warning（同一套 Zod）`);
  console.log('');
  console.log(formatCoverageSummary(report));
  console.log('');
  console.log(
    `已写出 ${displayPath(jsonPath, cwd)}（${formatBytes(Buffer.byteLength(json, 'utf8'))}）` +
      ` · ${displayPath(mdPath, cwd)}（${formatBytes(Buffer.byteLength(markdown, 'utf8'))}）`,
  );
  return 0;
}

process.exitCode = main();
