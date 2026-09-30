import { readFileSync, writeFileSync } from "node:fs";

const CASES = process.argv[2] || "bench/rag-cases.jsonl";
const OUT = process.argv[3] || "results/report-rag.md";
const RUNS = process.argv.slice(4);
const LLM_COST = Number(process.env.LLM_COST || 0.005);      // USD per LLM generation call

const cases = readFileSync(CASES, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(cases.map((c) => [c.id, c]));
const load = (p) => readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const pct = (x) => (x == null || Number.isNaN(x) ? "-" : (100 * x).toFixed(1) + "%");
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };

const runs = {};
for (const f of RUNS) {
  const rows = load(f).map((r) => {
    const c = byId.get(r.id);
    if (!c || !r.ok) return { id: r.id, ok: false };
    const a = r.answers.relevant;
    return { id: r.id, ok: true, p: a.noul, pred: a.noul >= 0.5, gold: c.gold.relevant, correct: (a.noul >= 0.5) === c.gold.relevant, ms: r.ms, usage: r.usage,
             dataset: c.dataset, neg_type: c.neg_type, words: c.passage_words, n_passages: c.n_passages };
  }).filter((r) => r.ok);
  runs[f.replace(/^results\//, "").replace(/\.jsonl$/, "")] = rows;
}
const names = Object.keys(runs);

function auc(rows) { const pos = rows.filter((r) => r.gold), neg = rows.filter((r) => !r.gold); if (!pos.length || !neg.length) return null;
  let a = 0; for (const p of pos) for (const n of neg) a += (p.p > n.p ? 1 : p.p === n.p ? 0.5 : 0); return a / (pos.length * neg.length); }
function ece(rows, bins = 10) { let e = 0; for (let b = 0; b < bins; b++) { const inB = rows.filter((r) => r.p >= b / bins && (b === bins - 1 ? r.p <= 1 : r.p < (b + 1) / bins)); if (!inB.length) continue; e += (inB.length / rows.length) * Math.abs(mean(inB.map((r) => (r.gold ? 1 : 0))) - mean(inB.map((r) => r.p))); } return e; }
function platt(train, test) { const lg = (p) => Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, p))));
  let w = 1, b = 0; const X = train.map((r) => lg(r.p));
  for (let it = 0; it < 800; it++) { let gw = 0, gb = 0; for (let i = 0; i < train.length; i++) { const q = 1 / (1 + Math.exp(-(w * X[i] + b))); const e = q - (train[i].gold ? 1 : 0); gw += e * X[i]; gb += e; } w -= 0.5 * gw / train.length; b -= 0.5 * gb / train.length; }
  return test.map((r) => ({ ...r, p: 1 / (1 + Math.exp(-(w * lg(r.p) + b))) })); }

const md = [];
md.push("# RAG 门控深挖（BEIR 混合集 + BM25 硬负样本）", "");
md.push("- case 数: n=" + cases.length + "（正样本 " + cases.filter((c) => c.gold.relevant).length + " / 硬负 " + cases.filter((c) => c.neg_type === "hard_neg").length + " / 随机负 " + cases.filter((c) => c.neg_type === "easy_neg").length + "）");
md.push("- 门控问题: @@Does the passage contain information that helps answer the question?@@（noul）");
md.push("- 成本模型: 一次 LLM 生成 = $" + LLM_COST + "（可用 LLM_COST 环境变量覆盖）");
md.push("");
md.push("## 1. 判别力与校准", "");
md.push("| 模型 | n | acc | AUC | ECE | ECE(Platt 半训半测) | 正样本召回 | 负样本特异度 | p50 |");
md.push("|---|---|---|---|---|---|---|---|---|");
for (const n of names) {
  const rows = runs[n];
  const half = Math.floor(rows.length / 2);
  const cal = platt(rows.slice(0, half), rows.slice(half));
  const rec = rows.filter((r) => r.gold).length ? rows.filter((r) => r.gold && r.pred).length / rows.filter((r) => r.gold).length : null;
  const spec = rows.filter((r) => !r.gold).length ? rows.filter((r) => !r.gold && !r.pred).length / rows.filter((r) => !r.gold).length : null;
  md.push("| " + n + " | " + rows.length + " | " + pct(rows.filter((r) => r.correct).length / rows.length) + " | " + (auc(rows) ?? 0).toFixed(3) + " | " + ece(rows).toFixed(3) + " | " + ece(cal).toFixed(3) + " | " + pct(rec) + " | " + pct(spec) + " | " + Math.round(quantile(rows.map((r) => r.ms), 0.5)) + "ms |");
}
md.push("");

