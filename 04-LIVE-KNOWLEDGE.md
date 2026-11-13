# BinAtlas · 实时知识层与接口设计

> 解决一个根本矛盾：**知识要能随时长，但站点必须是静态的、能离线跑的。**
> 答案不是把前端变成后端项目，而是**双源合并**：只读 Base + 可写 Overlay，在内存里合成。
> 配套：`03-DATA-SCHEMA.md`（字段规范）。

---

## 1. 要解决的具体问题

| 场景 | 静态架构的失败方式 |
| --- | --- |
| 分析师今天发现一个新工具 | 只能记在笔记里，等下次发版；或者干脆放弃记录 |
| 团队三人各自发现，各记一份 | 三条重复数据，半年后谁也说不清哪个是权威 |
| 发现现有条目写错了 | 要改 YAML、跑构建、发版，成本高到没人愿意改 |
| 需要"刚出的 CVE 用的什么技术" | 查不到，因为库是上周的快照 |

**目标（全部可验收）**：
- R1 从"想到"到"图上可见" ≤ 30 秒，不需要构建、不需要发版
- R2 离线时至少能本地录入，联网后自动同步
- R3 多标签页 / 多用户实时看到彼此的变更
- R4 任何写入都不直接污染知识库——必须经过提案与审核
- R5 已有 1500 节点的性能预算不被破坏（增量渲染，不整图重排）

---

## 2. 双源架构

```
┌─────────────────────────────────────────────────────────┐
│ BASE 层（构建期产物，只读，随版本发布）                    │
│   data/**.yaml ──build──▶ public/graph/{nodes,edges}.json│
│   带 baseRev（内容哈希），变更需发版                       │
└────────────────────────┬────────────────────────────────┘
                         │  merge（Web Worker 内）
┌────────────────────────┴────────────────────────────────┐
│ OVERLAY 层（运行时可变）                                  │
│   L0: IndexedDB（本地，离线可用）                          │
│   L1: 本地 SQLite/内存（单机多窗口，可选）                 │
│   L2: 远端服务（团队，可选）                               │
│   存的是 Mutation 序列，不是完整图                         │
└────────────────────────┬────────────────────────────────┘
                         ▼
              MERGED GRAPH（内存，只读视图）
              节点数 / 边数 / rev 写入状态栏
```

### 2.1 合并规则（必须精确，否则会出现幽灵数据）

| 情况 | 规则 |
| --- | --- |
| Overlay 新增 ID | 追加到 merged |
| Overlay 修改已有 ID | **字段级合并**，overlay 的字段覆盖 base 同名字段，其余保留 |
| Overlay 删除 | 写 `_tombstone: true`，合并时过滤；**不物理删除**（可回溯、可撤销） |
| 同一字段被多个 Overlay 变更 | 按 `appliedAt` 后写胜出，但保留 `_history[]` |
| `id` / `kind` 被修改 | **禁止**。改这两项等于删旧建新，必须走 delete + create，并保留 `_supersededBy` |

**为什么用 Mutation 序列而不是存整条记录**：存整条会导致"我在手机改字段 A、在 PC 改字段 B，最后互相覆盖"。存操作序列 + 字段级合并才能保住两边。

### 2.2 rev 与一致性

- `baseRev` = base JSON 的内容哈希（前 12 位），发版才变
- `overlayRev` = overlay 内 mutation 数量的单调计数
- 客户端上报 `baseRev` 与 `overlayRev`，服务端 `baseRev` 不匹配 → 返回 **409 `BASE_STALE`**，前端提示"知识库已更新，请刷新后重试"（不自动合并，避免静默错乱）

---

## 3. 三种部署形态（按需选，不强制全上）

### L0 · 纯本地录入（零后端，**必做**）

- 存储：IndexedDB（`idb` 库，不用 localStorage——5MB 上限 + 同步阻塞）
- 表：`mutations`（按 id 索引）、`meta`（rev、schema 版本）
- 能力：录入/编辑/删除/撤销/导入导出
- 导出：`JSON Patch`（RFC 6902）或 YAML 补丁，可提 PR 回流 base
- **这是 MVP 就能交付的，不依赖任何服务端**

### L1 · 本地服务（单机多窗口同步，可选）

