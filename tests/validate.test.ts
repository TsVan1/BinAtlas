/**
 * 校验器测试：真实 data/ + 4 个故意坏掉的夹具 + CLI 退出码。
 *
 * 只读 data/ —— 这里还会断言校验过程不会改动 data/ 下任何字节。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatFinding } from '../scripts/lib/finding.js';
import { validate } from '../scripts/lib/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = new Date('2026-11-13T00:00:00Z');

const fixtureData = (name: string): string => path.join(ROOT, 'tests/fixtures', name, 'data');

function run(dataDir: string) {
  return validate({ dataDir, cwd: ROOT, today: TODAY });
}

/** data/ 下所有文件内容的指纹，用于证明校验器只读 */
function fingerprint(dirAbs: string): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs);
      else hash.update(`${path.relative(dirAbs, abs)}\u0000`).update(readFileSync(abs));
    }
  };
  walk(dirAbs);
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// 真实数据
// ---------------------------------------------------------------------------

test('真实 data/：0 个 error，且统计口径自洽（不写死条数——数据在并行增长）', () => {
  const dataDir = path.join(ROOT, 'data');
  const before = fingerprint(dataDir);
  const result = run(dataDir);
  const after = fingerprint(dataDir);

  assert.deepEqual(
    result.errors.map(formatFinding),
    [],
    `真实 data/ 不应有 error，实际有：\n${result.errors.map(formatFinding).join('\n')}`,
  );
  assert.equal(before, after, '校验器不许修改 data/ 下任何文件');

  // 统计口径自洽：文件条数 = 节点 + 边；类型分布之和 = 节点数；领域行数 = domain 节点数
  const fileTotal = result.files.reduce((sum, f) => sum + f.count, 0);
  assert.equal(fileTotal, result.stats.nodeCount + result.stats.edgeCount, '文件条数应等于节点数 + 边数');
  const byTypeSum = Object.values(result.stats.byType).reduce((a, b) => a + b, 0);
  assert.equal(byTypeSum, result.stats.nodeCount, 'byType 之和应等于节点数');
  assert.equal(result.stats.domains.length, result.stats.byType.domain ?? 0, '领域表行数应等于 domain 节点数');

  // V11 只针对非 domain 节点（规则语义），且载体靠 artifacts 字段被引用即算关联（§6）
  const v11 = result.warnings.filter((w) => w.rule === 'V11');
  assert.ok(!v11.some((w) => w.locator.startsWith('domain.')), 'domain 不参与 V11');
  assert.equal(
    v11.filter((w) => w.locator.startsWith('artifact.')).length,
    0,
    `载体不应被判孤立（它们被 artifacts 字段引用）：\n${v11.map(formatFinding).join('\n')}`,
  );

  // 真实数据只可能触发这四条警告规则；出现别的规则说明规则实现串了
  const allowedWarnings = new Set(['V11', 'V12', 'V13', 'V14']);
  for (const w of result.warnings) {
    assert.ok(allowedWarnings.has(w.rule), `真实 data/ 出现了非预期警告：${formatFinding(w)}`);
  }
});

// ---------------------------------------------------------------------------
// 坏样例 1：缺 rationale 的边
// ---------------------------------------------------------------------------

test('坏样例 1：缺 rationale 的边 → V4，指到第 2 行', () => {
  const result = run(fixtureData('edge-missing-rationale'));
  assert.equal(result.errors.length, 1, formatFinding(result.errors[0] ?? ({} as never)));
  const [err] = result.errors;
  assert.ok(err);
  assert.equal(err.rule, 'V4');
  assert.equal(err.line, 2);
  assert.equal(err.locator, 'edge[1].rationale');
  assert.match(formatFinding(err), /data\/edges\/relations\.yaml:2 · edge\[1\]\.rationale · 期望非空且 ≥15 字 · 实际 缺失/);
});

// ---------------------------------------------------------------------------
// 坏样例 2：from 指向不存在的节点
// ---------------------------------------------------------------------------

test('坏样例 2：from 悬空 → V3，指出缺失的 ID', () => {
  const result = run(fixtureData('edge-dangling-from'));
  assert.equal(result.errors.length, 1, result.errors.map(formatFinding).join('\n'));
  const [err] = result.errors;
  assert.ok(err);
  assert.equal(err.rule, 'V3');
  assert.equal(err.line, 2);
  assert.equal(err.locator, 'edge[1].from');
  assert.match(err.actual, /tech:does-not-exist/);
});

