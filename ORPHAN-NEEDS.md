# ORPHAN-NEEDS · A3 关系建模的缺口清单

**产出方**：A3 关系建模师 · 2026-11-13
**对应产出**：`data/edges/{technique-tool,relations,misc}.yaml`（102 条边）
**用途**：记录"想连但连不了"的地方。本批严格遵守「只引用已存在节点」，
没有为凑边数造节点，也没有为了覆盖 kind 而扭曲方向。

---

## 0. 一句话结论

12 种边里有 **4 种在本批是 0 条**——`detects` / `bypasses` / `implemented_in` / `teaches`。
原因不是漏写，是**端点类型整体缺席**：节点库只有 `domain` / `technique` / `artifact` / `tool`
四类，没有任何 `atk:` / `eco:` / `ai:` / plugin 节点。这四种边现在写了也一定会被
`V3 悬空引用` 拦下，所以本批选择不写。

---

## 1. 缺节点类型（阻断整种 kind）

| 缺的类型 | 前缀 | 卡住的 kind | 现在完全无法表达的东西 |
| --- | --- | --- | --- |
| 攻击手法 | `atk:` | `detects`（tool→atk）、`bypasses`（atk→any） | 「capa 检出进程注入」「Frida 绕过证书固定」「Unicorn 绕开反调试」这类**检测能力视图与对抗关系图**的全部数据。这是本项目差异化价值最高的一类边，目前为 0 |
| 生态资源 | `eco:` | `teaches`（eco→tech） | 靶场/课程/书籍 → 技法的映射，学习路径功能没法起步 |
| AI 条目 / 插件 | `ai:` / plugin | `implemented_in`（plugin→host） | 生态视图（哪些 MCP 挂在哪个宿主上）。工具节点里 `ai_ready: mcp` 已有 7 个，但没有插件节点去承载 host 关系 |

**建议最小补充集**（每类 5–8 条即可解锁整种 kind）：
- `atk:process-injection` `atk:anti-debugging` `atk:anti-emulation` `atk:certificate-pinning`
  `atk:string-encryption` `atk:control-flow-obfuscation` `atk:vm-based-protection` `atk:env-sandbox-check`
- `eco:` 先补 3 个常见靶场/课程即可，不必等齐

---

## 2. 缺技法节点（把 `uses` 边挤成"寄生"）

有几个工具在 15 个技法里**没有真正的归宿**，本批只能挂在语义最近的技法上，
这些边应视为**临时占位**，等对应技法建好后重新指向：

| 工具 | 本批挂在 | 应该属于（缺失技法） | 症状 |
| --- | --- | --- | --- |
| `tool:aflpp` | 无 `uses`，仅 `complements(qemu)` + `applies_to(firmware-image)` | `tech:fuzzing`（schema §5 有 fuzzers 类目，却没有对应技法节点） | 全库唯一没有 `uses` 入边的工具，矩阵里只能靠 applies_to 露一格 |
| `tool:angr` | `tech:executable-unpacking`（weight 0.45） | `tech:symbolic-execution` / `tech:constraint-solving` | 符号执行被硬塞进脱壳工序，真实重合面很窄 |
| `tool:volatility3` | `tech:behavioral-dynamic-analysis`（0.7） | `tech:memory-forensics` | 内存取证是独立工序，现在只能算"动态分析的收尾" |
| `tool:windbg` | `tech:behavioral-dynamic-analysis`（0.55） | `tech:kernel-driver-analysis` | 内核/驱动分析无节点，WinDbg 的看家本领表达不出来 |
| `tool:detect-it-easy` | `tech:malware-static-triage`（0.95） | 语义上没问题，但缺 `tech:packer-detection` 时它承担的"壳判定"没有独立环节 | 加壳判定被并进静态研判，流水线上看不出这是个岔路口 |
| `tool:cyberchef` | `tech:malware-static-triage`（0.7） | 缺 `tech:crypto-identification` / `tech:data-deobfuscation` | 只有 1 条 `uses`，工具能力被严重欠表达 |

另有两个领域边界问题：
- `tech:network-traffic-interception` 的 `note` 自己写着「与 `dom:network-protocol`
  的协议逆向边界待划清」，但 **`dom:network-protocol` 领域节点不存在**，
  这条技法目前无主归属（现挂在 `dom:mobile`）。协议逆向在本图里是空白。
- 固件侧缺 `tech:uefi-secure-boot-bypass` 一类细分，`tech:uefi-firmware-analysis`
  一条技法要同时承担"解析卷结构"与"审安全启动"，`uses` 只能写两个静态反汇编器。

---

## 3. 缺工具节点（`uses` 密度被卡住）

现有 20 个工具只覆盖 schema §5 的 11/22 个类目。以下缺口直接让我**不敢写**某些
`uses`——因为 `uses` 的语义是"这个技法用这个工具"，而图里那个工具根本不存在：

