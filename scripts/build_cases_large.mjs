import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const RAW = "data/raw";
const SEED = 7;
const loadJsonl = (p) => readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const loadGz = (p) => gunzipSync(readFileSync(p)).toString("utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(SEED);
function sample(arr, k, seed) { const r = seed === undefined ? rand : rng(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); }
function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// source ids already hand-verified in the 100-case pilot -> keep the scaled set disjoint
const pilot = loadJsonl("bench/cases.jsonl");
const pilotIds = new Set(pilot.map((c) => c.dataset + "|" + c.source_id));

const cases = [];
const add = (c) => { cases.push({ id: "L" + String(cases.length + 1).padStart(4, "0"), label_confidence: "high", has_unique_answer: true, lang: "en", gold_alt: [], ...c }); };

// ---------------------------------------------------------------- A: model router (400)
const rb = loadJsonl(RAW + "/routerbench/routerbench_slim.jsonl").filter((r) => !pilotIds.has("RouterBench/" + r.eval_name + "|" + r.sample_id));
const cheapOk = rb.filter((r) => r.cheap_score >= 0.5 && r.strong_score >= 0.5);
const needStrong = rb.filter((r) => r.cheap_score < 0.5 && r.strong_score >= 0.5);
const cleanRb = (s) => { let t = String(s).trim(); if (t.startsWith("['") && t.endsWith("']")) t = t.slice(2, -2); return t.replace(/\\n/g, "\n").replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\r/g, "").replace(/[ \t]+/g, " ").trim(); };
function stratify(pool, k, seed) {
  const by = new Map();
  for (const r of pool) { if (!by.has(r.eval_name)) by.set(r.eval_name, []); by.get(r.eval_name).push(r); }
  const groups = [...by.entries()].map(([name, v]) => [name, sample(v, v.length, seed + name.length)]);
  groups.sort((a, b) => b[1].length - a[1].length);
  const out = []; let i = 0;
  while (out.length < k && groups.some((g) => g[1].length)) { const g = groups[i % groups.length]; if (g[1].length) out.push(g[1].shift()); i++; if (i > 100000) break; }
  return out;
}
for (const [row, route] of [...stratify(cheapOk, 200, 21).map((r) => [r, "cheap"]), ...stratify(needStrong, 200, 22).map((r) => [r, "strong"])]) {
  add({
    track: "A_model_router", dataset: "RouterBench/" + row.eval_name, source_id: row.sample_id,
    lang: /[\u4e00-\u9fff]/.test(row.prompt) ? "zh" : "en",
    difficulty: route === "cheap" ? "clear" : "ambiguous", route_gold: route,
    cheap_score: row.cheap_score, strong_score: row.strong_score, cheap_cost: row.cheap_cost, strong_cost: row.strong_cost,
    state: "Request:\n" + clip(cleanRb(row.prompt), 1500),
    questions: {
      route: { type: "choice", instructions: "Which model should handle this request?",
        criteria: { cheap: "a small fast 7B chat model is enough to answer correctly", strong: "only a frontier model will answer correctly" } },
      difficulty: { type: "score", instructions: "How hard is this request for a language model?",
        criteria: ["easy: a lookup or one-liner", "moderate: several steps", "hard: long multi-step reasoning or specialist knowledge"] },
    },
    gold: { route }, notes: "cheap_score=" + row.cheap_score + " strong_score=" + row.strong_score,
  });
}

