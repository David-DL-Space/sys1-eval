import { readFileSync } from "node:fs";
const cases = new Map(readFileSync("bench/cases.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>{const c=JSON.parse(l);return [c.id,c];}));
const load = (p) => readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
for (const model of ["laya","jev"]) {
  const base = new Map(load("results/"+model+".jsonl").map(r=>[r.id,r]));
  const flip = new Map(load("results/"+model+"-flip.jsonl").map(r=>[r.id,r]));
  let tot=0, changed=0; const byTrack={};
  for (const [id,r] of base) {
    const f = flip.get(id); if(!f||!r.ok||!f.ok) continue;
    const c = cases.get(id); const [k,spec]=Object.entries(c.questions)[0]; if (spec.type!=="choice") continue;
    tot++; const t=c.track; byTrack[t]=byTrack[t]||{n:0,ch:0}; byTrack[t].n++;
    if (r.answers[k].choice !== f.answers[k].choice) { changed++; byTrack[t].ch++; }
  }
  console.log("== " + model + " ==");
  console.log("  选项顺序翻转后答案改变:", changed+"/"+tot, "|", Object.entries(byTrack).map(([t,v])=>t.split("_")[0]+" "+v.ch+"/"+v.n).join(", "));
  const A = [...base.values()].filter(r=>r.track==="A_model_router"&&r.ok);
  const Ac = [...flip.values()].filter(r=>r.track==="A_model_router"&&r.ok);
  const cnt = (rows)=>{const o={};for(const r of rows){const ch=r.answers.route.choice;o[ch]=(o[ch]||0)+1;}return JSON.stringify(o);};
  console.log("  A 轨原顺序:", cnt(A), "| 翻转后:", cnt(Ac));
  const rows = load("results/"+model+"-a-noul.jsonl");
  let ok=0,n=0; const pts=[]; let trueRate=0;
  for (const r of rows) { if(!r.ok) continue; const c=cases.get(r.id); const gold=c.gold.route==="cheap"; const p=r.answers.cheap_enough.noul; n++; if((p>=0.5)===gold) ok++; if(p>=0.5) trueRate++; pts.push({p,y:gold?1:0}); }
  const pos=pts.filter(x=>x.y===1), neg=pts.filter(x=>x.y===0); let auc=0;
  for (const a of pos) for (const b of neg) auc += (a.p>b.p?1:a.p===b.p?0.5:0);
  auc = pos.length&&neg.length?auc/(pos.length*neg.length):NaN;
  console.log("  A 轨改成 noul 事实问法: acc "+(100*ok/n).toFixed(1)+"%", "AUC "+auc.toFixed(3), "回答 true 比例 "+(trueRate/n).toFixed(2));
  // difficulty score distribution
  const d = A.map(r=>r.answers.difficulty?.score).filter(x=>x!=null);
  const mean = d.reduce((s,x)=>s+x,0)/d.length;
  console.log("  A 轨 difficulty score: mean " + mean.toFixed(2), "分布", JSON.stringify(d.map(x=>Math.round(x*10)/10).sort((a,b)=>a-b).slice(0,25)));
}
