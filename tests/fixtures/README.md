# 测试夹具（故意坏掉的样例）

这里的 YAML **故意不符合** `03-DATA-SCHEMA.md`，用于证明 `pnpm validate` 能准确抓住问题。
请勿「修好」它们，也勿把它们复制进 `data/`。

| 目录 | 故意制造的问题 | 期望被哪条规则抓住 |
| --- | --- | --- |
| `edge-missing-rationale/` | `complements` 边缺 `rationale` | V4 |
| `edge-dangling-from/` | 边的 `from` 指向不存在的节点 | V3 |
| `tool-missing-required/` | `tool` 缺 `license` 与 `platforms` | V1 |
| `line-precision/` | `coverage: fullish`（非法枚举，位于第 9 行） | V1（验证行号精确） |

每个夹具都是独立的 `data/` 根目录，用 `pnpm validate --data tests/fixtures/<目录>/data` 单独跑。
