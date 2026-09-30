import { readFileSync, writeFileSync } from "node:fs";
const load = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sample(arr, k, seed) { const r = rng(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); }
const cases = new Map(load("bench/agentinfra-cases.jsonl").map((c) => [c.id, c]));
const L = new Map(load("results/laya-agentinfra.jsonl").map((r) => [r.id, r]));
const J = new Map(load("results/jev-agentinfra.jsonl").map((r) => [r.id, r]));
const rows = [];
for (const [id, c] of cases) {
  const key = Object.keys(c.gold)[0]; const gold = c.gold[key];
  const a = L.get(id), b = J.get(id); if (!a?.ok || !b?.ok) continue;
  const pred = (r) => { const x = r.answers[key]; return x ? x.noul >= 0.5 : null; };
  const lc = pred(a) === gold, jc = pred(b) === gold;
  rows.push({ c, key, gold, lc, jc, kind: lc && jc ? "both_right" : !lc && !jc ? "both_wrong" : "disagree" });
}
const byKind = (k) => rows.filter((r) => r.kind === k);
console.log("agent-infra auditable:", rows.length, "| disagree:", byKind("disagree").length, "| both_wrong:", byKind("both_wrong").length, "| both_right:", byKind("both_right").length);
const pick = [...sample(byKind("disagree"), 90, 601), ...sample(byKind("both_wrong"), 90, 602), ...sample(byKind("both_right"), 60, 603)];
const items = pick.map((r) => {
  const [qk, spec] = Object.entries(r.c.questions)[0];
  return { id: r.c.id, audit_kind: r.kind, track: r.c.track, dataset: r.c.dataset, lang: r.c.lang,
    question_kind: spec.type, question: spec.instructions,
    content: r.c.state.length > 4000 ? r.c.state.slice(0, 4000) + " …[truncated]" : r.c.state,
    options: spec.type === "choice" ? Object.keys(spec.criteria) : null,
    dataset_gold: r.gold, laya_correct: r.lc, jev_correct: r.jc };
});
writeFileSync("bench/judge-set-agentinfra.jsonl", items.map((x) => JSON.stringify(x)).join("\n") + "\n");
console.log("judge set:", items.length);
const by = {}; for (const x of items) by[x.track + "/" + x.audit_kind] = (by[x.track + "/" + x.audit_kind] || 0) + 1;
console.log(JSON.stringify(by, null, 1));
