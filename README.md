# sys1-eval — System-1 decision models for LLM agent harnesses

Paired, self-audited evaluation of two *System-1 decision models* — **Laya** (open weights, local) and **Jev** (hosted API) —
on 11 decision points of an LLM agent harness: model routing, tool selection, tool-call guardrails, RAG relevance gating,
prompt-injection screening (user turn vs. tool output), groundedness checks, pre-execution safety and PII egress.

> Paper: *Fast Models, Slow Evidence: A Paired and Self-Audited Evaluation of System-1 Decision Models for LLM Agent Harnesses* — Jiawei Li, 2026.
> PDF: [`paper/dist/acl-preprint.pdf`](paper/dist/acl-preprint.pdf) · 中文技术报告: [`paper/dist/tech-report-zh.pdf`](paper/dist/tech-report-zh.pdf)

## Key results

| Decision point | Laya | Jev | Paired Δ (95% CI) |
|---|---|---|---|
| Tool selection, random distractors (n=400) | 84.0 | 99.5 | +15.5 [11.9, 19.1] |
| Tool selection, nearest distractors, unique gold (n=281) | 61.6 | 98.9 | +37.4 |
| Large label set, 60–77 intents (n=200) | 35.0 | 81.0 | +46.0 [38.7, 53.3] |
| Injection guard (n=400) | 78.2 | 93.0 | +14.8 [10.1, 19.4] |
| Groundedness (n=200) | 79.0 | 90.0 | +11.0 [5.7, 16.3] |
| RAG relevance gate (n=1,920) | 60.5 | 61.0 | +0.5 [−2.0, 3.0] (tie) |
| Model routing (n=400) | 48.5 | 50.0 | +1.5 [−4.8, 7.8] (both at chance) |

* Laya changes **30.3%** of its answers when only the option order is reversed (Jev 1.8%).
* Used as gates, System-1 models save much less than naive accounting suggests; see the self-audit table in §7 of the paper.

## Repository layout

```
bench/            all evaluation cases (JSONL; one decision per line, byte-identical input for both systems)
results/          raw responses (day 1: Windows + RTX 2080 Ti) and results/mac/ (day 2: macOS + Apple M4, DeepSeek reference & label audit)
lib/              API clients (Jev, LLM judge) and .env loader
scripts/          case builders (build_*), runners (run_jev.mjs, run_laya.py, llm_ref.mjs), per-track analyses
paper/analysis.py single source of truth: recomputes every number and figure -> paper/numbers.json, paper/figures/
paper/src/        shared paper source; paper/build_venues.py generates ACL / ARR / arXiv / WWW / KDD / TMLR / TIST versions
docs/             first-version design notes and findings (with errata banners)
```

Raw upstream datasets (`data/raw/`) are not redistributed; `scripts/fetch_data*.ps1` and `scripts/convert_*.py` download and convert them.

## Reproduce

```bash
python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt      # Laya 0.3.21 runs on CPU, CUDA or MPS
cp .env.example .env                                                         # JEV_KEY=..., DEEPSEEK_KEY=... (never commit)

# numbers and figures from the released raw outputs (no API calls)
.venv/bin/python paper/analysis.py

# re-run the control experiments (B2 / G2 / J2)
.venv/bin/python scripts/build_v2_cases.py
node scripts/run_jev.mjs bench/v2-cases.jsonl results/mac/jev-v2.jsonl                      # Node >= 20
LAYA_DEVICE=cpu .venv/bin/python scripts/run_laya.py bench/v2-cases.jsonl results/mac/laya-v2.jsonl
DS_ENV_FILE=.env node scripts/llm_ref.mjs audit  bench/v2-cases.jsonl results/mac/ds-audit-tools.jsonl
DS_ENV_FILE=.env node scripts/llm_ref.mjs answer bench/v2-cases.jsonl results/mac/ds-v2.jsonl

# paper versions (needs tectonic)
.venv/bin/python paper/build_venues.py
```

Versions used: Laya 0.3.21 (transformers 5.17.0, torch 2.14.0), Jev `jev-1.13.0`, DeepSeek `deepseek-flash` (V4.1-Flash).
Confidence is always `max(probabilities)`; Laya's response field `confidence` is on a different (entropy) scale.

## Citation

```bibtex
@misc{li2026fastmodels,
  title  = {Fast Models, Slow Evidence: A Paired and Self-Audited Evaluation of System-1 Decision Models for LLM Agent Harnesses},
  author = {Li, Jiawei},
  year   = {2026},
  url    = {https://github.com/David-DL-Space/sys1-eval}
}
```

## License

Code: MIT (see `LICENSE`). Our annotations, model outputs and derived statistics: CC BY 4.0.
Evaluation cases embed text from third-party datasets and keep their original licenses — see [`DATA_LICENSE.md`](DATA_LICENSE.md).
