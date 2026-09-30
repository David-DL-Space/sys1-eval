import { readFileSync } from "node:fs";
const load = (p) => new Map(readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.id,r];}));
const analyse = (casesPath, tag) => {
  const cases = new Map(readFileSync(casesPath,"utf8").replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean).map(l=>{const c=JSON.parse(l);return [c.id,c];}));
  const L = load("results/laya-all.jsonl"), J = load("results/jev-all.jsonl");
  const by = {};
  for (const [id, c] of cases) {
    const l = L.get(id), j = J.get(id); if (!l?.ok || !j?.ok) continue;
    const t = c.track; by[t] = by[t] || { n: 0, bothWrong: 0, bothRight: 0, posBothWrong: 0, pos: 0 };
    const key = Object.keys(c.gold)[0];
    const gold = c.gold[key];
    const pred = (r) => { const a = r.answers[key]; if (!a) return null; return a.type === "noul" ? (a.noul >= 0.5) : a.choice; };
    const lp = pred(l), jp = pred(j); if (lp === null || jp === null) continue;
    const lc = lp === gold, jc = jp === gold;
    by[t].n++;
    if (!lc && !jc) { by[t].bothWrong++; if (gold === true) by[t].posBothWrong++; }
    if (lc && jc) by[t].bothRight++;
    if (gold === true) by[t].pos++;
  }
  console.log("== " + tag + " ==");
  for (const [t, v] of Object.entries(by)) console.log("   " + t.padEnd(28) + " n=" + String(v.n).padEnd(5) + " 双对 " + (100*v.bothRight/v.n).toFixed(1) + "%  双错 " + (100*v.bothWrong/v.n).toFixed(1) + "%" + (v.pos ? "  (正样本里双错 " + v.posBothWrong + "/" + v.pos + ")" : ""));
};
analyse("bench/cases-large.jsonl", "规模集 2100（两模型都错 = 疑似标注噪声/难题）");
analyse("bench/rag-cases.jsonl", "RAG 深挖 1920");
analyse("bench/rag-multi-cases.jsonl", "RAG 多段落 400");
