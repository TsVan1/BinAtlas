# BinAtlas · 二进制安全知识图谱

把二进制安全领域的**技术、工具、概念、对抗手法与生态资源**织成一张可交互的知识图谱，
让逆向工程师在 30 秒内回答三个问题：

1. 这个方向**有哪些**技术和工具？（全景）
2. 我手上这个东西**该按什么顺序**、用什么工具处理？（路径）
3. 我**缺什么**、下一步该学什么？（差距）

> **状态**：设计阶段完成，代码待实现。规范文档已可用于开发。

---

## 为什么不是又一个 Awesome List

Awesome List 能回答"有什么"，但回答不了"怎么串起来"，更回答不了"我还差什么"。

本项目用**图**而不是列表组织知识，核心在**边**而不在节点：

- 每条边必须有理由（`rationale`），说不清为什么连的边不入库
- 工具之间区分 `alternative`（可替代，带迁移代价 `switch_cost`）与 `complements`（互补）
- 技术之间用 `upstream` 表达流水线顺序，据此自动推导分析路径，而不是硬编码流程模板

## 核心特征

| 特征 | 说明 |
| --- | --- |
| **多维分类** | 9 类节点 × 12 类边；领域 / 载体 / 阶段 / 技术族多轴交叉，而非单一目录树 |
| **组合视图** | 交叉矩阵、流水线、交集筛选、并排对比、邻域下钻、演化时间轴 |
| **实时可写** | 只读 Base + 可写 Overlay，内存字段级合并；离线可用，内网可部署 |
| **AI 就绪度** | 每个工具标注 `none / api / plugin / mcp`，回答"哪些环节 AI 还插不进去" |
| **PC 专用** | 高密度三栏布局；hover 富信息、右键菜单、框选、快捷键、命令面板 |
| **数据与代码分离** | 知识全在 `data/*.yaml`，新增一条工具不改任何组件代码 |

## 文档

| 文档 | 内容 |
| --- | --- |
| [03-DATA-SCHEMA.md](03-DATA-SCHEMA.md) | 节点/边规范、22 个工具类目与收录基准、字段判定标准、YAML 示例 |
| [04-LIVE-KNOWLEDGE.md](04-LIVE-KNOWLEDGE.md) | 实时层架构、API 契约、字段级合并、去重算法、SSE 增量推送 |
| [06-MOTION-SPEC.md](06-MOTION-SPEC.md) | 视觉识别系统、14 组语义化动效、性能降级阶梯 |

## 目录结构

```
data/            知识库（YAML，构建期编译为 JSON）
  tools/         按 22 个类目拆分的工具档案
  edges/         关系边（含 rationale）
src/
  views/         六个组合视图
  panels/        分类面板、详情抽屉、命令面板
  graph/         渲染与布局
  live/          实时层：Overlay / 合并 / 去重 / 录入器
  motion/        动效 token 与统一入口
scripts/         构建、校验、统计、折叠
sources/         情报信源注册表
inbox/           采集候选池（隔离区，不写入 data/）
proposals/       待审提案
public/graph/    构建产物
```

## 数据质量红线

1. 每条记录必须有 `source` 与 `verified_at`
2. 不确定的字段写 `unknown`，**严禁编造**版本号、许可证、作者
3. 每条边必须有 `rationale`；`alternative` 必须给出 `switch_cost` 与 `tradeoff`
4. 提交前必须通过 `pnpm validate`

## 快速开始

待实现。实现后预期为：

```bash
pnpm install
pnpm dev        # 本地开发
pnpm validate   # 数据校验
pnpm build      # 构建静态站点
```

## 许可

待定。
