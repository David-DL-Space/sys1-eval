import { readFileSync, writeFileSync, existsSync } from "node:fs";
const SEEDS = [42, 99], WORDINGS = [1, 2, 3, 4];
const load = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const pct = (x) => (x == null || Number.isNaN(x) ? "-" : (100 * x).toFixed(1) + "%");
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

const runs = {};
for (const seed of SEEDS) for (const w of WORDINGS) {
  const cases = "bench/sens-s" + seed + "-w" + w + ".jsonl";
  const jf = "results/sens-jev-s" + seed + "-w" + w + ".jsonl";
  const lf = "results/sens-laya-s" + seed + "-w" + w + ".jsonl";
  if (!existsSync(cases) || !existsSync(jf) || !existsSync(lf)) continue;
  const cs = new Map(load(cases).map((c) => [c.id, c]));
  const acc = (file) => {
    const out = {};
    for (const r of load(file)) {
      const c = cs.get(r.id); if (!c || !r.ok) continue;
      const key = Object.keys(c.gold)[0]; const gold = c.gold[key]; const a = r.answers[key]; if (!a) continue;
      const pred = a.type === "noul" ? a.noul >= 0.5 : a.choice;
      const t = c.track; out[t] = out[t] || { n: 0, ok: 0 }; out[t].n++; if (pred === gold) out[t].ok++;
    }
    return out;
  };
  runs["s" + seed + "/w" + w] = { jev: acc(jf), laya: acc(lf) };
}
const combos = Object.keys(runs);
const tracks = [...new Set(combos.flatMap((k) => Object.keys(runs[k].jev)))];
const md = [];
md.push("# 措辞 × seed 敏感度矩阵", "");
md.push("- 组合数: " + combos.length + "（seed " + SEEDS.join("/") + " × 措辞 " + WORDINGS.map((w) => "v" + w).join("/") + "），每组合 600 条（A100 B120 C80 D160 E80 F60）");
md.push("- 措辞 v1 = 前两轮用的原文；v2/v3/v4 = 三种改写；criteria（选项定义）全程逐字不变。");
md.push("- seed 变化 = 重新抽样（不同 case），不是重跑同一批。");
md.push("");
md.push("## 1. 每个 (模型, 轨道) 在 8 个组合下的准确率分布", "");
md.push("| 轨道 | 模型 | 均值 | 最小 | 最大 | 极差 | 标准差 |");
md.push("|---|---|---|---|---|---|---|");
const summary = {};
for (const t of tracks) {
  for (const m of ["laya", "jev"]) {
    const vals = combos.map((k) => { const v = runs[k][m][t]; return v && v.n ? v.ok / v.n : null; }).filter((x) => x != null);
    const mu = mean(vals), lo = Math.min(...vals), hi = Math.max(...vals);
    const sd = Math.sqrt(mean(vals.map((x) => (x - mu) ** 2)));
    summary[t] = summary[t] || {}; summary[t][m] = { mean: mu, min: lo, max: hi, range: hi - lo, sd, n: vals.length };
    md.push("| " + t + " | " + m + " | " + pct(mu) + " | " + pct(lo) + " | " + pct(hi) + " | " + (100 * (hi - lo)).toFixed(1) + "pp | " + (100 * sd).toFixed(1) + "pp |");
  }
}
md.push("");
md.push("## 2. 每个组合下 Jev − Laya 的差值（符号是否稳定 = 结论是否稳）", "");
md.push("| 组合 | " + tracks.map((t) => t.split("_")[0]).join(" | ") + " | 全部 |");
md.push("|---" + "|---".repeat(tracks.length + 1) + "|");
const diffs = {};
for (const k of combos) {
  const cells = [];
  let jAll = 0, jN = 0, lAll = 0;
  for (const t of tracks) {
    const j = runs[k].jev[t], l = runs[k].laya[t];
    if (!j || !l) { cells.push("-"); continue; }
    const d = (j.ok - l.ok) / j.n;
    diffs[t] = diffs[t] || []; diffs[t].push(d);
    jAll += j.ok; lAll += l.ok; jN += j.n;
    cells.push(((d >= 0 ? "+" : "") + (100 * d).toFixed(1) + "pp"));
  }
  const dAll = (jAll - lAll) / jN;
  diffs.ALL = diffs.ALL || []; diffs.ALL.push(dAll);
  md.push("| " + k + " | " + cells.join(" | ") + " | " + ((dAll >= 0 ? "+" : "") + (100 * dAll).toFixed(1) + "pp") + " |");
}
md.push("");
md.push("## 3. 结论稳定性判定", "");
md.push("| 轨道 | 差值均值 | 差值最小 | 差值最大 | 8 个组合里 Jev 领先的次数 | 判定 |");
md.push("|---|---|---|---|---|---|");
for (const [t, ds] of Object.entries(diffs)) {
  const mu = mean(ds), lo = Math.min(...ds), hi = Math.max(...ds);
  const wins = ds.filter((d) => d > 0).length;
  const verdict = wins === ds.length && lo > 0.02 ? "稳（全胜且最小优势 >2pp）" : wins === ds.length ? "方向稳（全胜但优势可能很小）" : "不稳";
  md.push("| " + t + " | " + ((mu >= 0 ? "+" : "") + (100 * mu).toFixed(1) + "pp") + " | " + ((100 * lo >= 0 ? "+" : "") + (100 * lo).toFixed(1)) + "pp | " + ((hi >= 0 ? "+" : "") + (100 * hi).toFixed(1)) + "pp | " + wins + "/" + ds.length + " | " + verdict + " |");
}
md.push("");
writeFileSync("results/sens-matrix.md", md.join("\n"));
writeFileSync("results/sens-matrix.json", JSON.stringify({ summary, diffs, runs }, null, 2));
console.log(md.join("\n"));
