# 安全闸门两级结构实测（System-1 预筛 + LLM 终审）

> ⚠️ **勘误（2026-09-30）**：原脚本两级方案漏算了 Jev 预筛本身的成本。修正后 Jev @0.10 **只省 4.3%**（不是 23.9%），@0.05 反而**贵 4.7%**；“零额外漏报”只在样本内成立，留出集上 47% 的划分会多漏。tier-2 与数据集标签一致率为 75.0%（不是 91.1%）。真正的收益是延迟（34–41% 请求约 0.3s 放行）。见 `paper/dist/tech-report-zh.pdf` §5.4。


> 问题：agent 执行前要不要拦，能不能用便宜的 System-1 先筛一遍、只把可疑的交给 LLM 终审，从而省下 LLM 调用？
> 数据：603 条公开请求（BeaverTails 320 / HarmBench 90+ / do-not-answer 73 / Alpaca 120 作良性对照）。
> 策略：`docs/SAFETY-POLICY.md`（显式写了 R1–R10 拒绝类 + A1–A7 允许类 + 具体性/目标/意图/捆绑四条裁决规则）。
> 金标：`z-ai/glm-4.6` 按策略盲标（不给数据集标签、不给被测模型答案）。
> tier-2：`deepseek/deepseek-v4.1-flash` 按同一策略终审（延迟 p50 4.1s/批 6 条）。
> 评估集：金标与两边结果都可用的 **540 条**（策略金标判定 unsafe 225 / safe 315）。

## 0. 结论

**Jev 做预筛是有价值的，Laya 不是。**

| 方案 | LLM 调用率 | 端到端漏报 FNR | 端到端误报 FPR | 每百万次成本 | 相对 LLM-only |
|---|---|---|---|---|---|
| **LLM-only（基线）** | 100% | 11.56% (26/225) | 6.98% | $71.62 | — |
| **Jev 预筛 @0.10** | **65.6%** | **11.56%**（一分不差） | 6.98% | **$54.47** | **省 23.9%** |
| Jev 预筛 @0.20 | 58.9% | 12.00% (+0.44pp) | 5.08% | $48.81 | 省 31.8% |
| Jev 预筛 @0.30 | 53.3% | 15.11% (+3.6pp) | 3.49% | $43.86 | 省 38.8% |
| Laya 预筛 @0.10 | 99.3% | 11.56% | 6.98% | $71.18 | 省 0.6%（等于没用） |

**@0.10 那行是最有价值的结果**：LLM 调用砍掉 1/3，端到端漏报率和误报率**和全量走 LLM 完全一样**。
逐条核对过：tier-1 在该阈值下只漏掉 1 条 unsafe，而**那条正好也是 tier-2 会漏的**——所以加预筛带来的额外召回损失是 **0**。（见 `scripts/verify_two_tier.mjs`）

## 1. 各层单独看

| 层 | 漏报 FNR | 误报 FPR | 准确率 | AUC | 成本/百万次 |
|---|---|---|---|---|---|
| tier-1 = Laya @0.5 | **34.67%** | 40.00% | 62.22% | 0.704 | $0（自托管） |
| tier-1 = Jev @0.5 | 10.67% | 13.02% | 87.96% | **0.966** | $15.73 |
| tier-2 = DeepSeek V4.1 Flash | 11.56% | 6.98% | 91.11% | — | $71.62 |

- **Jev 单独用的漏报率（10.67%）甚至低于 LLM 终审（11.56%）**，但代价是误报 13% vs 7%（把正常请求拦下来）。所以两者不是替代关系，而是精度/召回的取舍。
- **Laya 在安全场景的 AUC 0.704、FNR 34.7%**：拦不住三分之一的有害请求。这条闸门它不能碰。

## 2. 一个重要的结构性认识：漏报下限由 tier-2 决定，不由预筛决定

