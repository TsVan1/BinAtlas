#!/usr/bin/env node
/**
 * BinAtlas 数据校验 CLI —— CI 阻断入口（`pnpm validate`）。
 *
 * 退出码：0 = 无 error（warning 不阻断）；1 = 有 error；2 = 用法错误。
 * 只读 data/，不写任何文件。
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { renderReport } from './lib/report.js';
import { displayPath } from './lib/text.js';
import { validate } from './lib/validate.js';

interface CliArgs {
  data: string;
  allWarnings: boolean;
  noExt: boolean;
  downgrade: string[];
  today?: Date;
  help: boolean;
}

const USAGE = `用法：pnpm validate [选项]

选项
  --data <dir>        要校验的目录，默认 ./data
  --all-warnings      警告不再按规则截断，全部列出
  --no-ext            关闭 EXT-* 扩展检查（只跑规范里的 V1–V15）
  --downgrade <规则>  把指定规则（逗号分隔，如 V9b,EXT-REF）的 error 降级为 warning
  --today <Y-M-D>     覆盖 V12 的判定基准日（默认今天），便于回归测试
  --help              显示本帮助

退出码：0 无 error · 1 有 error · 2 用法错误`;

function parseArgs(argv: string[]): CliArgs | { error: string } {
  const args: CliArgs = { data: 'data', allWarnings: false, noExt: false, downgrade: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--': // pnpm run validate -- --data xxx 时可能出现，忽略
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
      case '--all-warnings':
        args.allWarnings = true;
        break;
      case '--no-ext':
        args.noExt = true;
        break;
      case '--downgrade': {
        const v = argv[++i];
        if (!v) return { error: '--downgrade 需要以逗号分隔的规则列表' };
        args.downgrade.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      }
      case '--today': {
        const v = argv[++i];
        if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: '--today 需要 YYYY-MM-DD' };
        args.today = new Date(`${v}T00:00:00Z`);
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
  const args = parsed;
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const cwd = process.cwd();
  const dataAbs = path.resolve(cwd, args.data);
  const dataLabel = `${displayPath(dataAbs, cwd)}/`;

  if (!existsSync(dataAbs) || !statSync(dataAbs).isDirectory()) {
    console.error(`✗ data 目录不存在或不是目录：${dataAbs}`);
    return 1;
  }

  const result = validate({
    dataDir: dataAbs,
    cwd,
    today: args.today,
    extensions: !args.noExt,
    downgrade: new Set(args.downgrade),
  });

  console.log(renderReport(result, { allWarnings: args.allWarnings, dataLabel, command: 'pnpm validate' }));
  return result.errors.length > 0 ? 1 : 0;
}

process.exitCode = main();
