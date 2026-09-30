# ARR Responsible NLP Research Checklist — draft answers

Section numbers refer to `paper/dist/arr-review.pdf`. Re-check each item against the final PDF before submitting;
incorrect or misleading answers can lead to desk rejection.

## A. For every submission
- **A1. Did you describe the limitations of your work?** Yes — section "Limitations" (after §9), plus §8 Threats to Validity.
- **A2. Did you discuss any potential risks of your work?** Yes — "Ethics Statement" (harmful-request and jailbreak texts used only as classifier inputs; synthetic PII) and §8 (label noise, contamination, LLM-judge dependence).

## B. Did you use or create scientific artifacts? Yes
- **B1. Did you cite the creators of artifacts you used?** Yes — §4, Appendix A, and DATA_LICENSE.md in the supplementary material.
- **B2. Did you discuss the license or terms for use and/or distribution of any artifacts?** Yes — Ethics Statement and DATA_LICENSE.md (derived cases keep upstream licenses; several sources are non-commercial).
- **B3. Did you discuss if your use of existing artifacts was consistent with their intended use?** Yes — all datasets are used for evaluation only; safety/jailbreak data only as classifier inputs (Ethics Statement).
- **B4. Did you discuss the steps taken to check whether the data contains personally identifying information or offensive content?** Yes — the PII dataset (ai4privacy) is synthetic; harmful-request datasets are used as inputs and no harmful completions were generated (Ethics Statement, Appendix A).
- **B5. Did you provide documentation of the artifacts?** Yes — Table 1, Appendix A (construction of every track), README in the supplementary material.
- **B6. Did you report relevant statistics like the number of examples, details of train/test/dev splits?** Yes — Table 1 and Appendix A (no training; all cases are test cases; class balance per track).

## C. Did you run computational experiments? Yes
- **C1. Did you report the number of parameters in the models used, the total computational budget, and computing infrastructure used?** Partly — hardware, runtimes and API spend in "Reproducibility and Compute" (appendix) and §5 latency; parameter counts are not reported because one system is a closed API.
- **C2. Did you discuss the experimental setup, including hyperparameter search and best-found hyperparameter values?** Yes — §3 (protocol, confidence definition), Appendix B (verbatim questions and prompts); no training or hyperparameter search; gate thresholds and their held-out selection in §6.
- **C3. Did you report descriptive statistics about your results (error bars, summary statistics over multiple runs)?** Yes — Wilson intervals, exact McNemar tests and paired-difference CIs (§3, Fig. 1), 4 wordings × 2 samples (Fig. 3b), 500 random splits for thresholds (Fig. 4b), repeat/day-2/cross-hardware reruns (§3).
- **C4. If you used existing packages, did you report the implementation, model, and parameter settings used?** Yes — versions in "Reproducibility and Compute" (Laya 0.3.21, transformers 5.17.0, torch 2.14.0, jev-1.13.0, deepseek-flash).

## D. Did you use human annotators or research with human participants? No
- Labels come from the source datasets and from LLM annotators (described in §8 and Appendix D). D1–D5: N/A.

## E. AI assistants in research or writing
- **E1. Did you use AI assistants (e.g., ChatGPT, Copilot) in your research, coding, or writing?** Yes — LLM-based assistants were used for coding and editing (see Acknowledgments). LLMs were also used as experimental instruments (label audit, policy annotation, reference model), described in §7, §8 and Appendix D.
  *Answer this item accurately and in full; the checklist is part of the review.*