- 一个 200 行的 Node/Hono 服务 + SQLite，`docker run` 起
- 提供 SSE，多标签页实时同步
- 用途：一个人开三个窗口对照看，或本地演示

### L2 · 团队服务（内网部署，可选）

- 同一套 API + 鉴权 + 角色 + 审计日志
- 角色：`viewer`（只读）/ `contributor`（提提案）/ `curator`（审提案）/ `admin`
- 用途：安全团队共享知识库；采集 Agent 也往这里写

> **三者共用同一套 API 契约**（见第 5 节）。L0 是"把 API 在本地实现了一遍"，
> 所以从 L0 升到 L2 不需要改前端，只换实现层。这是这套设计最重要的可演进性。

---

## 4. 核心数据模型

```ts
// 一次变更 = 一条不可变的 Mutation 记录
type MutationOp =
  | 'node.create' | 'node.patch' | 'node.delete'
  | 'edge.create' | 'edge.patch' | 'edge.delete';

interface Mutation {
  id: string;                 // mut_<ULID>，客户端生成，天然可排序
  op: MutationOp;
  target: string | null;      // create 时为 null，apply 后回填
  kind?: NodeKind;            // create 时必填
  payload: JsonPatch | Record<string, unknown>;
  idempotencyKey: string;     // 客户端生成；重复提交返回同一条，不重复应用
  baseRev: string;            // 提交者当时看到的 base 版本
  evidence: {
    sources: string[];        // 必填 ≥1，https only
    rationale: string;        // 必填 ≥15 字：为什么这条值得入库
    capturedAt: string;       // 证据抓取时间 ISO
    excerpt?: string;         // 原文摘录 ≤500 字
  };
  author: { id: string; name: string; kind: 'human' | 'agent' };
  createdAt: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'applied' | 'superseded';
  review?: {
    by: string; at: string;
    decision: 'approve' | 'reject' | 'request-changes';
    note: string;
    score?: number;           // 0-100，见 05 文档
  };
  appliedAt?: string;
}
```

**为什么 payload 用 JSON Patch（RFC 6902）**：能精确表达"只把 `latest_version` 改成 `unknown`"
而不覆盖整条记录；冲突检测到字段级；且是可标准化的操作语义。对 `node.create` 用完整对象，
对 `node.patch` 用 patch 数组。

### 4.1 为什么必须有 `idempotencyKey`

采集 Agent 会因网络重试重复提交同一条；用户会连点两次保存。
没有幂等键 → 库里出现两条一模一样的工具。**服务端按 `idempotencyKey` 去重，返回首次结果（200 而非 201）。**

### 4.2 状态机（不可跳步）

```
draft ──submit──▶ pending ──approve──▶ approved ──apply──▶ applied
                     │                                        │
                     └──reject──▶ rejected                    │
                                                              │
applied + 新变更 ──────────────────────────────────▶ superseded
```

`approved` 与 `applied` 分开的原因：批准是"内容合格"，应用是"真的写进 overlay"。
中间可能因为 base 冲突而失败，需要重试队列。

---

## 5. API 契约

### 5.1 端点总表

| 方法 | 路径 | 作用 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/api/v1/meta` | 返回 `baseRev / overlayRev / counts / schemaVersion` | viewer |
| `GET` | `/api/v1/graph?since=<rev>` | 全量或增量拉图 | viewer |
| `GET` | `/api/v1/mutations?status=pending&limit=50` | 审核队列 | curator |
| `POST` | `/api/v1/mutations` | 提交变更（含幂等键） | contributor |
| `POST` | `/api/v1/mutations/{id}/review` | 批准/驳回 | curator |
| `POST` | `/api/v1/mutations/{id}/revert` | 撤销已应用的变更（生成反向 mutation） | contributor+ |
| `POST` | `/api/v1/duplicates/check` | 去重预检（录入器边打字边调） | any |
| `GET` | `/api/v1/stream` | SSE 变更流 | viewer |
| `POST` | `/api/v1/import` | 批量导入（YAML/JSON Patch） | curator |

### 5.2 提交变更

```http
POST /api/v1/mutations
Authorization: Bearer <token>
Idempotency-Key: 01JBX9K2Q7F3M8N4P6R1S5T0V
Content-Type: application/json

