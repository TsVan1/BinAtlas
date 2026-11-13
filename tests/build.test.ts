/**
 * 图数据构建 & 覆盖率统计的测试。
 *
 * 两条原则：
 * 1. **不写死条数**：data/ 由 A1/A2/A3 并行扩写，写死 37/50 这种数字会让 CI 每逢数据提交就红。
 *    这里只断言「契约」：字段齐、条数自洽、摘要不超长、id 唯一、空数据不崩。
 * 2. **不碰仓库里的产物**：所有落盘都写进 os.tmpdir()，跑完即删。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, ARTIFACT_KINDS } from '../schema/index.js';
import {
  GRAPH_FILE_NAMES,
  INDEX_SUMMARY_MAX,
  compileGraph,
  projectGraph,
  writeGraph,
  type GraphEdge,
  type GraphNode,
  type SearchEntry,
} from '../scripts/lib/graph.js';
import { computeCoverage, renderCoverageMarkdown } from '../scripts/lib/stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const NOW = new Date('2026-11-13T00:00:00Z');

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

/** 按真实 data/ 跑一遍编译 + 投影 + 落盘，返回读回来的 4 份产物 */
function buildRealData(outDir: string): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  index: SearchEntry[];
  meta: { counts: Record<string, number>; warnings: string[]; schemaVersion: string };
} {
  const compiled = compileGraph({ dataDir: DATA, cwd: ROOT });
  assert.deepEqual(compiled.errors, [], '真实数据的 Zod 复检不应失败');
  const model = projectGraph(compiled, { now: NOW });
  writeGraph(model, outDir);
  const read = (name: string): unknown => JSON.parse(readFileSync(path.join(outDir, name), 'utf8'));
  return {
    nodes: read('nodes.json') as GraphNode[],
    edges: read('edges.json') as GraphEdge[],
    index: read('index.json') as SearchEntry[],
    meta: read('meta.json') as { counts: Record<string, number>; warnings: string[]; schemaVersion: string },
  };
}

// ---------------------------------------------------------------------------
// 1. 真实数据：4 份产物的契约
// ---------------------------------------------------------------------------

test('build-graph：4 个文件都是合法 JSON，字段齐、条数自洽、摘要 ≤80 字', (t) => {
  const outDir = tempDir('binatlas-graph-');
  t.after(() => rmSync(outDir, { recursive: true, force: true }));

  const { nodes, edges, index, meta } = buildRealData(outDir);
  assert.deepEqual(readdirSync(outDir).sort(), [...GRAPH_FILE_NAMES].sort(), '应恰好产出 4 个文件');

  // 每条节点都带齐契约字段
  for (const node of nodes) {
    for (const key of ['id', 'kind', 'name', 'def', 'domain', 'artifacts', 'platforms'] as const) {
      assert.ok(key in node, `${node.id} 缺字段 ${key}`);
    }
    assert.ok(Array.isArray(node.domain) && Array.isArray(node.artifacts) && Array.isArray(node.platforms));
  }

  // id 唯一
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length, 'nodes.json 里 id 不能重复');

  // 条数与 meta.counts 自洽
  const countBy = (kind: string): number => nodes.filter((n) => n.kind === kind).length;
  assert.equal(meta.counts.domain, countBy('domain'));
  assert.equal(meta.counts.technique, countBy('technique'));
  assert.equal(meta.counts.artifact, countBy('artifact'));
  assert.equal(meta.counts.tool, countBy('tool'));
  assert.equal(meta.counts.edge, edges.length);
  assert.equal(meta.schemaVersion, SCHEMA_VERSION);
  assert.equal(index.length, nodes.length, 'index 与 nodes 应一一对应');

  // 索引：摘要长度上限、别名是数组、id 对得上
  const ids = new Set(nodes.map((n) => n.id));
  for (const entry of index) {
    assert.ok(ids.has(entry.id), `index 里的 ${entry.id} 在 nodes.json 中不存在`);
    assert.ok(Array.isArray(entry.aliases), `${entry.id} 的 aliases 必须是数组`);
    assert.ok(
      Array.from(entry.tldr).length <= INDEX_SUMMARY_MAX,
      `${entry.id} 的摘要 ${Array.from(entry.tldr).length} 字，超过 ${INDEX_SUMMARY_MAX}`,
    );
  }

  // 工具没有 def 字段（§2.3 用 tldr），构建层必须回落到 tldr，不能留空
  const tools = nodes.filter((n) => n.kind === 'tool');
  for (const tool of tools) {
    assert.notEqual(tool.def, '', `${tool.id} 的 def 为空：tool 的 def 应从 tldr 回落`);
  }

  // 边：data/edges/ 现在为空 → 空数组 + meta 有说明（不是静默的空）
  assert.deepEqual(edges, [], 'data/edges/ 为空时 edges.json 必须是空数组');
  assert.ok(
    meta.warnings.some((w) => w.includes('边库为空')),
    `边库为空时 meta.warnings 必须说明，实际：${JSON.stringify(meta.warnings)}`,
  );
});

