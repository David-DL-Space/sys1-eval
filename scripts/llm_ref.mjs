// LLM reference runs with DeepSeek (one case per call, temperature 0).
//   node scripts/llm_ref.mjs answer <cases.jsonl> <out.jsonl>   -> same row shape as run_jev.mjs (answers.{key}.noul / .choice)
//   node scripts/llm_ref.mjs audit  <cases.jsonl> <out.jsonl>   -> tool-selection label audit: every tool that could serve the request
// Env: DS_ENV_FILE=../.env (DeepSeek key), CONC (default 8), ONLY_TRACKS=comma list (optional filter)
import { readFileSync, writeFileSync } from "node:fs";
import { chat, extractJson, JUDGE_MODEL } from "../lib/judge.mjs";

const [MODE, CASES, OUT] = process.argv.slice(2);
const CONC = Number(process.env.CONC || 8);
const ONLY = process.env.ONLY_TRACKS ? new Set(process.env.ONLY_TRACKS.split(",")) : null;
let cases = readFileSync(CASES, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
if (ONLY) cases = cases.filter((c) => ONLY.has(c.track));
if (MODE === "audit") cases = cases.filter((c) => Object.values(c.questions)[0].type === "choice");
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 1500);
// RETRY=1: keep ok rows already in OUT and only re-run the failed / missing ids (reasoning can exhaust max_tokens -> empty reply)
let kept = [];
if (process.env.RETRY) {
  const prev = readFileSync(OUT, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  kept = prev.filter((r) => r.ok);
  const done = new Set(kept.map((r) => r.id));
  cases = cases.filter((c) => !done.has(c.id));
  console.log("retry: keeping", kept.length, "ok rows, re-running", cases.length);
}

const SYS_ANSWER = [
  "You are the decision component of an AI agent. You receive a STATE and one QUESTION about it.",
  "- yes/no question: give p_yes, your probability (0..1) that the answer is yes.",
  "- multiple-choice question: give choice = the exact key of the single best option.",
  "Reply with ONLY JSON: {\"p_yes\": 0.0} or {\"choice\": \"<key>\"}.",
].join("\n");
const SYS_AUDIT = [
  "You audit labels of a tool-selection benchmark. Given a user request and a list of tools (name: description),",
  "list EVERY tool that, called with suitable arguments, would correctly fulfil the request. Usually exactly one; list more only if",
  "another tool would genuinely do the job as well. If none would, return an empty list.",
  "Reply with ONLY JSON: {\"valid\": [\"<exact tool name>\", ...]}.",
].join("\n");

function prompt(c) {
  const [key, q] = Object.entries(c.questions)[0];
  if (MODE === "audit") return { key, text: c.state };
  const opts = q.type === "choice" ? "\nOPTIONS:\n" + Object.entries(q.criteria).map(([k, v]) => "- " + k + ": " + v).join("\n") : "";
  return { key, q, text: "STATE:\n" + c.state + "\n\nQUESTION (" + (q.type === "choice" ? "multiple-choice" : "yes/no") + "): " + q.instructions + opts };
}

const results = kept;
let cursor = 0, inTok = 0, outTok = 0;
async function worker() {
  while (cursor < cases.length) {
    const c = cases[cursor++];
    const { key, q, text } = prompt(c);
    const r = await chat([{ role: "system", content: MODE === "audit" ? SYS_AUDIT : SYS_ANSWER }, { role: "user", content: text }], { maxTokens: MAX_TOKENS });
    const j = r.ok ? extractJson(r.text) : null;
    inTok += r.usage?.prompt_tokens || 0; outTok += r.usage?.completion_tokens || 0;
    const row = { id: c.id, track: c.track, dataset: c.dataset, ok: false, ms: r.ms, model: r.model || JUDGE_MODEL, usage: r.usage || null, error: null };
    if (MODE === "audit") {
      if (j && Array.isArray(j.valid)) { row.ok = true; row.valid = j.valid; row.gold = Object.values(c.gold)[0]; }
    } else if (j && q.type === "noul" && typeof j.p_yes === "number") {
      row.ok = true; row.answers = { [key]: { type: "noul", noul: Math.max(0, Math.min(1, j.p_yes)) } };
    } else if (j && q.type === "choice" && typeof j.choice === "string") {
      row.ok = true; row.answers = { [key]: { type: "choice", choice: j.choice, probabilities: { [j.choice]: 1 } } };
    }
    if (!row.ok) row.error = r.ok ? "unparsable: " + String(r.text).slice(0, 120) : (r.error || "HTTP " + r.status);
    results.push(row);
    if (results.length % 50 === 0) process.stdout.write(results.length + " ");
    if (results.length % 50 === 0) writeFileSync(OUT, results.map((x) => JSON.stringify(x)).join("\n") + "\n");
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(OUT, results.map((x) => JSON.stringify(x)).join("\n") + "\n");
console.log("\n" + MODE + " done:", results.length, "| ok:", results.filter((r) => r.ok).length, "| tokens in/out:", inTok, "/", outTok, "| model:", JUDGE_MODEL);
for (const r of results.filter((x) => !x.ok).slice(0, 3)) console.log("FAIL", r.id, r.error);
