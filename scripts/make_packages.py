"""Build upload packages from the committed repository state.

  paper/dist/supplementary-anonymous.zip   code + data for double-blind venues (ARR/OpenReview, WWW, TMLR)
  paper/dist/zenodo-sys1-eval-v<ver>.zip    full named archive for a Zenodo deposit (or use the GitHub-Zenodo integration)

Run from sys1-eval/ after `git commit`:  python scripts/make_packages.py [version]
"""
import pathlib, re, subprocess, sys, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "paper" / "dist"
VERSION = sys.argv[1] if len(sys.argv) > 1 else "2.0.0"

IDENTIFYING = [
    (r"Jiawei Li", "Anonymous Author(s)"),
    (r"Li, Jiawei", "Anonymous"),
    (r"davidlijiawei@\w+\.com", "anonymous@example.com"),
    (r"https://github\.com/David-DL-Space/sys1-eval", "https://anonymous.4open.science/r/sys1-eval"),
    (r"David-DL-Space", "anonymous"),
]
DROP = {"CITATION.cff", ".zenodo.json", "paper/tex/tech-report-zh.tex", "paper/SUBMISSION-GUIDE.md", "scripts/make_packages.py"}
DROP_PREFIX = ("paper/dist/", "paper/submission/")
TEXT_EXT = {".md", ".py", ".mjs", ".js", ".json", ".jsonl", ".tex", ".bib", ".sty", ".bst", ".txt", ".ps1", ".log", ".cff", ".yaml", ".yml", ""}

ANON_README = """# sys1-eval (anonymized supplementary material)

Evaluation cases, raw model outputs and analysis code for the submission
"Fast Models, Slow Evidence: A Paired and Self-Audited Evaluation of System-1 Decision Models for LLM Agent Harnesses".

* `bench/`   evaluation cases (JSONL, byte-identical inputs for both systems)
* `results/` raw responses (day 1) and `results/mac/` (day 2, control experiments, LLM reference and label audit)
* `paper/analysis.py` regenerates every number and figure in the paper from these files:
  `python -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python paper/analysis.py`
* `scripts/` case builders and runners; API keys are read from a local `.env` (see `.env.example`).

Upstream datasets keep their original licenses (see DATA_LICENSE.md). Code: MIT.
"""


def tracked():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [l for l in out.splitlines() if l]


def scrub(text):
    for pat, rep in IDENTIFYING:
        text = re.sub(pat, rep, text)
    return text


def build_anonymous():
    dst = DIST / "supplementary-anonymous.zip"
    n = 0
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in tracked():
            if rel in DROP or rel.startswith(DROP_PREFIX):
                continue
            p = ROOT / rel
            if rel == "README.md":
                z.writestr("sys1-eval/README.md", ANON_README); n += 1
                continue
            raw = p.read_bytes()
            try:
                text = raw.decode("utf-8") if p.suffix in TEXT_EXT else None
            except UnicodeDecodeError:
                text = None          # e.g. UTF-16 PowerShell scripts: copied as-is, still checked below
            if text is not None:
                z.writestr("sys1-eval/" + rel, scrub(text))
            else:
                z.write(p, "sys1-eval/" + rel)
            n += 1
    # verify
    leaks = []
    with zipfile.ZipFile(dst) as z:
        for name in z.namelist():
            data = z.read(name)
            for needle in (b"Jiawei", b"davidlijiawei", b"David-DL-Space"):
                if needle in data:
                    leaks.append((name, needle.decode()))
    print(f"{dst.name}: {n} files, {dst.stat().st_size / 1e6:.1f} MB, identifying strings found: {leaks or 'none'}")


def build_zenodo():
    dst = DIST / f"zenodo-sys1-eval-v{VERSION}.zip"
    subprocess.run(["git", "archive", "--format=zip", f"--prefix=sys1-eval-v{VERSION}/", "-o", str(dst), "HEAD"], cwd=ROOT, check=True)
    print(f"{dst.name}: {dst.stat().st_size / 1e6:.1f} MB (git archive of HEAD)")


if __name__ == "__main__":
    DIST.mkdir(parents=True, exist_ok=True)
    build_anonymous()
    build_zenodo()
