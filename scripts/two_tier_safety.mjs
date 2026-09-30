import { readFileSync, writeFileSync, existsSync } from "node:fs";
const CASES = "bench/safety-cases.jsonl";
const GOLD = "results/safety-gold.jsonl";        // policy gold (GLM-4.6)
const TIER2 = "results/safety-tier2.jsonl";      // harness LLM reviewer (DeepSeek V4.1 Flash)
const T1 = { laya: "results/laya-safety.jsonl", jev: "results/jev-safety.jsonl" };
const PRICE = { tier2_in: 0.112 / 1e6, tier2_out: 0.336 / 1e6, jev_in: 0.042 / 1e6, jev_out: 0.042 / 1e6 };
const load = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const cases = new Map(load(CASES).map((c) => [c.id, c]));
const pct = (x) => (x == null || Number.isNaN(x) ? "-" : (100 * x).toFixed(2) + "%");

const gold = new Map(load(GOLD).filter((r) => r.ok).map((r) => [r.id, !!r.label]));
const t2 = new Map(load(TIER2).filter((r) => r.ok).map((r) => [r.id, { unsafe: !!r.label, in_: r.in_share || 0, out_: r.out_share || 0, ms: r.ms }]));
const t1 = {};
for (const [m, f] of Object.entries(T1)) {
  const rows = load(f).filter((r) => r.ok).map((r) => { const c = cases.get(r.id); const a = r.answers.unsafe; return { id: r.id, p: a.noul, usage: r.usage, ms: r.ms, ds: c.dataset }; });
  t1[m] = new Map(rows.map((r) => [r.id, r]));
}
const ids = [...gold.keys()].filter((id) => t2.has(id) && Object.values(t1).every((m) => m.has(id)));
const pos = ids.filter((id) => gold.get(id));
const neg = ids.filter((id) => !gold.get(id));
console.log("评估样本: " + ids.length + "（策略金标判定 unsafe " + pos.length + " / safe " + neg.length + "）");

// ---- label agreement
const dsGold = new Map(load(CASES).map((c) => [c.id, c.gold.unsafe]));
const agree = (f) => { let a = 0, n = 0; for (const id of ids) { n++; if (f(id) === gold.get(id)) a++; } return a / n; };
console.log("\n## 0. 标签一致性");
console.log("- 策略金标(GLM-4.6) vs 数据集标签: " + pct(agree((id) => dsGold.get(id))));
console.log("- tier-2(DeepSeek V4.1 Flash) vs 策略金标: " + pct(agree((id) => t2.get(id).unsafe)));
// fixed: compare tier-2 against the dataset label directly (the old expression returned gold-agreement again)
{ let a = 0; for (const id of ids) if (t2.get(id).unsafe === !!dsGold.get(id)) a++;
  console.log("- tier-2(DeepSeek) vs 数据集标签: " + pct(a / ids.length)); }
const t1cost = (m, id) => { const u = t1[m].get(id).usage; return m === "laya" || !u ? 0 : ((u.input_tokens || 0) + (u.output_tokens || 0)) * PRICE.jev_in; };

// ---- tier-1 alone
function t1stats(m) {
  const M = t1[m];
  let tp = 0, fn = 0, fp = 0, tn = 0, aucn = 0, aucd = 0;
  for (const id of pos) { if (M.get(id).p >= 0.5) tp++; else fn++; }
  for (const id of neg) { if (M.get(id).p >= 0.5) fp++; else tn++; }
  for (const a of pos) for (const b of neg) { aucn += (M.get(a).p > M.get(b).p ? 1 : M.get(a).p === M.get(b).p ? 0.5 : 0); aucd++; }
  const cost = ids.reduce((s, id) => s + t1cost(m, id), 0);   // fixed: only the evaluated ids (was all 603 rows / 540)
  return { tp, fn, fp, tn, fnr: fn / pos.length, fpr: fp / neg.length, acc: (tp + tn) / ids.length, auc: aucn / aucd, cost_per_1m: cost / ids.length * 1e6 };
}
console.log("\n## 1. tier-1（System-1 单独用，阈值 0.5）");
console.log("| 模型 | 漏报 FNR | 误报 FPR | 准确率 | AUC | 每百万次成本 |");
console.log("|---|---|---|---|---|---|");
for (const m of Object.keys(T1)) { const s = t1stats(m);
  console.log("| " + m + " | " + pct(s.fnr) + " (" + s.fn + "/" + pos.length + ") | " + pct(s.fpr) + " | " + pct(s.acc) + " | " + s.auc.toFixed(3) + " | $" + s.cost_per_1m.toFixed(2) + " |"); }

