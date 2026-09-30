import { readFileSync } from "node:fs";
const cases = new Map(readFileSync("bench/cases.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>{const c=JSON.parse(l);return [c.id,c];}));
const load = (p) => readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
for (const n of ["laya","jev","laya-typed-decisions"]) {
  const rows = load("results/"+n+".jsonl").filter(r=>r.ok);
  console.log("== " + n + " ==");
  for (const track of ["C_tool_guardrail","D_rag_gate","E_injection_guard"]) {
    let tp=0,fp=0,tn=0,fn=0;
    for (const r of rows.filter(r=>r.track===track)) {
      const c = cases.get(r.id); const [k] = Object.entries(c.questions)[0];
      const gold = c.gold[k]===true; const a = r.answers[k]; if(!a) continue;
      const p = a.noul >= 0.5;
      if (gold && p) tp++; else if (gold && !p) fn++; else if (!gold && p) fp++; else tn++;
    }
    console.log("   " + track.padEnd(20) + " TP=" + tp + " FN=" + fn + " (漏报) | FP=" + fp + " (误报) TN=" + tn);
  }
  // B track: K=20 failures - was the correct label even available?
  const b20 = rows.filter(r=>r.track==="B_tool_selection" && r.option_count===20);
  let wrong=0, pickedDecoy=0;
  for (const r of b20) { const c = cases.get(r.id); const a = r.answers.tool; if(!a) continue; if (a.choice !== c.gold.tool) { wrong++; if (Object.keys(c.questions.tool.criteria).includes(a.choice)) pickedDecoy++; } }
  console.log("   B轨 K=20: 错 " + wrong + "/" + b20.length + "（其中选出的是候选里的干扰项: " + pickedDecoy + "）");
  const bAll = rows.filter(r=>r.track==="B_tool_selection");
  let hi=0; for (const r of bAll) { const c=cases.get(r.id); const p=r.answers.tool?.probabilities||{}; const mx=Math.max(...Object.values(p).filter(v=>typeof v==="number")); if (mx>=0.9) hi++; }
  console.log("   B轨 置信度>=0.9 的比例: " + hi + "/" + bAll.length);
}
