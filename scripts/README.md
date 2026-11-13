# scripts/ · 数据管线

配套规范：`03-DATA-SCHEMA.md`（唯一事实来源）。数据只读，校验器只报错不改数据。

| 命令 | 现状 | 说明 |
| --- | --- | --- |
| `pnpm validate` | ✅ 已实现 | V1–V17 + 4 条 `EXT-*`；任何 error → exit 1 |
| `pnpm test` | ✅ 已实现 | 13 个用例：真实数据 / 5 个坏夹具 / 规则冷门分支 / CLI 退出码 / 只读证明 |
| `pnpm typecheck` | ✅ 已实现 | `tsc --noEmit`，覆盖 `schema/ scripts/ tests/` |
| `pnpm build` | 🟡 部分实现 | 先跑类型检查；图数据构建（`scripts/build-graph.ts`）**未实现**，故默认 **exit 1** 并打印「未实现」。`pnpm build --allow-incomplete` 跳过该步（仅供临时 CI） |

## validate 用法

```bash
pnpm validate                                  # 校验 ./data
pnpm validate --data tests/fixtures/xxx/data    # 校验任意目录（夹具用）
pnpm validate --all-warnings                   # 警告不再按规则截断
pnpm validate --no-ext                         # 只跑 V1–V17，关掉 EXT-*
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
| V17 | error | 出现已废弃字段 `typical_artifacts`（§6.2：矩阵轴只认 `artifacts`）。**规范说「出现即为 error」但没给编号，这里补 V17** |

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

- `tests/validate.test.ts` —— 对 5 个坏夹具断言具体规则、行号、字段路径、退出码
- `tests/rules.test.ts` —— 在 `os.tmpdir()` 造一棵临时 `data/`，一次性触发 V2/V4–V16 的冷门分支；跑完即删
- `tests/fixtures/` —— 故意坏掉的样例，见其中的 README
