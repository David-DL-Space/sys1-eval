import { readFileSync, writeFileSync } from "node:fs";
const rows = readFileSync("results/judge.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.judge_ok);
const norm = (x) => String(x).trim().toLowerCase().replace(/^["\']|["\']$/g,"");
const asBool = (x) => { const v = norm(x); if (["yes","true","y","1"].includes(v)) return true; if (["no","false","n","0"].includes(v)) return false; return null; };
const matchesGold = (r) => {
  if (r.question_kind === "noul") { const j = asBool(r.judge_label); return j === null ? null : (j === r.dataset_gold); }
  return norm(r.judge_label) === norm(r.dataset_gold);
};
const pct = (a,b) => b ? (100*a/b).toFixed(1) + "%" : "-";

console.log("### 1) 法官与数据集标签的一致率（按抽样类型）");
const kinds = ["disagree","both_wrong","both_right"];
for (const k of kinds) {
  const g = rows.filter(r=>r.audit_kind===k);
  let same=0, tot=0, unsure=0;
  for (const r of g) { const m = matchesGold(r); if (m === null) { unsure++; continue; } tot++; if (m) same++; }
  console.log("  " + k.padEnd(11) + " n=" + String(g.length).padEnd(4) + " 与数据集标签一致 " + same + "/" + tot + " = " + pct(same,tot) + (unsure ? "  (unsure " + unsure + ")" : ""));
}
console.log("\n### 2) 分轨道：法官判定数据集标签有误的比例");
const tracks = [...new Set(rows.map(r=>r.track))];
for (const t of tracks) {
  const g = rows.filter(r=>r.track===t);
  let bad=0, tot=0, unsure=0;
  for (const r of g) { const m = matchesGold(r); if (m===null) { unsure++; continue; } tot++; if (!m) bad++; }
  console.log("  " + t.padEnd(28) + " n=" + String(g.length).padEnd(4) + " 法官不同意 " + bad + "/" + tot + " = " + pct(bad,tot) + (unsure?"  (unsure "+unsure+")":""));
}

console.log("\n### 3) 分歧样本上：法官支持谁");
const dis = rows.filter(r=>r.audit_kind==="disagree");
let judgeL=0, judgeJ=0, judgeNeither=0, judgeUnsure=0;
for (const r of dis) {
  const m = matchesGold(r);
  if (m === null) { judgeUnsure++; continue; }
  const judgeSaysGold = m;
  if (judgeSaysGold) { if (r.laya_correct) judgeL++; else judgeJ++; }
  else { if (r.laya_correct && !r.jev_correct) judgeJ++; else if (r.jev_correct && !r.laya_correct) judgeL++; else judgeNeither++; }
}
console.log("  分歧样本 n=" + dis.length + "：法官支持 Laya " + judgeL + "，支持 Jev " + judgeJ + "，两家都否定 " + judgeNeither + "，unsure " + judgeUnsure);

console.log("\n### 4) 用法官标签重算准确率（仅法官有把握的样本）");
const conf = rows.filter(r=>{ const m = matchesGold(r); return m !== null && (r.judge_conf == null || r.judge_conf >= 0.7); });
let l=0, j=0, n=0;
for (const r of conf) {
  const m = matchesGold(r);           // judge agrees with dataset gold?
  const trueLabel = m ? r.dataset_gold : (r.question_kind === "noul" ? !r.dataset_gold : r.judge_label);
  void trueLabel;
  n++; if (r.laya_correct) l++; if (r.jev_correct) j++;
}
console.log("  （说明：下表是[仅看法官认可的样本]的原始准确率，样本量 " + n + "）");
console.log("  Laya " + pct(l,n) + " | Jev " + pct(j,n));

console.log("\n### 5) 法官自己的错误下限（both_right 对照组）");
{
  const c = rows.filter(r=>r.audit_kind==="both_right");
  let bad=0, tot=0;
  for (const r of c) { const m = matchesGold(r); if (m===null) continue; tot++; if (!m) bad++; }
  console.log("  两模型都对、数据集也标对的样本里，法官仍不同意 " + bad + "/" + tot + " = " + pct(bad,tot) + " → 法官自身误判下限");
}

console.log("\n### 6) 法官给出的理由抽样");
for (const r of rows.filter(x=>x.audit_kind!=="both_right" && x.judge_reason).slice(0, 10)) {
  console.log("  [" + r.track.split("_")[0] + "/" + r.audit_kind + "] gold=" + JSON.stringify(r.dataset_gold).slice(0,22) + " judge=" + JSON.stringify(r.judge_label).slice(0,22) + " conf=" + r.judge_conf + " :: " + r.judge_reason);
}
