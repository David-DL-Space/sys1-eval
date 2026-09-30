import { readFileSync } from "node:fs";
for (const name of ["laya","jev"]) {
  const rows = readFileSync("results/"+name+".jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.ok);
  let n=0, diff=0, maxdiff=0, same=0;
  for (const r of rows) for (const a of Object.values(r.answers||{})) {
    if (a.type!=="choice" || !a.probabilities) continue;
    const mx = Math.max(...Object.values(a.probabilities).filter(v=>typeof v==="number"));
    n++; const d = Math.abs(mx - (a.confidence ?? 0)); diff += d; maxdiff = Math.max(maxdiff,d); if (d < 0.02) same++;
  }
  console.log(name, "| choice answers:", n, "| mean |max(p)-confidence|:", (diff/n).toFixed(3), "| max diff:", maxdiff.toFixed(3), "| agree(<0.02):", same+"/"+n);
}
