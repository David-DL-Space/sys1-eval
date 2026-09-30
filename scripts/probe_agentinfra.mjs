import { hfTree } from "../lib/hf.mjs";
const ids = ["pminervini/HaluEval","wandb/RAGTruth-processed","PKU-Alignment/BeaverTails","ai4privacy/pii-masking-300k","LibrAI/do-not-answer","allenai/wildguardmix","AgentSafetyBench/Agent-SafetyBench","nvidia/Nemotron-PII","openai/gsm8k","Salesforce/xlam-function-calling-60k"];
for (const id of ids) {
  const r = await hfTree(id);
  if (r.error) { console.log(id.padEnd(38), "ERR", r.error.slice(0,60)); continue; }
  const f = r.files.filter(x=>x.type==="file");
  const data = f.filter(x=>/\.(jsonl|json|csv|parquet|tsv)($|\.)/.test(x.path)).slice(0,6).map(x=>x.path+" "+Math.round((x.size||0)/1024)+"KB");
  console.log(id.padEnd(38), "files=" + f.length, "|", data.join(" ; ") || "(no data files)");
}
