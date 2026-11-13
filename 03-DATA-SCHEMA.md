# BinAtlas · 数据规范（Data Schema）

> A1/A2/A3 照此产出数据，A6 照此写校验器。
> **本文件是唯一事实来源**：字段含义有歧义时以本文件为准，不以任何 Agent 的判断为准。

---

## 1. ID 规范

```
{prefix}:{slug}
tool:ida-pro          tech:symbolic-execution      art:elf64
dom:firmware          con:pe-tls-callback         fmt:mach-o
atk:anti-debug-ptrace eco:pwn-college             ai:ida-pro-mcp
```

| 规则 | 说明 |
| --- | --- |
| `prefix` | 只能是 9 个之一，见第 2 节 |
| `slug` | 全小写、kebab-case、仅 `[a-z0-9-]`；不用版本号（`tool:ida-pro` 不是 `tool:ida-9`） |
| **稳定不可变** | ID 一旦入库不得改名（边靠它引用）。改名等于删旧建新 + 重连边 |
| 唯一性 | 全局唯一（跨类型也不允许重名） |
| 别名 | 放在 `aliases[]`，不进 ID |

---

## 2. 节点类型

### 2.1 `domain` — 领域方向

```yaml
- id: dom:firmware
  name: 固件与嵌入式安全
  name_en: Firmware & Embedded Security
  def: 研究路由器、摄像头、IoT 设备、UEFI 等固件镜像的提取、解包、仿真与漏洞挖掘，核心难点是异构架构与无源码环境。
  typical_artifacts: [art:firmware-image, art:elf32-mips, art:uefi-bios]
  entry_difficulty: 4
  coverage: full          # full | partial | stub
  note: 仿真成功率受外设依赖影响，是当前主要瓶颈
```

| 字段 | 类型 | 必填 | 规范 |
| --- | --- | --- | --- |
| `name` | string | ✅ | 中文，≤16 字 |
| `name_en` | string | ✅ | 英文标准叫法 |
| `def` | string | ✅ | ≤120 字，必须说清**研究什么 + 核心难点**，禁止百科式空话 |
| `typical_artifacts` | string[] | ✅ | 引用 `art:` |
| `entry_difficulty` | 1-5 | ✅ | 见 4.3 |
| `coverage` | enum | ✅ | `full`=工具与技术都充分 / `partial`=某个维度缺失 / `stub`=仅占位 |

---

### 2.2 `technique` — 技术/方法

```yaml
- id: tech:symbolic-execution
  name: 符号执行
  name_en: Symbolic Execution
  domain: [dom:program-analysis, dom:vuln-research]
  def: 把输入符号化后沿路径求解约束，自动找出触发特定分支的输入，适合绕过复杂校验和自动生成 PoC。
  difficulty: 5
  prerequisites: [con:constraint-satisfiability, tech:disassembly]
  typical_artifacts: [art:elf64, art:pe64, art:firmware-image]
  outputs: [可达路径集合, 触发输入的输入约束, 崩溃 PoC]
  cost: high              # low | medium | high —— 单次分析的时间/算力成本
  false_positive_risk: low # low | medium | high —— 结论的可信度
```

**关键**：`outputs` 决定流水线能否串起来——上游的 outputs 必须能对上下游的输入。A3 据此判断能不能连 `upstream`。

---

### 2.3 `tool` — 工具

```yaml
- id: tool:ghidra
  name: Ghidra
  aliases: [Ghidra SRE, NSA Ghidra]
  category: disassembler         # 见第 5 节 22 类目
  domain: [dom:re-fundamentals, dom:malware-analysis, dom:firmware]
  artifacts: [art:pe32, art:pe64, art:elf32, art:elf64, art:mach-o, art:firmware-image]
  license: oss                   # oss | commercial | freeware | mixed | unknown
  pricing: 免费
  platforms: [win, linux, mac]
  oss: true
  learning_curve: 3
  maintain_status: active        # active | stale | abandoned | unknown
  first_release: 2019
  latest_version: unknown        # ⚠️ 不确定就写 unknown，不要编
  url: https://ghidra-sre.org/
  source: [https://github.com/NationalSecurityAgency/ghidra]
  verified_at: 2026-11-13
  headless: yes                  # yes | partial | no
  ai_ready: mcp                  # none | api | plugin | mcp
  tldr: >-
    免费开源的逆向框架，反编译质量接近商业工具，支持多架构与协作式分析。
    适合预算受限、需要批量脚本化分析、或要审计算法细节的团队。
    短板：大型二进制分析速度慢于 IDA，UI 响应较重，复杂 C++ 反编译仍有差距。
  note: 有 GhidraMCP 等社区 MCP 实现可接 LLM
```

