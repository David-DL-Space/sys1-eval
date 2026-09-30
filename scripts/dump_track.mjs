import { readFileSync } from "node:fs";
const cases = readFileSync("bench/cases.jsonl", "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();
const want = process.argv[2].split(",");
for (const c of cases.filter((x) => want.includes(x.track))) {
  const [key, spec] = Object.entries(c.questions)[0];
  console.log(c.id + " " + c.dataset + " gold=" + JSON.stringify(c.gold) + (c.option_count ? " K=" + c.option_count : "") + (c.lang !== "en" ? " lang=" + c.lang : ""));
  console.log("   Q: " + spec.instructions);
  console.log("   S: " + oneLine(c.state).slice(0, 260));
}