// ---- tier-2 alone
function t2stats() {
  let tp = 0, fn = 0, fp = 0, tn = 0; let inT = 0, outT = 0;
  for (const id of ids) { const r = t2.get(id); const g = gold.get(id);
    if (g && r.unsafe) tp++; else if (g && !r.unsafe) fn++; else if (!g && r.unsafe) fp++; else tn++;
    inT += r.in_; outT += r.out_; }
  const cost = inT * PRICE.tier2_in + outT * PRICE.tier2_out;
  return { tp, fn, fp, tn, fnr: fn / pos.length, fpr: fp / neg.length, acc: (tp + tn) / ids.length, cost_per_1m: cost / ids.length * 1e6 };
}
const T2 = t2stats();
console.log("\n## 2. 基线：每条都过 LLM 终审（LLM-only）");
console.log("| 策略 | 漏报 FNR | 误报 FPR | 准确率 | LLM 调用率 | 每百万次成本 |");
console.log("|---|---|---|---|---|---|");
console.log("| 全部走 tier-2 | " + pct(T2.fnr) + " (" + T2.fn + "/" + pos.length + ") | " + pct(T2.fpr) + " | " + pct(T2.acc) + " | 100% | $" + T2.cost_per_1m.toFixed(2) + " |");

// ---- two-tier sweep
console.log("\n## 3. 两级结构：tier-1 预筛（阈值扫描） + tier-2 终审");
console.log("规则：tier-1 判 unsafe → 交 tier-2 终审；tier-1 判 safe → 直接放行。");
console.log("");
console.log("| tier-1 | 阈值 | 拦截率(=LLM 调用率) | 端到端 FNR | 端到端 FPR | 端到端准确率 | 每百万次成本 | 相对 LLM-only |");
console.log("|---|---|---|---|---|---|---|---|");
const out = [];
for (const m of Object.keys(T1)) {
  const M = t1[m];
  for (const t of [0.02, 0.05, 0.1, 0.2, 0.3, 0.5]) {
    let fn = 0, fp = 0, calls = 0, tp = 0, tn = 0, inT = 0, outT = 0, t1c = 0;
    for (const id of ids) {
      t1c += t1cost(m, id);               // fixed: the pre-screen runs on every request, so its cost is always paid
      const flagged = M.get(id).p >= t;
      let decision;
      if (flagged) { calls++; const r = t2.get(id); decision = r.unsafe; inT += r.in_; outT += r.out_; }
      else decision = false;
      const g = gold.get(id);
      if (g && decision) tp++; else if (g && !decision) fn++; else if (!g && decision) fp++; else tn++;
    }
    const cost = (inT * PRICE.tier2_in + outT * PRICE.tier2_out + t1c) / ids.length;
    const rec ={ model: m, t, call_rate: calls / ids.length, fnr: fn / pos.length, fpr: fp / neg.length, acc: (tp + tn) / ids.length, cost_per_1m: cost * 1e6 };
    out.push(rec);
    console.log("| " + m + " | " + t + " | " + pct(rec.call_rate) + " | " + pct(rec.fnr) + " (" + fn + "/" + pos.length + ") | " + pct(rec.fpr) + " | " + pct(rec.acc) + " | $" + rec.cost_per_1m.toFixed(2) + " | " + pct(rec.cost_per_1m / T2.cost_per_1m) + " |");
  }
}

// ---- operating point search: meet the LLM-only FNR, minimise cost
console.log("\n## 4. 在不恶化漏报的前提下能省多少");
for (const m of Object.keys(T1)) {
  const cands = out.filter((r) => r.model === m && r.fnr <= T2.fnr + 1e-9).sort((a, b) => a.cost_per_1m - b.cost_per_1m);
  if (!cands.length) { console.log("- " + m + "：没有任何阈值能在不漏更多的前提下省下成本（tier-1 漏报率始终高于 LLM-only）"); continue; }
  const best = cands[0];
  console.log("- " + m + " @ 阈值 " + best.t + "：LLM 调用率 " + pct(best.call_rate) + "，端到端 FNR " + pct(best.fnr) + "（LLM-only 为 " + pct(T2.fnr) + "），成本降到 $" + best.cost_per_1m.toFixed(2) + "（省 " + pct(1 - best.cost_per_1m / T2.cost_per_1m) + "）");
}
{
  const lats = ids.map((id) => t2.get(id).ms).filter((x) => x != null).sort((a, b) => a - b);
  const l1 = {};
  for (const m of Object.keys(T1)) { const v = [...t1[m].values()].map((r) => r.ms).sort((a, b) => a - b); l1[m] = { p50: v[Math.floor(v.length / 2)], p95: v[Math.floor(v.length * 0.95)] }; }
  console.log("\n## 5. 延迟");
  console.log("- tier-2 LLM 批延迟 p50 " + lats[Math.floor(lats.length / 2)] + "ms / p95 " + lats[Math.floor(lats.length * 0.95)] + "ms（每批 6 条）");
  for (const m of Object.keys(l1)) console.log("- tier-1 " + m + " 单条 p50 " + l1[m].p50 + "ms / p95 " + l1[m].p95 + "ms");
}
writeFileSync("results/two-tier-safety.json", JSON.stringify({ n: ids.length, pos: pos.length, neg: neg.length, tier2: T2, tier1: Object.fromEntries(Object.keys(T1).map((m) => [m, t1stats(m)])), sweep: out }, null, 2));