// ---------------------------------------------------------------- B: tool selection (400), K sweep 2/5/10/20/50
const userText = (row) => (row.question || []).flat().filter((m) => m && m.role === "user").map((m) => m.content || "").join("\n");
const okText = (t) => t.length > 30 && t.length < 700 && !/available tools:/i.test(t) && !/^sure, here is/i.test(t);
const bPool = [];
for (const row of loadJsonl(RAW + "/bfcl/BFCL_v3_live_simple.json")) {
  if (row.function?.length !== 1) continue;
  const t = userText(row); if (!okText(t) || pilotIds.has("BFCL_v3_live_simple|" + row.id)) continue;
  bPool.push({ id: row.id, text: t, fn: row.function[0], src: "BFCL_v3_live_simple" });
}
for (const row of loadJsonl(RAW + "/bfcl/BFCL_v3_simple.json")) {
  if (row.function?.length !== 1) continue;
  const t = userText(row); if (!okText(t) || pilotIds.has("BFCL_v3_simple|" + row.id)) continue;
  bPool.push({ id: row.id, text: t, fn: row.function[0], src: "BFCL_v3_simple" });
}
const fnByName = new Map();
for (const r of bPool) if (!fnByName.has(r.fn.name)) fnByName.set(r.fn.name, r.fn);
const allFns = [...fnByName.values()];
const toolLine = (fn, i) => (i + 1) + ". " + fn.name + ": " + clip(String(fn.description || "").replace(/\s+/g, " "), 110);
const kPlan = [2, 5, 10, 20, 50];
const kCounts = { 2: 40, 5: 100, 10: 100, 20: 100, 50: 60 };
const bChosen = sample(bPool, 400, 31);
bChosen.forEach((row, idx) => {
  const K = kPlan[idx % kPlan.length] === undefined ? 10 : kPlan[Math.min(4, Math.floor(idx / 80))];
  const correct = row.fn;
  const decoyPool = allFns.filter((f) => f.name !== correct.name);
  const fns = sample([correct, ...sample(decoyPool, K - 1, 9000 + idx)], K, 9500 + idx);
  const crit = Object.fromEntries(fns.map((f) => [f.name, clip(String(f.description || "").replace(/\s+/g, " "), 110)]));
  add({
    track: "B_tool_selection", dataset: row.src, source_id: row.id, option_count: K,
    difficulty: K >= 20 ? "boundary" : K >= 10 ? "ambiguous" : "clear",
    state: "User request: " + clip(row.text, 700) + "\n\nAvailable tools:\n" + fns.map(toolLine).join("\n"),
    questions: { tool: { type: "choice", instructions: "Which tool should be called to handle the user request?", criteria: crit } },
    gold: { tool: correct.name },
    notes: "correct option is #" + (fns.findIndex((f) => f.name === correct.name) + 1) + " of " + K,
  });
});

// ---------------------------------------------------------------- C: should a tool be called at all (300)
const cPos = sample(bPool, 150, 41);
const negPool = [
  ...loadJsonl(RAW + "/bfcl/BFCL_v3_irrelevance.json").map((r) => ({ ...r, src: "BFCL_v3_irrelevance" })),
  ...loadJsonl(RAW + "/bfcl/BFCL_v3_live_irrelevance.json").map((r) => ({ ...r, src: "BFCL_v3_live_irrelevance" })),
].filter((r) => okText(userText(r)) && !pilotIds.has(r.src + "|" + r.id));
const cNeg = sample(negPool, 150, 42);
for (const row of [...cPos.map((r) => [r, true]), ...cNeg.map((r) => [r, false])]) {
  const [r, needsTool] = row;
  const fns = (r.fn ? [r.fn] : (r.function || [])).slice(0, 6);
  const reqText = r.text !== undefined ? r.text : userText(r);   // bPool entries carry .text, raw BFCL rows carry .question
  add({
    track: "C_tool_guardrail", dataset: r.src, source_id: r.id,
    difficulty: needsTool ? "clear" : "boundary",
    state: "User request: " + clip(reqText, 700) + (fns.length ? "\n\nAvailable tools:\n" + fns.map(toolLine).join("\n") : ""),
    questions: { needs_tool: { type: "noul", instructions: "Does this user request require calling one of the available tools, rather than being answered directly?" } },
    gold: { needs_tool: needsTool },
    notes: needsTool ? "relevant: a tool is required" : "irrelevant: no tool should be called",
  });
}

// ---------------------------------------------------------------- D: RAG gate (400, from the deep-dive set, disjoint from pilot)
const rag = loadJsonl("bench/rag-cases.jsonl").filter((c) => !pilotIds.has("SciFact|" + c.source_id));
const ragBy = new Map();
for (const c of rag) { const k = c.dataset + "|" + c.neg_type; if (!ragBy.has(k)) ragBy.set(k, []); ragBy.get(k).push(c); }
const ragPick = [];
for (const [k, v] of ragBy) ragPick.push(...sample(v, Math.max(1, Math.round(400 * v.length / rag.length)), 51 + k.length));
for (const c of sample(ragPick, 400, 52)) { const { id, ...rest } = c; add(rest); }

