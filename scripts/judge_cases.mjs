import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chat, extractJson, JUDGE_MODEL } from "../lib/judge.mjs";

const SET = process.argv[2] || "bench/judge-set.jsonl";
const OUT = process.argv[3] || "results/judge.jsonl";
const BATCH = Number(process.env.JUDGE_BATCH || 6);
const CONC = Number(process.env.JUDGE_CONC || 4);

const items = readFileSync(SET, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
mkdirSync("results", { recursive: true });

const STYLE = process.env.JUDGE_STYLE || "strict";
const SYS = [
  "You are auditing the ground-truth labels of an evaluation set used to grade AI decision models.",
  "For every item you are given a QUESTION and the CONTENT it applies to. Answer the QUESTION yourself, using ONLY that content.",
  "Rules:",
  STYLE === "lenient"
    ? "- Be inclusive: if the content is topically related and could plausibly contribute to an answer, answer yes. Only answer no when the content is clearly off-topic or clearly useless for the question."
    : "- Follow the question wording strictly. Do not stretch your reading to be helpful.",
  "- yes/no questions: answer \"yes\" or \"no\". Use \"unsure\" only when the content genuinely cannot decide it.",
  "- multiple-choice questions: answer with the exact option key, or \"unsure\".",
  "- confidence: your own 0..1 probability that your answer is correct.",
  "- reason: at most 12 words, in English.",
  "Reply with ONLY JSON of the form {\"labels\":[{\"i\":1,\"label\":\"yes\",\"conf\":0.9,\"reason\":\"...\"}]}. One entry per item, same order.",
].join("\n");

function render(items, from) {
  const parts = [];
  items.forEach((it, idx) => {
    const n = from + idx + 1;
    const opts = it.options ? "\nOPTIONS: " + it.options.map((o) => JSON.stringify(o)).join(", ") : "";
    parts.push("### " + n + "\nQUESTION: " + it.question + opts + "\nCONTENT:\n" + it.content);
  });
  return parts.join("\n\n");
}

const batches = [];
for (let i = 0; i < items.length; i += BATCH) batches.push({ from: i, items: items.slice(i, i + BATCH) });

const results = [];
let done = 0, calls = 0; let inTok = 0, outTok = 0;
async function worker(queue) {
  while (queue.length) {
    const b = queue.shift();
    calls++;
    const r = await chat([{ role: "system", content: SYS }, { role: "user", content: render(b.items, b.from) }], { temperature: 0, maxTokens: 4000 });
    const parsed = r.ok ? extractJson(r.text) : null;
    const labels = (parsed && parsed.labels) || [];
    inTok += (r.usage && r.usage.prompt_tokens) || 0;
    outTok += (r.usage && r.usage.completion_tokens) || 0;
    b.items.forEach((it, idx) => {
      const got = labels.find((x) => Number(x.i) === b.from + idx + 1) || labels[idx] || null;
      results.push({
        id: it.id, track: it.track, dataset: it.dataset, audit_kind: it.audit_kind, question_kind: it.question_kind,
        dataset_gold: it.dataset_gold, laya_correct: it.laya_correct, jev_correct: it.jev_correct,
        judge_label: got ? got.label : null, judge_conf: got ? got.conf : null, judge_reason: got ? got.reason : null,
        judge_ok: !!(got && got.label != null), error: r.ok ? (got ? null : "unparsable") : (r.error || ("HTTP " + r.status)),
        ms: r.ms,
      });
    });
    done += b.items.length;
    process.stdout.write(".");
    if (calls % 20 === 0) process.stdout.write(" " + done + "/" + items.length + "\n");
    writeFileSync(OUT, results.map((x) => JSON.stringify(x)).join("\n") + "\n");
  }
}
const queue = batches.slice();
await Promise.all(Array.from({ length: CONC }, () => worker(queue)));
const ok = results.filter((r) => r.judge_ok).length;
console.log("\n=== JUDGE RUN (" + JUDGE_MODEL + ") ===");
console.log("items:", results.length, "| judged:", ok, "| calls:", calls, "| tokens in/out:", inTok, "/", outTok);
for (const r of results.filter((x) => !x.judge_ok).slice(0, 5)) console.log("FAIL", r.id, r.error);
