import { readFileSync, writeFileSync } from "node:fs";

const CASES = process.argv[2];
const OUT = process.argv[3];
const RUNS = process.argv.slice(4);

const cases = readFileSync(CASES, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(cases.map((c) => [c.id, c]));
const load = (p) => { try { return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)); } catch { return null; } };

// ------------------------------------------------------------------ metrics helpers
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const quantile = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const pct = (x) => (x == null || Number.isNaN(x) ? "-" : (100 * x).toFixed(1) + "%");
export function wilson(k, n) { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n; const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; }
function ece(pairs, bins = 10) {
  const u = pairs.filter(([c]) => c != null); if (!u.length) return null;
  let e = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins, hi = (b + 1) / bins;
    const inBin = u.filter(([c]) => c >= lo && (b === bins - 1 ? c <= hi : c < hi));
    if (!inBin.length) continue;
    e += (inBin.length / u.length) * Math.abs(mean(inBin.map(([, ok]) => (ok ? 1 : 0))) - mean(inBin.map(([c]) => c)));
  }
  return e;
}
function brier(pairs) { const u = pairs.filter(([p]) => p != null); return u.length ? mean(u.map(([p, ok]) => (p - (ok ? 1 : 0)) ** 2)) : null; }
function auc(pts) {
  const pos = pts.filter((x) => x.y === 1), neg = pts.filter((x) => x.y === 0);
  if (!pos.length || !neg.length) return null;
  let a = 0; for (const p of pos) for (const n of neg) a += (p.p > n.p ? 1 : p.p === n.p ? 0.5 : 0);
  return a / (pos.length * neg.length);
}
// McNemar exact (binomial) test on discordant pairs
function mcnemar(a, b) {
  let n01 = 0, n10 = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] === null || b[i] === null) continue; if (!a[i] && b[i]) n01++; else if (a[i] && !b[i]) n10++; }
  const n = n01 + n10; if (!n) return { n01, n10, p: 1 };
  const k = Math.min(n01, n10);
  let tail = 0; for (let i = 0; i <= k; i++) tail += binom(n, i) * Math.pow(0.5, n);
  return { n01, n10, p: Math.min(1, 2 * tail) };
}
function binom(n, k) { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }
function bootstrapCI(values, stat, iters = 1000, seed = 12345) {
  let a = seed >>> 0; const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [];
  for (let it = 0; it < iters; it++) { const s = []; for (let i = 0; i < values.length; i++) s.push(values[Math.floor(rnd() * values.length)]); out.push(stat(s)); }
  out.sort((x, y) => x - y);
  return [out[Math.floor(iters * 0.025)], out[Math.floor(iters * 0.975)]];
}
function plattFit(pts) {   // 1-D logistic regression on the logit of p
  let w = 1, b = 0, lr = 0.5;
  const logit = (p) => Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, p))));
  const X = pts.map((x) => logit(x.p));
  for (let it = 0; it < 500; it++) {
    let gw = 0, gb = 0; const n = pts.length;
    for (let i = 0; i < n; i++) { const z = w * X[i] + b; const q = 1 / (1 + Math.exp(-z)); const e = q - pts[i].y; gw += e * X[i]; gb += e; }
    w -= lr * gw / n; b -= lr * gb / n;
  }
  return (p) => 1 / (1 + Math.exp(-(w * logit(p) + b)));
}

// ------------------------------------------------------------------ scoring
function scoreRow(row) {
  const c = byId.get(row.id);
  if (!c || !row.ok || !row.answers) return { ...row, correct: null, conf: null, p_true: null, gold: null, pred: null };
  const key = Object.keys(c.gold)[0];
  const gold = c.gold[key];
  const a = row.answers[key];
  if (!a) return { ...row, correct: null, conf: null, p_true: null, gold, pred: null };
  if (a.type === "choice") {
    const probs = a.probabilities || {};
    const nums = Object.values(probs).filter((v) => typeof v === "number");
    const mx = nums.length ? Math.max(...nums) : a.confidence;
    return { ...row, gold, pred: a.choice, correct: a.choice === gold, conf: mx, p_true: gold in probs ? probs[gold] : null };
  }
  if (a.type === "noul") {
    const p = a.noul;
    return { ...row, gold: !!gold, pred: p >= 0.5, correct: (p >= 0.5) === !!gold, conf: Math.max(p, 1 - p), p_true: gold ? p : 1 - p, raw_noul: p };
  }
  if (a.type === "score") return { ...row, gold, pred: a.score, correct: null, conf: a.confidence, p_true: null, score: a.score };
  return { ...row, correct: null, conf: null, p_true: null, gold, pred: null };
}

