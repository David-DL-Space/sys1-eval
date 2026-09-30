import { readFileSync } from "node:fs";
const cases = new Map(readFileSync("bench/cases.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>{const c=JSON.parse(l);return [c.id,c];}));
for (const name of ["jev","laya"]) {
  const rows = readFileSync("results/"+name+".jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
  const A = rows.filter(r=>r.track==="A_model_router" && r.ok);
  const picks = {};
  for (const r of A) { const a = r.answers.route; picks[a.choice] = (picks[a.choice]||0)+1; }
  console.log(name, "A-track choice counts:", JSON.stringify(picks), "| mean conf:", (A.reduce((s,r)=>s+r.answers.route.confidence,0)/A.length).toFixed(3));
  // AUC of P(cheap) against gold=cheap
  const pts = A.map(r=>{const c=cases.get(r.id); const p = r.answers.route.probabilities?.cheap ?? 0; const y = c.gold.route==="cheap"?1:0; return {p,y};});
  const pos = pts.filter(x=>x.y===1), neg = pts.filter(x=>x.y===0);
  let auc=0; for (const a of pos) for (const b of neg) auc += (a.p>b.p?1:a.p===b.p?0.5:0);
  auc = auc/(pos.length*neg.length);
  console.log("   P(cheap) AUC:", auc.toFixed(3), "| base rate cheap:", (pos.length/pts.length).toFixed(2), "| p(cheap) range:", Math.min(...pts.map(x=>x.p)).toFixed(2), "-", Math.max(...pts.map(x=>x.p)).toFixed(2));
}
// Laya overall: how many choice answers equal the FIRST criteria key?
{
  const rows = readFileSync("results/laya.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.ok);
  let first=0, tot=0;
  for (const r of rows) { const c = cases.get(r.id); const [k,spec]=Object.entries(c.questions)[0]; if (spec.type!=="choice") continue; const a=r.answers[k]; if(!a) continue; tot++; if (a.choice===Object.keys(spec.criteria)[0]) first++; }
  console.log("laya picks the first listed option:", first+"/"+tot);
  const rowsJ = readFileSync("results/jev.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.ok);
  let f2=0,t2=0;
  for (const r of rowsJ) { const c = cases.get(r.id); const [k,spec]=Object.entries(c.questions)[0]; if (spec.type!=="choice") continue; const a=r.answers[k]; if(!a) continue; t2++; if (a.choice===Object.keys(spec.criteria)[0]) f2++; }
  console.log("jev  picks the first listed option:", f2+"/"+t2);
}
