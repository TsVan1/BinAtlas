/**
 * 校验器测试：真实 data/ + 9 个故意坏掉的夹具 + CLI 退出码。
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
  // V21 例外：data/techniques.yaml 还有 5 条 P-1 试点技术没补 detail/principle/procedure，
  // 按规则就该报 warning（由 A1 另行补齐，不是校验器该压掉的东西）。
  const allowedWarnings = new Set(['V11', 'V12', 'V13', 'V14', 'V21']);
  for (const w of result.warnings) {
    assert.ok(allowedWarnings.has(w.rule), `真实 data/ 出现了非预期警告：${formatFinding(w)}`);
  }
  // V21 只约束 technique：domain / tool / artifact 缺这三个字段是合法的
  const v21 = result.warnings.filter((w) => w.rule === 'V21');
  assert.ok(
    v21.every((w) => w.locator.startsWith('technique.')),
    `V21 只应落在 technique 上，实际：\n${v21.map(formatFinding).join('\n')}`,
  );
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
// 坏样例 6：detail 超过 400 字（V18）
// ---------------------------------------------------------------------------

test('坏样例 6：detail 401 字 → V18，报出实际字数与字段路径', () => {
  const result = run(fixtureData('detail-too-long'));
  assert.equal(result.errors.length, 1, result.errors.map(formatFinding).join('\n'));
  const [err] = result.errors;
  assert.ok(err);
  assert.equal(err.rule, 'V18');
  assert.equal(err.level, 'error');
  assert.equal(err.line, 16, '应指到 detail 那一行');
  assert.equal(err.locator, 'technique.detail-too-long.detail');
  assert.match(
    formatFinding(err),
    /tests\/fixtures\/detail-too-long\/data\/techniques\.yaml:16 · technique\.detail-too-long\.detail · 期望≤400 字（去空白后的码点数，§6\.1①） · 实际 401 字/,
  );
  // 边界：同目录里 detail 正好 400 字的技术必须通过（`>` 而不是 `>=`）
  assert.ok(
    !result.findings.some((f) => f.rule === 'V18' && f.locator === 'technique.detail-at-limit.detail'),
    `恰好 400 字的 detail 不应触发 V18：\n${result.findings.map(formatFinding).join('\n')}`,
  );
});

// ---------------------------------------------------------------------------
// 坏样例 7：principle 超过 300 字（V19）
// ---------------------------------------------------------------------------

test('坏样例 7：principle 301 字 → V19；300 字边界必须通过', () => {
  const result = run(fixtureData('principle-too-long'));
  assert.equal(result.errors.length, 1, result.errors.map(formatFinding).join('\n'));
  const [err] = result.errors;
  assert.ok(err);
  assert.equal(err.rule, 'V19');
  assert.equal(err.level, 'error');
  assert.equal(err.line, 17, '应指到 principle 那一行');
  assert.equal(err.locator, 'technique.principle-too-long.principle');
  assert.match(
    formatFinding(err),
    /tests\/fixtures\/principle-too-long\/data\/techniques\.yaml:17 · technique\.principle-too-long\.principle · 期望≤300 字（去空白后的码点数，§6\.1①） · 实际 301 字/,
  );

  // 边界：真实数据里有正好 300 字的 principle，必须不报错（`<=` 而不是 `<`）
  const real = run(path.join(ROOT, 'data'));
  assert.ok(
    !real.findings.some((f) => f.rule === 'V19'),
    `恰好 300 字的 principle 不应触发 V19：\n${real.findings.filter((f) => f.rule === 'V19').map(formatFinding).join('\n')}`,
  );
});

// ---------------------------------------------------------------------------
// 坏样例 8：procedure 三条分支（V20）
// ---------------------------------------------------------------------------

test('坏样例 8：procedure 条数不足 / 空项 / 重复项 → 三条 V20', () => {
  const result = run(fixtureData('procedure-bad'));
  const errs = result.errors.filter((e) => e.rule === 'V20');
  assert.equal(result.errors.length, 3, result.errors.map(formatFinding).join('\n'));
  assert.deepEqual(
    errs.map((e) => e.locator),
    ['technique.few-steps.procedure', 'technique.empty-step.procedure[1]', 'technique.duplicate-step.procedure[3]'],
    result.errors.map(formatFinding).join('\n'),
  );

  const [few, empty, dup] = errs;
  assert.match(formatFinding(few!), /data\/techniques\.yaml:18 · technique\.few-steps\.procedure · 期望3–8 项 · 实际 2 项/);
  assert.match(formatFinding(empty!), /procedure\[1\] · 期望非空字符串（每项一句话） · 实际 " {3}"（全是空白）/);
  assert.match(formatFinding(dup!), /procedure\[3\] · 期望同一 procedure 内不重复 · 实际 与第 1 项重复："先备份样本"/);
  // 相似但不相同的步骤不算重复（不做模糊匹配）：备份到 A / 备份到 A 并校验
  assert.ok(
    !result.findings.some((f) => f.rule === 'V20' && f.locator.startsWith('technique.similar-steps')),
    `相似步骤不应被判重复：\n${result.findings.map(formatFinding).join('\n')}`,
  );
});

// ---------------------------------------------------------------------------
// 坏样例 9：technique 缺 detail / principle / procedure（V21，warning）
// ---------------------------------------------------------------------------

test('坏样例 9：technique 三个字段全缺 → V21 只报 warning，不阻断', () => {
  const result = run(fixtureData('technique-missing-fields'));
  assert.deepEqual(result.errors.map(formatFinding), [], 'V21 是 warning，不应产生 error');
  const v21 = result.warnings.filter((w) => w.rule === 'V21');
  assert.equal(v21.length, 1, `一条技术只报一条 V21：\n${result.warnings.map(formatFinding).join('\n')}`);
  const [warn] = v21;
  assert.ok(warn);
  assert.equal(warn.level, 'warning');
  assert.equal(warn.line, 2, '整条记录级问题退化为节点起始行');
  assert.equal(warn.locator, 'technique.pilot-gap');
  assert.match(
    formatFinding(warn),
    /techniques\.yaml:2 · technique\.pilot-gap · 期望三个字段齐全（detail \/ principle \/ procedure，§2\.2；V21 逐步收紧为 error） · 实际 缺 detail \/ principle \/ procedure/,
  );
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
  for (const name of [
    'edge-missing-rationale',
    'edge-dangling-from',
    'tool-missing-required',
    'line-precision',
    'deprecated-field',
    'detail-too-long',
    'principle-too-long',
    'procedure-bad',
  ]) {
    const res = runCli(['--data', path.join('tests/fixtures', name, 'data')]);
    assert.equal(res.status, 1, `${name} 应 exit 1\n${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /✗ 错误 \d+/, `${name} 应打印错误清单`);
  }
  const good = runCli(['--data', 'data']);
  assert.equal(good.status, 0, `真实 data/ 应 exit 0\n${good.stdout}${good.stderr}`);
  assert.match(good.stdout, /结论 通过/);
});

test('CLI：V21 只有 warning → exit 0，并打印规则分组', () => {
  const res = runCli(['--data', path.join('tests/fixtures', 'technique-missing-fields', 'data'), '--all-warnings']);
  assert.equal(res.status, 0, `V21 是 warning，不应阻断\n${res.stdout}${res.stderr}`);
  assert.match(res.stdout, /\[V21\].*technique\.pilot-gap/);
  assert.match(res.stdout, /结论 通过：0 个错误，3 个警告不阻断/);
});

test('CLI：--no-ext 只跑 V1–V21，不改变已通过的数据结论', () => {
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
