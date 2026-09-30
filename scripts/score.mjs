import { readFileSync, writeFileSync } from "node:fs";

const cases = readFileSync("bench/cases.jsonl", "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(cases.map((c) => [c.id, c]));
const load = (p) => { try { return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)); } catch { return null; } };

// ---------------------------------------------------------------- per-case scoring
function scoreRow(row) {
  const c = byId.get(row.id);
  if (!c || !row.ok || !row.answers) return { ...row, correct: null, p_true: null, conf: null, gold: null, pred: null };
  const keys = Object.keys(c.gold);
  const key = keys[0];
  const gold = c.gold[key];
  const a = row.answers[key];
  if (!a) return { ...row, correct: null, p_true: null, conf: null, gold, pred: null };
  if (a.type === "choice") {
    // Laya's own harness takes conf = max(probabilities); its response "confidence" field is a
    // different (entropy-based) quantity on a different scale. Use max(p) for both models so the
    // calibration and gating numbers are comparable, and keep the API field for reference.
    const probs = a.probabilities || {};
    const nums = Object.values(probs).filter((v) => typeof v === "number");
    const mx = nums.length ? Math.max(...nums) : (a.confidence == null ? null : a.confidence);
    return { ...row, gold, pred: a.choice, correct: a.choice === gold, conf: mx, api_confidence: a.confidence == null ? null : a.confidence,
             p_true: gold in probs ? probs[gold] : null };
  }
  if (a.type === "noul") {
    const p = a.noul;
    return { ...row, gold: !!gold, pred: p >= 0.5, correct: (p >= 0.5) === !!gold, conf: Math.max(p, 1 - p), p_true: gold ? p : 1 - p, raw_noul: p };
  }
  if (a.type === "score") {
    const probs = a.probabilities || {};
    const levels = Object.keys(probs).map(Number).sort((x, y) => x - y);
    const dist = levels.map((l) => probs[String(l)]);
    const goldNum = typeof gold === "number" ? gold : null;
    const predNum = a.score;
    const correct = goldNum == null ? null : Math.abs(a.score - goldNum) <= 1;
    return { ...row, gold, pred: predNum, correct, conf: a.confidence, dist, levels, goldNum, p_true: goldNum == null ? null : (probs[String(goldNum)] ?? null) };
  }
  return { ...row, correct: null, p_true: null, conf: null, gold, pred: null };
}

// ---------------------------------------------------------------- metrics
const wilson = (k, n) => { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n;
  const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; };
const pct = (x) => (x == null ? "-" : (100 * x).toFixed(1) + "%");
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const quantile = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

function ece(pairs, bins = 10) {   // pairs: [confidence, correct]
  const usable = pairs.filter(([c]) => c != null);
  if (!usable.length) return null;
  let e = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins, hi = (b + 1) / bins;
    const inBin = usable.filter(([c]) => c >= lo && (b === bins - 1 ? c <= hi : c < hi));
    if (!inBin.length) continue;
    const conf = mean(inBin.map(([c]) => c));
    const acc = mean(inBin.map(([, ok]) => (ok ? 1 : 0)));
    e += (inBin.length / usable.length) * Math.abs(acc - conf);
  }
  return e;
}
function brier(pairs) { const u = pairs.filter(([p]) => p != null); return u.length ? mean(u.map(([p, ok]) => (p - (ok ? 1 : 0)) ** 2)) : null; }

