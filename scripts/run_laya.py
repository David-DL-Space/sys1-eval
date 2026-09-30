"""Run the pilot cases through Laya locally. Writes results/laya.jsonl."""
import json, os, sys, time

# HF_ENDPOINT: set to https://hf-mirror.com where huggingface.co is unreachable
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
# HF_HOME: set it yourself to relocate the weight cache

CASES = sys.argv[1] if len(sys.argv) > 1 else "bench/cases.jsonl"
OUT = sys.argv[2] if len(sys.argv) > 2 else "results/laya.jsonl"
MODEL = os.environ.get("LAYA_MODEL") or None
DEVICE = os.environ.get("LAYA_DEVICE") or None

cases = [json.loads(l) for l in open(CASES, encoding="utf-8-sig") if l.strip()]
LIMIT = int(os.environ.get("LAYA_LIMIT", "0"))
if LIMIT:
    cases = cases[:LIMIT]
os.makedirs("results", exist_ok=True)

import torch
from laya import Router

device = DEVICE or ("cuda" if torch.cuda.is_available() else "cpu")
print("torch", torch.__version__, "| device:", device, "| cuda:", torch.cuda.is_available())
PRELOAD = os.environ.get("LAYA_PRELOAD", "english,multilingual").split(",")
router = Router(device=device)          # note: Router(preload=True) always preloads all three checkpoints
router.preload(None if PRELOAD == ["all"] else PRELOAD)
print("preloaded:", router.loaded)

t = time.perf_counter()
_ = router.predict({"message": "hello there"}, {"q": {"type": "noul", "instructions": "Is `message` a greeting?"}})
print("warmup ok in %.0f ms" % ((time.perf_counter() - t) * 1000))

def normalise(res):
    out = {}
    for k, v in (res.get("answers") or {}).items():
        t = v.get("type")
        if t == "choice":
            out[k] = {"type": "choice", "choice": v.get("choice"), "confidence": v.get("confidence"), "probabilities": v.get("probabilities")}
        elif t == "noul":
            out[k] = {"type": "noul", "noul": v.get("noul")}
        elif t == "score":
            out[k] = {"type": "score", "score": v.get("score"), "confidence": v.get("confidence"), "probabilities": v.get("probabilities"), "legend": v.get("legend")}
        else:
            out[k] = v
    return out

results = []
for i, c in enumerate(cases):
    t0 = time.perf_counter()
    err = None
    res = None
    try:
        if MODEL:
            res = router.predict(c["state"], c["questions"], model=MODEL)
        else:
            res = router.predict(c["state"], c["questions"])
    except Exception as e:
        err = (type(e).__name__ + ": " + str(e))[:300]
    ms = (time.perf_counter() - t0) * 1000
    routing = (res or {}).get("routing") or {}
    row = {"id": c["id"], "track": c["track"], "dataset": c["dataset"], "lang": c["lang"],
           "option_count": c.get("option_count"), "ok": err is None, "ms": round(ms, 1),
           "model": routing.get("model"), "mean_confidence": (res or {}).get("mean_confidence"),
           "answers": normalise(res) if res else None, "error": err}
    results.append(row)
    print("." if err is None else "x", end="", flush=True)
    if (i + 1) % 25 == 0:
        print(" " + str(i + 1), flush=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(json.dumps(r, ensure_ascii=False) for r in results) + "\n")

ok = [r for r in results if r["ok"]]
lat = sorted(r["ms"] for r in ok)
print("")
print("=== LAYA RUN (" + (MODEL or "router-default") + ") ===")
print("cases:", len(cases), "| ok:", len(ok), "| failed:", len(results) - len(ok))
if lat:
    print("p50: %.0fms | p95: %.0fms | mean: %.0fms" % (lat[len(lat) // 2], lat[int(len(lat) * 0.95)], sum(lat) / len(lat)))
print("checkpoints used:", sorted({r["model"] for r in ok if r["model"]}))
for r in results:
    if not r["ok"]:
        print("FAIL", r["id"], r["error"][:200])
