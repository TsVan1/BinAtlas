# 测试夹具（故意坏掉的样例）

这里的 YAML **故意不符合** `03-DATA-SCHEMA.md`，用于证明 `pnpm validate` 能准确抓住问题。
请勿「修好」它们，也勿把它们复制进 `data/`。

| 目录 | 故意制造的问题 | 期望被哪条规则抓住 |
| --- | --- | --- |
| `edge-missing-rationale/` | `complements` 边缺 `rationale` | V4 |
| `edge-dangling-from/` | 边的 `from` 指向不存在的节点 | V3 |
| `tool-missing-required/` | `tool` 缺 `license` 与 `platforms` | V1 |
| `line-precision/` | `coverage: fullish`（非法枚举，位于第 9 行） | V1（验证行号精确） |
| `deprecated-field/` | 同时写了 `artifacts` 与已废弃的 `typical_artifacts` | V17 |
| `detail-too-long/` | `detail` 去空白后 401 字（上限 400）；同目录另有一条正好 400 字的合法技术（边界必须通过） | V18 |
| `principle-too-long/` | `principle` 去空白后 301 字（上限 300） | V19 |
| `procedure-bad/` | 三条技术分别踩：条数 2 条 / 含纯空白项 / 第 4 项与第 1 项重复；另有一条相似但不相同的步骤（不应判重） | V20（3 条） |
| `technique-missing-fields/` | `technique` 缺 `detail` / `principle` / `procedure` 三个字段 | V21（warning，exit 0） |

每个夹具都是独立的 `data/` 根目录，用 `pnpm validate --data tests/fixtures/<目录>/data` 单独跑。
