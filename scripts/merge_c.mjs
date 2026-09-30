import { readFileSync, writeFileSync } from "node:fs";
const fix = (allPath, fixPath, outPath) => {
  const all = readFileSync(allPath, "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  const fx = new Map(readFileSync(fixPath, "utf8").split(/\r?\n/).filter(Boolean).map(l => { const r = JSON.parse(l); return [r.id, r]; }));
  let replaced = 0;
  const merged = all.map((r) => (fx.has(r.id) ? (replaced++, fx.get(r.id)) : r));
  writeFileSync(outPath, merged.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(outPath, "rows:", merged.length, "| replaced:", replaced);
};
fix("results/jev-all.jsonl", "results/jev-c-fixed.jsonl", "results/jev-all.jsonl");
fix("results/laya-all.jsonl", "results/laya-c-fixed.jsonl", "results/laya-all.jsonl");
const cases = readFileSync("bench/cases-large.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const others = ["bench/rag-cases.jsonl","bench/rag-multi-cases.jsonl"].map(f=>readFileSync(f,"utf8").replace(/^\uFEFF/,"")).join("");
writeFileSync("bench/all-cases.jsonl", cases.map(c=>JSON.stringify(c)).join("\n") + "\n" + others);
console.log("all-cases rebuilt");
