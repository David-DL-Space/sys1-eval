"""Measure Laya batch throughput on the 2080 Ti vs Jev API economics."""
import json, os, time
# HF_ENDPOINT: set to https://hf-mirror.com where huggingface.co is unreachable
# HF_HOME: set it yourself to relocate the weight cache
import torch
from laya import Router

cases = [json.loads(l) for l in open("bench/cases.jsonl", encoding="utf-8") if l.strip()]
sel = [c for c in cases if c["track"] == "D_rag_gate"]          # identical question text across cases
q = sel[0]["questions"]
states = [c["state"] for c in sel]

router = Router(device=os.environ.get("LAYA_DEVICE", "cuda"))
router.preload(["english"])
router.predict(states[0], q)                                    # warmup

reqs = [{"state": s, "questions": q} for s in states]
t0 = time.perf_counter(); router.predict_batch(reqs); dt = time.perf_counter() - t0
print("predict_batch %d: %.3fs = %.1f decisions/s" % (len(states), dt, len(states) / dt))

t0 = time.perf_counter()
for s in states:
    router.predict(s, q)
dt2 = time.perf_counter() - t0
print("sequential   %d: %.3fs = %.1f decisions/s" % (len(states), dt2, len(states) / dt2))

big = [{"state": s, "questions": q} for s in states * 27]
t0 = time.perf_counter(); router.predict_batch(big); dt3 = time.perf_counter() - t0
print("batch        %d: %.3fs = %.1f decisions/s" % (len(big), dt3, len(big) / dt3))

# Jev-equivalent token cost for the same traffic (measured on this task)
jev = [json.loads(l) for l in open("results/jev.jsonl", encoding="utf-8") if l.strip()]
d = [r for r in jev if r["track"] == "D_rag_gate" and r["ok"]]
tok = sum((r["usage"]["input_tokens"] + r["usage"]["output_tokens"]) for r in d) / len(d)
print("Jev same task: %.0f tokens/decision -> $%.6f per decision -> $%.2f per 1M decisions (list price)" % (tok, tok * 0.042 / 1e6, tok * 0.042 / 1e6 * 1e6))
print("if it were on one 2080 Ti at the batch rate above: 1M decisions = %.1f GPU-hours" % (1e6 / (len(big) / dt3) / 3600))
