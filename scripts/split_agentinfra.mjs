import { readFileSync, writeFileSync } from "node:fs";
const load = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const cases = load("bench/agentinfra-cases.jsonl");
for (const t of [...new Set(cases.map((c) => c.track))]) {
  const sub = cases.filter((c) => c.track === t);
  writeFileSync("bench/ai-" + t + ".jsonl", sub.map((c) => JSON.stringify(c)).join("\n") + "\n");
}
console.log("split into", [...new Set(cases.map((c) => c.track))].length, "files");