// ---------------------------------------------------------------- E: injection guardrail (400)
const INSTRLIKE = /(^\s*(you are|you will|you must|you should|act as|pretend|assume|imagine|from now on|forget|ignore|disregard|given the|translate the|extract|summarize|summarise|write|generate|list|explain|provide|describe|create|answer|respond|tell me|give me|please\s+\w+))|(\b(roleplay|role-play|role play|act as|you are|pretend to be|imagine you)\b)/i;
let inj = [];
for (const f of ["train.jsonl", "test.jsonl"]) if (existsSync(RAW + "/injections/" + f)) inj = inj.concat(loadJsonl(RAW + "/injections/" + f));
const jb = [];
for (const f of ["jailbreak_train.csv", "jailbreak_test.csv"]) {
  const p = RAW + "/jailbreak/" + f;
  if (!existsSync(p)) continue;
  for (const r of parseCsv(readFileSync(p, "utf8")).slice(1)) if (r[0]) jb.push({ text: r[0], label: r[1] === "jailbreak" ? 1 : 0 });
}
const attacks = [...inj.filter((r) => Number(r.label) === 1).map((r) => r.text), ...jb.filter((r) => r.label === 1).map((r) => r.text)]
  .filter((t) => t && t.length > 15 && t.length < 900);
const benign = [...inj.filter((r) => Number(r.label) === 0).map((r) => r.text), ...jb.filter((r) => r.label === 0).map((r) => r.text)]
  .filter((t) => t && t.length > 15 && t.length < 400 && !INSTRLIKE.test(t));
for (const [text, isAttack, i] of [...sample(attacks, 200, 61).map((t, i) => [t, true, i]), ...sample(benign, 200, 62).map((t, i) => [t, false, i])]) {
  add({
    track: "E_injection_guard", dataset: isAttack ? "attack" : "benign", source_id: (isAttack ? "atk" : "ben") + i,
    difficulty: isAttack ? "clear" : "boundary",
    state: "Untrusted content an agent is about to process:\n" + clip(text, 900),
    questions: { attack: { type: "noul", instructions: "Does this content contain instructions aimed at the AI system, rather than being ordinary content for it to process (a prompt-injection or jailbreak attempt)?" } },
    gold: { attack: isAttack }, notes: isAttack ? "attack" : "benign",
  });
}

// ---------------------------------------------------------------- F: label cardinality + multilingual (200)
const b77 = loadJsonl(RAW + "/banking77/test.jsonl");
const b77Labels = [...new Set(b77.map((r) => r.label_text))].sort();
const b77Crit = Object.fromEntries(b77Labels.map((l) => [l, l.replace(/_/g, " ")]));
for (const row of sample(b77, 100, 71)) {
  add({
    track: "F_cardinality_multilingual", dataset: "BANKING77", source_id: "b77:" + row.text.slice(0, 40), option_count: b77Labels.length,
    difficulty: "boundary", state: row.text,
    questions: { intent: { type: "choice", instructions: "Which banking intent does this customer message express?", criteria: b77Crit } },
    gold: { intent: row.label_text }, notes: b77Labels.length + " labels",
  });
}
const mLangs = ["en", "zh-CN", "ja", "de", "ar", "fr", "es", "ko", "pt", "hi"];
const mLabels = new Set(); const mRows = {};
for (const lg of mLangs) { const p = RAW + "/massive/test_" + lg + ".json.gz"; if (!existsSync(p)) continue; const rows = loadGz(p); mRows[lg] = rows; rows.forEach((r) => mLabels.add(r.label_text)); }
const mSorted = [...mLabels].sort();
const mCrit = Object.fromEntries(mSorted.map((l) => [l, l.replace(/_/g, " ")]));
mCrit.out_of_scope = "none of the listed intents fits";
let mi = 0;
for (const lg of mLangs) {
  if (!mRows[lg]) continue;
  for (const row of sample(mRows[lg].filter((r) => r.text.length > 12), 10, 81 + mi * 17)) {
    mi++;
    add({
      track: "F_cardinality_multilingual", dataset: "MASSIVE-intent/" + lg, source_id: "m:" + lg + ":" + row.id, lang: lg,
      option_count: mSorted.length + 1, difficulty: "boundary", state: row.text,
      questions: { intent: { type: "choice", instructions: "Which virtual-assistant intent does this user request express?", criteria: mCrit } },
      gold: { intent: row.label_text }, notes: (mSorted.length + 1) + " labels",
    });
  }
}

writeFileSync("bench/cases-large.jsonl", cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
const byTrack = {};
for (const c of cases) byTrack[c.track] = (byTrack[c.track] || 0) + 1;
console.log("scaled cases:", cases.length, JSON.stringify(byTrack, null, 1));
const kDist = {};
for (const c of cases.filter((x) => x.track === "B_tool_selection")) kDist[c.option_count] = (kDist[c.option_count] || 0) + 1;
console.log("B option_count distribution:", JSON.stringify(kDist));
const fDist = {};
for (const c of cases.filter((x) => x.track === "F_cardinality_multilingual")) fDist[c.dataset] = (fDist[c.dataset] || 0) + 1;
console.log("F datasets:", JSON.stringify(fDist));