// ---------------------------------------------------------------------------
// 2. 空数据：不能崩，输出空数组并在 meta 里注明
// ---------------------------------------------------------------------------

test('build-graph：data/ 为空时不崩溃，输出空数组并在 meta 里注明', (t) => {
  const root = tempDir('binatlas-empty-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  mkdirSync(path.join(dataDir, 'edges'), { recursive: true });
  const outDir = path.join(root, 'graph');

  const compiled = compileGraph({ dataDir, cwd: root });
  assert.deepEqual(compiled.errors, []);
  assert.deepEqual(compiled.nodes, []);
  assert.deepEqual(compiled.edges, []);

  const model = projectGraph(compiled, { now: NOW });
  assert.deepEqual(model.nodes, []);
  assert.deepEqual(model.edges, []);
  assert.deepEqual(model.index, []);
  assert.deepEqual(model.meta.counts, { domain: 0, technique: 0, artifact: 0, tool: 0, edge: 0 });
  assert.ok(
    model.meta.warnings.some((w) => w.includes('没有任何 YAML')) && model.meta.warnings.some((w) => w.includes('边库为空')),
    `空数据应在 meta.warnings 里注明，实际：${JSON.stringify(model.meta.warnings)}`,
  );

  const outputs = writeGraph(model, outDir);
  assert.equal(outputs.length, 4);
  assert.equal(readFileSync(path.join(outDir, 'nodes.json'), 'utf8'), '[]\n');
  assert.equal(readFileSync(path.join(outDir, 'edges.json'), 'utf8'), '[]\n');
});

// ---------------------------------------------------------------------------
// 3. 统计：空数据不产生 NaN，矩阵列是完整枚举
// ---------------------------------------------------------------------------

test('stats：空数据下比例为 null（不是 0 / NaN），矩阵列仍是 12 个 kind', (t) => {
  const root = tempDir('binatlas-stats-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  mkdirSync(dataDir, { recursive: true });

  const compiled = compileGraph({ dataDir, cwd: root });
  const report = computeCoverage(compiled, { now: NOW });

  assert.equal(report.totals.nodes, 0);
  assert.equal(report.provenance.unverified.ratio, null, '分母为 0 时占比必须是 null，不能是 NaN/0');
  assert.equal(report.provenance.tldrShort.ratio, null);
  assert.equal(report.matrix.ratio, null);
  assert.deepEqual(report.matrix.columns, [...ARTIFACT_KINDS]);
  assert.deepEqual(report.matrix.rows, []);

  const markdown = renderCoverageMarkdown(report);
  assert.match(markdown, /^# BinAtlas · 覆盖率报告/);
  assert.doesNotMatch(markdown, /NaN/, 'markdown 里不能出现 NaN');
});

test('stats：真实数据下矩阵行数 = 技术数，覆盖率在 0–1 之间', () => {
  const compiled = compileGraph({ dataDir: DATA, cwd: ROOT });
  const report = computeCoverage(compiled, { now: NOW });
  const techniques = compiled.nodes.filter((n) => n.kind === 'technique').length;

  assert.equal(report.matrix.rows.length, techniques);
  assert.equal(report.matrix.total, techniques * ARTIFACT_KINDS.length);
  assert.equal(report.matrix.filled + report.matrix.zeroCells.length, report.matrix.total);
  assert.ok(report.matrix.ratio !== null && report.matrix.ratio > 0 && report.matrix.ratio <= 1);
  assert.equal(report.domains.length, compiled.nodes.filter((n) => n.kind === 'domain').length);
});

// ---------------------------------------------------------------------------
// 4. CLI：校验失败 → exit 1，且不写出任何 JSON
// ---------------------------------------------------------------------------

test('CLI：坏数据 → exit 1 且不产出任何 JSON', (t) => {
  const outDir = tempDir('binatlas-badgraph-');
  t.after(() => rmSync(outDir, { recursive: true, force: true }));

  const proc = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/build-graph.ts',
      '--data',
      path.join('tests/fixtures/edge-missing-rationale/data'),
      '--out',
      outDir,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );

  assert.equal(proc.status, 1, `坏数据应 exit 1\nstdout:\n${proc.stdout}\nstderr:\n${proc.stderr}`);
  assert.match(proc.stderr, /校验失败/);
  assert.deepEqual(readdirSync(outDir), [], '校验失败时不允许留下任何产物（哪怕半个文件）');
});
