"""Convert agent-infra sources to jsonl and print their shapes."""
import json, gzip, sys
import pandas as pd

def peek(name, obj, n=1):
    print("==", name, "rows:", len(obj))
    for r in obj[:n]:
        print("   ", json.dumps(r, ensure_ascii=False)[:400])

# HaluEval qa
h = pd.read_parquet("data/raw/halueval/qa.parquet")
print("halueval columns:", list(h.columns), "rows:", len(h))
print("qa pairs: right_answer + hallucinated_answer columns are the two labels")
h.to_json("data/raw/halueval/qa.jsonl", orient="records", lines=True, force_ascii=False)
peek("halueval", h.to_dict("records"))

# PII
pii = []
with open("data/raw/pii/val_en_8k.jsonl", encoding="utf-8") as fh:
    for i, line in enumerate(fh):
        if i >= 4000:
            break
        pii.append(json.loads(line))
print("\npii columns:", list(pii[0].keys()), "sampled:", len(pii))
peek("pii", pii)

# HarmBench behaviors
import csv
hb = list(csv.DictReader(open("data/raw/harmbench/behaviors.csv", encoding="utf-8")))
print("\nharmbench columns:", list(hb[0].keys()), "rows:", len(hb))
peek("harmbench", hb)

# do-not-answer
dna = pd.read_csv("data/raw/donotanswer/data_en.csv")
print("\ndo-not-answer columns:", list(dna.columns), "rows:", len(dna))
dna.to_json("data/raw/donotanswer/data_en.jsonl", orient="records", lines=True, force_ascii=False)
peek("dna", dna.to_dict("records"))

# AgentDojo vectors: keep both the benign defaults and the suspicious ones
import re
vec = {}
for suite in ["banking", "slack", "travel", "workspace"]:
    txt = open(f"data/raw/agentdojo/injection_vectors_{suite}.yaml", encoding="utf-8").read()
    cur = None
    for line in txt.splitlines():
        m = re.match(r"^(\w+):\s*$", line)
        if m:
            cur = m.group(1)
            continue
        m = re.match(r"^\s+default:\s*\"(.*)\"\s*$", line)
        if m and cur:
            vec[suite + "/" + cur] = m.group(1)
json.dump(vec, open("data/raw/agentdojo/vectors.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nagentdojo vectors:", len(vec))
for k, v in list(vec.items())[:6]:
    print("   ", k, "->", v[:90])
