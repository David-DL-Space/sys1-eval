import { systemOne, JEV_URL, JEV_MODEL } from "../lib/jev.mjs";

const state = {
  from: "david@example.com",
  subject: "Duplicate charge on invoice #4411",
  body: "Hi, we were billed twice for March. Please refund the duplicate today or we will cancel our plan.",
};

const questions = {
  department: { type: "choice", instructions: "Which department should handle this request?",
    criteria: { billing: "invoices, payments, refunds", technical: "bugs, outages, system errors", sales: "pricing, new contracts", other: "everything else" } },
  urgency: { type: "score", instructions: "How urgent is this request?",
    criteria: ["not urgent", "soon", "critical deadline or blocking issue"] },
  churn_risk: { type: "noul", instructions: "Does the user threaten to cancel or leave?" },
};

console.log("URL:", JEV_URL, "| model:", JEV_MODEL);
const r = await systemOne({ state, questions });
console.log("status:", r.status, "ok:", r.ok, "ms:", r.ms);
console.log("RAW:", JSON.stringify(r.json ?? r.error ?? r.text, null, 2).slice(0, 2500));

// repeat for determinism + latency spread
const lat = [];
for (let i = 0; i < 3; i++) {
  const x = await systemOne({ state, questions: { department: questions.department } });
  lat.push(x.ms);
  process.stdout.write((x.json?.answers?.department?.choice ?? "ERR") + " ");
}
console.log("\nlatency samples(ms):", lat.join(", "));