| 字段 | 类型 | 必填 | 规范 |
| --- | --- | --- | --- |
| `category` | enum | ✅ | 22 类目之一，见第 5 节 |
| `domain` | string[] | ✅ | ≥1 个 `dom:` |
| `artifacts` | string[] | ✅ | ≥1 个 `art:`；这是矩阵视图的轴数据，漏填等于该工具在矩阵里消失 |
| `license` | enum | ✅ | `oss`开源 / `commercial`商业 / `freeware`免费闭源 / `mixed`双许可 / `unknown` |
| `platforms` | enum[] | ✅ | `win`/`linux`/`mac`/`android`/`ios`/`hardware`/`web` |
| `learning_curve` | 1-5 | ✅ | 见 4.3，**有客观锚点，不许凭感觉** |
| `maintain_status` | enum | ✅ | 见 4.1 |
| `first_release` | int | ⚠️ | 年份。不确定写 `null`，不要猜 |
| `latest_version` | string | ⚠️ | **不确定就写 `unknown`**，禁止编版本号 |
| `url` | string | ✅ | 官方站点 |
| `source` | string[] | ✅ | ≥1 条可访问链接（官网或仓库） |
| `verified_at` | date | ✅ | 本条目内容核验日期 `YYYY-MM-DD` |
| `headless` | enum | ✅ | 能否无 GUI 自动化 |
| `ai_ready` | enum | ✅ | 见 4.2，本系统差异化维度 |
| `tldr` | string | ✅ | **≥40 字**，四段式：它解决什么 / 什么场景用 / 已知短板 |
| `note` | string | ❌ | 补充说明、坑、与其他版本的差异 |

---

### 2.4 `concept` / `format` / `attack` / `ecosystem` / `ai`

```yaml
# concept —— 底层原理
- id: con:pe-tls-callback
  name: PE TLS 回调
  def: PE 可注册在进程启动前执行的回调函数，常用于反调试与早期注入，正常程序罕见使用。
  difficulty: 4
  layer: user            # user | kernel | hardware
  related_formats: [fmt:pe]

# format —— 文件格式
- id: fmt:mach-o
  name: Mach-O
  def: macOS/iOS 的可执行与动态库格式，含 __TEXT/__DATA 段、LC_ 加载命令、代码签名与 arm64e 指针认证。
  platforms: [mac, ios]
  parsers: [tool:otool, tool:jtool2, tool:lief]

# attack —— 对抗手法
- id: atk:anti-debug-ptrace
  name: ptrace 反调试
  def: 通过 PTRACE_TRACEME 自我附加或检测 TracerPid，阻止调试器附加；绕过需 hook 或内核态修补。
  targets: [art:elf64]
  countermeasures: [tech:dynamic-instrumentation, tool:frida]
  difficulty: 2

# ecosystem —— 教学资源
- id: eco:pwn-college
  name: pwn.college
  kind: 靶场            # 书籍 | 课程 | 靶场 | 会议 | 社区 | 论文 | 数据集 | 合集
  url: https://pwn.college/
  covers: [tech:rop, tech:heap-exploitation]
  free: true

# ai —— AI/自动化分析能力
- id: ai:ghidramcp
  name: GhidraMCP
  kind: mcp             # mcp | plugin | model | dataset | benchmark
  host_tool: tool:ghidra
  def: 把 Ghidra 的反编译、符号、交叉引用能力暴露为 MCP 工具，使 LLM 客户端可直接驱动分析。
  maturity: experimental # experimental | usable | production
  url: https://github.com/LaurieWired/GhidraMCP
```

