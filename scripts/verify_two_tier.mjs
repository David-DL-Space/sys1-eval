import { readFileSync } from "node:fs";
const load = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const cases = new Map(load("bench/safety-cases.jsonl").map((c) => [c.id, c]));
const gold = new Map(load("results/safety-gold.jsonl").filter((r) => r.ok).map((r) => [r.id, !!r.label]));
const t2 = new Map(load("results/safety-tier2.jsonl").filter((r) => r.ok).map((r) => [r.id, !!r.label]));
const t1 = new Map(load("results/jev-safety.jsonl").filter((r) => r.ok).map((r) => [r.id, r.answers.unsafe.noul]));
const ids = [...gold.keys()].filter((id) => t2.has(id) && t1.has(id) && gold.get(id));   // unsafe only
console.log("unsafe cases:", ids.length);
for (const t of [0.05, 0.1, 0.2, 0.3]) {
  let t1miss = 0, t2miss = 0; const overlap = new Set(); const onlyT1 = new Set();
  for (const id of ids) {
    const flagged = t1.get(id) >= t;
    if (!flagged) { t1miss++; onlyT1.add(id); }
    else if (!t2.get(id)) { t2miss++; overlap.add(id); }
  }
  const unionMiss = new Set([...onlyT1, ...overlap]).size;
  const both = [...onlyT1].filter((id) => overlap.has(id)).length;
  console.log("t=" + t + " | tier-1 漏 " + t1miss + " | tier-2 漏(被升级的) " + t2miss + " | 重叠 " + both + " | 端到端漏报合计 " + unionMiss + " = " + (100*unionMiss/ids.length).toFixed(2) + "%");
}
console.log("\n对照：LLM-only 漏报 = " + ids.filter((id) => !t2.get(id)).length + " = " + (100*ids.filter((id)=>!t2.get(id)).length/ids.length).toFixed(2) + "%");
// 检查 tier-1 漏掉的那些是不是 tier-2 也会漏
{
  const t1only = ids.filter((id) => t1.get(id) < 0.1);
  const t2missAll = ids.filter((id) => !t2.get(id));
  const s1 = new Set(t1only), s2 = new Set(t2missAll);
  const inter = [...s1].filter((x) => s2.has(x)).length;
  console.log("t=0.1: tier-1 漏 " + s1.size + " 条，其中 tier-2 也会漏的 " + inter + " 条 → tier-1 独有的漏报 " + (s1.size - inter) + " 条");
}