{
  "op": "node.create",
  "kind": "tool",
  "baseRev": "a1b2c3d4e5f6",
  "payload": {
    "id": "tool:binwalk-v3",
    "name": "binwalk v3",
    "category": "firmware",
    "domain": ["dom:firmware"],
    "artifacts": ["art:firmware-image"],
    "license": "oss",
    "platforms": ["linux", "mac"],
    "oss": true,
    "learning_curve": 2,
    "maintain_status": "active",
    "first_release": 2024,
    "latest_version": "unknown",
    "url": "https://github.com/ReFirmLabs/binwalk",
    "source": ["https://github.com/ReFirmLabs/binwalk/releases"],
    "verified_at": "2026-11-13",
    "headless": "yes",
    "ai_ready": "none",
    "tldr": "Rust 重写的新一代固件提取工具，大幅提升对大固件的扫描速度与稳定性，适合替代旧版 Python binwalk 处理数 GB 级镜像；短板是插件生态与签名库仍在补齐中。"
  },
  "evidence": {
    "sources": ["https://github.com/ReFirmLabs/binwalk/releases"],
    "rationale": "官方仓库已发布 Rust 版本，与库中旧版 binwalk 条目需要区分或合并",
    "capturedAt": "2026-11-13T09:20:00Z",
    "excerpt": "binwalk v3 is a Rust rewrite of the original project..."
  }
}
```

**201 Created**
```json
{
  "id": "mut_01JBXABCDEF",
  "status": "pending",
  "target": "tool:binwalk-v3",
  "reviewQueuePosition": 3
}
```

**409 Conflict（重复）**
```json
{
  "error": "DUPLICATE_SUSPECTED",
  "candidates": [
    { "id": "tool:binwalk", "name": "binwalk", "similarity": 0.91,
      "suggestedAction": "merge", "reason": "name_normalized_equal" }
  ]
}
```

**409 Conflict（base 过期）**
```json
{ "error": "BASE_STALE", "yourBaseRev": "a1b2c3d4e5f6", "currentBaseRev": "f9e8d7c6b5a4" }
```

### 5.3 增量拉图

```http
GET /api/v1/graph?since=r_10220
```
```json
{
  "rev": "r_10231",
  "nodes": [ { "id": "tool:binwalk-v3", "...": "...", "_origin": "overlay" } ],
  "edges": [],
  "deleted": ["tool:binwalk-old"],
  "hasMore": false
}
```

### 5.4 SSE 变更流

```http
GET /api/v1/stream
Accept: text/event-stream
```
```
event: graph.rev
data: {"rev":"r_10231","changed":["tool:binwalk-v3"],"deleted":[],"by":"collector"}

event: review.required
data: {"pending":3}

: keep-alive   （每 15s 一行注释，防代理断连）
```

**为什么用 SSE 而不是 WebSocket**：变更推送是单向的，SSE 自带重连与 `Last-Event-ID` 断点续传，
穿企业代理更稳，实现成本低一个数量级。写操作走普通 POST 即可。

客户端收到 `graph.rev` 后：拉增量 → 合并 → **只重绘受影响节点**（见 8.2）。

---

## 6. 冲突解决

### 6.1 版本冲突（并发编辑同一字段）

`baseRev` 不匹配 → 409，前端展示**三方对比**：

```
        基准(base)          对方(theirs)        你(mine)
license  oss                 commercial          oss
tldr     旧描述              新描述               你的新描述     ← 冲突，逐字段选
```

用户逐字段选择或"全部用我的/对方的"。合并结果重新提交，`baseRev` 更新为当前值。

### 6.2 语义冲突（A 删了 B 又改）

- 节点已 `_tombstone` 时收到 `node.patch` → 返回 `410 GONE`，前端提示"该条目已被删除"，给"重新创建"入口
- 边引用已删除节点 → 合并阶段标记为 `_dangling`，UI 上显示为虚线灰边 + 提示，不静默丢弃

---

## 7. 去重算法（入库前**必跑**，否则三个月就烂）

### 7.1 归一化

```ts
normalizeName(s) = s.toLowerCase()
  .replace(/[\s\-_.]/g, '')          // ida-pro / IDA Pro / ida_pro → idapro
  .replace(/[^\p{L}\p{N}]/gu, '');