---

### 2.5 `artifact` — 载体/分析对象

```yaml
- id: art:elf64
  name: ELF64 可执行文件
  kind: executable
  def: Linux/Unix 主流可执行格式，含动态段、PLT/GOT 与节表，是用户态逆向最常见的输入。
  platforms: [linux]
```

| 字段 | 类型 | 必填 | 规范 |
| --- | --- | --- | --- |
| `name` | string | ✅ | 中文，≤20 字 |
| `kind` | enum | ✅ | **只能取下表的值，不得自造** |
| `def` | string | ✅ | ≤120 字，说清这是什么载体、逆向时的主要障碍 |
| `platforms` | enum[] | ❌ | `win`/`linux`/`mac`/`android`/`ios`/`hardware`/`web` |

**`kind` 枚举（新增取值必须先在本文档登记）**

| kind | 含义 | 典型实例 |
| --- | --- | --- |
| `executable` | 可直接执行的文件 | `pe32` `pe64` `elf32` `elf64` `mach-o` `pe-dotnet` |
| `library` | 动态/静态库 | `so` `dll` `dylib` |
| `package` | 分发容器 | `apk` `ipa` `jar` |
| `bytecode` | 中间表示 | `dex` `il` `wasm` `lua-bytecode` `evm-bytecode` |
| `firmware` | 固件镜像 | `firmware-image` `uefi-bios` `rtos-image` `rom` |
| `kernel-object` | 内核模块或驱动 | `kernel-module` `driver` |
| `runtime-dump` | 运行时转储 | `memory-dump` `crash-dump` |
| `capture` | 网络/总线抓包 | `pcap` `usb-capture` |
| `document` | 文档类载体 | `document` `pdf` `office` |
| `script` | 脚本 | `script` `browser-js` `powershell` |
| `shellcode` | 位置无关代码片段 | `shellcode` |
| `container` | 容器或镜像 | `container-image` |

> **为什么 kind 必须统一**：它是交叉矩阵视图的轴。一旦允许各写各的，
> "符号执行 × 载体"这张表会被拆成十几列同义项，矩阵直接失去意义。

### 2.6 实时层附加字段（Overlay 专用，Base 里不出现）

由 `04-LIVE-KNOWLEDGE.md` 的 Overlay 层注入，合并视图里可见：

```yaml
_origin: base | overlay      # 该节点来自哪一层
_rev: r_10231               # 最后一次变更的 overlay 版本
_tombstone: true            # 软删除标记（合并时过滤，不物理删）
_supersededBy: tool:xxx     # id/kind 变更时指向继任节点
_dangling: true             # 所在边指向的节点已被删除
_history:                   # 字段级变更历史（compact 时导出到 _audit/）
  - { at: 2026-11-13T09:20:00Z, by: curator, field: latest_version, from: 2.3.4, to: 3.0.0 }
```

**合并优先级**：overlay > base；`id`/`kind` 不允许被 overlay 修改；
同一字段多次变更时 `appliedAt` 后写胜出，但完整保留 `_history`。

## 3. 边定义

```yaml
# edges/technique-tool.yaml
- from: tech:unpacking
  to: tool:scylla
  kind: uses
  weight: 0.9
  rationale: Scylla 通过重建导入表把运行时 OEP 处的内存镜像还原成可分析 PE，是 IAT 修复环节的标准工具。

# edges/relations.yaml
- from: tool:ollydbg
  to: tool:x64dbg
  kind: supersedes
  since: 2015
  reason: OllyDbg 停止维护且不支持 64 位；x64dbg 成为 Windows 用户态调试的事实标准。
  rationale: 两者都是 Windows 用户态 Ring3 调试器，能力集覆盖度高度重合。

- from: tool:ida-pro
  to: tool:ghidra
  kind: alternative
  switch_cost: high
  tradeoff: 换到 Ghidra 失去 Hex-Rays 的 C++ 反编译质量与成熟插件生态，但省下许可成本并可审计算法。
  rationale: 都提供多架构反汇编 + 反编译 + 图形化交叉引用，面向同一"二进制静态理解"任务。

- from: tech:static-analysis
  to: tech:unpacking
  kind: upstream
  order: 10
  rationale: 加壳会破坏静态分析可读性，因此静态分析前必须先判断是否加壳并在必要时先脱壳。

# edges/misc.yaml
- from: tool:capa
  to: atk:process-injection
  kind: detects
  rationale: capa 的规则集包含进程注入相关的 API 组合与行为特征匹配。
```