// ---------------------------------------------------------------------------
// 坏样例 3：tool 缺必填字段
// ---------------------------------------------------------------------------

test('坏样例 3：tool 缺 license + platforms → 两条 V1', () => {
  const result = run(fixtureData('tool-missing-required'));
  const v1 = result.errors.filter((e) => e.rule === 'V1');
  assert.deepEqual(
    v1.map((e) => e.locator),
    ['tool.upx.license', 'tool.upx.platforms'],
    result.errors.map(formatFinding).join('\n'),
  );
  assert.equal(result.errors.length, 2, '除这两个字段外不该有别的 error');
  assert.match(formatFinding(v1[0]!), /期望枚举值之一：oss \| commercial \| freeware \| mixed \| unknown · 实际 缺失/);
});

// ---------------------------------------------------------------------------
// 行号精度：非法枚举值必须指到它真正所在的行
// ---------------------------------------------------------------------------

test('行号精度：非法枚举值指到第 9 行，而不是文件头', () => {
  const result = run(fixtureData('line-precision'));
  assert.equal(result.errors.length, 1, result.errors.map(formatFinding).join('\n'));
  const [err] = result.errors;
  assert.ok(err);
  assert.equal(err.line, 9);
  assert.equal(err.locator, 'domain.fixture.coverage');
  assert.match(err.actual, /fullish/);
});

// ---------------------------------------------------------------------------
// 坏样例 5：已废弃字段 typical_artifacts（§6.2 出现即 error）
// ---------------------------------------------------------------------------

test('坏样例 5：出现已废弃字段 typical_artifacts → V17', () => {
  const result = run(fixtureData('deprecated-field'));
  assert.equal(result.errors.length, 1, result.errors.map(formatFinding).join('\n'));
  const [err] = result.errors;
  assert.ok(err);
  assert.equal(err.rule, 'V17');
  assert.equal(err.line, 28, '应指到 typical_artifacts 那一行，而不是节点起始行');
  assert.equal(err.locator, 'technique.stale.typical_artifacts');
  assert.match(formatFinding(err), /data\/techniques\.yaml:28 · technique\.stale\.typical_artifacts · 期望不含已废弃字段（§6\.2/);
  assert.match(err.actual, /art:fixture-obj/);
});

// ---------------------------------------------------------------------------
// CLI：退出码与参数
// ---------------------------------------------------------------------------

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const proc = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/validate.ts', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { status: proc.status, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

test('CLI：坏数据 exit 1，真实数据 exit 0', () => {
  for (const name of ['edge-missing-rationale', 'edge-dangling-from', 'tool-missing-required', 'line-precision', 'deprecated-field']) {
    const res = runCli(['--data', path.join('tests/fixtures', name, 'data')]);
    assert.equal(res.status, 1, `${name} 应 exit 1\n${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /✗ 错误 [12]/, `${name} 应打印错误清单`);
  }
  const good = runCli(['--data', 'data']);
  assert.equal(good.status, 0, `真实 data/ 应 exit 0\n${good.stdout}${good.stderr}`);
  assert.match(good.stdout, /结论 通过/);
});

test('CLI：--no-ext 只跑 V1–V17，不改变已通过的数据结论', () => {
  const res = runCli(['--data', 'data', '--no-ext', '--all-warnings']);
  assert.equal(res.status, 0);
  assert.doesNotMatch(res.stdout, /\[EXT-/);
});

test('CLI：--today 能把 verified_at 推过 18 个月阈值（V12 是 warning，不阻断）', () => {
  const name = 'tool-missing-required';
  const res = runCli(['--data', path.join('tests/fixtures', name, 'data'), '--today', '2030-01-01', '--all-warnings']);
  assert.equal(res.status, 1, '该夹具本身有 V1 错误，仍应 exit 1');
  assert.match(res.stdout, /\[V12\]/);
});

test('CLI：--downgrade 把指定规则的 error 降级为 warning', () => {
  const res = runCli(['--data', path.join('tests/fixtures', 'tool-missing-required', 'data'), '--downgrade', 'V1']);
  assert.equal(res.status, 0, '降级后不应再有 error');
  assert.match(res.stdout, /被 --downgrade 降级/);
});

test('CLI：--data 指向不存在的目录 → exit 1 并说明', () => {
  const res = runCli(['--data', 'tests/fixtures/__not_exist__/data']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /data 目录不存在/);
});
