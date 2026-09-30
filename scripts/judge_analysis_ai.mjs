import { readFileSync } from "node:fs";
const FILE = process.argv[2] || "results/judge-agentinfra.jsonl";
const rows = readFileSync(FILE,"utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.judge_ok);
const norm = (x) => String(x).trim().toLowerCase().replace(/^["\']|["\']$/g,"");
const asBool = (x) => { const v = norm(x); if (["yes","true","y","1"].includes(v)) return true; if (["no","false","n","0"].includes(v)) return false; return null; };
const agree = (r) => r.question_kind === "noul" ? (asBool(r.judge_label)===null?null:asBool(r.judge_label)===r.dataset_gold) : norm(r.judge_label)===norm(r.dataset_gold);
const pct = (a,b) => b ? (100*a/b).toFixed(1)+"%" : "-";
console.log("### 法官 vs 数据集标签（agent-infra, n=" + rows.length + "）");
for (const k of ["disagree","both_wrong","both_right"]) {
  const g = rows.filter(r=>r.audit_kind===k); let same=0,tot=0,un=0;
  for (const r of g) { const m = agree(r); if (m===null) { un++; continue; } tot++; if (m) same++; }
  console.log("  " + k.padEnd(11) + " n=" + String(g.length).padEnd(4) + " 一致 " + pct(same,tot) + (un?" (unsure "+un+")":""));
}
console.log("\n### 分轨道");
for (const t of [...new Set(rows.map(r=>r.track))]) {
  const g = rows.filter(r=>r.track===t); let bad=0,tot=0;
  for (const r of g) { const m = agree(r); if (m===null) continue; tot++; if (!m) bad++; }
  console.log("  " + t.padEnd(24) + " n=" + String(g.length).padEnd(4) + " 法官不同意 " + bad + "/" + tot + " = " + pct(bad,tot));
}
console.log("\n### 分歧样本上法官站谁");
{
  const dis = rows.filter(r=>r.audit_kind==="disagree" && r.question_kind==="noul");
  let jL=0,jJ=0;
  for (const r of dis) { const j = asBool(r.judge_label); if (j===null) continue;
    const judgeSaysGold = (j === r.dataset_gold);
    if (judgeSaysGold) { if (r.laya_correct) jL++; else jJ++; }
    else { if (r.laya_correct && !r.jev_correct) jJ++; else if (r.jev_correct && !r.laya_correct) jL++; } }
  console.log("  法官站 Jev " + jJ + " / 站 Laya " + jL + " → Jev 占 " + pct(jJ, jL+jJ) + " (n=" + dis.length + ")");
}
console.log("\n### 各轨道法官判 yes 的比例（看两个模型是不是系统性偏向一侧）");
for (const t of [...new Set(rows.map(r=>r.track))]) {
  const g = rows.filter(r=>r.track===t && r.question_kind==="noul");
  let yes=0, goldYes=0, tot=0;
  for (const r of g) { const j = asBool(r.judge_label); if (j===null) continue; tot++; if (j) yes++; if (r.dataset_gold) goldYes++; }
  console.log("  " + t.padEnd(24) + " 法官 yes " + pct(yes,tot) + " | 数据集正例 " + pct(goldYes,tot));
}
