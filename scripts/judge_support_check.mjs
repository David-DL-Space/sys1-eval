import { readFileSync } from "node:fs";
const load = (p) => new Map(readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.id,r];}));
const norm = (x) => String(x).trim().toLowerCase();
const asBool = (x) => { const v = norm(x); if (["yes","true","y","1"].includes(v)) return true; if (["no","false","n","0"].includes(v)) return false; return null; };
for (const [tag, file] of [["严格口径","results/judge.jsonl"],["宽松口径","results/judge-lenient-dis.jsonl"]]) {
  const m = load(file);
  let jL=0, jJ=0, unsure=0;
  for (const [id, r] of m) {
    if (r.audit_kind !== "disagree" || !r.judge_ok || r.question_kind !== "noul") continue;
    const j = asBool(r.judge_label); if (j === null) { unsure++; continue; }
    const judgeSaysGold = (j === r.dataset_gold);
    if (judgeSaysGold) { if (r.laya_correct) jL++; else jJ++; }
    else { if (r.laya_correct && !r.jev_correct) jJ++; else if (r.jev_correct && !r.laya_correct) jL++; }
  }
  console.log(tag + "：分歧样本上 法官站 Jev " + jJ + " / 站 Laya " + jL + " → Jev 占 " + (100*jJ/(jL+jJ)).toFixed(1) + "% (unsure " + unsure + ")");
}
