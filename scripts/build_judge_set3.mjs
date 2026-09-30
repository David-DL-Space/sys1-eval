import { readFileSync, writeFileSync } from "node:fs";
const items = readFileSync("bench/judge-set.jsonl","utf8").split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const dis = items.filter(x=>x.audit_kind==="disagree");
writeFileSync("bench/judge-set-lenient-dis.jsonl", dis.map(x=>JSON.stringify(x)).join("\n")+"\n");
console.log("lenient disagreement set:", dis.length);
