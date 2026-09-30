import { readFileSync, writeFileSync } from "node:fs";
const cases = readFileSync("bench/cases-large.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const flip = cases.map(c => {
  const [k, spec] = Object.entries(c.questions)[0];
  if (spec.type !== "choice") return null;
  return { ...c, questions: { [k]: { ...spec, criteria: Object.fromEntries(Object.entries(spec.criteria).reverse()) } } };
}).filter(Boolean);
writeFileSync("bench/cases-large-flip.jsonl", flip.map(c=>JSON.stringify(c)).join("\n") + "\n");
console.log("flipped choice cases:", flip.length);
const byTrack = {}; for (const c of flip) byTrack[c.track] = (byTrack[c.track]||0)+1;
console.log(JSON.stringify(byTrack));
