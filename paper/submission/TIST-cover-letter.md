Dear Editor-in-Chief,

Please consider the enclosed manuscript, "Fast Models, Slow Evidence: A Paired and Self-Audited Evaluation of System-1
Decision Models for LLM Agent Harnesses", for publication in ACM Transactions on Intelligent Systems and Technology as a
regular paper.

LLM agents are increasingly wrapped in harnesses that make many small, typed decisions: which model to call, which tool
to use, whether retrieved context is relevant, and whether an input carries a prompt injection. A new class of
"System-1" decision models promises to take these decisions off the LLM at a fraction of the cost and latency. The
manuscript reports a paired evaluation of an open-weight and a hosted System-1 model on 11 harness decision points built
from 18 public datasets (7,283 base cases and 6,640 robustness variants), with byte-identical inputs, paired statistics
and cross-hardware and cross-day reproducibility checks.

Beyond the comparison, the manuscript audits its own first version. It shows that errors in deployment accounting
(omitted component costs, gate accuracy reported as end-to-end quality, thresholds selected in-sample) and a content-
channel confound changed practical recommendations, and it reports three control experiments, two of which confirmed the
original conclusions. We believe these lessons on evaluating gating components in intelligent systems fit TIST's focus
on applicable intelligent systems and technology.

All cases, raw model outputs and the analysis code that regenerates every number and figure are publicly available
(https://github.com/David-DL-Space/sys1-eval). A preprint of this work may be posted on arXiv; the manuscript has not
been published and is not under review elsewhere.

Thank you for your consideration.

Sincerely,
Jiawei Li
davidlijiawei@gmail.com
