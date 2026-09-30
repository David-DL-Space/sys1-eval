import { readFileSync, writeFileSync } from "node:fs";
const load = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sample(arr, k, seed) { const r = rng(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); }

const cases = new Map([...load("bench/cases-large.jsonl"), ...load("bench/rag-cases.jsonl")].map((c) => [c.id, c]));
const res = { laya: new Map(load("results/laya-all.jsonl").map((r) => [r.id, r])), jev: new Map(load("results/jev-all.jsonl").map((r) => [r.id, r])) };
const AUDITABLE = new Set(["B_tool_selection", "C_tool_guardrail", "D_rag_gate", "E_injection_guard", "F_cardinality_multilingual"]);

function outcome(id) {
  const c = cases.get(id); const key = Object.keys(c.gold)[0]; const gold = c.gold[key];
  const val = (model) => {
    const r = res[model].get(id); if (!r || !r.ok) return null;
    const a = r.answers[key]; if (!a) return null;
    const pred = a.type === "noul" ? a.noul >= 0.5 : a.choice;
    return { pred, correct: pred === gold };
  };
  const L = val("laya"), J = val("jev");
  if (!L || !J) return null;
  return { c, key, gold, L, J, kind: L.correct && J.correct ? "both_right" : !L.correct && !J.correct ? "both_wrong" : "disagree" };
}

const rows = [...cases.keys()].filter((id) => AUDITABLE.has(cases.get(id).track)).map(outcome).filter(Boolean);
const byKind = (k) => rows.filter((r) => r.kind === k);
console.log("auditable cases:", rows.length, "| disagree:", byKind("disagree").length, "| both_wrong:", byKind("both_wrong").length, "| both_right:", byKind("both_right").length);

// stratified sample: 150 disagreements, 150 both-wrong (prioritising failed RAG positives), 60 both-right controls
function stratify(pool, k, seed, keyFn) {
  const g = new Map();
  for (const r of pool) { const kk = keyFn(r); if (!g.has(kk)) g.set(kk, []); g.get(kk).push(r); }
  const groups = [...g.entries()].map(([kk, v]) => [kk, sample(v, v.length, seed + kk.length)]).sort((a, b) => b[1].length - a[1].length);
  const out = []; let i = 0;
  while (out.length < k && groups.some((x) => x[1].length)) { const g2 = groups[i % groups.length]; if (g2[1].length) out.push(g2[1].shift()); i++; if (i > 100000) break; }
  return out;
}
const keyFn = (r) => r.c.track + (r.c.neg_type ? "/" + r.c.neg_type : "");
const pickDisagree = stratify(byKind("disagree"), 150, 501, keyFn);
const wrongPos = byKind("both_wrong").filter((r) => r.c.track === "D_rag_gate" && r.gold === true);
const wrongOther = byKind("both_wrong").filter((r) => !(r.c.track === "D_rag_gate" && r.gold === true));
const pickWrong = [...stratify(wrongPos, 90, 502, (r) => r.c.dataset), ...stratify(wrongOther, 60, 503, keyFn)];
const pickRight = stratify(byKind("both_right"), 60, 504, keyFn);

const items = [...pickDisagree, ...pickWrong, ...pickRight].map((r) => {
  const c = r.c; const [qk, spec] = Object.entries(c.questions)[0];
  return {
    id: c.id, audit_kind: r.kind, track: c.track, dataset: c.dataset, lang: c.lang,
    question_kind: spec.type, question: spec.instructions,
    content: c.state.length > 4000 ? c.state.slice(0, 4000) + " …[truncated]" : c.state,
    options: spec.type === "choice" ? Object.keys(spec.criteria) : null,
    dataset_gold: r.gold, laya_correct: r.L.correct, jev_correct: r.J.correct,
  };
});
writeFileSync("bench/judge-set.jsonl", items.map((x) => JSON.stringify(x)).join("\n") + "\n");
const by = {}; for (const x of items) by[x.track + "/" + x.audit_kind] = (by[x.track + "/" + x.audit_kind] || 0) + 1;
console.log("judge set:", items.length);
console.log(JSON.stringify(by, null, 1));
