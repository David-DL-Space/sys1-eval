# sys1-eval — System-1 决策层评测：Laya（本地） vs Jev（API）

给 Agent harness 的决策层选型做的配对实测。两边喂逐字节相同的输入，置信度统一用 `max(probabilities)`（Laya 官方口径）。

## 五轮评测

| 轮次 | 规模 | 用途 | 结果 |
|---|---|---|---|
| pilot | 100 条（人工逐条核验） | 校准 rubric、发现标注口径问题 | `results/report.md` |
| **规模集** | **2100 条** | 结论依据（Wilson + McNemar） | `results/report-large.md` |
| **RAG 深挖** | **1920 + 400** | 唯一"两家打平"的轨道 | `results/report-rag.md` |
| **Agent Infra 专项** | **1280 条**（5 条轨道，全公开数据） | 间接注入 / 落地性 / 执行前安全 / PII 出网 + 通道配对实验 | `results/report-agentinfra.md` |
| **安全闸门两级结构** | **603 条**（BeaverTails/HarmBench/do-not-answer/Alpaca + 显式策略金标） | System-1 预筛 + LLM 终审：省 1/3 LLM 调用且不损失召回 | `docs/FINDINGS-SAFETY.md` |

## 结论速览

- `docs/FINDINGS.md`：总体 63.1% vs 76.7%（n=2100）；工具选择/注入护栏/大标签集 Jev 压倒性领先；模型路由与 RAG 门控两家打平且都不能用；Laya 的 choice 对选项顺序有 30.3% 的不稳定（Jev 1.8%）；措辞×seed 的准确率极差 5–15pp，但"谁更强"8/8 组合稳定。
- `docs/FINDINGS-RAG.md`：RAG 门控不能做"跳过 LLM"的闸门（5% 漏报预算下 Laya 仍要调 93% 的 LLM）；硬负样本上 Laya 反而比 Jev 准 12.5pp。
- `docs/FINDINGS-AGENTINFRA.md`：**投递通道会系统性改变判断**（同一 payload 换成工具输出，P(attack) 抬高 0.11–0.16、良性误报翻 2–3 倍）；只有"间接注入"和"落地性校验"两道闸门值得上 Jev；安全闸门和 PII 闸门不要用 System-1。



## v2（2026-09-30）：论文、技术报告与勘误

- **论文**：各投稿版本在 `paper/dist/`（共享源文件 `paper/src/`，由 `paper/build_venues.py` 生成）
- **中文技术报告**：`paper/dist/tech-report-zh.pdf`（源文件 `paper/tex/tech-report-zh.tex`）
- **单一数据来源**：`paper/analysis.py` 从原始结果重算所有数字与图表 → `paper/numbers.json`、`paper/figures/`
- **新增对照实验**：`scripts/build_v2_cases.py`（B2 相似干扰 / G2 文档内注入 × 双通道 / J2 自然脱敏），结果在 `results/mac/`（Laya Mac CPU、Jev 第 2 天、DeepSeek 参照与标签审计）
- **已修正脚本**：`two_tier_safety.mjs`（漏算预筛成本、分母、一致率表达式）、`rag_analysis.mjs` / `gate_config.mjs`（“端到端正确率”实为闸门准确率；gate-config 每闸门单独输出）、`lib/judge.mjs`（支持直连 DeepSeek）
- 各 `docs/FINDINGS*.md` 顶部已加勘误说明


## 目录

```
bench/cases.jsonl          100 条 pilot（人工核验过）
bench/cases-large.jsonl    2100 条规模集（seed=7，与 pilot 不重叠）
bench/rag-cases.jsonl      1920 条 RAG 单段落（800 正 / 800 BM25 硬负 / 320 随机负）
bench/rag-multi-cases.jsonl 400 条 top-5 检索上下文（200 命中 / 200 未命中）
bench/manifest.json        数据来源 sha256、seed、分轨统计
docs/BENCHMARK-SPEC.md     评测设计（轨道/指标/口径）
docs/RUBRIC.md             试标规则 + 规模集的三层质量控制
docs/API-NOTES.md          两边 API 实测形状与 7 个坑
docs/FINDINGS.md           规模集结论与落地建议
docs/FINDINGS-RAG.md       RAG 门控深挖
lib/{env,jev,hf}.mjs       Jev 客户端 / env 读取 / HF 镜像工具
scripts/                   build_* / run_* / score* / rag_analysis / 部署与抓取
results/                   原始结果 + 生成的报告
```

## 复现

```powershell
# 0) 环境：Laya 装在 F:\sys1-eval\venv（torch 2.14.0+cu126 + laya 0.3.21），HF 走镜像
$env:HF_ENDPOINT = "https://hf-mirror.com"

# 1) 数据（HF 直连不通，统一走 hf-mirror.com）
.\scripts\fetch_data.ps1; .\scripts\fetch_data2.ps1
& F:\sys1-eval\venv\Scripts\python.exe scripts/convert_raw.py all
& F:\sys1-eval\venv\Scripts\python.exe scripts/slim_routerbench.py

# 2) 构建 case
node scripts/build_cases.mjs          # pilot 100
& F:\sys1-eval\venv\Scripts\python.exe scripts/build_rag_cases.py   # RAG 1920
& F:\sys1-eval\venv\Scripts\python.exe scripts/build_rag_multi.py   # RAG 多段落 400
node scripts/build_cases_large.mjs    # 规模集 2100
node scripts/manifest.mjs

# 3) 跑分（规模集 + RAG 一起跑，4220 条）
node -e "const fs=require('fs');fs.writeFileSync('bench/all-cases.jsonl',['bench/cases-large.jsonl','bench/rag-cases.jsonl','bench/rag-multi-cases.jsonl'].map(f=>fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'')).join(''))"
$env:CONC='6'; node scripts/run_jev.mjs bench/all-cases.jsonl results/jev-all.jsonl
& F:\sys1-eval\venv\Scripts\python.exe scripts/run_laya.py bench/all-cases.jsonl results/laya-all.jsonl

# 4) 报告
node scripts/score2.mjs bench/cases-large.jsonl results/report-large.md results/laya-all.jsonl results/jev-all.jsonl
node scripts/rag_analysis.mjs bench/rag-cases.jsonl results/report-rag.md results/laya-all.jsonl results/jev-all.jsonl
```

## 关键约定

- Jev key 从 `F:\jev\.env` 的 `jev_key` 读取，**不落盘、不进日志**。
- Laya 权重缓存在 `F:\sys1-eval\hf-cache`（走 hf-mirror）。
- 本地延迟不含网络，Jev 延迟含公网往返，两者不直接相减。
- 报告里所有置信度/校准/门控数字都用 `max(probabilities)`；Laya 响应里的 `confidence` 字段是另一套口径（平均差 0.299）。