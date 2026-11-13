# scripts/ · 数据管线

配套规范：`03-DATA-SCHEMA.md`（唯一事实来源）。数据只读，校验器只报错不改数据。

| 命令 | 现状 | 说明 |
| --- | --- | --- |
| `pnpm validate` | ✅ 已实现 | V1–V21 + 4 条 `EXT-*`；任何 error → exit 1 |
| `pnpm build` | ✅ 已实现 | **CI 入口**：类型检查 → 数据校验（同一套 Zod）→ 图数据 4 份 JSON；全部成功才 exit 0 |
| `pnpm build:graph` | ✅ 已实现 | 只跑图数据构建：`data/**/*.yaml` → `public/graph/{nodes,edges,index,meta}.json` |
| `pnpm stats` | ✅ 已实现 | 覆盖率报告：`reports/coverage.json`（机器读）+ `reports/coverage.md`（人读） |
| `pnpm test` | ✅ 已实现 | 23 个用例：真实数据 / 9 个坏夹具 / 规则冷门分支 / CLI 退出码 / 只读证明 / 图数据契约 / 空数据 / 统计 NaN |
| `pnpm typecheck` | ✅ 已实现 | `tsc --noEmit`，覆盖 `schema/ scripts/ tests/` |

## build 用法（CI 用这一条）

```bash
pnpm build                       # = 类型检查 + 数据校验 + 图数据构建
pnpm build -- --out dist/graph   # 额外参数透传给 build-graph
```

`pnpm build` 内部三步，任一步失败即 exit 1：

1. `tsc --noEmit -p tsconfig.json`（含 `schema/ scripts/ tests/`）
2. `scripts/build-graph.ts`：先跑与 `pnpm validate` **完全同一套** 校验函数与 Zod 定义，
   有 error 直接 exit 1，**一个 JSON 都不写**（宁可没有产物，也不产出坏 JSON）
3. 打印 4 个产物的大小与条数

## build-graph 用法与产物契约

```bash
pnpm build:graph                        # data/ → public/graph/
pnpm build:graph --data tests/fixtures/xxx/data --out /tmp/g   # 任意目录
```

退出码：`0` 成功 · `1` 校验/编译失败（不产出任何 JSON）· `2` 用法错误。

| 产物 | 内容 | 字段 |
| --- | --- | --- |
| `nodes.json` | 全部节点（紧凑 JSON） | `id / kind / name / def / domain[] / artifacts[] / platforms[]` + 可选 `category? / difficulty? / ai_ready? / maintain_status? / license? / importance?` |
| `edges.json` | 全部边（紧凑 JSON） | `from / to / kind / rationale` + 可选 `weight?` |
| `index.json` | MiniSearch 索引（紧凑 JSON） | `id / name / aliases[] / kind / tldr`（摘要 ≤80 字） |
| `meta.json` | 构建元信息（2 空格缩进） | `builtAt / schemaVersion / counts{domain,technique,artifact,tool,edge} / warnings[]` |

三条容易踩的约定，改动前先看：

- **`def` 是统一描述字段**。§2.3 的 `tool` 没有 `def`（长描述在 `tldr`），构建层做回落：
  `def = def ?? tldr`。所以工具节点的 `def` 是 tldr 全文，`index.json` 里的 `tldr` 才是 ≤80 字摘要。
- **`difficulty` 是跨类型归并值**：`domain → entry_difficulty`、`tool → learning_curve`、
  `technique/concept/attack → difficulty`。三者都是 1–5（§4.3），但语义不同，UI 别当同一把尺子比较。
- **`domain[]` 对 `domain` 节点是自引用**（`[自己的 id]`），这样「按领域筛图」不必对领域节点特判；
  工具/技术可属多个领域，故各领域工具数之和会大于工具总数。

`meta.counts` 只统计契约里的 5 类；将来出现 `concept/format/attack/ecosystem/ai` 节点时，
它们仍在 `nodes.json` 里，但会计入 `meta.warnings` 提示「未覆盖类型」，需要先扩展契约。

**空数据是合法状态**：`data/edges/` 为空时 `edges.json` 输出 `[]`，并在 `meta.warnings[]` 里写明；
`data/` 一条 YAML 都没有也不会崩，同样在 `warnings[]` 里注明。

