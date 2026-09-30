import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { systemOne } from "../lib/jev.mjs";

const CASES = process.argv[2] || "bench/cases.jsonl";
const OUT = process.argv[3] || "results/jev.jsonl";
const CONC = Number(process.env.CONC || 4);

const cases = readFileSync(CASES, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
mkdirSync("results", { recursive: true });

function normalise(json) {
  const a = (json && json.answers) || {};
  const out = {};
  for (const [k, v] of Object.entries(a)) {
    if (v.type === "choice") out[k] = { type: "choice", choice: v.choice, confidence: v.confidence, probabilities: v.probabilities };
    else if (v.type === "noul") out[k] = { type: "noul", noul: v.noul };
    else if (v.type === "score") out[k] = { type: "score", score: v.score, confidence: v.confidence, probabilities: v.probabilities, legend: v.legend };
    else out[k] = v;
  }
  return out;
}

const results = [];
let done = 0;
async function runOne(c) {
  let r, attempts = 0;
  while (attempts < 3) {
    attempts++;
    r = await systemOne({ state: c.state, questions: c.questions });
    if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) break;
    await new Promise((res) => setTimeout(res, 1500 * attempts));
  }
  return {
    id: c.id, track: c.track, dataset: c.dataset, lang: c.lang, option_count: c.option_count == null ? null : c.option_count,
    ok: !!r.ok, status: r.status, ms: r.ms, model: r.json && r.json.model ? r.json.model : null,
    usage: (r.json && r.json.usage) || null,
    answers: r.ok ? normalise(r.json) : null,
    error: r.ok ? null : (r.error || r.text || ("HTTP " + r.status)),
    attempts,
  };
}

const t0 = Date.now();
let cursor = 0;
async function worker() {
  while (cursor < cases.length) {
    const c = cases[cursor++];
    const row = await runOne(c);
    results.push(row);
    done++;
    process.stdout.write((row.ok ? "." : "x") + (done % 25 === 0 ? " " + done + "\n" : ""));
    writeFileSync(OUT, results.map((x) => JSON.stringify(x)).join("\n") + "\n");
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
const totalMs = Date.now() - t0;
const okRows = results.filter((r) => r.ok);
const lat = okRows.map((r) => r.ms).sort((a, b) => a - b);
console.log("\n=== JEV RUN ===");
console.log("cases:", cases.length, "| ok:", okRows.length, "| failed:", results.length - okRows.length);
console.log("wall:", (totalMs / 1000).toFixed(1) + "s", "| p50:", lat[Math.floor(lat.length * 0.5)] + "ms", "| p95:", lat[Math.floor(lat.length * 0.95)] + "ms");
const inTok = okRows.reduce((s, r) => s + ((r.usage && r.usage.input_tokens) || 0), 0);
const outTok = okRows.reduce((s, r) => s + ((r.usage && r.usage.output_tokens) || 0), 0);
const cost = (inTok + outTok) * 0.042 / 1e6;
console.log("tokens in/out:", inTok, "/", outTok, "| est cost at 0.042 per 1M:", cost.toFixed(5), "USD");
console.log("model versions:", [...new Set(okRows.map((r) => r.model))].join(", "));
for (const r of results.filter((x) => !x.ok).slice(0, 5)) console.log("FAIL", r.id, r.status, String(r.error).slice(0, 160));