md.push("## 2. 门控运营点：目标漏报率下能省多少 LLM 调用", "");
md.push("（门控说 [相关] 才调 LLM；说 [不相关] 就直接回 [无法回答]，省掉这次生成。漏报 = 该调没调。）", "");
md.push("（注：旧版把\"闸门自身分类准确率\"标成了\"端到端正确率\"。放行的负样本仍交给 LLM，不会变成错误；端到端只会因漏报丢掉可答问题。阈值为样本内选取，留出集波动见 scripts/cv_gates.py。）", "");
md.push("| 模型 | 目标 FNR | 实际 FNR | 门控通过率(=LLM 调用率) | 每百万次查询省下的 LLM 调用 | 省下成本 | 闸门分类准确率 | 端到端保留率(假定 LLM 正确) |");
md.push("|---|---|---|---|---|---|---|---|");
for (const n of names) {
  const rows = runs[n];
  const pos = rows.filter((r) => r.gold);
  for (const target of [0.02, 0.05, 0.10, 0.20, 0.30, 0.40]) {
    let best = null;
    for (let t = 0.01; t <= 0.99; t += 0.005) {
      const fnr = pos.filter((r) => r.p < t).length / pos.length;
      if (fnr > target) continue;
      const passRate = rows.filter((r) => r.p >= t).length / rows.length;
      if (!best || passRate < best.passRate) best = { t, fnr, passRate };
    }
    if (!best) { md.push("| " + n + " | " + pct(target) + " | 达不到 | - | - | - | - | - |"); continue; }
    const e2e = 1 - best.fnr * pos.length / rows.length;   // only dropped answerable queries are end-to-end errors
    const acc = (pos.length * (1 - best.fnr) + rows.filter((r) => !r.gold).length * (1 - (rows.filter((r) => !r.gold && r.p >= best.t).length / rows.filter((r) => !r.gold).length))) / rows.length;
    const saved = (1 - best.passRate) * 1e6;
    md.push("| " + n + " | " + pct(target) + " | " + pct(best.fnr) + " | " + pct(best.passRate) + " (阈值 " + best.t.toFixed(3) + ") | " + Math.round(saved).toLocaleString() + " | $" + Math.round(saved * LLM_COST).toLocaleString() + " | " + pct(acc) + " | " + pct(e2e) + " |");
  }
}
md.push("");

md.push("## 3. 按负样本类型（BM25 硬负 vs 随机负）", "");
md.push("| 模型 | 正样本 acc | 硬负样本 acc(判为不相关) | 随机负 acc | 硬负平均 p | 随机负平均 p |");
md.push("|---|---|---|---|---|---|");
for (const n of names) {
  const rows = runs[n];
  const g = (t) => rows.filter((r) => r.neg_type === t);
  md.push("| " + n + " | " + pct(g("pos").filter((r) => r.correct).length / Math.max(1, g("pos").length)) + " | " + pct(g("hard_neg").filter((r) => r.correct).length / Math.max(1, g("hard_neg").length)) + " | " + pct(g("easy_neg").filter((r) => r.correct).length / Math.max(1, g("easy_neg").length)) + " | " + (mean(g("hard_neg").map((r) => r.p)) ?? 0).toFixed(3) + " | " + (mean(g("easy_neg").map((r) => r.p)) ?? 0).toFixed(3) + " |");
}
md.push("");

md.push("## 4. 按段落长度（Laya 的 512/1024 token 上限在这里现形）", "");
md.push("| 段落词数 | n | " + names.map((n) => n + " acc").join(" | ") + " |");
md.push("|---" + "|---".repeat(names.length + 1) + "|");
const buckets = [[0, 150], [150, 300], [300, 500], [500, 1e9]];
for (const [lo, hi] of buckets) {
  const ids = new Set(cases.filter((c) => c.passage_words >= lo && c.passage_words < hi).map((c) => c.id));
  if (!ids.size) continue;
  const cells = names.map((n) => { const rows = runs[n].filter((r) => ids.has(r.id)); return rows.length ? pct(rows.filter((r) => r.correct).length / rows.length) + " (" + rows.length + ")" : "-"; });
  md.push("| " + lo + "-" + (hi > 1e8 ? "∞" : hi) + " | " + ids.size + " | " + cells.join(" | ") + " |");
}
md.push("");

md.push("## 5. 按数据集", "");
md.push("| 数据集 | n | " + names.map((n) => n + " acc").join(" | ") + " |");
md.push("|---" + "|---".repeat(names.length + 1) + "|");
for (const ds of [...new Set(cases.map((c) => c.dataset))]) {
  const ids = new Set(cases.filter((c) => c.dataset === ds).map((c) => c.id));
  const cells = names.map((n) => { const rows = runs[n].filter((r) => ids.has(r.id)); return rows.length ? pct(rows.filter((r) => r.correct).length / rows.length) + " (" + rows.length + ")" : "-"; });
  md.push("| " + ds + " | " + ids.size + " | " + cells.join(" | ") + " |");
}
md.push("");

if (names.length >= 2 && names[0].includes("laya") && names[1].includes("jev")) {
  md.push("## 6. 三级级联：Laya → Jev → LLM", "");
  const jm = new Map(runs[names[1]].map((r) => [r.id, r]));
  md.push("| 策略 | LLM 调用率 | Jev 调用率 | 端到端正确率 | 每百万次查询总成本 |");
  md.push("|---|---|---|---|---|");
  for (const t of [0.7, 0.8, 0.9, 0.95]) {
    let llm = 0, jev = 0, acc = 0, n = 0, cost = 0;
    for (const r of runs[names[0]]) {
      const j = jm.get(r.id); if (!j) continue; n++;
      if (r.p >= t) { if (r.correct) acc++; }
      else if (j.p >= 0.5) { jev++; cost += ((j.usage?.input_tokens || 0) + (j.usage?.output_tokens || 0)) * 0.042 / 1e6; if (j.correct) acc++; }
      else { llm++; cost += LLM_COST; if (j.correct) acc++; }
    }
    md.push("| Laya>=" + t + " 承接，否则 Jev>0.5，否则 LLM | " + pct(llm / n) + " | " + pct(jev / n) + " | " + pct(acc / n) + " | $" + Math.round(cost / n * 1e6).toLocaleString() + " |");
  }
  md.push("| 全部走 LLM（基线） | 100% | 0% | 100%（假定） | $" + Math.round(LLM_COST * 1e6).toLocaleString() + " |");
  md.push("");
}

writeFileSync(OUT, md.join("\n"));
console.log(md.join("\n"));
