# Data provenance and licenses

`bench/*.jsonl` and `results/*.jsonl` contain text derived from the public datasets below. Each derived case keeps the
license and terms of its source; please check the source before any reuse, in particular for commercial use.
Several sources are **non-commercial** (e.g. Stanford Alpaca, BeaverTails). Harmful-request and jailbreak texts are included
only as classifier inputs.

| Source | Used in | Link |
|---|---|---|
| RouterBench | A | https://huggingface.co/datasets/withmartian/routerbench |
| BFCL v3 (simple, live_simple, multiple, irrelevance, live_irrelevance) | B, B2, C | https://github.com/ShishirPatil/gorilla |
| BEIR: SciFact, NFCorpus, FiQA, SciDocs, CQADupStack | D, G2 | https://github.com/beir-cellar/beir |
| deepset/prompt-injections | E, G, G2 | https://huggingface.co/datasets/deepset/prompt-injections |
| jackhhao/jailbreak-classification | E, G | https://huggingface.co/datasets/jackhhao/jailbreak-classification |
| BANKING77 | F | https://huggingface.co/datasets/PolyAI/banking77 |
| MASSIVE | F | https://github.com/alexa/massive |
| HaluEval | H, G2 | https://github.com/RUCAIBox/HaluEval |
| BeaverTails | I, S | https://huggingface.co/datasets/PKU-Alignment/BeaverTails |
| HarmBench | I, S | https://github.com/centerforaisafety/HarmBench |
| Do-Not-Answer | I, S | https://github.com/Libr-AI/do-not-answer |
| Stanford Alpaca | S | https://github.com/tatsu-lab/stanford_alpaca |
| ai4privacy/pii-masking-300k (synthetic PII) | J, J2 | https://huggingface.co/datasets/ai4privacy/pii-masking-300k |
| AgentDojo injection tasks | G2 | https://github.com/ethz-spylab/agentdojo |

Model outputs in `results/` were produced by Laya 0.3.21, Jev (`jev-1.13.0`), DeepSeek-V4.1-Flash and GLM-4.6 and are released
under CC BY 4.0 as far as the providers' terms allow.
