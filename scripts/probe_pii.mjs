import { hfTree } from "../lib/hf.mjs";
const r = await hfTree("ai4privacy/pii-masking-300k");
if (!r.error) { const f = r.files.filter(x=>x.type==="file"); console.log("pii-masking files:"); console.log(f.slice(0,20).map(x=>"  "+x.path+" "+Math.round((x.size||0)/1024)+"KB").join("\n")); }
const h = await hfTree("pminervini/HaluEval");
if (!h.error) { console.log("\nHaluEval files:"); console.log(h.files.filter(x=>x.type==="file").map(x=>"  "+x.path).join("\n")); }
