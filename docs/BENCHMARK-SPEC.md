# System-1 决策层评测：Laya vs Jev（Agent Infra 视角）

> 目标不是复刻官方榜单，而是回答一个工程问题：
> **在 Agent harness 里，把"决策"从大模型卸载给 System-1 决策模型（choice/score/noul），能省多少钱、掉多少准确率；这条线该用 Laya（本地开源）还是 Jev（云 API）？**

## 0. 被测对象

| | Laya | Jev |
|---|---|---|
| 获取 | `pip install laya`，Apache 2.0 权重，本机 RTX 2080 Ti 22G | `POST https://api.typesafe.ai/v1/systemone`，Bearer `jev_key` |
| 版本 | laya 0.3.21（记录 checkpoint：laya / laya-multilingual / laya-typed-decisions） | 响应自带 `model: jev-1.13.0` |
| 原语 | `choice` / `score` / `noul` | 同（响应形状见 `docs/API-NOTES.md`） |
| 计费 | 自托管（折算 GPU 小时），无 key | published $0.042 / 1M tokens，响应返回 usage |

**公平性铁律**：两边收到的 `state` 与 `questions`（instructions/criteria 文本）逐字节相同；同一批 case、同一顺序、同一并发；分别记录 wall-clock（本地无网络，API 含网络，报告里分列）；记录模型版本与运行日期。

## 1. 五条评测轨道（对应 Agent harness 的五个决策点）

| 轨 | Agent 里的决策点 | 公开数据集 | 原语 | 样本(n) | 主指标 |
|---|---|---|---|---|---|
| **A 模型智能路由** | 这条请求用便宜模型还是升级到强模型？（降本核心） | RouterBench (`withmartian/routerbench`, 0-shot) | choice(2) | 25 | 路由准确率、**同质量下的成本节省 %**、Pareto |
| **B MCP/工具选择** | 该调哪个工具？（工具目录 N 选 1） | BFCL v3 `live_simple` + `live_multiple` | choice(N) | 25 | top-1 / top-3 准确率；**标签基数扫描 5/10/20/50** |
| **C 工具调用护栏** | 到底该不该调工具？（不该调却调=事故） | BFCL `live_irrelevance` + `irrelevance` | noul | 15 | FPR=1% 时的召回率、误触发率 |
| **D RAG 相关性门控** | 检索到的段落够不够答？不够才叫大模型 | BEIR SciFact (mteb/scifact) qrels 正负样本 | noul | 15 | 准确率、coverage-risk、**省下的 LLM 调用比例** |
| **E 注入/越狱护栏** | 这段输入能不能进 Agent？ | deepset/prompt-injections + jackhhao/jailbreak-classification | noul | 10 | 召回@FPR≤1%、AUROC |
| **F 标签基数 & 多语言压力** | 77 个意图、非英语流量怎么办？ | BANKING77（parquet 分支）+ MASSIVE 抽样（可选） | choice(77) | 10 | 断崖点定位（复现官方 0.425 vs 0.870） |

合计 **100 条** pilot。

## 2. 指标口径

- **准确率类**：argmax accuracy、macro-F1、top-k（k=3）
- **校准类**（System-1 的命门）：ECE(15 bins)、Brier、reliability curve
- **可自动化性（最落地）**：置信度阈值扫描 → coverage-risk 曲线、**confident-wrong 率**（conf≥0.9 时错的比例）
- **延迟**：p50 / p95，本地推理与 API 往返分列；批量吞吐（决策/秒）
- **成本**：Jev 按 usage token × $0.042/1M；Laya 按本机实测吞吐折算；给出"每 100 万次决策"成本对比
- **稳定性**：同输入重复 3 次是否漂移；A 轨内随机的选项顺序固定为同一份文件，保证两边一致
- **统计**：n=100 属 pilot，给 Wilson 95% 区间；配对差异用 McNemar；**不下"谁全面更强"的结论**，只报"在哪个决策点上差多少"

## 3. 试标（pilot labeling）协议

1. 每个 case 落成一行 jsonl，字段：
   ```
   { id, track, dataset, source_id, lang, state, questions, gold, gold_alt[], difficulty,
     has_unique_answer, notes }
   ```
2. **有唯一答案标记**：boundary/无解题必须 `has_unique_answer: false`，评分时单独桶统计，不计入模型错误（这是 laya-jev-lab 那份 benchmark 最大的坑：把无解题当错题）。
3. **难度分层**：clear / ambiguous / boundary / adversarial，每轨按比例抽。
4. **criteria 文案**：两边共用同一份文本；选项描述压到 ≤6 个词（Laya 英文 checkpoint 对选项有 ~192 token 预算，写法必须两边都公平）。
5. **试标复核**：100 条我逐条过一遍 gold 与 criteria；有歧义的标 `gold_alt` 或降级为无解；`question` 与 `gold` 的映射关系写进 `docs/RUBRIC.md`。
6. 抽样种子固定（seed=42），记录 dataset revision/hash，保证可复现。

## 4. 交付物

```
sys1-eval/
  docs/BENCHMARK-SPEC.md   # 本文
  docs/API-NOTES.md        # 两边 API 实测形状（已含 Jev 实测）
  docs/RUBRIC.md           # 试标规则 + 逐轨判分说明
  bench/cases.jsonl        # 100 条 pilot（含 gold）
  bench/manifest.json      # 数据集来源、revision、seed、抽样统计
  lib/{env,jev,laya,hf}.mjs
  scripts/build_cases.mjs  # 数据集 → cases.jsonl
  scripts/run_jev.mjs      # Jev 全量跑分（并发 + 重试 + 原始响应落盘）
  scripts/run_laya.py      # Laya 本地跑分
  scripts/score.mjs        # 指标计算 + 报表
  results/*.json|md        # 原始结果 + 报告
```

## 5. 已知风险 / 前提

- **HF 直连被墙**：huggingface.co 超时，权重与数据集统一走 `HF_ENDPOINT=https://hf-mirror.com`。
- **2080 Ti 是 Turing**：无 bf16，Laya 走 fp16/fp32；显存 22G 足够（权重 ~1.3–1.7GB/checkpoint）。
- **Laya 的 512/1024 上下文**是硬墙，长 state 会截断——这本身就是评测结论之一（"能力边界 ≠ 性能差距"）。
- **别把 Laya 官方数字和 Jev 官方数字混着比**：官方表里 Jev 列是"third-party published"，本次全部是本机/本 key 配对实测。
- 100 条只够定位方向，不足以下强结论；如需正式榜再扩到 500–2000。
