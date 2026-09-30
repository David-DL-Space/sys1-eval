import { readFileSync, writeFileSync } from "node:fs";
const CASES = process.argv[2], A = process.argv[3], B = process.argv[4];
const LLM_COST = Number(process.env.LLM_COST || 0.005);
const TARGETS = (process.env.FNR_TARGETS || "0.02,0.05,0.10,0.20").split(",").map(Number);
const DEFAULT_TARGET = Number(process.env.FNR_TARGET || 0.05);
const cases = readFileSync(CASES, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(cases.map((c) => [c.id, c]));
const load = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const pct = (x) => (100 * x).toFixed(1) + "%";

const INVERT = process.argv[5] === "invert";       // positive class = the one that triggers the expensive path
function curve(file, name) {
  const rows = load(file).map((r) => {
    const c = byId.get(r.id); if (!c || !r.ok) return null;
    const key = Object.keys(c.gold)[0];
    const a = r.answers[key]; if (!a || a.type !== "noul") return null;
    const p = INVERT ? 1 - a.noul : a.noul;
    return { p, gold: INVERT ? !c.gold[key] : c.gold[key], usage: r.usage };
  }).filter(Boolean);
  const pos = rows.filter((r) => r.gold), neg = rows.filter((r) => !r.gold);
  const points = [];
  for (let t = 0.01; t <= 0.99; t += 0.005) {
    const pass = rows.filter((r) => r.p >= t).length / rows.length;
    const fnr = pos.length ? pos.filter((r) => r.p < t).length / pos.length : 0;
    const fpr = neg.length ? neg.filter((r) => r.p >= t).length / neg.length : 0;
    points.push({ t: Number(t.toFixed(3)), pass, fnr, fpr, saved_per_1m: (1 - pass) * 1e6, saved_usd_per_1m: (1 - pass) * 1e6 * LLM_COST });
  }
  const options = TARGETS.map((target) => {
    const feasible = points.filter((p) => p.fnr <= target);
    if (!feasible.length) return { model: name, target_fnr: target, feasible: false };
    const best = feasible.reduce((a, b) => (b.saved_per_1m > a.saved_per_1m ? b : a));
    return { model: name, target_fnr: target, feasible: true, threshold: best.t, fnr: best.fnr, fpr: best.fpr, llm_call_rate: best.pass, calls_saved_per_1m: Math.round(best.saved_per_1m), usd_saved_per_1m: Math.round(best.saved_usd_per_1m), accuracy: 1 - (best.fnr * pos.length + best.fpr * neg.length) / rows.length };
  });
  return { model: name, n: rows.length, positives: pos.length, negatives: neg.length, options, errors: points.filter((p) => p.pass < 0.99).length > 0 ? null : "gate never rejects" };
}

const results = [curve(A, A.replace(/^results\//, "").replace(/\.jsonl$/, "")), curve(B, B.replace(/^results\//, "").replace(/\.jsonl$/, ""))];
const feasible = results.flatMap((r) => r.options.filter((o) => o.feasible && Math.abs(o.target_fnr - DEFAULT_TARGET) < 1e-9));
const recommended = feasible.length ? feasible.reduce((a, b) => (b.usd_saved_per_1m > a.usd_saved_per_1m ? b : a)) : null;
const cfg = {
  generated_at: new Date().toISOString(), cases: CASES, llm_cost_per_call_usd: LLM_COST, default_target_fnr: DEFAULT_TARGET,
  recommended, per_model: results,
  policy: recommended ? {
    gate_model: recommended.model, threshold: recommended.threshold,
    rule: "if P(relevant) >= " + recommended.threshold + " then call the LLM else answer \"not in the retrieved context\"",
    expected: { llm_call_rate: recommended.llm_call_rate, missed_answerable: recommended.fnr, usd_saved_per_1m_queries: recommended.usd_saved_per_1m },
  } : null,
};
// fixed: one config file per gate (previously every run overwrote results/gate-config.json)
const GATE_OUT = process.env.GATE_OUT || "results/gate-config-" + CASES.replace(/^.*[\\/]/, "").replace(/\.jsonl$/, "") + ".json";
writeFileSync(GATE_OUT, JSON.stringify(cfg, null, 2));
console.log("wrote " + GATE_OUT + " (thresholds are chosen in-sample; see scripts/cv_gates.py for held-out FNR)");
console.log("== gate config: " + CASES + " ==");
for (const r of results) {
  console.log("  " + r.model + " (n=" + r.n + ", pos=" + r.positives + ", neg=" + r.negatives + ")");
  for (const o of r.options) {
    if (!o.feasible) { console.log("    目标漏报 " + pct(o.target_fnr) + " -> 达不到"); continue; }
    console.log("    目标漏报 " + pct(o.target_fnr) + " -> 阈值 " + o.threshold + " | LLM 调用率 " + pct(o.llm_call_rate) + " | 每百万省 $" + o.usd_saved_per_1m.toLocaleString() + " | 闸门分类准确率 " + pct(o.accuracy));
  }
}
if (recommended) console.log("  => 推荐: " + recommended.model + " @ " + recommended.threshold + " (目标漏报 " + pct(DEFAULT_TARGET) + ", 每百万省 $" + recommended.usd_saved_per_1m.toLocaleString() + ")");
else console.log("  => 没有模型能在目标漏报下给出正收益");