| 字段 | 必填 | 规范 |
| --- | --- | --- |
| `from` / `to` | ✅ | 必须是已存在的节点 ID |
| `kind` | ✅ | 12 种之一 |
| `rationale` | ✅ | **必填**，一句话说清功能上的关系。禁止"都是逆向工具"式弱关联 |
| `weight` | ❌ | 0-1，关系强度，用于图布局与推荐排序 |
| `switch_cost` | alternative 必填 | low/medium/high |
| `tradeoff` | alternative 必填 | 换过去会失去什么（必须具体） |
| `since` | supersedes 必填 | 年份 |
| `reason` | supersedes 必填 | 为什么被取代 |
| `order` | upstream 必填 | 数字，越小越靠前，用于流水线拓扑排序 |

### 12 种边

| kind | 语义 | 方向 | 用在哪 |
| --- | --- | --- | --- |
| `prerequisite` | 学 B 前先会 A | A→B | 学习路径（最短路） |
| `uses` | 技法用某工具 | tech→tool | 主图、详情页 |
| `applies_to` | 技法/工具适用于某载体 | any→art | **矩阵视图的轴** |
| `part_of` | 组成关系 | child→parent | 层级折叠 |
| `alternative` | 可互相替换 | 双向 | 详情页"备选"、选型决策 |
| `complements` | 流水线上配合使用 | 双向 | 流水线步骤内的工具组合 |
| `supersedes` | B 取代 A | A→B | 时间轴、迁移建议 |
| `upstream` | B 在 A 之后 | A→B | **流水线视图的唯一数据源** |
| `detects` | 工具能检出某手法 | tool→atk | 检测能力视图 |
| `bypasses` | 手法绕过某工具/检测 | atk→any | 对抗关系图 |
| `implemented_in` | 插件宿主 | plugin→host | 生态视图 |
| `teaches` | 资源教某技法 | eco→tech | 靶场映射 |

---

## 4. 易出错的字段：精确判定标准

这四个字段是最容易各写各的、导致数据无法比较的地方。**照表填，不要自己发挥。**

### 4.1 `maintain_status`

| 值 | 判定标准（满足任一） |
| --- | --- |
| `active` | 近 12 个月有提交/发版 |
| `stale` | 近 12-36 个月无更新，但仍可用 |
| `abandoned` | 超 36 个月无更新，或官方已声明停止维护，或有明确继任者 |
| `unknown` | 无法确认（闭源商业工具看发版页） |

### 4.2 `ai_ready`（本系统差异化维度）

| 值 | 判定标准 |
| --- | --- |
| `mcp` | 有可用 MCP server，LLM 客户端可直接调用 |
| `api` | 有稳定 Python/REST/CLI 接口，可脚本批量驱动 |
| `plugin` | 仅能通过宿主 GUI 插件扩展，需人工在环 |
| `none` | 纯 GUI，无程序化入口 |

> 这个维度会直接产出一个有价值的视图：「哪些环节 AI 还插不进去」。
> 现状是反汇编器基本都有 MCP，而**沙箱、打包器识别、多数 fuzzer 仍是 `none`**——这正是自动化的断层。

### 4.3 `learning_curve` 与 `entry_difficulty`（1-5）

