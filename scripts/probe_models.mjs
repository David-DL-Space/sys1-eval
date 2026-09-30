import { readFileSync } from "node:fs";
import { chat } from "../lib/judge.mjs";
const j = JSON.parse(readFileSync(process.env.TEMP + "/or-models-keyed.json", "utf8").replace(/^\uFEFF/, ""));
const cands = j.data.filter(m => /^(z-ai|moonshotai|qwen|minimax|openai|google|mistralai)\//.test(m.id) && /(glm-4\.6|kimi-k2|qwen3\.8|qwen3-max|minimax-m2|gpt-5-mini$|gpt-5-nano$|gemini-2\.5-flash$|mistral-large)/.test(m.id))
  .map(m => ({ id: m.id, p: Number(m.pricing.prompt)*1e6, c: Number(m.pricing.completion)*1e6 }));
for (const c of cands) {
  const r = await chat([{ role: "user", content: "Reply with exactly: OK" }], { model: c.id, maxTokens: 20, retries: 1, timeoutMs: 45000 });
  console.log((r.ok ? "OK   " : "FAIL ") + c.id.padEnd(38) + "$" + c.p.toFixed(2) + "/$" + c.c.toFixed(2) + (r.ok ? "" : "  " + String(r.error).slice(0, 90)));
}
