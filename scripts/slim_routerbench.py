"""Slim RouterBench export: prompt + two model scores/costs, for the model-router track."""
import json
import pandas as pd

CHEAP = "mistralai/mistral-7b-chat"
STRONG = "gpt-4-1106-preview"

df = pd.read_pickle("data/raw/routerbench/routerbench_0shot.pkl")
print("rows:", len(df))
print("eval_name counts:")
print(df["eval_name"].value_counts().to_string())
print("\ncheap score distribution:", df[CHEAP].value_counts().to_dict())
print("strong score distribution:", df[STRONG].value_counts().to_dict())
print("\ncost means:", df[CHEAP + "|total_cost"].mean(), df[STRONG + "|total_cost"].mean())

out = []
for _, r in df.iterrows():
    out.append({
        "sample_id": str(r["sample_id"]),
        "eval_name": r["eval_name"],
        "prompt": str(r["prompt"]),
        "cheap_score": float(r[CHEAP]),
        "strong_score": float(r[STRONG]),
        "cheap_cost": float(r[CHEAP + "|total_cost"]),
        "strong_cost": float(r[STRONG + "|total_cost"]),
    })
with open("data/raw/routerbench/routerbench_slim.jsonl", "w", encoding="utf-8") as fh:
    for o in out:
        fh.write(json.dumps(o, ensure_ascii=False) + "\n")
print("wrote", len(out), "rows -> data/raw/routerbench/routerbench_slim.jsonl")
both_ok = sum(1 for o in out if o["cheap_score"] >= 1 and o["strong_score"] >= 1)
cheap_only = sum(1 for o in out if o["cheap_score"] < 1 and o["strong_score"] >= 1)
both_bad = sum(1 for o in out if o["cheap_score"] < 1 and o["strong_score"] < 1)
print(f"cheap-ok={both_ok} ({both_ok/len(out):.1%}) | needs-strong={cheap_only} ({cheap_only/len(out):.1%}) | both-fail={both_bad} ({both_bad/len(out):.1%})")