| 分数 | 含义（工具） | 含义（领域/技术） |
| --- | --- | --- |
| 1 | 装上就能用，1 小时上手 | 有基础即可理解 |
| 2 | 半天到一天，看一篇教程 | 需 1 个前置概念 |
| 3 | 需数天实践，要理解其模型 | 需逆向基础 + 1-2 门前置技术 |
| 4 | 需数周，配套知识门槛高 | 需系统学习 + 实操环境 |
| 5 | 需数月，通常要领域经验 | 需多领域交叉背景，入门即劝退 |

### 4.4 `coverage`

| 值 | 标准 |
| --- | --- |
| `full` | 该领域 ≥5 工具 且 ≥5 技术，且矩阵中该领域的组合覆盖 ≥30% |
| `partial` | 有内容但任一维度不足 |
| `stub` | 仅占位（≤2 条内容） |

---

### 4.5 `source` 与 `verified_at` 的适用范围

| 节点类型 | 是否强制 | 理由 |
| --- | --- | --- |
| `tool` / `ai` / `ecosystem` | **强制** | 含版本号、官网、维护状态等**会过期**的事实 |
| `domain` / `technique` / `concept` / `format` / `attack` / `artifact` | 选填 | 结构性定义，不随版本失效 |

**但有一条硬约束**：结构性节点里一旦写了**具体年份、CVE 编号、版本号、厂商名称**，
就必须同时给 `source` 与 `verified_at`。

> 归纳成一句：**不是每条都要出处，而是「凡写了会过期的事实，就必须有出处」。**
> 这条同时覆盖 AGENTS.md 里"每条记录必须有 source"的宽泛表述。

## 5. 22 个工具类目与代表工具（收录范围基准）

> 目标：P1 阶段每类 ≥8 个，P2 阶段合计 ≥400 个。
> **下列清单是"找什么的索引"，不是"抄进去的答案"**——每个都必须自己核实
> `license / platforms / latest_version / 是否仍维护`，查不到就标 `unknown`。

