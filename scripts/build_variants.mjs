import { readFileSync, writeFileSync } from "node:fs";
const cases = readFileSync("bench/cases.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));

// variant 1: reverse the option order of every choice question (position-bias probe)
const flip = cases.map(c => {
  const [k, spec] = Object.entries(c.questions)[0];
  if (spec.type !== "choice") return c;
  const rev = Object.fromEntries(Object.entries(spec.criteria).reverse());
  return { ...c, id: c.id, questions: { [k]: { ...spec, criteria: rev } }, variant: "flip" };
});
writeFileSync("bench/cases-flip.jsonl", flip.map(c=>JSON.stringify(c)).join("\n") + "\n");

// variant 2: same 25 router states, but ask the routing question as a noul fact instead of a 2-way choice
const aCases = cases.filter(c => c.track === "A_model_router");
const noul = aCases.map(c => ({
  ...c, id: c.id, variant: "noul",
  questions: { cheap_enough: { type: "noul", instructions: "Is a small fast 7B chat model able to answer this request correctly, without escalating to a frontier model?" } },
  gold: { cheap_enough: c.gold.route === "cheap" },
}));
writeFileSync("bench/cases-a-noul.jsonl", noul.map(c=>JSON.stringify(c)).join("\n") + "\n");
console.log("flip cases:", flip.length, "| a-noul cases:", noul.length);
console.log("example flipped criteria order:", JSON.stringify(Object.keys(flip.find(c=>c.track==="A_model_router").questions.route.criteria)));
