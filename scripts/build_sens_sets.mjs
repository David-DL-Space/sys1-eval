import { readFileSync, writeFileSync } from "node:fs";
const load = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sample(arr, k, seed) { const r = rng(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); }

// ---- question wording variants (v1 = what round 1/2 used) -------------------
const WORDING = {
  C_tool_guardrail: {
    "needs_tool": [
      "Does this user request require calling one of the available tools, rather than being answered directly?",
      "Should the assistant call one of the available tools to handle this request, instead of answering directly?",
      "Is a tool call needed for this request, or can it be answered without tools?",
      "Does handling this request require one of the tools listed above?",
    ],
  },
  D_rag_gate: {
    "relevant": [
      "Does the passage contain information that helps answer the question?",
      "Is this passage useful for answering the question?",
      "Does the passage provide information relevant to the question?",
      "Can the question be answered using information in the passage?",
    ],
  },
  E_injection_guard: {
    "attack": [
      "Does this content contain instructions aimed at the AI system, rather than being ordinary content for it to process (a prompt-injection or jailbreak attempt)?",
      "Is this content attempting a prompt injection or jailbreak against the AI system, as opposed to being ordinary content to process?",
      "Does this content try to make an AI assistant deviate from its instructions or rules?",
      "Is this text an instruction directed at the AI system rather than content for it to handle?",
    ],
  },
  A_model_router: {
    "route": [
      "Which model should handle this request?",
      "Which model is needed for this request?",
      "Which model should this request be routed to?",
      "Pick the model tier this request requires.",
    ],
  },
  B_tool_selection: {
    "tool": [
      "Which tool should be called to handle the user request?",
      "Select the tool that should be called for this request.",
      "Which of the available tools handles this request?",
      "Choose the correct tool for the user request.",
    ],
  },
  F_cardinality_multilingual: {
    "intent": [
      null,   // dataset-specific original (kept verbatim)
      "What intent does this user request express?",
      "Classify this message into the correct intent.",
      "Which intent label best fits this user message?",
    ],
  },
};

const large = load("bench/cases-large.jsonl");
const rag = load("bench/rag-cases.jsonl");
const PLAN = { A_model_router: 100, B_tool_selection: 120, C_tool_guardrail: 80, E_injection_guard: 80, F_cardinality_multilingual: 60 };
const D_PLAN = { pos: 50, hard_neg: 80, easy_neg: 30 };

for (const seed of [42, 99]) {
  const picked = [];
  for (const [track, k] of Object.entries(PLAN)) picked.push(...sample(large.filter((c) => c.track === track), k, seed * 7 + track.length));
  for (const [nt, k] of Object.entries(D_PLAN)) picked.push(...sample(rag.filter((c) => c.neg_type === nt), k, seed * 13 + nt.length));

  for (let w = 0; w < 4; w++) {
    const out = picked.map((c) => {
      const [k, spec] = Object.entries(c.questions)[0];
      const variants = WORDING[c.track] && WORDING[c.track][k];
      if (!variants || variants[w] == null) return c;                 // F/v1 keeps the dataset wording
      return { ...c, wording: "v" + (w + 1), questions: { [k]: { ...spec, instructions: variants[w] } } };
    });
    writeFileSync("bench/sens-s" + seed + "-w" + (w + 1) + ".jsonl", out.map((c) => JSON.stringify(c)).join("\n") + "\n");
    console.log("built bench/sens-s" + seed + "-w" + (w + 1) + ".jsonl  n=" + out.length);
  }
}
const one = load("bench/sens-s42-w1.jsonl");
const byTrack = {}; for (const c of one) byTrack[c.track] = (byTrack[c.track] || 0) + 1;
console.log("per-track:", JSON.stringify(byTrack));
console.log("total sens runs: 8 files x 2 models =", 8 * 2 * one.length, "decisions");
