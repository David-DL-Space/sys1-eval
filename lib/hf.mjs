const MIRROR = process.env.HF_ENDPOINT || "https://hf-mirror.com";

const clean = (t) => t.replace(/^\uFEFF/, "");

export async function hfTree(repo, { type = "datasets", rev = "main", recursive = true } = {}) {
  const url = `${MIRROR}/api/${type}/${repo}/tree/${rev}?recursive=${recursive}`;
  const res = await fetch(url, { redirect: "follow" });
  const txt = clean(await res.text());
  if (!txt.startsWith("[")) return { error: `HTTP ${res.status}: ${txt.slice(0, 150)}` };
  return { files: JSON.parse(txt) };
}

export function hfResolve(repo, file, { type = "datasets", rev = "main" } = {}) {
  return `${MIRROR}/${type}/${repo}/resolve/${rev}/${file}`;
}

export async function hfFetchText(repo, file, opts) {
  const res = await fetch(hfResolve(repo, file, opts), { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${hfResolve(repo, file, opts)}`);
  return await res.text();
}
