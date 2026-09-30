import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
const files = [
  "data/raw/bfcl/BFCL_v3_live_simple.json", "data/raw/bfcl/BFCL_v3_live_irrelevance.json", "data/raw/bfcl/BFCL_v3_irrelevance.json",
  "data/raw/scifact/corpus.jsonl", "data/raw/scifact/queries.jsonl", "data/raw/scifact/qrels_test.tsv",
  "data/raw/banking77/test.jsonl", "data/raw/massive/test_en.json.gz", "data/raw/massive/test_zh-CN.json.gz",
  "data/raw/massive/test_ja.json.gz", "data/raw/massive/test_de.json.gz", "data/raw/massive/test_ar.json.gz",
  "data/raw/injections/test.jsonl", "data/raw/injections/train.jsonl", "data/raw/jailbreak/jailbreak_test_balanced.csv",
  "data/raw/routerbench/routerbench_slim.jsonl",
];
const cases = readFileSync("bench/cases.jsonl", "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byTrack = {};
for (const c of cases) byTrack[c.track] = (byTrack[c.track] || 0) + 1;
const manifest = {
  built_at: new Date().toISOString(),
  seed: 42,
  n_cases: cases.length,
  by_track: byTrack,
  low_confidence_items: cases.filter((c) => c.label_confidence === "low").map((c) => ({ id: c.id, why: c.label_note })),
  sources: files.map((f) => { const b = readFileSync(f); return { path: f, bytes: b.length, sha256: createHash("sha256").update(b).digest("hex").slice(0, 16) }; }),
  models: { jev: "typesafe/jev (api.typesafe.ai/v1/systemone)", laya: "convaiinnovations/laya (local, pip laya 0.3.21)" },
};
writeFileSync("bench/manifest.json", JSON.stringify(manifest, null, 2));
console.log("manifest written:", cases.length, "cases,", manifest.sources.length, "sources");
console.log("low-confidence:", JSON.stringify(manifest.low_confidence_items));