function trackMetrics(rows) {
  const excluded = rows.filter((r) => byId.get(r.id) && byId.get(r.id).label_confidence === "low").length;
  rows = rows.filter((r) => !byId.get(r.id) || byId.get(r.id).label_confidence !== "low");
  const ok = rows.filter((r) => r.correct !== null && r.correct !== undefined);
  const correct = ok.filter((r) => r.correct).length;
  const conf = ok.map((r) => [r.conf, r.correct]);
  const pt = ok.map((r) => [r.p_true, r.correct]);
  const hiConf = ok.filter((r) => r.conf != null && r.conf >= 0.9);
  const hiWrong = hiConf.filter((r) => !r.correct);
  const lat = ok.map((r) => r.ms);
  const [lo, hi] = wilson(correct, ok.length);
  return {
    n: rows.length, excluded_low_confidence: excluded, scored: ok.length, correct,
    acc: ok.length ? correct / ok.length : null, acc_ci: [lo, hi],
    mean_conf: mean(conf.map(([c]) => c)),
    ece: ece(conf), brier: brier(pt),
    high_conf_coverage: ok.length ? hiConf.length / ok.length : null,
    high_conf_precision: hiConf.length ? 1 - hiWrong.length / hiConf.length : null,
    confident_wrong: hiWrong.length,
    p50_ms: quantile(lat, 0.5), p95_ms: quantile(lat, 0.95),
  };
}

function groupBy(rows, fn) { const m = new Map(); for (const r of rows) { const k = fn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; }

// ---------------------------------------------------------------- cascade over a pair of runs
function cascade(layaRows, jevRows, thresholds = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]) {
  const jm = new Map(jevRows.map((r) => [r.id, r]));
  const out = [];
  for (const t of thresholds) {
    let accepted = 0, accAccepted = 0, esc = 0, accEsc = 0, escCost = 0, escMs = 0, n = 0;
    for (const r of layaRows) {
      if (r.correct === null || r.correct === undefined) continue;
      const j = jm.get(r.id);
      if (!j || j.correct === null || j.correct === undefined) continue;
      n++;
      const confident = r.conf != null && r.conf >= t;
      if (confident) { accepted++; if (r.correct) accAccepted++; }
      else { esc++; if (j.correct) accEsc++; escCost += j.cost || 0; escMs += j.ms; }
    }
    out.push({ threshold: t, n, coverage: accepted / n, escalation_rate: esc / n,
      acc: (accAccepted + accEsc) / n, accepted_acc: accepted ? accAccepted / accepted : null,
      esc_cost_usd: escCost, total_cost_usd: escCost, mean_ms: (layaRows.length ? escMs / n : null) });
  }
  return out;
}


// ---------------------------------------------------------------- track A: routing economics
function routingEconomics(run, name) {
  const rows = run.filter((r) => r.track === "A_model_router" && r.correct !== null && r.correct !== undefined);
  if (!rows.length) return null;
  const pick = (r) => { const c = byId.get(r.id); return r.pred === "cheap" ? { q: c.cheap_score, c: c.cheap_cost } : { q: c.strong_score, c: c.strong_cost }; };
  const routed = rows.map(pick);
  const all = rows.map((r) => byId.get(r.id));
  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const oracle = all.map((c) => (c.cheap_score >= c.strong_score ? { q: c.cheap_score, c: c.cheap_cost } : { q: c.strong_score, c: c.strong_cost }));
  // difficulty-score policy: cheap when the model's difficulty score is low
  const scoreRows = rows.filter((r) => { const a = r.answers && r.answers.difficulty; return a && a.type === "score"; });
  const sweep = [0.5, 1.5, 2.5].map((t) => {
    const picked = scoreRows.map((r) => { const c = byId.get(r.id); return r.answers.difficulty.score < t ? { q: c.cheap_score, c: c.cheap_cost } : { q: c.strong_score, c: c.strong_cost }; });
    return { threshold: t, n: picked.length, quality: m(picked.map((x) => x.q)), cost_usd: m(picked.map((x) => x.c)), cheap_share: picked.filter((x, i) => scoreRows[i].answers.difficulty.score < t).length / picked.length };
  });
  return {
    n: rows.length,
    route_acc: rows.filter((r) => r.correct).length / rows.length,
    chosen_quality: m(routed.map((x) => x.q)), chosen_cost_usd: m(routed.map((x) => x.c)),
    cheap_share: rows.filter((r) => r.pred === "cheap").length / rows.length,
    always_cheap: { quality: m(all.map((c) => c.cheap_score)), cost_usd: m(all.map((c) => c.cheap_cost)) },
    always_strong: { quality: m(all.map((c) => c.strong_score)), cost_usd: m(all.map((c) => c.strong_cost)) },
    oracle: { quality: m(oracle.map((x) => x.q)), cost_usd: m(oracle.map((x) => x.c)) },
    difficulty_sweep: sweep,
    score_n: scoreRows.length,
    name,
  };
}