## stats 用法与报告内容

```bash
pnpm stats                        # data/ → reports/coverage.{json,md}
pnpm stats --out /tmp/reports     # 换输出目录
```

先过校验门：有 error 就不出报告（坏数据算出来的覆盖率比没有更危险）。

报告内容：

- 各领域工具数 / 技术数 / 载体数 + §4.4 门槛判定（`<5` 工具、`<5` 技术、矩阵 `<30%` 逐项标出）
- **技术 × 载体 kind 组合覆盖矩阵**：15 行技术 × 12 列 `ARTIFACT_KINDS`，`·` = 0 覆盖；
  `coverage.json` 的 `matrix.zeroCells` 给出完整清单
- `unverified` 占比（≤15%）、`tldr` 不足 40 字占比（<10%）、`source` / `verified_at` 缺失数
- `maintain_status: abandoned / stale` 清单
- `ai_ready` 分布（mcp / api / plugin / none）
- 所有门槛集中在 `scripts/lib/stats.ts` 的 `THRESHOLDS`，改验收口径只改这一处

> 分母为 0 的比例在 JSON 里写 `null`、在 Markdown 里写「—」，不写 `0` ——
> 「没有数据」和「达标」必须能区分，否则 `tldr` 会在工具数为 0 时假装满分。

## validate 用法

```bash
pnpm validate                                  # 校验 ./data
pnpm validate --data tests/fixtures/xxx/data    # 校验任意目录（夹具用）
pnpm validate --all-warnings                   # 警告不再按规则截断
pnpm validate --no-ext                         # 只跑 V1–V21，关掉 EXT-*
pnpm validate --downgrade V17,V12              # 把指定规则的 error 降级为 warning（应急）
pnpm validate --today 2030-01-01               # 覆盖 V12 的「今天」
```

退出码：`0` 无 error（warning 不阻断）· `1` 有 error · `2` 用法错误。

## 输出格式

```
[V4] data/edges/relations.yaml:2 · edge[1].rationale · 期望非空且 ≥15 字 · 实际 缺失（undefined）
```

四段式 `文件:行号 · 字段路径 · 期望X · 实际 Y`，行首方括号是规则编号。
行号来自 YAML AST（`yaml` 的 `LineCounter`），字段缺失时退化到最近的祖先节点，
所以「缺 source」指到的是该节点起始行，而「coverage 写错」指到的是 `coverage:` 那一行。

## 规则 → 实现

| 规则 | 级别 | 实现要点 |
| --- | --- | --- |
| V1 | error | YAML 语法（`yaml` 解析错误）+ Zod（`schema/nodes.ts` / `schema/edges.ts`） |
| V2 | error | `{prefix}:{slug}` 正则、前缀↔类型对应（§1 对照表）、**ID 字符串全局唯一**；slug 允许跨类型重复（`tool:upx` 与 `art:upx` 无歧义） |
| V3 | error | 边的 `from`/`to` 必须在节点库中 |
| V4 | error | `rationale` 非空且 ≥15 字（去掉空白后的码点数） |
| V5 | error | `alternative` 必须有 `switch_cost` + `tradeoff` |
| V6 | error | `supersedes` 必须有 `since` + `reason` |
| V7 | error | `upstream` 必须有 `order`（数字） |
| V8 | error | `tool.tldr` ≥40 字 |
| V9 | error | `tool`/`ai`/`ecosystem` 的 `source` 非空（§4.5） |
| V16 | error | 同上三类的 `verified_at` 必填（§4.5 / §6 V16）。与 V9 成对：V9 管 `source` 非空，V16 管 `verified_at` 存在 |
| V10 | error | 环检测：`prerequisite` 边 + `technique.prerequisites` 合并成图后 DFS 找环 |
| V11 | warning | 非 `domain` 节点**既没有边、也没被任何节点字段整串引用**才算孤立（§6 改判：载体靠 `artifacts` 字段被引用，不是靠边）。只认整串匹配，`note` 散文里提到的 ID 不算 |
| V12 | warning | `verified_at` 早于「今天 - 18 个月」 |
| V13 | warning | `unverified: true` 占全部节点比例 > 15% |
| V14 | warning | 某 `domain` 的工具数 < 5，并输出覆盖度表 |
| V15 | error | `first_release` 晚于 `verified_at` 的年份 |
| V17 | error | 出现已废弃字段 `typical_artifacts`（§6.2：矩阵轴只认 `artifacts`） |
| V18 | error | `detail` 存在时去空白后 ≤400 字（`charCount` 口径：中文标点算 1 字，§6.1①）。非字符串也报，避免类型错绕过长度检查 |
| V19 | error | `principle` 存在时去空白后 ≤300 字；**恰好 300 字必须通过**（用 `>` 判超限，不是 `>=`） |
| V20 | error | `procedure` 存在时必须是数组、3–8 项；每项非空字符串；同一节点内 **trim 后整串相同**即重复。条数、空项、重复项各出一条 finding，定位到 `procedure[i]` |
| V21 | warning | 只检查 `technique`：缺 `detail` / `principle` / `procedure` 任一即报（一条技术只报一条，actual 列全缺口）。`domain` / `tool` / `artifact` 不要求这三个字段。空串 / 空数组视为「没写」 |