| # | 类目 slug | 中文 | 代表工具（务必核实） |
| --- | --- | --- | --- |
| 1 | `disassemblers` | 反汇编/反编译 | IDA Pro · Ghidra · Binary Ninja · radare2 · rizin · Cutter · Hopper · RetDec · rev.ng · Snowman · Reko · objdump · llvm-objdump · Decompiler Explorer · dnSpy · ILSpy · jadx · JD-GUI · CFR · Procyon |
| 2 | `debuggers` | 调试器 | x64dbg/x32dbg · WinDbg · GDB · pwndbg · gef · peda · LLDB · rr · HyperDbg · OllyDbg · Immunity Debugger · Cheat Engine · TTD · Undo LiveRecorder · Voltron |
| 3 | `instrumentation` | DBI/插桩/追踪 | Frida · DynamoRIO · Intel Pin · QBDI · TinyInst · Unicorn · Qiling · Speakeasy · Intel PT / libipt · bpftrace · eBPF · DTrace · ETW · Detours · MinHook · API Monitor · strace · ltrace · Procmon · Sysmon |
| 4 | `symbolic` | 符号执行/约束求解 | angr · Triton · miasm · Manticore · KLEE · S2E · SymCC · QSYM · Fuzzolic · Z3 · CVC5 · Boolector · STP · Ponce · angr-management |
| 5 | `fuzzers` | 模糊测试 | AFL++ · libFuzzer · honggfuzz · syzkaller · boofuzz · Fuzzilli · Domato · Jackalope · WinAFL · Nyx · Centipede · OSS-Fuzz · ClusterFuzz · LibAFL · atheris · Jazzer · Radamsa · FuzzIntrospector · FuzzBench · Fuzzware · HALucinator |
| 6 | `analysis-frameworks` | 程序分析框架 | CodeQL · Semgrep · Joern · SVF · BAP · Dyninst · Clang Static Analyzer · Infer · Frama-C · Capstone · Keystone · XED · Souffle · BinExport |
| 7 | `binary-formats` | 二进制格式与编辑 | PE-bear · CFF Explorer · pestudio · Detect It Easy · ExeInfoPE · LIEF · pefile · pyelftools · goblin · MachOView · otool · jtool2 · readelf · nm · dumpbin · Dependencies · 010 Editor · HxD · ImHex · Kaitai Struct · binwalk · hexyl · Resource Hacker |
| 8 | `packers` | 加壳识别/脱壳 | UPX · Scylla · PE-sieve · hollows_hunter · pe_unmapper · OllyDumpEx · Detect It Easy · PEiD · VMProtect · Themida/WinLicense · Enigma Protector · ASPack · PECompact · MPRESS · .NET Reactor · ConfuserEx · de4dot · Eazfuscator · frida-dexdump · youpk · frida-ios-dump · bagbak · Clutch · ipatool |
| 9 | `detection-rules` | YARA/检测规则 | YARA · YARA-X · capa · FLOSS · Chainsaw · Sigma · Velociraptor · osquery · Loki · Hayabusa · MISP · OpenCTI · STIX/TAXII · Atomic Red Team |
| 10 | `sandboxes` | 沙箱/恶意分析平台 | CAPEv2 · Cuckoo · Joe Sandbox · ANY.RUN · Hatching Triage · VMRay · VirusTotal · Hybrid Analysis · MalwareBazaar · DRAKVUF · MalCat · Speakeasy · ProcDOT · Noriben · TheHive · Cortex · LimaCharlie |
| 11 | `firmware` | 固件分析 | binwalk · unblob · EMBA · FACT · FirmAE · Firmadyne · firmware-mod-kit · sasquatch · jefferson · ubireader · UEFITool · UEFIExtract · CHIPSEC · efiXplorer · QEMU · ONEKEY |
| 12 | `mobile` | 移动逆向 | jadx · apktool · GDA · JEB · MobSF · objection · Frida · LSPosed · Magisk · Zygisk · dex2jar · androguard · baksmali/smali · Bytecode Viewer · APK Analyzer · class-dump · FLEX · ios-deploy · Theos · Il2CppDumper · Il2CppInspector · frida-il2cpp-bridge · Zygisk-Il2CppDumper |
| 13 | `kernel` | 内核/驱动 | WinDbg · TTD · Driver Verifier · GFlags · Poolmon · mex · HyperDbg · Volatility 3 · MemProcFS · System Informer · GMER · crash · drgn · ftrace · perf · LKRG · KASAN · KFENCE |
| 14 | `memory-forensics` | 内存取证 | Volatility 3 · MemProcFS · LiME · WinPmem · AVML · DumpIt · Magnet RAM Capture · FTK Imager · Bulk Extractor · pypykatz · mimikatz · pmem · Velociraptor |
| 15 | `network-protocol` | 网络与协议逆向 | Wireshark · tshark · tcpdump · mitmproxy · Fiddler · Burp Suite · OWASP ZAP · Scapy · Netzob · Kaitai Struct · protobuf-inspector · NetworkMiner · Arkime · Zeek · Suricata · Snort · Npcap · Charles · HTTP Toolkit · whistle · CyberChef |
| 16 | `crypto` | 密码算法识别 | FindCrypt (IDA/Ghidra 插件) · signsrch · KANAL · capstone · miasm · Triton · angr · CyberChef · hashcat · John the Ripper · RsaCtfTool · factordb · yafu · msieve |
| 17 | `game-security` | 游戏安全 | Il2CppDumper · Il2CppInspector · frida-il2cpp-bridge · BepInEx · MelonLoader · Harmony · Cheat Engine · ReClass.NET · UnityPy · AssetStudio · AssetRipper · FModel · UAssetGUI · unluac · luajit-decompiler · dnSpy · Mono.Cecil |
| 18 | `ai-x-re` | AI × 逆向 | ida-pro-mcp · GhidraMCP · ReVa · binary_ninja_mcp · radare2-mcp · CutterMCP · x64dbgMCP · frida-mcp · Jadx-MCP · apktool-mcp-server · YaraFlux · WireMCP · LLDB MCP · Gepetto · aiDAPal · Binary Ninja Sidekick · LLM4Decompile · ollama · llama.cpp · vLLM |
| 19 | `binary-similarity` | 二进制相似性/SCA | BinDiff · Diaphora · TurboDiff · BSim · BinGo · Kam1n0 · FLIRT · FunctionID · Lumina · ssdeep · tlsh · sdhash · imphash · cve-bin-tool · syft · grype · trivy · Dependency-Track · SCANOSS |
| 20 | `visualization` | 可视化/辅助 | BinVis · Veles · IDA Graph View · Ghidra Function Graph · Cutter Graph · ImHex · CyberChef · 010 Editor · entropy 图 (binwalk -E) |
| 21 | `doc-malware` | 文档/脚本恶意代码 | oletools (olevba/oleid/rtfobj) · oledump · msoffcrypto-tool · pdfid · pdf-parser · peepdf · qpdf · de4js · Box-js · ViperMonkey · XLMMacroDeobfuscator · LECmd · PSDecode · AMSITrigger · scdbg |
| 22 | `environment` | 环境与基建 | FLARE VM · REMnux · Kali · SIFT Workstation · Tsurugi Linux · Docker · Vagrant · VMware · VirtualBox · QEMU · Proxmox · INetSim · FakeNet-NG · Windows Sandbox · Hyper-V · WSL2 |