// ---------------------------------------------------------------- sweeps
function byOptionCount(run, track) {
  const out = {};
  for (const r of run.filter((x) => x.track === track && x.correct !== null && x.correct !== undefined)) {
    const k = r.option_count == null ? "?" : r.option_count;
    out[k] = out[k] || { n: 0, ok: 0 };
    out[k].n++; if (r.correct) out[k].ok++;
  }
  return out;
}
function byDataset(run, track) {
  const out = {};
  for (const r of run.filter((x) => x.track === track && x.correct !== null && x.correct !== undefined)) {
    out[r.dataset] = out[r.dataset] || { n: 0, ok: 0 };
    out[r.dataset].n++; if (r.correct) out[r.dataset].ok++;
  }
  return out;
}

// ---------------------------------------------------------------- run
const files = process.argv.slice(2);
const runs = {};
for (const f of files.length ? files : ["results/laya.jsonl", "results/jev.jsonl"]) {
  const rows = load(f);
  if (rows) runs[f.replace(/^results\//, "").replace(/\.jsonl$/, "")] = rows.map(scoreRow);
}
const names = Object.keys(runs);
if (!names.length) { console.log("no result files found"); process.exit(1); }

// attach jev cost per case for cascade accounting
for (const name of names) for (const r of runs[name]) {
  const u = r.usage || {};
  r.cost = ((u.input_tokens || 0) + (u.output_tokens || 0)) * 0.042 / 1e6;
}

const TITLES = {
  A_model_router: "A 模型智能路由", B_tool_selection: "B MCP/工具选择", C_tool_guardrail: "C 工具调用护栏",
  D_rag_gate: "D RAG 相关性门控", E_injection_guard: "E 注入/越狱护栏", F_cardinality_multilingual: "F 标签基数/多语言",
};
const allTracks = [...new Set(cases.map((c) => c.track))];
const metrics = {};
for (const name of names) {
  metrics[name] = { overall: trackMetrics(runs[name]), by_track: {} };
  for (const t of allTracks) {
    const rows = runs[name].filter((r) => r.track === t);
    if (rows.length) metrics[name].by_track[t] = trackMetrics(rows);
  }
}

const md = [];
md.push("# System-1 决策层评测报告（pilot, n=" + cases.length + "）", "");
md.push("生成时间: " + new Date().toISOString(), "");
md.push("## 轨道总览", "");
const header = ["轨道", ...names.flatMap((n) => [n + " 准确率", n + " n", n + " p50"])];
md.push("| " + header.join(" | ") + " |");
md.push("|" + header.map(() => "---").join("|") + "|");
for (const t of allTracks) {
  const cells = [TITLES[t] || t];
  for (const n of names) { const m = metrics[n].by_track[t]; cells.push(m ? pct(m.acc) + " [" + pct(m.acc_ci[0]) + "," + pct(m.acc_ci[1]) + "]" : "-", m ? String(m.scored) : "-", m ? Math.round(m.p50_ms) + "ms" : "-"); }
  md.push("| " + cells.join(" | ") + " |");
}
md.push("");
md.push("## 详细指标", "");
md.push("| 模型 | 轨道 | acc | 95%CI | macro? | mean_conf | ECE | Brier | conf>=0.9 覆盖/精度 | confident-wrong | p50 | p95 |");
md.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const n of names) {
  for (const [t, m] of Object.entries({ overall: metrics[n].overall, ...metrics[n].by_track })) {
    md.push("| " + [n, t === "overall" ? "全部" : (TITLES[t] || t), pct(m.acc), pct(m.acc_ci[0]) + "-" + pct(m.acc_ci[1]), "",
      m.mean_conf == null ? "-" : m.mean_conf.toFixed(3), m.ece == null ? "-" : m.ece.toFixed(3),
      m.brier == null ? "-" : m.brier.toFixed(3),
      (m.high_conf_coverage == null ? "-" : pct(m.high_conf_coverage) + " / " + pct(m.high_conf_precision)),
      m.confident_wrong, Math.round(m.p50_ms) + "ms", Math.round(m.p95_ms) + "ms"].join(" | ") + " |");
  }
}
md.push("");
if (names.includes("laya") && names.includes("jev")) {
  md.push("## Laya → Jev 级联（置信度阈值扫描）", "");
  md.push("| 阈值 | 本地承接比例 | 升级到 Jev 比例 | 级联准确率 | 本地部分准确率 | Jev 成本 |");
  md.push("|---|---|---|---|---|---|");
  const cas = cascade(runs.laya, runs.jev);
  for (const c of cas) md.push("| " + [c.threshold, pct(c.coverage), pct(c.escalation_rate), pct(c.acc), pct(c.accepted_acc), "$" + c.esc_cost_usd.toFixed(5)].join(" | ") + " |");
  md.push("");
}
md.push("## A 轨：模型路由经济学（cheap=mistral-7b-chat, strong=gpt-4-1106-preview）", "");
md.push("| 策略 | 平均质量 | 单次成本(USD) | 相对 always-strong 成本 | 备注 |");
md.push("|---|---|---|---|---|");
for (const n of names) {
  const e = routingEconomics(runs[n], n);
  if (!e) continue;
  const f = (x) => x.toFixed(3);
  const sci = (x) => "$" + x.toExponential(2);
  md.push("| " + n + " 路由（choice） | " + f(e.chosen_quality) + " | " + sci(e.chosen_cost_usd) + " | " + pct(e.chosen_cost_usd / e.always_strong.cost_usd) + " | 路由正确率 " + pct(e.route_acc) + "，选 cheap 比例 " + pct(e.cheap_share) + " |");
  for (const s of e.difficulty_sweep) md.push("| " + n + " 路由 (difficulty score < " + s.threshold + ") | " + f(s.quality) + " | " + sci(s.cost_usd) + " | " + pct(s.cost_usd / e.always_strong.cost_usd) + " | 走 cheap 比例 " + pct(s.cheap_share) + " |");
}
{
  const e = routingEconomics(runs[names[0]], names[0]);
  if (e) {
    const f = (x) => x.toFixed(3);
    md.push("| always cheap | " + f(e.always_cheap.quality) + " | $" + e.always_cheap.cost_usd.toExponential(2) + " | " + pct(e.always_cheap.cost_usd / e.always_strong.cost_usd) + " | 基线 |");
    md.push("| always strong | " + f(e.always_strong.quality) + " | $" + e.always_strong.cost_usd.toExponential(2) + " | 100% | 基线 |");
    md.push("| oracle（事后最优） | " + f(e.oracle.quality) + " | $" + e.oracle.cost_usd.toExponential(2) + " | " + pct(e.oracle.cost_usd / e.always_strong.cost_usd) + " | 上界 |");
  }
}
md.push("");
for (const n of names) {
  const b = byOptionCount(runs[n], "B_tool_selection");
  const bf = Object.entries(byDataset(runs[n], "F_cardinality_multilingual")).map(([d, v]) => d + " " + v.ok + "/" + v.n).join(", ");
  md.push("### " + n + " 分组明细", "");
  md.push("- B 轨工具数扫描: " + Object.entries(b).sort((x, y) => Number(x[0]) - Number(y[0])).map(([k, v]) => "K=" + k + " " + v.ok + "/" + v.n).join(" | "));
  md.push("- F 轨数据集: " + bf);
  md.push("");
}
// ---------------------------------------------------------------- robustness variants
{
  md.push("## 鲁棒性：选项顺序翻转 & 换个问法（同一批 case，只改一个变量）", "");
  md.push("| 模型 | 顺序翻转后 choice 答案改变 | A 轨原顺序 cheap/strong | 翻转后 cheap/strong | A 轨改 noul 事实问法 acc / AUC |");
  md.push("|---|---|---|---|---|");
  const auc = (pts) => { const pos = pts.filter((x) => x.y === 1), neg = pts.filter((x) => x.y === 0); if (!pos.length || !neg.length) return null;
    let a = 0; for (const p of pos) for (const n of neg) a += (p.p > n.p ? 1 : p.p === n.p ? 0.5 : 0); return a / (pos.length * neg.length); };
  for (const n of names) {
    const flip = load("results/" + n + "-flip.jsonl");
    let changed = 0, tot = 0, cntBase = {}, cntFlip = {};
    if (flip) {
      const fm = new Map(flip.map((r) => [r.id, r]));
      for (const r of runs[n]) {
        const c = byId.get(r.id); if (!c) continue;
        const [k, spec] = Object.entries(c.questions)[0];
        if (spec.type !== "choice") continue;
        const f = fm.get(r.id); if (!f || !f.ok || !r.answers) continue;
        tot++;
        if (r.answers[k] && f.answers[k] && r.answers[k].choice !== f.answers[k].choice) changed++;
        if (c.track === "A_model_router") { cntBase[r.answers[k].choice] = (cntBase[r.answers[k].choice] || 0) + 1; cntFlip[f.answers[k].choice] = (cntFlip[f.answers[k].choice] || 0) + 1; }
      }
    }
    const noulRun = load("results/" + n + "-a-noul.jsonl");
    let noulTxt = "-";
    if (noulRun) {
      let ok = 0, cnt = 0; const pts = [];
      for (const r of noulRun) {
        if (!r.ok) continue;
        const c = byId.get(r.id); if (!c) continue;
        const gold = c.gold.route === "cheap"; const p = r.answers.cheap_enough.noul;
        cnt++; if ((p >= 0.5) === gold) ok++;
        pts.push({ p, y: gold ? 1 : 0 });
      }
      const a = auc(pts);
      noulTxt = pct(ok / cnt) + " / " + (a == null ? "-" : a.toFixed(3));
    }
    const cbf = (o) => "cheap " + (o.cheap || 0) + " / strong " + (o.strong || 0);
    md.push("| " + [n, tot ? changed + "/" + tot + " (" + pct(changed / tot) + ")" : "-", tot ? cbf(cntBase) : "-", tot ? cbf(cntFlip) : "-", noulTxt].join(" | ") + " |");
  }
  md.push("");
  md.push("注：Laya 的 `confidence` 字段与 `max(probabilities)` 不是一回事（平均差 0.299），上表所有校准/门控数字统一用 `max(probabilities)`，即 Laya 官方 benchmark 的口径。");
  md.push("");
}

writeFileSync("results/cases-scored.jsonl", cases.map((c) => JSON.stringify({ ...c, results: Object.fromEntries(names.map((n) => { const r = runs[n].find((x) => x.id === c.id); return [n, r ? { pred: r.pred, conf: r.conf, correct: r.correct, ms: r.ms } : null]; })) })).join("\n") + "\n");
writeFileSync("results/metrics-extra.json", JSON.stringify({ routing: Object.fromEntries(names.map((n) => [n, routingEconomics(runs[n], n)])), sweeps: Object.fromEntries(names.map((n) => [n, { b_by_K: byOptionCount(runs[n], "B_tool_selection"), f_by_dataset: byDataset(runs[n], "F_cardinality_multilingual") }])) }, null, 2));
writeFileSync("results/report.md", md.join("\n"));
writeFileSync("results/metrics.json", JSON.stringify(metrics, null, 2));
console.log(md.join("\n"));
