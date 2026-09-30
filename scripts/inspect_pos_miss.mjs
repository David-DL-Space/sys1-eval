import { readFileSync } from "node:fs";
const cases = readFileSync("bench/rag-cases.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const L = new Map(readFileSync("results/laya-all.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.id,r];}));
const J = new Map(readFileSync("results/jev-all.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.id,r];}));
const bad = cases.filter(c => c.gold.relevant && c.neg_type === "pos" && L.get(c.id)?.ok && J.get(c.id)?.ok && L.get(c.id).answers.relevant.noul < 0.5 && J.get(c.id).answers.relevant.noul < 0.5);
console.log("positives missed by both:", bad.length, "of", cases.filter(c=>c.neg_type==="pos").length);
const byDs = {}; for (const c of bad) byDs[c.dataset]=(byDs[c.dataset]||0)+1; console.log("by dataset:", JSON.stringify(byDs));
for (const c of bad.slice(0, 5)) {
  console.log("\n--- " + c.id + " " + c.dataset + " (laya p=" + L.get(c.id).answers.relevant.noul.toFixed(2) + ", jev p=" + J.get(c.id).answers.relevant.noul.toFixed(2) + ") ---");
  console.log(c.state.replace(/\s+/g," ").slice(0, 520));
}
