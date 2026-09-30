import { readFileSync } from "node:fs";
const cases = new Map(readFileSync("bench/cases-large.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>{const c=JSON.parse(l);return [c.id,c];}));
const load = (p) => new Map(readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.id,r];}));
for (const m of ["laya","jev"]) {
  const base = load("results/" + m + "-all.jsonl");
  const flip = load("results/" + m + "-large-flip.jsonl");
  const byTrack = {};
  let tot = 0, changed = 0;
  for (const [id, r] of base) {
    const c = cases.get(id); if (!c) continue;
    const [k, spec] = Object.entries(c.questions)[0];
    if (spec.type !== "choice") continue;
    const f = flip.get(id); if (!f || !f.ok || !r.ok) continue;
    tot++;
    const t = c.track; byTrack[t] = byTrack[t] || { n: 0, ch: 0 }; byTrack[t].n++;
    if (r.answers[k].choice !== f.answers[k].choice) { changed++; byTrack[t].ch++; }
  }
  console.log("== " + m + " | 选项顺序翻转后答案改变: " + changed + "/" + tot + " = " + (100*changed/tot).toFixed(1) + "%");
  console.log("   " + Object.entries(byTrack).map(([t,v]) => t + " " + v.ch + "/" + v.n + " (" + (100*v.ch/v.n).toFixed(0) + "%)").join(" | "));
  const A = [...base.values()].filter(r => r.track === "A_model_router" && r.ok);
  const Af = [...flip.values()].filter(r => r.track === "A_model_router" && r.ok);
  const cnt = (rows) => { const o = {}; for (const r of rows) { const ch = r.answers.route.choice; o[ch] = (o[ch]||0)+1; } return JSON.stringify(o); };
  console.log("   A 轨: 原顺序 " + cnt(A) + " | 翻转后 " + cnt(Af));
}