| 缺的类目 | 缺的工具（技法真实依赖） | 影响的技法 |
| --- | --- | --- |
| `packers` 脱壳 | Scylla · OllyDumpEx · PE-sieve · de4dot · frida-dexdump | `tech:executable-unpacking` 的核心工具**一个都没有**，现在只能用调试器+仿真器绕；`tech:mobile-app-unpacking` 只有 frida 一条边 |
| `firmware` 提取 | binwalk · unblob · EMBA · firmware-mod-kit · UEFITool · UEFIExtract | `tech:firmware-extraction` 只能连 `radare2`（且它只做边界定位）；`tech:uefi-firmware-analysis` 缺解析器本体 |
| `mobile` 反编译 | jadx · apktool · GDA · JEB · MobSF · dex2jar | `tech:mobile-app-static-analysis` 与 `tech:android-component-surface-audit` 的真实主力全缺，只能用 IDA/r2 凑 |
| `fuzzers` | libFuzzer · honggfuzz · boofuzz · WinAFL · Fuzzware | 只有 AFL++ 一个；`tech:firmware-emulation` 之后没有 fuzz 环节可接 |
| `binary-similarity` | BinDiff · Diaphora · ssdeep · tlsh · imphash | `tech:firmware-diffing` 与 `tech:malware-family-attribution` **只能靠 radare2 的 radiff2 与 ghidra 的 Version Tracking 近似**，这是两个技法最该有工具却最缺的地方 |
| `doc-malware` | oletools/olevba · oledump · pdfid · Box-js · ViperMonkey · de4js | `tech:malware-static-triage` 面对 `art:document` / `art:script` 时没有专用工具，只有 cyberchef |
| `symbolic` 求解器 | Triton · miasm · Z3 · Manticore | `tool:angr` 孤掌难鸣，符号执行没法形成工具簇 |
| `memory-forensics` 采集 | LiME · WinPmem · DumpIt | `tool:volatility3` 只能**分析**镜像，`art:memory-dump` 怎么来的无人表达 |
| `network-protocol` 构造 | Scapy · mitmproxy · Netzob | `tech:network-traffic-interception` 缺协议构造/重放侧工具 |
| `kernel` | Driver Verifier · Poolmon · System Informer · HyperDbg | `tool:windbg` 缺配套，内核分析只有一条腿 |

---

## 4. `supersedes` 为什么是 0 条

本批 `relations.yaml` 里 `supersedes` 一条都没写。**不是没有可写的内容，是没有合法端点**：

| 真实的取代关系 | 缺的一端 |
| --- | --- |
| OllyDbg → x64dbg（64 位与停维护） | `tool:ollydbg` 不存在 |
| Volatility 2.x → Volatility 3（插件 API 不兼容重写） | 2.x 不存在 |
| YARA → YARA-X（官方重写分支） | `tool:yara-x` 不存在 |
| radare2 → rizin（fork 重写） | `tool:rizin` 不存在 |
| Cuckoo → CAPEv2（维护转移） | 两者都不存在 |

补上这些旧节点后，`supersedes` 是**最容易一次性写满 5–8 条**的 kind，
且每条都能给出 `since` + `reason`，不需要编造。

---

## 5. 缺载体节点（让部分 `uses`/`applies_to` 只能落在近似载体上）

`data/artifacts.yaml` 现有 19 条，schema §5 的载具清单还有一半没建。对本批影响最大的：

| 缺的载体 | 谁真正需要它 |
| --- | --- |
| `art:driver` / `art:kernel-module` | `tool:windbg` 的 `uses`（我在行为动态分析里给它 0.55，就是因为它的对象 driver 不存在，只能借 pe64/memory-dump 表达） |
| `art:dll` | Windows 恶意样本的常见形态完全无法表达，`art:pe32` 顶替会丢掉"被宿主加载"这一关键差异 |
| `art:crash-dump` | WinDbg 的蓝屏转储归因能力只能落到 `art:memory-dump` |
| `art:il-bytecode` | `.NET` 样本只有 `art:pe-dotnet`，IL 层工具（dnSpy 类）的适用面表达不完整 |
| `art:container-image` | 容器镜像逃逸/挖矿样本这一整块没有入口 |
| `art:macho-fat` / `art:dylib` | iOS/macOS 侧只建了 `mach-o`，fat 二进制与动态库的差异被抹平 |
| `art:rom` / `art:lnk` / `art:browser-js` / `art:wasm` / `art:evm-bytecode` / `art:game-client` / `art:lua-bytecode` | 各自领域暂无技法节点，不阻塞当前，但矩阵列会是空的 |

---

## 6. 数据侧需要复核的两处（不是边的问题，但影响边的语义）

1. **`tool:qemu` 的 `domain` 只有 `dom:firmware`**，但 `applies_to` 里我给它连了
   `art:elf64`（`elf64` 确实在其 `artifacts` 字段里）。若后续要给 qemu 连
   `tech:android-component-surface-audit` 一类移动侧边，先补 domain 再连。
2. **`tool:unicorn` 的 `maintain_status: stale`**（2025-09-09 发版，距今约 14 个月，
   按 §4.1 落在 12–36 个月区间）。我在两处 `uses` 里都以 0.6 的权重使用它，
   若后续它进入 `abandoned`，这两条边（`firmware-emulation` / `executable-unpacking`）
   应同步降权并考虑改连 QEMU 或 Triton。

---

## 7. 优先级建议（给下一轮 A1/A2）

1. **`atk:` 攻击手法节点** → 一次解锁 `detects` + `bypasses` 两种边，投入产出比最高
2. **`tech:fuzzing` + `tech:memory-forensics` + `tech:symbolic-execution` 三个技法** → 让 AFL++ / Volatility / angr 归位，同时消除本批 4 条"寄生"边
3. **`packers` 与 `binary-similarity` 两类工具** → 脱壳与差分/归因四个技法现在工具严重不足，是边密度最该提升的地方
4. **`supersedes` 的旧节点对** → 最容易一次写满
