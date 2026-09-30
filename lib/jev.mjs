import { jevKey } from "./env.mjs";

export const JEV_URL = process.env.JEV_BASE_URL || "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = process.env.JEV_MODEL || "jev-latest";

/** One call to the System-1 endpoint. Returns raw response + wall-clock latency. */
export async function systemOne({ state, questions, model = JEV_MODEL, key = jevKey(), timeoutMs = 120000 }) {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(JEV_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ state, model, questions }),
      signal: ctl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json, text: json ? null : text.slice(0, 800), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e), ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}
