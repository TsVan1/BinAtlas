/**
 * 把校验结果渲染成人可读的终端输出。
 * 格式要点（§6）：每条 finding 都是「文件:行号 · 字段 · 期望 · 实际」。
 */
import { RULE_TITLES, formatFinding, type Finding } from './finding.js';
import type { ValidateResult } from './validate.js';

export interface RenderOptions {
  /** 每个警告分组最多列几条（--all-warnings 时忽略） */
  allWarnings?: boolean;
  /** 分组内显示上限 */
  warningLimit?: number;
  dataLabel: string;
  command: string;
}

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

function pad(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)));
}

const TYPE_LABEL: Record<string, string> = {
  domain: '领域',
  technique: '技术',
  tool: '工具',
  concept: '概念',
  format: '格式',
  attack: '手法',
  ecosystem: '生态',
  ai: 'AI 能力',
  artifact: '载体',
  edges: ' ',
};

function groupByRule(list: Finding[]): [string, Finding[]][] {
  const map = new Map<string, Finding[]>();
  for (const f of list) {
    const arr = map.get(f.rule) ?? [];
    arr.push(f);
    map.set(f.rule, arr);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
}

export function renderReport(result: ValidateResult, opts: RenderOptions): string {
  const out: string[] = [];
  const { stats } = result;
  const limit = opts.warningLimit ?? 10;

  out.push(`BinAtlas 数据校验 · ${opts.dataLabel}`);
  out.push(
    `文件 ${result.files.length} 个 · 节点 ${stats.nodeCount} 个 · 边 ${stats.edgeCount} 条 · 规则 V1–V17${result.findings.some((f) => f.rule.startsWith('EXT-')) ? ' + EXT-*' : ''}`,
  );
  out.push('');

  // ---- 文件清单 ----
  out.push('文件');
  if (result.files.length === 0) out.push('  （没有找到任何 YAML）');
  const pathWidth = Math.max(24, ...result.files.map((f) => displayWidth(f.relPath))) + 2;
  for (const f of result.files) {
    const label = TYPE_LABEL[f.kind] ?? f.kind;
    out.push(`  ${pad(f.relPath, pathWidth)}${String(f.count).padStart(3)} 条  ${label}`);
  }
  for (const s of result.skipped) out.push(`  ${s}`);
  out.push('');

  // ---- 错误 ----
  if (result.errors.length === 0) {
    out.push('✗ 错误 0');
  } else {
    out.push(`✗ 错误 ${result.errors.length}`);
    for (const f of result.errors) out.push(`  ${formatFinding(f)}`);
  }
  out.push('');

  // ---- 警告（按规则汇总） ----
  if (result.warnings.length === 0) {
    out.push('⚠ 警告 0');
  } else {
    const head = opts.allWarnings
      ? `⚠ 警告 ${result.warnings.length}（全部列出）`
      : `⚠ 警告 ${result.warnings.length}（按规则汇总，每组最多 ${limit} 条；--all-warnings 看全部）`;
    out.push(head);
    for (const [rule, list] of groupByRule(result.warnings)) {
      const title = RULE_TITLES[rule] ?? rule;
      out.push(`  ${rule} · ${title} · ${list.length} 条`);
      const shown = opts.allWarnings ? list : list.slice(0, limit);
      for (const f of shown) out.push(`    ${formatFinding(f)}`);
      if (shown.length < list.length) out.push(`    … 另有 ${list.length - shown.length} 条同规则警告未列出`);
    }
  }
  out.push('');

  // ---- 统计 ----
  out.push('统计');
  const typeLine = Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${TYPE_LABEL[k] ?? k} ${v}`)
    .join(' · ');
  out.push(`  节点  ${typeLine || '（无）'}`);
  const edgeLine = Object.entries(stats.edgesByKind)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  out.push(`  边    ${edgeLine || '（data/edges 为空）'}`);
  out.push(
    `  出处  source 缺失（tool/ai/eco）${stats.sourceMissing} · tldr 不足 40 字 ${stats.tldrShort} · unverified ${stats.unverified.flagged}/${stats.unverified.total}（${(stats.unverified.ratio * 100).toFixed(1)}%）· 悬空引用 ${stats.danglingRefs}`,
  );

  // ---- 覆盖度（V14 要求进 stats 报告） ----
  if (stats.domains.length > 0) {
    out.push('');
    out.push('覆盖度（§4.4 / V14）');
    out.push(`  ${pad('domain', 22)}${pad('工具', 6)}${pad('技术', 6)}${pad('载体', 6)}${pad('coverage', 10)}结论`);
    for (const d of stats.domains) {
      const verdict =
        d.tools < 5
          ? d.coverage === 'full'
            ? '标 full 但工具 <5，与 §4.4 矛盾'
            : `工具 <5（coverage=${d.coverage}，与 §4.4 不冲突）`
          : d.coverage === 'stub'
            ? 'stub 但工具已 ≥5，与 §4.4 矛盾'
            : '达标';
      out.push(`  ${pad(d.id, 22)}${pad(String(d.tools), 6)}${pad(String(d.techniques), 6)}${pad(String(d.artifactCount), 6)}${pad(d.coverage, 10)}${verdict}`);
    }
  }

  out.push('');
  if (result.errors.length > 0) {
    out.push(`结论 失败：${result.errors.length} 个错误 → exit 1（${opts.command}）`);
  } else {
    out.push(`结论 通过：0 个错误，${result.warnings.length} 个警告不阻断 → exit 0`);
  }
  if (result.downgraded.length > 0) {
    const rules = [...new Set(result.downgraded.map((f) => f.rule))].join(', ');
    out.push(`注意 ${result.downgraded.length} 条错误被 --downgrade 降级为警告：${rules}（判断逻辑未改，仅不阻断）`);
  }
  return out.join('\n');
}
