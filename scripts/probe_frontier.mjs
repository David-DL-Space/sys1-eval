import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync(process.env.TEMP + "/or-models-keyed.json", "utf8").replace(/^\uFEFF/, ""));
const ids = j.data.map(m => ({ id: m.id, p: Number(m.pricing.prompt)*1e6, c: Number(m.pricing.completion)*1e6 }));
for (const pat of [/claude-sonnet-5\.5$/, /^anthropic\/claude-haiku/, /^openai\/gpt-5\.2$/, /^openai\/gpt-5$/, /^google\/gemini-3-pro/]) {
  const m = ids.find(x => pat.test(x.id));
  console.log(pat.source.padEnd(28), m ? (m.id + "  $" + m.p.toFixed(2) + " in / $" + m.c.toFixed(2) + " out") : "(not found)");
}
