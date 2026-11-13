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

test('真实 data/：0 个 error（warning 不阻断）', () => {
  const dataDir = path.join(ROOT, 'data');
  const before = fingerprint(dataDir);
  const result = run(dataDir);
  const after = fingerprint(dataDir);

  assert.deepEqual(
    result.errors.map(formatFinding),
    [],
    `真实 data/ 不应有 error，实际有：\n${result.errors.map(formatFinding).join('\n')}`,
  );
  assert.equal(result.stats.nodeCount, 37, '当前应为 3 领域 + 15 技术 + 19 载体');
  assert.equal(result.stats.edgeCount, 0, 'data/edges 目前为空');
  assert.equal(before, after, '校验器不许修改 data/ 下任何文件');
  // V11 应当就「还没写边」这件事报警，而不是沉默
  assert.ok(result.warnings.some((w) => w.rule === 'V11'), '应出现 V11 孤立节点警告');
  assert.ok(result.warnings.some((w) => w.rule === 'V14'), '应出现 V14 领域工具数不足警告');
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
  for (const name of ['edge-missing-rationale', 'edge-dangling-from', 'tool-missing-required', 'line-precision']) {
    const res = runCli(['--data', path.join('tests/fixtures', name, 'data')]);
    assert.equal(res.status, 1, `${name} 应 exit 1\n${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /✗ 错误 [12]/, `${name} 应打印错误清单`);
  }
  const good = runCli(['--data', 'data']);
  assert.equal(good.status, 0, `真实 data/ 应 exit 0\n${good.stdout}${good.stderr}`);
  assert.match(good.stdout, /结论 通过/);
});

test('CLI：--no-ext 只跑 V1–V15，不改变已通过的数据结论', () => {
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
