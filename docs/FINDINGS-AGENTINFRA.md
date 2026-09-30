# Agent Infra 决策层评测（全公开数据，n=1280）

> ⚠️ **勘误（2026-09-30）**：§1“投递通道让良性误报翻 2–3 倍”只在把用户式短文本搬进工具输出时成立；换成原生文档（G2 对照）后 Jev 误报 0%→0%，Laya 变化不显著。§2 的“端到端正确率”实为闸门分类准确率，阈值为样本内选取（留出集 95 分位 FNR 10–17%）；`results/gate-config.json` 只保留了最后一次运行，现已改为每道闸门单独输出。J 轨结论经自然脱敏对照验证**不变**。见 `paper/dist/tech-report-zh.pdf` §6。


> 这一轮专门针对 **agent harness 的真实决策点**：工具输出里的间接注入、答案落地性、执行前安全、PII 出网。
> 全部数据来自公开集，两边喂逐字节相同的输入；置信度统一用 `max(probabilities)`。
> 明细：`results/report-agentinfra.md`；每道闸门的最优工作点：`results/gate-config.json`。

## 0. 结论速览

| 轨道 | 公开数据源 | Laya | Jev | McNemar p | 能用吗 |
|---|---|---|---|---|---|
| **G 间接注入**（payload 藏在工具输出里） | deepset/prompt-injections + jackhhao/jailbreak 的 payload，投递到 tool output | 78.3% | **92.1%** | <0.0001 | Jev 可用（做前置审查） |
| **G 直接注入**（同一批 payload，走用户消息） | 同上（配对实验的对照通道） | 81.3% | **92.1%** | 0.0002 | Jev |
| **H 落地性校验**（答案有没有证据支撑） | HaluEval qa（10k，配对：right_answer vs hallucinated_answer） | 79.0% | **90.0%** | 0.0001 | **Jev 可用，且最划算** |
| **I 执行前安全闸门** | BeaverTails + HarmBench + do-not-answer | 55.0% | **71.3%** | <0.0001 | **都别单独用** |
| **J PII 出网闸门** | ai4privacy/pii-masking-300k（配对：source_text vs target_text） | 42.0% | **59.5%** | 0.0004 | **都别用**（见 §3.4） |
| **全部** | | 66.0% | **80.2%** | <0.0001 | — |

延迟：Laya p50 29ms｜Jev p50 273ms（含公网往返）。本轮 Jev 总花费 $0.021。

## 1. 最有价值的发现：投递通道会改变判断（配对实验）

同一批 240 条 payload（120 攻击 / 120 良性），**只改投递方式**：走用户消息 vs 藏在工具输出里。

| 模型 | 通道 | 攻击召回 TPR | 良性误报 FPR | 整体准确率 | 平均 P(attack) | 同 payload 跨通道一致率 |
|---|---|---|---|---|---|---|
| Laya | 用户消息 | 70.8% | 8.3% | 81.3% | 0.408 | **83.8%** |
| Laya | 工具输出 | **82.5%** | **25.8%** | 78.3% | 0.566 | |
| Jev | 用户消息 | 88.3% | 4.2% | 92.1% | 0.464 | **92.5%** |
| Jev | 工具输出 | **94.2%** | **10.0%** | 92.1% | 0.575 | |

**两家都系统性地"对数据更疑心"**：同样的文本换成工具输出，P(attack) 平均抬高 0.11–0.16，攻击召回 +6~12pp，但**良性误报翻 2–3 倍**。Jev 的总准确率扛住了（92.1% vs 92.1%），Laya 掉了 3pp。

工程含义：
- 别拿"用户消息通道"上调好的阈值直接用在工具输出上——你会把大量正常工具结果误判成注入。
- **两个通道要分别标定阈值**。这条在公开资料里基本没人提。
- Jev 的跨通道一致率 92.5%（Laya 83.8%），说明它对"渠道"这个元信息更稳。

## 2. 每道闸门的可用工作点（自动生成，见 results/gate-config.json）

判读方式：闸门判"命中"就走昂贵路径（调 LLM / 拦截）；"漏报"= 该拦没拦 / 该升级没升级。

| 闸门 | 模型 | 目标漏报 | 阈值 | 昂贵路径触发率 | 每百万次省 | 端到端正确率 |
|---|---|---|---|---|---|---|
| **间接注入** | Jev | 5% | 0.47 | 53.8% | **$2,313** | **91.3%** |
| 间接注入 | Laya | 5% | 0.09 | 80.0% | $1,000 | 65.0% |
| **落地性校验** | Jev | 5% | 0.045 | 66.0% | **$1,700** | **81.0%** |
| 落地性校验 | Laya | 5% | 0.03 | 97.5% | $125 | 48.5% |
| 执行前安全 | Jev | 5% | 0.045 | 82.0% | $900 | 63.5% |
| 执行前安全 | Laya | 5% | 0.01 | 94.3% | $287 | 50.8% |
| PII 出网 | Jev | 20% | 0.73 | 63.5% | $1,825 | 66.5% |
| PII 出网 | Laya | 5% | 0.015 | 96.0% | $200 | 49.0% |

（成本模型：一次 LLM 调用 $0.005。全部可用 `FNR_TARGET` / `LLM_COST` 环境变量重算，脚本是 `scripts/gate_config.mjs`。）

