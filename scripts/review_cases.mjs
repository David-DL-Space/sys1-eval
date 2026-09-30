import { readFileSync, writeFileSync } from "node:fs";
const cases = readFileSync("bench/cases.jsonl", "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();
const out = [];
for (const c of cases) {
  const q = Object.entries(c.questions)[0];
  const key = q[0];
  const spec = q[1];
  const opts = spec.type === "choice" ? Object.keys(spec.criteria) : [];
  out.push([
    "### " + c.id + " [" + c.track + "] " + c.dataset + " | gold=" + JSON.stringify(c.gold) + (c.option_count ? " | K=" + c.option_count : "") + " | " + c.difficulty,
    "  Q(" + spec.type + "): " + spec.instructions,
    opts.length ? "  OPTIONS(" + opts.length + "): " + opts.slice(0, 8).join(" / ") + (opts.length > 8 ? " ... +" + (opts.length - 8) : "") : "",
    "  STATE: " + oneLine(c.state).slice(0, 420),
    "  NOTE: " + c.notes,
  ].filter(Boolean).join("\n"));
}
writeFileSync("bench/REVIEW.md", out.join("\n\n"));
console.log("wrote bench/REVIEW.md,", out.length, "cases");
// compact per-track sanity stats
const byTrack = {};
for (const c of cases) { byTrack[c.track] = byTrack[c.track] || { n: 0, pos: 0, uniq: 0, Ks: [] }; const t = byTrack[c.track]; t.n++;
  const g = Object.values(c.gold)[0]; if (g === true) t.pos++; if (c.has_unique_answer) t.uniq++; if (c.option_count) t.Ks.push(c.option_count); }
console.log(JSON.stringify(byTrack, null, 1));
