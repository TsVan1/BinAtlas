/**
 * 规则覆盖测试：V1–V15 里那些「真实数据暂时证明不了」的规则，
 * 用一个临时 data/ 根目录一次性触发。
 *
 * 临时目录建在 os.tmpdir() 下，跑完即删 —— 不污染仓库、更不碰 data/。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { formatFinding } from '../scripts/lib/finding.js';
import { validate, type ValidateResult } from '../scripts/lib/validate.js';

const TODAY = new Date('2026-11-13T00:00:00Z');

/** 故意把 V4(字数) / V5 / V6 / V7 / V8 / V9 / V16 / V10 / V12 / V13 / V15 全部踩一遍 */
const FILES: Record<string, string> = {
  'domains.yaml': `# 规则覆盖测试：1 个领域（coverage=partial，避免触发 EXT-COVERAGE）
- id: dom:fixture
  name: 示例领域
  name_en: Fixture Domain
  def: 规则覆盖测试用的领域条目，只保证字段齐全。
  artifacts:
  - art:fixture-obj
  entry_difficulty: 1
  coverage: partial
`,
  'artifacts.yaml': `- id: art:fixture-obj
  name: 示例载体
  kind: executable
  def: 规则覆盖测试用的载体条目。
`,
  // 两条技术互相把对方写进 prerequisites → V10 环
  'techniques.yaml': `- id: tech:loop-a
  name: 环甲
  name_en: Loop A
  domain:
  - dom:fixture
  def: 规则覆盖测试用技术甲。
  difficulty: 1
  prerequisites:
  - tech:loop-b
  artifacts:
  - art:fixture-obj
  outputs:
  - 输出甲
  cost: low
  false_positive_risk: low
- id: tech:loop-b
  name: 环乙
  name_en: Loop B
  domain:
  - dom:fixture
  def: 规则覆盖测试用技术乙。
  difficulty: 1
  prerequisites:
  - tech:loop-a
  artifacts:
  - art:fixture-obj
  outputs:
  - 输出乙
  cost: low
  false_positive_risk: low
`,
  // V8 tldr 太短 / V9 source 为空 / V12 verified_at 过旧 / V15 first_release 晚于核验年份
  'tools/torture.yaml': `- id: tool:bad
  name: Bad Tool
  category: packers
  domain:
  - dom:fixture
  artifacts:
  - art:fixture-obj
  license: oss
  platforms:
  - linux
  learning_curve: 2
  maintain_status: active
  first_release: 2030
  latest_version: unknown
  url: https://example.com/bad
  source: []
  verified_at: 2024-01-01
  headless: yes
  ai_ready: none
  tldr: 太短
`,
  // V9 source 缺失 / V16 verified_at 缺失 / V13 打上 unverified
  'ai.yaml': `- id: ai:fixture-mcp
  name: 夹具 MCP
  kind: mcp
  def: 规则覆盖测试用的 AI 能力条目。
  maturity: experimental
  url: https://example.com/mcp
  unverified: true
`,
  // V16 verified_at 缺失（source 给了）/ V13 打上 unverified
  'ecosystems.yaml': `- id: eco:fixture-lab
  name: 夹具靶场
  kind: 靶场
  url: https://example.com/lab
  covers:
  - tech:loop-a
  free: true
  source:
  - https://example.com/lab
  unverified: true
`,
  'edges/torture.yaml': `# V4：rationale 只有 2 字
- from: tech:loop-a
  to: tool:bad
  kind: uses
  rationale: 太短
# V5：alternative 缺 switch_cost 与 tradeoff
- from: tech:loop-a
  to: tech:loop-b
  kind: alternative
  rationale: 两者能力高度重叠，可以互相替换，理由是写得足够长的。
# V6：supersedes 缺 since 与 reason
- from: tool:bad
  to: tech:loop-a
  kind: supersedes
  rationale: 后者取代前者，理由是写得足够长能通过字数检查的。
# V7：upstream 缺 order
- from: tech:loop-a
  to: tech:loop-b
  kind: upstream
  rationale: 两者在流水线上前后相邻，理由是写得足够长能通过检查。
# 这条用来证明合法的边不会被误报
- from: tool:bad
  to: art:fixture-obj
  kind: applies_to
  rationale: 该工具直接处理这种载体，理由是写得足够长能通过字数检查。
`,
};

function buildTortureApp(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'binatlas-rules-'));
  const dataDir = path.join(root, 'data');
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = path.join(dataDir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return dataDir;
}

function countByRule(result: ValidateResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of result.findings) out[f.rule] = (out[f.rule] ?? 0) + 1;
  return out;
}