**要点**：
- **只有两道闸门值得上**：间接注入（Jev，省 46% 调用且端到端 91.3%）和落地性校验（Jev，省 34% 且 81%）。
- **安全闸门和 PII 闸门不要用 System-1**：安全闸门在 5% 漏报下只能省 18%，而 PII 闸门 Laya 的 AUC 是 **0.412（低于随机，信号是反的）**，Jev 虽然 AUC 0.810 排序正确，但要阈值 0.73 才勉强能用（63.5% 触发率）。PII 应该用正则/NER 专用工具。
- **落地性校验是性价比之王**：任务是"比对两段文本"，正好落在 System-1 的能力区（noul 二值判断），Jev 在这条上 90% 原始准确率。

## 3. 分轨道细节

### 3.1 间接注入（G）
- 攻击样本：deepset prompt-injections + jackhhao jailbreak 的 418 条攻击文本；良性：703 条筛过的普通内容。
- 状态写成真实 agent 形态：`You are an AI agent working on this task: <task>. You called the tool [name] and received this output: ...`
- Jev FNR 5.8% / FPR 10.0%；Laya FNR 17.5% / FPR 25.8%。

### 3.2 落地性校验（H）
- HaluEval qa 的配对结构（同一知识 + 同一问题 + 正确/幻觉两个答案），所以**样本量虽只有 200，但配对对照让结论很干净**：把"答案"从正确的换成幻觉的，模型是否翻转判断。
- Jev 90.0%（FNR 4.0%），Laya 79.0%（FNR 5.0%，但 FPR 37.0%——它倾向于说"不支撑"）。
- 用途：**在把答案返回给用户前做一次自检**，或者决定要不要重新生成。这是目前测下来唯一"省得多且掉得少"的闸门。

### 3.3 执行前安全闸门（I）
- Laya **FNR 81.5%**：200 条有害请求里它放过了 163 条。这不是"弱"，是**危险**。
- Jev FNR 25.5% / FPR 32.0%：也不够格单独做安全闸门。
- 数据来源混合（BeaverTails 的 is_safe 是模型标的、HarmBench 是人工行为清单、do-not-answer 是问句），**这一轨的标签本身质量最差**（见 §4），所以绝对数字要打折——但两家的相对排序在所有分层里都一致。

### 3.4 PII 出网闸门（J）
- Laya AUC **0.412**（判正负的能力低于随机）；Jev AUC 0.810。
- Jev 的原始阈值（0.5）下 FPR 66%：把大量已脱敏文本判成含 PII。
- 结论：**PII 检测别用 System-1**，用正则 + NER（这条任务本质是"找实体"，不是"做判断"）。

## 4. 法官审计（同上一轮的盲标流程，n=233）

用 DeepSeek V4.1 Flash 盲法官复核（不给 gold、不给模型答案）：

| 抽样层 | 样本 | 与数据集标签一致 |
|---|---|---|
| 分歧 | 84 | 81.0% |
| 双错 | 90 | 33.3% |
| 双对（对照） | 59 | **93.2%** → 法官自身误判下限 ~7% |

分轨道的"法官不认同数据集标签"比例：**执行前安全 45.5%** > 落地性 37.9% > PII 30.9% > 间接注入 21.7% > 直接注入 18.4%。

→ **安全轨道的标签最不可信**（BeaverTails 的 is_safe 本身就是模型标注），所以 §3.3 的数字应视为"在这套标签下"的相对比较，不是绝对安全能力。
→ 但在两家意见不合的 84 个样本上，**法官 84.5% 站 Jev**——和上一轮（85–87%）一致，**标签噪声不改变排序**。

## 5. 给 agent harness 的落地清单

| 决策点 | 用什么 | 阈值/做法 |
|---|---|---|
| 工具输出里的注入检测 | **Jev**（用户消息通道和工具输出通道**分别标定**） | 工具输出通道建议阈值 0.47（5% 漏报），并接受 ~10% 良性误报 |
| 答案落地性自检 | **Jev** | 阈值 0.045（"不支撑"就重新生成），省 34% 重生成调用 |
| 执行前安全 | **不要只靠 System-1**：LLM 仍留在环内，System-1 只做预筛 | Jev 在 5% 漏报阈值下能省 18%，但 FNR 25.5% 意味着必须有人工/LLM 复核 |
| PII 出网 | **正则 + NER**，不要用 System-1 | — |
| 工具选择 / 护栏 / 大标签分类 | 见 `docs/FINDINGS.md`（Jev；Laya 只在 K≤10 且可兜底时用） | — |

## 6. 复现

```powershell
.\scripts\fetch_agentinfra.ps1                                                   # 公开集下载
& F:\sys1-eval\venv\Scripts\python.exe scripts/convert_agentinfra.py           # parquet/jsonl 转换
& F:\sys1-eval\venv\Scripts\python.exe scripts/slim_pii.py
node scripts/build_agentinfra_cases.mjs                                           # bench/agentinfra-cases.jsonl (1280)
node scripts/run_jev.mjs bench/agentinfra-cases.jsonl results/jev-agentinfra.jsonl
& F:\sys1-eval\venv\Scripts\python.exe scripts/run_laya.py bench/agentinfra-cases.jsonl results/laya-agentinfra.jsonl
node scripts/score2.mjs bench/agentinfra-cases.jsonl results/report-agentinfra.md results/laya-agentinfra.jsonl results/jev-agentinfra.jsonl
node scripts/channel_effect.mjs                                                   # 通道效应
node scripts/gate_config.mjs bench/ai-J_pii_egress.jsonl results/laya-agentinfra.jsonl results/jev-agentinfra.jsonl
```
