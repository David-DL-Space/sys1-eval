import { readFileSync } from "node:fs";
const t = JSON.parse(readFileSync(process.env.TEMP + "/agentdojo-tree.json", "utf8"));
const paths = t.tree.map((x) => x.path);
console.log("default_suites:");
console.log(paths.filter(p=>p.includes("default_suites")).slice(0,40).join("\n"));
console.log("\ninjection_vectors.yaml files:");
console.log(paths.filter(p=>p.endsWith("injection_vectors.yaml")).join("\n"));
console.log("\nuser_tasks/injection_tasks py:");
console.log(paths.filter(p=>/(user_tasks|injection_tasks)\.py$/.test(p)).join("\n"));
