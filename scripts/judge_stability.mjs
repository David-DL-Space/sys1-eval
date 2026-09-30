import { readFileSync } from "node:fs";
const load = (p) => new Map(readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.id,r];}));
const strict = load("results/judge.jsonl"), lenient = load("results/judge-lenient.jsonl");
const norm = (x) => String(x).trim().toLowerCase();
const asBool = (x) => { const v = norm(x); if (["yes","true","y","1"].includes(v)) return true; if (["no","false","n","0"].includes(v)) return false; return null; };
let n=0, flip=0, strictYes=0, lenientYes=0; const byTrack={};
for (const [id, L] of lenient) {
  const S = strict.get(id); if (!S || !L.judge_ok || !S.judge_ok) continue;
  if (L.question_kind !== "noul") continue;
  const a = asBool(S.judge_label), b = asBool(L.judge_label); if (a === null || b === null) continue;
  n++; if (a) strictYes++; if (b) lenientYes++; if (a !== b) flip++;
  const t = L.track; byTrack[t]=byTrack[t]||{n:0,flip:0}; byTrack[t].n++; if (a!==b) byTrack[t].flip++;
}
console.log("同一批样本，严格口径 vs 宽松口径（n=" + n + "）");
console.log("  标签翻转: " + flip + "/" + n + " = " + (100*flip/n).toFixed(1) + "%");
console.log("  判 yes 比例: 严格 " + (100*strictYes/n).toFixed(1) + "% → 宽松 " + (100*lenientYes/n).toFixed(1) + "%");
for (const [t,v] of Object.entries(byTrack)) console.log("   " + t.padEnd(28) + " 翻转 " + v.flip + "/" + v.n);
// 宽松口径下，数据集标签还对不对？
let agreeL=0, tot=0;
for (const [id, L] of lenient) {
  if (!L.judge_ok || L.question_kind !== "noul") continue;
  const b = asBool(L.judge_label); if (b === null) continue;
  tot++; if (b === L.dataset_gold) agreeL++;
}
console.log("  宽松口径下与数据集标签一致率: " + agreeL + "/" + tot + " = " + (100*agreeL/tot).toFixed(1) + "%（严格口径同一批 12.7% 量级）");
