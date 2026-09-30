import json
rows = []
with open("data/raw/pii/val_en_8k.jsonl", encoding="utf-8") as fh:
    for i, line in enumerate(fh):
        if i >= 2000:
            break
        rows.append(json.loads(line))
keep = [{"source_text": r["source_text"], "target_text": r["target_text"], "id": r.get("id")} for r in rows if r.get("source_text") and r.get("target_text")]
with open("data/raw/pii/sample.jsonl", "w", encoding="utf-8") as fh:
    for r in keep:
        fh.write(json.dumps(r, ensure_ascii=False) + "\n")
print("pii sample rows:", len(keep))
print("source:", keep[0]["source_text"][:180].replace("\n", " "))
print("target:", keep[0]["target_text"][:180].replace("\n", " "))
