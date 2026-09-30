import { parseEnvFile } from "./env.mjs";

// Provider selection:
//   JUDGE_PROVIDER=deepseek  -> api.deepseek.com, key DEEPSEEK_KEY / DEEPSEEK_API_KEY from DS_ENV_FILE (default .env)
//   JUDGE_PROVIDER=openrouter (legacy default) -> openrouter.ai, key OPENROUTER_API_KEY from OR_ENV_FILE
const PROVIDER = process.env.JUDGE_PROVIDER || (process.env.DS_ENV_FILE ? "deepseek" : "openrouter");
const CFG = PROVIDER === "deepseek"
  ? { url: "https://api.deepseek.com/chat/completions", model: "deepseek-flash", envFile: process.env.DS_ENV_FILE || ".env", keys: ["DEEPSEEK_KEY", "DEEPSEEK_API_KEY"] }
  : { url: "https://openrouter.ai/api/v1/chat/completions", model: "deepseek/deepseek-v4.1-flash", envFile: process.env.OR_ENV_FILE || ".env", keys: ["OPENROUTER_API_KEY"] };
export const JUDGE_MODEL = process.env.JUDGE_MODEL || CFG.model;
const URL = CFG.url;

let cachedKey = null;
function key() {
  if (cachedKey) return cachedKey;
  const env = parseEnvFile(CFG.envFile);
  const k = CFG.keys.map((n) => env[n] || process.env[n]).find(Boolean);
  if (!k) throw new Error("no " + CFG.keys.join("/") + " in " + CFG.envFile);
  cachedKey = k;
  return k;
}

/** One chat completion against the judge model. Returns text + usage + latency. */
export async function chat(messages, { model = JUDGE_MODEL, temperature = 0, maxTokens = 4000, timeoutMs = 180000, retries = 4 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const t0 = Date.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { authorization: "Bearer " + key(), "content-type": "application/json" },
        body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages, response_format: { type: "json_object" } }),
        signal: ctl.signal,
      });
      const txt = await res.text();
      let json = null;
      try { json = JSON.parse(txt); } catch {}
      if (res.ok && json && json.choices && json.choices[0]) {
        return { ok: true, text: json.choices[0].message.content, usage: json.usage, ms: Date.now() - t0, model: json.model };
      }
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
      return { ok: false, status: res.status, error: txt.slice(0, 300), ms: Date.now() - t0 };
    } catch (e) {
      if (attempt === retries) return { ok: false, status: 0, error: String(e && e.message || e), ms: Date.now() - t0 };
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    } finally { clearTimeout(timer); }
  }
  return { ok: false, status: 0, error: "exhausted retries", ms: 0 };
}

/** Extract the first JSON object from a model reply (tolerates prose / code fences). */
export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}