### 载具清单（`art:`，≥25 条）

`pe32` `pe64` `pe-dotnet` `elf32` `elf64` `mach-o` `macho-fat` `dylib` `dll` `so` `apk` `dex` `ipa` `jar` `wasm` `firmware-image` `uefi-bios` `rtos-image` `rom` `kernel-module` `driver` `memory-dump` `crash-dump` `pcap` `document` `script` `lnk` `shellcode` `browser-js` `evm-bytecode` `container-image` `game-client` `lua-bytecode` `il-bytecode`

---

## 6. 校验规则（A6 实现，CI 阻断）

| # | 规则 | 级别 |
| --- | --- | --- |
| V1 | YAML 语法合法 + Zod schema 通过 | error |
| V2 | ID 全局唯一且符合 `{prefix}:{slug}` | error |
| V3 | 边的 `from`/`to` 必须存在于节点库 | error |
| V4 | 每条边 `rationale` 非空且 ≥15 字 | error |
| V5 | `alternative` 必须有 `switch_cost` + `tradeoff` | error |
| V6 | `supersedes` 必须有 `since` + `reason` | error |
| V7 | `upstream` 必须有 `order` | error |
| V8 | `tool.tldr` ≥40 字 | error |
| V9 | `tool.source` 非空 | error |
| V10 | `prerequisite` 无环（拓扑检测） | error |
| V11 | 非 `domain` 节点不得孤立（至少 1 条边） | warning |
| V12 | `verified_at` 超过 18 个月 | warning |
| V13 | `unverified: true` 占比 > 15% | warning |
| V14 | 某 `domain` 工具数 < 5 | warning（并在 stats 报告中标 partial） |
| V15 | `first_release` 晚于 `verified_at` 年份 | error |

**校验器输出必须可定位**：`data/tools/packers.yaml:42 · tool.upx.source · 期望非空 · 实际 null`

---

## 7. 扩展指引（未来加新类型时）

新增一种节点类型只需改三处，**不允许改组件内的业务逻辑**：

1. `03-DATA-SCHEMA.md` 加一节 + `schema/` 加 Zod 定义
2. `src/graph/styles.ts` 加配色与形状 token
3. `src/panels/FacetPanel.tsx` 的维度配置表加一项（配置数组，不是 if-else）

新增一种边类型同理：`edges` 类型枚举 + 线型 token + 图例，三处即可。

**如果发现需要改第四处，说明架构错了，回 A4 修 `ARCHITECTURE.md`，不要在组件里打补丁。**

---

## 8. 一句话记住

> 图谱的价值不在节点数量，在**边的质量**；
> 边的质量不在数量，在**每条都能说清为什么连**。
> 四百条编造的边，不如一百条能讲通的边。
