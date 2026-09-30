import { readFileSync } from "node:fs";
const cases = new Map(readFileSync("bench/cases.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>{const c=JSON.parse(l);return [c.id,c];}));
const load = (p) => readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
for (const model of ["laya","jev"]) {
  const flip = new Map(load("results/"+model+"-flip.jsonl").map(r=>[r.id,r]));
  const base = new Map(load("results/"+model+".jsonl").map(r=>[r.id,r]));
  let firstBase=0, firstFlip=0, tot=0;
  for (const [id, r] of base) {
    const c = cases.get(id); const [k,spec]=Object.entries(c.questions)[0]; if (spec.type!=="choice"||!r.ok) continue;
    tot++;
    const keys = Object.keys(spec.criteria);
    if (r.answers[k].choice === keys[0]) firstBase++;
    const f = flip.get(id); if (f?.ok && f.answers[k].choice === keys[keys.length-1]) firstFlip++;   // flipped order: original last is now first
  }
  console.log(model, "| first-listed pick rate: original order", firstBase+"/"+tot, "("+(100*firstBase/tot).toFixed(0)+"%)", "| after flip", firstFlip+"/"+tot, "("+(100*firstFlip/tot).toFixed(0)+"%)");
}
