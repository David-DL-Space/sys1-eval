import { readFileSync, writeFileSync } from "node:fs";
const rows = readFileSync("results/judge.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.judge_ok);
const norm = (x) => String(x).trim().toLowerCase().replace(/^["\']|["\']$/g,"");
const asBool = (x) => { const v = norm(x); if (["yes","true","y","1"].includes(v)) return true; if (["no","false","n","0"].includes(v)) return false; return null; };
const agree = (r) => r.question_kind === "noul" ? (asBool(r.judge_label) === null ? null : asBool(r.judge_label) === r.dataset_gold) : norm(r.judge_label) === norm(r.dataset_gold);
const pct = (a,b) => b ? (100*a/b).toFixed(1) + "%" : "-";

// population strata (auditable tracks, from build_judge_set run)
const POP = { disagree: 1048, both_wrong: 659, both_right: 1913 };
const N = POP.disagree + POP.both_wrong + POP.both_right;
let num = 0, den = 0;
console.log("### A) 分层还原：法官不认同数据集标签的总体比例");
for (const k of Object.keys(POP)) {
  const g = rows.filter(r=>r.audit_kind===k);
  let bad=0, tot=0;
  for (const r of g) { const m = agree(r); if (m===null) continue; tot++; if (!m) bad++; }
  const rate = bad/tot;
  num += POP[k]*rate; den += POP[k];
  console.log("  " + k.padEnd(11) + " 样本 " + bad + "/" + tot + " = " + pct(bad,tot) + "  → 总体贡献 " + Math.round(POP[k]*rate) + "/" + POP[k]);
}
console.log("  => 可审计总体 " + N + " 条中，法官不认同数据集标签的估计比例 = " + pct(num, den) + "（法官自身误判下限 ~10%，见 C）");

console.log("\n### B) 分歧样本（n=1048 总体）上法官站谁");
{
  const dis = rows.filter(r=>r.audit_kind==="disagree");
  let jL=0, jJ=0;
  for (const r of dis) {
    const m = agree(r);
    if (m === null) continue;
    const judgeSaysGold = m;
    if (judgeSaysGold) { if (r.laya_correct) jL++; else jJ++; }
    else { if (r.laya_correct && !r.jev_correct) jJ++; else if (r.jev_correct && !r.laya_correct) jL++; }
  }
  console.log("  法官支持 Jev " + jJ + " / 支持 Laya " + jL + "  → Jev 占 " + pct(jJ, jL+jJ));
  // 数据集标签口径下的同一批样本
  let goldJ=0, goldL=0;
  for (const r of dis) { if (r.jev_correct) goldJ++; else goldL++; }
  console.log("  （同一批样本按数据集标签：Jev 对 " + goldJ + " / Laya 对 " + goldL + "）");
}

console.log("\n### C) 法官自身误判下限（两模型都对且数据集标对的对照组）");
{
  const c = rows.filter(r=>r.audit_kind==="both_right");
  let bad=0, tot=0;
  for (const r of c) { const m = agree(r); if (m===null) continue; tot++; if (!m) bad++; }
  console.log("  法官不同意 " + bad + "/" + tot + " = " + pct(bad,tot));
}

console.log("\n### D) 分歧样本里，分歧点的构成（哪一侧更接近法官）");
{
  const dis = rows.filter(r=>r.audit_kind==="disagree");
  const byTrack = {};
  for (const r of dis) { const t=r.track; byTrack[t]=byTrack[t]||{n:0,jL:0,jJ:0}; byTrack[t].n++; const m=agree(r); if(m===null) continue;
    const judgeSaysGold=m; if (judgeSaysGold) { if (r.laya_correct) byTrack[t].jL++; else byTrack[t].jJ++; } else { if (r.laya_correct && !r.jev_correct) byTrack[t].jJ++; else if (r.jev_correct && !r.laya_correct) byTrack[t].jL++; } }
  for (const [t,v] of Object.entries(byTrack)) console.log("  " + t.padEnd(28) + " n=" + String(v.n).padEnd(4) + " 法官站 Laya " + v.jL + " / 站 Jev " + v.jJ);
}
