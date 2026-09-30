import { readFileSync, writeFileSync } from "node:fs";
const items = readFileSync("bench/judge-set.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const focus = items.filter(x=>x.audit_kind==="both_wrong" && x.track==="D_rag_gate").slice(0,80);
const other = items.filter(x=>x.audit_kind==="both_wrong" && x.track!=="D_rag_gate").slice(0,40);
writeFileSync("bench/judge-set-lenient.jsonl", [...focus,...other].map(x=>JSON.stringify(x)).join("\n")+"\n");
console.log("lenient re-judge set:", focus.length + other.length);