test('规则覆盖：一次触发 V4(字数)/V5/V6/V7/V8/V9/V16/V10/V15，并让 V12/V13 报 warning', (t) => {
  const dataDir = buildTortureApp();
  t.after(() => rmSync(path.dirname(dataDir), { recursive: true, force: true }));

  const result = validate({ dataDir, cwd: path.dirname(dataDir), today: TODAY });
  const counts = countByRule(result);
  const errorsText = result.errors.map(formatFinding).join('\n');

  assert.deepEqual(
    counts,
    {
      V4: 1,
      V5: 2,
      V6: 2,
      V7: 1,
      V8: 1,
      V9: 2,
      V16: 2,
      V10: 1,
      V12: 1,
      V13: 1,
      V15: 1,
      V11: 2, // ai、eco 没有任何边（warning）
      V14: 1, // 该领域只有 1 个工具（warning）
    },
    `规则命中数与预期不符：\n${errorsText}`,
  );

  assert.equal(result.errors.length, 13, `error 数不符：\n${errorsText}`);
  assert.equal(
    result.warnings.length,
    5,
    `warning 应为 V11×2 + V12 + V13 + V14：\n${result.warnings.map(formatFinding).join('\n')}`,
  );

  // V4 的字数分支要给出实际字数，而不是只说「太短」
  const v4 = result.errors.find((e) => e.rule === 'V4');
  assert.ok(v4);
  assert.match(formatFinding(v4), /期望≥15 字 · 实际 2 字/);

  // V10 要打印出具体的环
  const v10 = result.errors.find((e) => e.rule === 'V10');
  assert.ok(v10);
  assert.match(v10.actual, /tech:loop-[ab] → tech:loop-[ab] → tech:loop-[ab]/);

  // V13 的占比要算对：2/7
  const v13 = result.warnings.find((w) => w.rule === 'V13');
  assert.ok(v13);
  assert.match(v13.actual, /28\.6%（2\/7）/);

  // 合法的边不能误报：这条 applies_to 不产生任何 error
  assert.ok(!errorsText.includes('edge[5]'), 'edge[5] 是合法边，不应报错');
});

// ---------------------------------------------------------------------------
// V2：ID 规范的三条分支（真实数据里一条都没有，只能造）
// ---------------------------------------------------------------------------

const DUP_FILES: Record<string, string> = {
  'domains.yaml': `- id: dom:dup
  name: 重复甲
  name_en: Dup A
  def: 第一条重复 ID 的领域。
  artifacts:
  - art:dup
  entry_difficulty: 1
  coverage: stub
- id: dom:dup
  name: 重复乙
  name_en: Dup B
  def: 第二条重复 ID 的领域。
  artifacts:
  - art:dup
  entry_difficulty: 1
  coverage: stub
`,
  'artifacts.yaml': `- id: art:dup
  name: 载体甲
  kind: executable
  def: slug 与 dom:dup 撞车的载体。
`,
  // 类型是 technique，前缀却写了 tool
  'techniques.yaml': `- id: tool:wrong-prefix
  name: 前缀错
  name_en: Wrong Prefix
  domain:
  - dom:dup
  def: 类型是 technique，但 ID 前缀写成 tool 的技术。
  difficulty: 1
  prerequisites: []
  artifacts:
  - art:dup
  outputs:
  - 输出
  cost: low
  false_positive_risk: low
`,
};

test('V2：重复 ID / 前缀与类型不符；slug 跨类型重复不再算错（§1 改判）', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'binatlas-ids-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  for (const [rel, content] of Object.entries(DUP_FILES)) {
    mkdirSync(path.dirname(path.join(dataDir, rel)), { recursive: true });
    writeFileSync(path.join(dataDir, rel), content, 'utf8');
  }

  const result = validate({ dataDir, cwd: root, today: TODAY });
  const errorsText = result.errors.map(formatFinding).join('\n');
  const v2 = result.errors.filter((e) => e.rule === 'V2');
  assert.equal(v2.length, 2, errorsText);
  assert.ok(v2.some((e) => /与 data\/domains\.yaml:1 重复/.test(e.actual)), '应报重复 ID');
  assert.ok(v2.some((e) => e.locator === 'technique.wrong-prefix.id' && /前缀必须是 tech:/.test(e.expected)), '应报前缀与类型不符');
  // §1 改判：slug 允许跨类型重复（tool:upx 与 art:upx 因前缀不同无歧义），不再算错
  assert.ok(!v2.some((e) => /slug/.test(e.expected)), `slug 跨类型重复不再算错：\n${errorsText}`);
  assert.ok(!errorsText.includes('art:dup'), `art:dup 不应被任何规则报错：\n${errorsText}`);
});
