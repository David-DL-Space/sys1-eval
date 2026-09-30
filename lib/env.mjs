import { readFileSync } from "node:fs";

export function parseEnvFile(path) {
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(raw)) continue;
    const m = raw.match(/^\s*([A-Za-z0-9_.]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export const JEV_ENV_FILE = process.env.JEV_ENV_FILE || ".env";   // file with JEV_KEY=... (never committed)

export function jevKey() {
  const env = parseEnvFile(JEV_ENV_FILE);
  const k = env.jev_key || env.JEV_KEY || env.TYPESAFE_API_KEY;
  if (!k) throw new Error("no jev key in " + JEV_ENV_FILE);
  return k;
}