## EXT-*（规范未覆盖、校验器额外做的检查，可用 `--no-ext` 全部关闭）

| 规则 | 级别 | 为什么加 |
| --- | --- | --- |
| `EXT-REF` | warning | 节点字段（`domain` / `artifacts` / `prerequisites` / `parsers` …）里出现的 ID 是否存在。悬空引用会让视图静默丢内容，但 §6 只要求查边的引用 |
| `EXT-LEN` | warning | §2.1 / §2.2 / §2.5 写了 `name` ≤16（载体 ≤20）字、`def` ≤120 字，§6 没有对应规则 |
| `EXT-COVERAGE` | warning | `coverage` 与 §4.4 的标准自相矛盾（`full` 但工具/技术 <5；`stub` 但内容 >2） |
| `EXT-DIR` | warning | §3 语义表里方向写得最死的 5 种边：`uses`(tech→tool)、`detects`(tool→atk)、`teaches`(eco→tech)、`applies_to`(→art)、`bypasses`(atk→)。**本轮保持 warning**：等 A3 产出第一批边再定是否升 error |

## 文件布局约定（§6.2）

| 路径 | 内容 |
| --- | --- |
| `data/domains.yaml` | 领域（单文件） |
| `data/techniques.yaml` | 技术（单文件） |
| `data/artifacts.yaml` | 载体（单文件） |
| `data/tools/*.yaml` | 工具，按 22 类目拆 |
| `data/edges/*.yaml` | 边，按 relation / technique-tool / misc 拆 |
| `data/_audit/*.jsonl` | 审计日志（`_` 前缀 → 跳过，不参与校验） |

校验器对 §6.2 未列出的类型（`concept` / `format` / `attack` / `ecosystem` / `ai`）仍接受
`data/<类型复数>.yaml` 或 `data/<类型复数>/<任意名>.yaml` 两种写法；
`_` 或 `.` 开头的文件/目录一律跳过；空目录（`data/edges/`、`data/tools/`）不是错误，输出里标「空目录，跳过」。

## 加测试

- `tests/validate.test.ts` —— 对 9 个坏夹具断言具体规则、行号、字段路径、退出码；真实数据只断言**结构性不变量**（0 error / 只读 / 统计自洽），不写死条数 —— `data/` 由 A1/A2/A3 并行扩写，写死 37 这类数字会让 CI 每逢数据提交就红。V21 例外：真实数据允许出现 V21（`data/techniques.yaml` 的 5 条 P-1 试点技术尚未补三个字段），但断言它只落在 `technique` 上
- `tests/rules.test.ts` —— 在 `os.tmpdir()` 造一棵临时 `data/`，一次性触发 V2/V4–V16 的冷门分支；跑完即删
- `tests/build.test.ts` —— 图数据 4 份产物的契约（字段齐、条数自洽、摘要 ≤80 字、id 唯一、tool.def 回落）、空数据不崩、统计不产生 NaN、坏数据 exit 1 且不留产物
- `tests/fixtures/` —— 故意坏掉的样例，见其中的 README