const runs = {};
for (const f of RUNS) { const rows = load(f); if (rows) runs[f.replace(/^results\//, "").replace(/\.jsonl$/, "")] = rows.map(scoreRow); }
const names = Object.keys(runs);
for (const n of names) for (const r of runs[n]) { const u = r.usage || {}; r.cost = ((u.input_tokens || 0) + (u.output_tokens || 0)) * 0.042 / 1e6; }

function metrics(rows) {
  const cl = rows.filter((r) => { const c = byId.get(r.id); return !c || c.label_confidence !== "low"; });
  const ok = cl.filter((r) => r.correct !== null && r.correct !== undefined);
  const correct = ok.filter((r) => r.correct).length;
  const conf = ok.map((r) => [r.conf, r.correct]);
  const pt = ok.map((r) => [r.p_true, r.correct]);
  const hi = ok.filter((r) => r.conf != null && r.conf >= 0.9);
  const lat = ok.map((r) => r.ms);
  const [lo, hiCI] = wilson(correct, ok.length);
  return {
    n: rows.length, scored: ok.length, correct, acc: ok.length ? correct / ok.length : null, ci: [lo, hiCI],
    mean_conf: mean(conf.map(([c]) => c)), ece: ece(conf),
    ece_ci: ok.length > 20 ? bootstrapCI(conf, (s) => ece(s) ?? 0) : [null, null],
    brier: brier(pt),
    // noul tracks: rank by P(true) against the gold label (gate discrimination).
    // choice tracks: rank by the chosen option's confidence against its own correctness.
    auc: ok.length && typeof ok[0].gold === "boolean"
      ? auc(ok.map((r) => ({ p: r.raw_noul, y: r.gold ? 1 : 0 })))
      : auc(ok.map((r) => ({ p: r.conf, y: r.correct ? 1 : 0 }))),
    hi_cov: ok.length ? hi.length / ok.length : null, hi_prec: hi.length ? hi.filter((r) => r.correct).length / hi.length : null,
    confident_wrong: hi.filter((r) => !r.correct).length,
    p50: quantile(lat, 0.5), p95: quantile(lat, 0.95),
    fnr: ok.filter((r) => r.gold === true).length ? ok.filter((r) => r.gold === true && !r.correct).length / ok.filter((r) => r.gold === true).length : null,
    fpr: ok.filter((r) => r.gold === false).length ? ok.filter((r) => r.gold === false && !r.correct).length / ok.filter((r) => r.gold === false).length : null,
  };
}
const fmt = (m) => [pct(m.acc), pct(m.ci[0]) + "-" + pct(m.ci[1]), String(m.scored), m.mean_conf == null ? "-" : m.mean_conf.toFixed(3),
  m.ece == null ? "-" : m.ece.toFixed(3), m.ece_ci[0] == null ? "-" : "[" + m.ece_ci[0].toFixed(3) + "," + m.ece_ci[1].toFixed(3) + "]",
  m.brier == null ? "-" : m.brier.toFixed(3), m.auc == null ? "-" : m.auc.toFixed(3),
  (m.hi_cov == null ? "-" : pct(m.hi_cov) + " / " + pct(m.hi_prec)), String(m.confident_wrong),
  Math.round(m.p50) + "ms", Math.round(m.p95) + "ms", pct(m.fnr), pct(m.fpr)].join(" | ");

const md = [];
md.push("# 评测报告 v2（规模集）", "");
md.push("- cases: " + CASES + "  n=" + cases.length);
md.push("- runs: " + names.join(", "));
md.push("- 生成: " + new Date().toISOString(), "");
md.push("> AUC 口径：noul 轨道 = P(true) 把正样本排在负样本之上的能力（判别力）；choice 轨道 = 置信度把答对的排在答错的之上的能力。");
md.push("");
md.push("| 模型 | 轨道 | acc | 95%CI | n | mean_conf | ECE | ECE 95%CI(boot) | Brier | AUC | conf>=0.9 覆盖/精度 | conf-wrong | p50 | p95 | FNR | FPR |");
md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const tracks = [...new Set(cases.map((c) => c.track))];
for (const n of names) {
  md.push("| " + n + " | **全部** | " + fmt(metrics(runs[n])) + " |");
  for (const t of tracks) { const rows = runs[n].filter((r) => r.track === t); if (rows.length) md.push("| " + n + " | " + t + " | " + fmt(metrics(rows)) + " |"); }
}
md.push("");

// paired comparison (McNemar) for the first two runs
if (names.length >= 2) {
  md.push("## 配对比较（McNemar 精确检验）", "");
  md.push("| 轨道 | " + names[0] + " 对 | " + names[1] + " 对 | 只有前者对 | 只有后者对 | p 值 |");
  md.push("|---|---|---|---|---|---|");
  for (const t of ["ALL", ...tracks]) {
    const f = (n) => { const m = new Map(); for (const r of runs[n].filter((x) => t === "ALL" || x.track === t)) m.set(r.id, r.correct); return m; };
    const A = f(names[0]), B = f(names[1]);
    const ids = [...A.keys()].filter((id) => byId.get(id) && byId.get(id).label_confidence !== "low");
    const aArr = ids.map((id) => A.get(id)), bArr = ids.map((id) => B.get(id));
    const accA = aArr.filter((x) => x === true).length, accB = bArr.filter((x) => x === true).length;
    const r = mcnemar(aArr, bArr);
    md.push("| " + t + " | " + pct(accA / ids.length) + " | " + pct(accB / ids.length) + " | " + r.n10 + " | " + r.n01 + " | " + (r.p < 1e-4 ? "<0.0001" : r.p.toFixed(4)) + " |");
  }
  md.push("");
}

// subgroups
const SUB = { B_tool_selection: "option_count", F_cardinality_multilingual: "dataset", D_rag_gate: "neg_type", E_injection_guard: "dataset", C_tool_guardrail: "dataset" };
md.push("## 分组明细", "");
for (const [t, field] of Object.entries(SUB)) {
  const vals = [...new Set(cases.filter((c) => c.track === t).map((c) => String(c[field] ?? "-")))].sort();
  if (vals.length < 2) continue;
  md.push("### " + t + " by " + field, "");
  md.push("| " + field + " | n | " + names.map((n) => n + " acc").join(" | ") + " |");
  md.push("|---" + "|---".repeat(names.length + 1) + "|");
  for (const v of vals) {
    const ids = new Set(cases.filter((c) => c.track === t && String(c[field] ?? "-") === v).map((c) => c.id));
    const cells = names.map((n) => { const rows = runs[n].filter((r) => ids.has(r.id)); const m = metrics(rows); return m.scored ? pct(m.acc) + " (" + m.correct + "/" + m.scored + ")" : "-"; });
    md.push("| " + v + " | " + ids.size + " | " + cells.join(" | ") + " |");
  }
  md.push("");
}

// cascade (Laya -> Jev)
if (names.length >= 2 && names[0].includes("laya") && names[1].includes("jev")) {
  md.push("## Laya → Jev 级联（阈值扫描，置信度 = max(probabilities)）", "");
  md.push("| 阈值 | 本地承接 | 升级率 | 级联 acc | 本地部分 acc | Jev 成本/千次 | 相对纯 Jev |");
  md.push("|---|---|---|---|---|---|---|");
  const jm = new Map(runs[names[1]].map((r) => [r.id, r]));
  const baseCost = runs[names[1]].reduce((s, r) => s + (r.cost || 0), 0);
  const cnt = runs[names[1]].length;
  for (const t of [0.5, 0.7, 0.8, 0.9, 0.95, 0.99]) {
    let acc = 0, n = 0, accL = 0, cov = 0, cost = 0;
    for (const r of runs[names[0]]) {
      if (r.correct === null || r.correct === undefined) continue;
      const j = jm.get(r.id); if (!j || j.correct === null) continue;
      const c = byId.get(r.id); if (c && c.label_confidence === "low") continue;
      n++;
      if (r.conf != null && r.conf >= t) { cov++; if (r.correct) { acc++; accL++; } }
      else { cost += j.cost || 0; if (j.correct) acc++; }
    }
    md.push("| " + t + " | " + pct(cov / n) + " | " + pct(1 - cov / n) + " | " + pct(acc / n) + " | " + pct(cov ? accL / cov : null) + " | $" + (1000 * cost / n).toFixed(4) + " | " + pct((cost / n) / (baseCost / cnt)) + " |");
  }
  md.push("| 纯 " + names[1] + " | 0% | 100% | " + pct(metrics(runs[names[1]]).acc) + " | - | $" + (1000 * baseCost / cnt).toFixed(4) + " | 100% |");
  md.push("");
}

writeFileSync(OUT, md.join("\n"));
writeFileSync(OUT.replace(/\.md$/, "-metrics.json"), JSON.stringify(Object.fromEntries(names.map((n) => [n, { overall: metrics(runs[n]), by_track: Object.fromEntries(tracks.map((t) => [t, metrics(runs[n].filter((r) => r.track === t))])) }])), null, 2));
console.log(md.slice(0, 30).join("\n"));
console.log("...");
console.log("written:", OUT);