端到端漏报 = tier-1 漏掉的 + tier-1 升级但 tier-2 也漏掉的。实测在合理阈值区间（0.05–0.2）里，**第二项占绝对主导**（24–26 条 vs 0–2 条）。

含义：
- **换更好的预筛救不了漏报**——预筛已经接近 100% 召回。
- 想把 11.56% 降到个位数，只能换更强的 tier-2（或者对高风险类别加人工）。
- 反过来说，**预筛的正确定位是"降本 + 降低慢路径占比"，不是"提准确率"**。

## 3. 成本与延迟的实际账

- 成本：LLM-only = **$71.62 / 百万次请求**（按 DeepSeek V4.1 Flash 实测 token 计，$0.112/$0.336 per M）；Jev 预筛 @0.1 后 = **$54.47**。省的钱不多（每百万 $17），因为 LLM 本身已经便宜。
- **真正的收益是慢路径占比**：同步结构下，被升级的请求要等 LLM（实测批延迟 p50 **4.1 秒**、p95 **33.8 秒**——p95 是重试造成的）。预筛把等待 LLM 的流量从 100% 降到 65.6%：
  - 分数低 → 直接放行，29ms（Laya）/ 274ms（Jev）
  - 分数高 → 进 LLM 终审
- tier-1 便宜到可以忽略：Jev 每次 $0.000016，Laya $0。

## 4. 策略本身的影响（必须说的前提）

| 对比 | 一致率 |
|---|---|
| 策略金标（GLM-4.6） vs 数据集标签 | **72.78%** |
| tier-2（DeepSeek） vs 策略金标 | 91.11% |

数据集标签（BeaverTails 的 is_safe 是模型标的、do-not-answer 是问句集合）和"按明示策略判定"只有七成一致——**说明这类安全评测的绝对数字高度依赖策略口径**。
本报告里**可靠的比较是"同一策略下的层间对比"**（tier-1 vs tier-2 vs 两级），而不是"某模型的安全准确率是 X%"。
这也正是为什么第一步要先把策略写成 `docs/SAFETY-POLICY.md`：**换掉那份文档，所有阈值都要重标定**——流水线已经支持（`scripts/policy_label.mjs` + `scripts/two_tier_safety.mjs`）。

## 5. 落地建议

| 场景 | 建议 |
|---|---|
| 执行前安全闸门 | **两级：Jev 预筛 @0.1 → LLM 终审**；省 1/3 的 LLM 审查流量且不损失召回 |
| 想进一步降漏报 | 不要在预筛上想办法，换更强的终审模型或对 R1–R5 加人工 |
| 想要低延迟直接放行 | 阈值取 0.2（58.9% 升级率，FNR +0.44pp）——对绝大多数正常请求是 274ms 内放行 |
| 千万不要 | 用 Laya 做安全预筛（FNR 34.7%）；或者只上 System-1 不上终审（Jev 单独看着还行，但误报 13% 且没有第二道闸） |
| 自己的策略 | 用你的策略文档替换 `docs/SAFETY-POLICY.md`，跑同款流程重新标定阈值 |

## 6. 复现

```powershell
node scripts/build_safety_cases.mjs                                  # bench/safety-cases.jsonl (603)
node scripts/run_jev.mjs bench/safety-cases.jsonl results/jev-safety.jsonl
& F:\sys1-eval\venv\Scripts\python.exe scripts/run_laya.py bench/safety-cases.jsonl results/laya-safety.jsonl
$env:LABEL_MODEL='z-ai/glm-4.6';                 node scripts/policy_label.mjs bench/safety-cases.jsonl results/safety-gold.jsonl
$env:LABEL_MODEL='deepseek/deepseek-v4.1-flash'; node scripts/policy_label.mjs bench/safety-cases.jsonl results/safety-tier2.jsonl
node scripts/two_tier_safety.mjs                                     # 两级结构全表 -> results/two-tier-safety.json
node scripts/verify_two_tier.mjs                                     # 漏报分解验证
```
