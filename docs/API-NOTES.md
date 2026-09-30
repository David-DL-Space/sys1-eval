# API 实测笔记（都在这台机器上跑过，不是抄文档）

## Jev（TypeSafe 官方 API）

```
POST https://api.typesafe.ai/v1/systemone
authorization: Bearer <jev_key>          # 来自 F:\\jev\\.env
content-type: application/json
{ "state": <string | object>, "model": "jev-latest", "questions": { "<id>": { "type": ..., "instructions": ..., "criteria": ... } } }
```

实测响应（2026-09-29，model 回显 `jev-1.13.0`）：

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "department": { "type": "choice", "choice": "billing", "confidence": 1,
                    "probabilities": { "billing": 1, "technical": 0, "sales": 0, "other": 0 } },
    "urgency":    { "type": "score", "score": 1.85, "confidence": 0.78,
                    "legend": { "0": "not urgent", "1": "soon", "2": "critical deadline or blocking issue" },
                    "probabilities": { "0": 0, "1": 0.15, "2": 0.85 } },
    "churn_risk": { "type": "noul", "noul": 0.98 }
  },
  "usage": { "input_tokens": 459, "output_tokens": 79 }
}
```

要点：
- `state` 可以直接传对象（会被序列化），也可以传纯字符串；本次评测统一传字符串，保证两边输入逐字节一致。
- 响应自带 `usage`，成本 = (input+output) × $0.042/1M。
- `score` 的取值区间由 criteria 数组长度决定（3 档 → 0..2，浮点）。
- `choice` 的 `confidence` == max(probabilities)（实测 60 条里 53 条一致，平均差 0.010）。
- 延迟实测 p50 310ms / p95 1476ms（含公网往返，出口在国内）。
- 一次调用可带多个 question（本次 A 轨就带 2 个），只按 token 计费。

## Laya（本地 `pip install laya` 0.3.21）

```python
import os
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"      # huggingface.co 本机直连超时
from laya import Router
router = Router(device="cuda")                            # 或 "cpu"
router.preload(["english", "multilingual"])               # Router(preload=True) 会加载全部三个
res = router.predict(state, questions)                    # model="typed-decisions" 可强制指定
```

要点 / 坑（按踩到的顺序）：
1. **HF 直连不通**：`huggingface.co` 超时（curl 15s 无响应），`hf-mirror.com` 正常。必须设 `HF_ENDPOINT`。
2. `Router(preload=True)` **总是加载全部三个 checkpoint**（约 2.2GB 权重、显存 ×3）。想只加载两个要显式 `router.preload(["english","multilingual"])`。
3. `router.loaded` 是 **property**，不是方法（写 `loaded()` 会报 `'list' object is not callable`）。
4. **checkpoint 自带温度参数非法**：加载时稳定复现
   `RuntimeWarning: this checkpoint ships invalid temperatures or values outside [0.5, 5]; using choice:11+=0.10058280825614929 -> 0.5. Treat confidence from the affected entries as uncalibrated.`
   —— 官方自己说"受影响的条目置信度不可校准"。
5. **响应里的 `confidence` 不是 max(probabilities)**。`laya.common.answer_confidence` 的注释写明：仓库里所有校准指标都用 `conf = max(probs)`，而 `confidence_from_probs`（熵口径）"不在同一尺度、不能拿同一个阈值比"。
   实测：`|max(p) - response.confidence|` 平均 **0.299**（最大 0.585），60 条 choice 里只有 7 条一致。Jev 同一指标是 0.010。
   → **做门控/校准必须自己用 `max(probabilities)`**，本报告已按此口径计算。
6. **`laya-typed-decisions` 在 CUDA 上硬崩**：Windows + torch 2.14.0+cu126 + RTX 2080 Ti，`predict(..., model="typed-decisions")` 直接 access violation（退出码 `-1073741819` / 0xC0000005），没有 Python traceback。同一 checkpoint 在 **CPU** 上正常。
7. `choice` 的选项有 **head_max_len=192**（多语 256）的 token 预算：选项总长超预算时，每个选项被截断到 `max(4, (budget-16)/n)` token，问题指令本身被截到 `max(8, 剩余)`，再超就吃 `state` 的空间。77 个标签时每个选项只剩 ~4 token —— 这就是官方 BANKING77 掉到 0.425 的结构性原因，本次评测复现了它。

## 本机环境

| 项 | 值 |
|---|---|
| OS / Shell | Windows（PowerShell 5.1，**没有 pwsh 7**） |
| Python | 3.11.15（venv 在 `F:\\sys1-eval\\venv`） |
| torch | 2.14.0+cu126（CUDA True，RTX 2080 Ti 22G，Turing sm_75 无 bf16） |
| laya / transformers | 0.3.21 / 5.17.0 |
| pip 源 | 清华 PyPI 镜像；torch CUDA wheel 走 SJTU 镜像（download.pytorch.org 实测仅 ~100KB/s） |
