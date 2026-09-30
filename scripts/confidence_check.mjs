import { readFileSync } from "node:fs";
const load = (p) => { try { return new Map(readFileSync(p,"utf8").replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.id,r];})); } catch { return null; } };
const cases = new Map([..."bench/cases-large.jsonl bench/rag-cases.jsonl".split(" ")].flatMap(f=>readFileSync(f,"utf8").replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean).map(l=>{const c=JSON.parse(l);return [c.id,c];})));
const keyOf = (c) => Object.keys(c.gold)[0];
const label = (r, c) => { if (!r || !r.ok) return null; const a = r.answers[keyOf(c)]; if (!a) return null; return a.type === "noul" ? (a.noul >= 0.5) : a.choice; };
const prob = (r, c) => { if (!r || !r.ok) return null; const a = r.answers[keyOf(c)]; if (!a) return null; return a.type === "noul" ? a.noul : (a.probabilities ? Math.max(...Object.values(a.probabilities)) : null); };
const mean = (a) => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;

const base = { laya: load("results/laya-all.jsonl"), jev: load("results/jev-all.jsonl") };
const rep  = { laya: load("results/laya-repeat.jsonl"), jev: load("results/jev-repeat.jsonl") };
const par  = { laya: load("results/laya-paraphrase.jsonl"), jev: load("results/jev-paraphrase.jsonl") };

console.log("### 1) 重复运行（同一输入跑第二遍）");
for (const m of ["laya","jev"]) {
  let n=0, flip=0; const dp=[]; const byTrack={};
  for (const [id, c] of cases) {
    const a = base[m].get(id), b = rep[m].get(id); if (!a || !b || !a.ok || !b.ok) continue;
    if (!par[m].has(id) && !rep[m].has(id)) continue;
    const la = label(a,c), lb = label(b,c); if (la === null || lb === null) continue;
    n++; const t=c.track; byTrack[t]=byTrack[t]||{n:0,flip:0}; byTrack[t].n++;
    if (la !== lb) { flip++; byTrack[t].flip++; }
    const pa = prob(a,c), pb = prob(b,c); if (pa!=null && pb!=null) dp.push(Math.abs(pa-pb));
  }
  console.log("  " + m + ": n=" + n + " | 答案翻转 " + flip + "/" + n + " = " + (100*flip/n).toFixed(1) + "% | 平均 |Δp| = " + mean(dp).toFixed(4));
  console.log("     " + Object.entries(byTrack).map(([t,v])=>t.split("_")[0]+" "+v.flip+"/"+v.n).join(" | "));
}

console.log("\n### 2) 提问措辞改写（criteria 完全不变，只改 instructions）");
for (const m of ["laya","jev"]) {
  let n=0, flip=0, accBase=0, accPar=0; const dp=[]; const byTrack={};
  for (const [id, c] of cases) {
    const a = base[m].get(id), b = par[m].get(id); if (!a || !b || !a.ok || !b.ok) continue;
    const la = label(a,c), lb = label(b,c); if (la === null || lb === null) continue;
    const gold = c.gold[keyOf(c)];
    n++; if (la !== lb) flip++;
    if (la === gold) accBase++; if (lb === gold) accPar++;
    const pa = prob(a,c), pb = prob(b,c); if (pa!=null && pb!=null) dp.push(Math.abs(pa-pb));
    const t=c.track; byTrack[t]=byTrack[t]||{n:0,flip:0,d:0}; byTrack[t].n++; if (la!==lb) byTrack[t].flip++; if ((la===gold)!==(lb===gold)) byTrack[t].d++;
  }
  console.log("  " + m + ": n=" + n + " | 答案翻转 " + flip + "/" + n + " = " + (100*flip/n).toFixed(1) + "% | 平均 |Δp| = " + mean(dp).toFixed(4));
  console.log("     准确率 " + (100*accBase/n).toFixed(1) + "% → " + (100*accPar/n).toFixed(1) + "%  (Δ " + ((100*(accPar-accBase)/n)>=0?"+":"") + (100*(accPar-accBase)/n).toFixed(1) + "pp)");
  console.log("     " + Object.entries(byTrack).map(([t,v])=>t.split("_")[0]+" 改判"+v.d+"/"+v.n).join(" | "));
}

console.log("\n### 3) 配对差异的 95% 置信区间（McNemar 口径，n=2100 / RAG n=1920）");
{
  const L = base.laya, J = base.jev;
  const byT = {};
  for (const [id, c] of cases) {
    const a = L.get(id), b = J.get(id); if (!a?.ok || !b?.ok) continue;
    const la = label(a,c), lb = label(b,c), gold = c.gold[keyOf(c)];
    if (la === null || lb === null) continue;
    const t = c.track; byT[t] = byT[t] || { n:0, n10:0, n01:0 };
    byT[t].n++;
    if (la === gold && lb !== gold) byT[t].n10++;
    else if (lb === gold && la !== gold) byT[t].n01++;
  }
  console.log("  轨道 | n | 只有 Laya 对 | 只有 Jev 对 | 差值(Jev-Laya) | 95% CI | 最小可检出差异(≈)");
  for (const [t,v] of Object.entries(byT)) {
    const d = (v.n01 - v.n10)/v.n;
    const se = Math.sqrt((v.n10 + v.n01) - (v.n10 - v.n01)**2/v.n) / v.n;
    const lo = d - 1.96*se, hi = d + 1.96*se;
    console.log("  " + t.padEnd(28) + " " + String(v.n).padEnd(5) + " " + String(v.n10).padEnd(6) + " " + String(v.n01).padEnd(6) + " " + ((100*d>=0?"+":"")+(100*d).toFixed(1)+"pp").padEnd(8) + " [" + (100*lo).toFixed(1) + ", " + (100*hi).toFixed(1) + "]  ±" + (100*1.96*se).toFixed(1) + "pp");
  }
}