normalizeUrl(u) = u.toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .replace(/\/+$/, '')
  .replace(/\.git$/, '');
```

### 7.2 相似度判据（按优先级短路）

| 序 | 判据 | 相似度 | 动作 |
| --- | --- | --- | --- |
| 1 | `id` 完全相同 | 1.00 | 拒绝，提示直接 patch |
| 2 | `normalizeName` 相同 | 0.95 | 建议 merge |
| 3 | `aliases` 命中对方 name 或 alias | 0.90 | 建议 link-alias（合并别名到已有条目） |
| 4 | `normalizeUrl` 相同（官网或仓库） | 0.88 | 建议 merge（同名工具不同名） |
| 5 | 名称 trigram 相似度 ≥ 0.75 | 0.75-0.87 | 提示人工判断 |
| 6 | 同 category + 同 domain + tldr 余弦 ≥ 0.8 | 0.60 | 只警告，不阻断 |

**系统不强判**，只给三选一：`merge`（合并字段）/ `link-alias`（加别名指向已有）/ `create-anyway`（确实不同，如 binwalk v2 与 v3）。

### 7.3 性能

1500 节点全量比对是 O(n)，单次 < 5ms（预建 trigram 倒排索引）。录入器输入时防抖 200ms 调用。

---

## 8. 实时渲染

### 8.1 不能做什么

**绝不整图重排**。新增一个节点就重跑力导向布局，会导致全图跳动——这在专业工具里是致命体验问题
（用户正在追踪某条路径，图突然重排，视线丢失）。

### 8.2 增量策略

| 变更 | 渲染行为 |
| --- | --- |
| 新增节点 | 在**最近邻域质心**位置"生长"出来（见 06 文档动效 G4），其余节点仅做 120ms 的轻微位移 |
| 修改字段 | 不重排，只更新该节点视觉属性（颜色/大小/角标），并让受影响视图（矩阵/详情）局部刷新 |
| 删除 | 淡出 + 邻居弹簧回位 320ms |
| 新增边 | 从 from 到 to 描线生长 400ms |

### 8.3 索引更新

MiniSearch 索引是增量的：`addAsync` / `removeAsync`，不重建。
筛选索引（facet 计数）用差分更新：只重算受影响维度的计数。

---

## 9. 前端录入器（"30 秒"的门面）

`Cmd/Ctrl + Shift + N` 唤起。**设计目标：从想到到入库 ≤30 秒，不能超过 5 次交互。**

```
┌─ 快速收录 ─────────────────────────────────────────────┐
│ ① 名称或 URL  [ binwalk v3                        ]  │
│    ⚠ 已有相似条目：binwalk（相似 91%）→ [合并] [作为别名] │
│                                                        │
│ ② 类型  ( ) 领域 (•) 技术 ( ) 工具 ( ) 概念 ( ) 手法     │
│                                                        │
│ ③ 证据链接  [ https://github.com/ReFirmLabs/binwalk ]  │  ← 必填
│    已抓取：binwalk v3 is a Rust rewrite…  [查看原文]     │
│                                                        │
│ ④ 一句话说清它是什么                                      │
│    [ Rust 重写的固件提取工具，扫描数 GB 镜像比旧版快…   ] │
│                                                        │
│ ⑤ 关系（可跳过，稍后由系统建议）                         │
│    [ + 连到… ]                                          │
│                                    [取消]  [收录 ⌘⏎]    │
└────────────────────────────────────────────────────────┘
```

**关键交互决策**

| 决策 | 理由 |
| --- | --- |
| 粘贴 URL 自动抓元信息预填 | 省掉 60% 打字。抓取走服务端代理（避免 CORS + 防 SSRF） |
| 边打字边去重 | 在用户投入填写成本**之前**就拦住重复，而不是提交后才报错 |
| 证据链接必填 | 没有来源的知识等于谣言。这是数据质量的唯一硬闸门 |
| 关系可跳过 | 降低录入摩擦；关系由后台异步建议，不阻塞 |
| 仅 5 个字段 | 完整 schema 有 20 个字段，录入时只问必需的，其余由 Agent 补全 |
| 保存后节点"飞入"图 | 即时正反馈，让用户确认"真的进去了" |
| Toast 5 秒可撤销 | 录错不用去翻列表，撤销 = 生成反向 mutation |

---

## 10. 审核策略（配置化，三种模式）

| 模式 | 规则 | 适用 |
| --- | --- | --- |
| `solo` | 全部自动 approve + apply | 个人自用，信任自己 |
| `team` | 高信任源（T1 官方仓库/release）自动；其余 pending | 小团队 |
| `strict` | 全部人工审核 | 对外发布的知识库 |

配置在 `binatlas.config.json`：
```json
{
  "review": {
    "mode": "team",
    "autoApprove": { "sources": ["github.com", "nvd.nist.gov"], "minScore": 70 },
    "dailyProposalCap": 20,
    "duplicateThreshold": 0.88
  }
}
```

---

## 11. 安全（这一节的每一条都是真实攻击面）

| 风险 | 防护 |
| --- | --- |
| **SSRF**（录入时抓 URL，可打内网） | 服务端抓取必须：白名单协议 `https`、DNS 解析后拒绝私有网段（10/8、172.16/12、192.168/16、127/8、169.254/16、::1、fc00::/7）、禁跟随 >3 次跳转、5s 超时、2MB 响应上限 |
| **Prompt Injection**（采集的网页里藏"忽略之前指令"） | **抓取内容永远只作为数据字段，绝不进入任何 Agent 的 system/user 指令位置**；Agent 处理候选时用结构化 JSON 输入，正文放在 `excerpt` 字段并用明确分隔符包裹 |
| **存储炸弹** | 单字段长度上限（`tldr` ≤1000、`excerpt` ≤500、`sources` ≤5）；单 mutation ≤64KB；每日提案上限 |
| **XSS**（tldr 里塞 `<img onerror>`） | 渲染层全部走 React 文本节点，禁用 `dangerouslySetInnerHTML`；导出 Markdown 时转义 |
| **越权写入** | `contributor` 只能创建 status=pending；只有 `curator` 能 approve；`id`/`kind` 变更需 `admin` |
| **审计缺失** | Mutation 表 append-only，不提供物理删除接口；`revert` 生成反向记录而非删除原记录 |
| **限流** | 单用户 60 次/分钟；单 IP 300 次/分钟；超限 429 + `Retry-After` |

---

## 12. Overlay 压缩回 Base（否则会无限膨胀）

Overlay 是**暂存区**，不是最终存储。

```
每周/每版本：
  approved + applied 的 mutation
    → pnpm compact
    → 折叠成 data/**.yaml 的最终形态（字段级合并、去重、重排）
    → 进 base，发版
    → overlay 清空，并记录 compactedUpTo: r_10231
```

**必须保留**：`_history`（谁在什么时候改了什么）导出到 `data/_audit/YYYY-MM.jsonl`，
保证知识库可追溯——这对安全领域的知识库是刚需，不是可选项。

---

## 13. 实现清单（给 A6 / 新 Agent 的任务）

| # | 任务 | 验收 |
| --- | --- | --- |
| L1 | `src/live/overlay.ts`：IndexedDB 增删查 + rev 管理 | 刷新不丢；10k mutation 下查询 <20ms |
| L2 | `src/live/merge.ts`：字段级合并 + tombstone + dangling 处理 | 单测覆盖 8 种合并组合 |
| L3 | `src/live/dedupe.ts`：归一化 + trigram 索引 + 相似度 | 20 组正负样本，准确率 ≥90% |
| L4 | `src/live/api.ts`：L0/L1/L2 三实现共用接口 | 切换实现不改调用方 |
| L5 | `src/panels/QuickCapture.tsx`：30 秒录入器 | 实测 5 次交互内完成录入 |
| L6 | `src/live/review.ts`：审核队列 UI + 三方 diff | 冲突场景可逐字段选择 |
| L7 | `scripts/compact.ts`：overlay → base 折叠 | 折叠后 base 与直接编辑等价（diff 为空） |
| L8 | 服务端（可选）：Hono + SQLite + SSE | 多标签页 200ms 内同步 |

---

## 14. 一句话记住

> 实时不等于随便写。
> **Overlay 让人能随时记，Proposal 让库不至于烂，compact 让它能活过一年。**
> 三者缺一，这个知识库都会在三个月内失去可信度。
