"""Generate, compile and package every venue version of the paper from paper/src/.

Usage (from sys1-eval/):  ../.venv/bin/python paper/build_venues.py
Output: paper/build/<venue>/ (self-contained LaTeX projects) and paper/dist/ (PDFs + upload packages)
Requires: tectonic (https://tectonic-typesetting.github.io). Figures come from paper/figures/ (run paper/analysis.py first).
"""
import pathlib, re, shutil, subprocess, tarfile, zipfile, sys

P = pathlib.Path(__file__).resolve().parent
SRC, FIG, BUILD, DIST = P / "src", P / "figures", P / "build", P / "dist"
TEX = P / "tex"
AUTHOR = "Jiawei Li"
EMAIL = "davidlijiawei@gmail.com"
GITHUB = "https://github.com/David-DL-Space/sys1-eval"
ANON_CODE = "the anonymized supplementary material"

rd = lambda n: (SRC / n).read_text().strip()
TITLE, ABSTRACT, BODY, LIM, ETH, APP, ACK, MACROS = (rd(n) for n in
    ["title.tex", "abstract.tex", "body.tex", "limitations.tex", "ethics.tex", "appendix.tex", "ack.tex", "macros.tex"])
ACL_TITLE = TITLE.replace(": ", ":\\\\ ", 1) if len(TITLE) > 80 else TITLE

KEYWORDS = "LLM agents, decision models, evaluation methodology, prompt injection, tool selection, retrieval-augmented generation, calibration"
CCS = r"""\begin{CCSXML}
<ccs2012>
<concept><concept_id>10010147.10010178.10010179</concept_id><concept_desc>Computing methodologies~Natural language processing</concept_desc><concept_significance>500</concept_significance></concept>
<concept><concept_id>10010147.10010178.10010219.10010221</concept_id><concept_desc>Computing methodologies~Intelligent agents</concept_desc><concept_significance>300</concept_significance></concept>
<concept><concept_id>10002944.10011123.10011130</concept_id><concept_desc>General and reference~Evaluation</concept_desc><concept_significance>500</concept_significance></concept>
</ccs2012>
\end{CCSXML}
\ccsdesc[500]{Computing methodologies~Natural language processing}
\ccsdesc[300]{Computing methodologies~Intelligent agents}
\ccsdesc[500]{General and reference~Evaluation}"""


def acl(mode, named):
    author = AUTHOR if named else "Anonymous submission"
    code = f"\\url{{{GITHUB}}}" if named else ANON_CODE
    return rf"""\documentclass[11pt]{{article}}
\usepackage[{mode}]{{acl}}
\usepackage{{times}}
\usepackage{{latexsym}}
\usepackage[T1]{{fontenc}}
\usepackage[utf8]{{inputenc}}
\usepackage{{microtype}}
\usepackage{{inconsolata}}
\usepackage{{graphicx}}
\usepackage{{booktabs}}
\usepackage{{amsmath}}
\usepackage{{amssymb}}
\usepackage{{multirow}}
\usepackage{{xcolor}}
\usepackage{{enumitem}}
\setlist{{nosep,leftmargin=*}}
\graphicspath{{{{figures/}}}}
{MACROS}
\newcommand{{\codeurl}}{{{code}}}

\title{{{ACL_TITLE}}}
\author{{{author}}}

\begin{{document}}
\maketitle
\begin{{abstract}}
{ABSTRACT}
\end{{abstract}}

{BODY}

\section*{{Limitations}}
{LIM}

\section*{{Ethics Statement}}
{ETH}

\section*{{Acknowledgments}}
{ACK}

\bibliography{{refs}}

\appendix
{APP}

\end{{document}}
"""


def acm(cls_opts, named, venue_block, fig_single="\\columnwidth", extra=""):
    if named:
        author = rf"""\author{{{AUTHOR}}}
\email{{{EMAIL}}}"""
        code = f"\\url{{{GITHUB}}}"
    else:
        author = r"""\author{Anonymous Author(s)}
\affiliation{\country{}}"""
        code = ANON_CODE
    return rf"""\documentclass[{cls_opts}]{{acmart}}
\usepackage{{booktabs}}
\usepackage{{multirow}}
\usepackage{{enumitem}}
\setlist{{nosep,leftmargin=*}}
\graphicspath{{{{figures/}}}}
\newcommand{{\figw}}{{{fig_single}}}
\newcommand{{\figwide}}{{\textwidth}}
\setlength{{\emergencystretch}}{{3em}}
{MACROS}
\newcommand{{\codeurl}}{{{code}}}
{venue_block}
{extra}
\begin{{document}}
\title{{{TITLE}}}
{author}

\begin{{abstract}}
{ABSTRACT}
\end{{abstract}}

{CCS}
\keywords{{{KEYWORDS}}}

\maketitle

{BODY}

\section*{{Limitations}}
{LIM}

\section*{{Ethics Statement}}
{ETH}

\begin{{acks}}
{ACK}
\end{{acks}}

\bibliographystyle{{ACM-Reference-Format}}
\bibliography{{refs}}

\appendix
{APP}

\end{{document}}
"""


def tmlr(mode_opt, named):
    """TMLR: single column; anonymous unless [preprint]/[accepted]. No acknowledgments in the anonymous version."""
    author = rf"\author{{\name {AUTHOR} \email {EMAIL}}}" if named else r"\author{\name Anonymous authors}"
    code = f"\\url{{{GITHUB}}}" if named else ANON_CODE
    ack = ("\n\\subsubsection*{Acknowledgments}\n" + ACK + "\n") if named else ""
    opt = f"[{mode_opt}]" if mode_opt else ""
    return rf"""\documentclass[10pt]{{article}}
\usepackage{opt}{{tmlr}}
\usepackage{{hyperref}}
\usepackage{{url}}
\usepackage{{graphicx}}
\usepackage{{booktabs}}
\usepackage{{amsmath}}
\usepackage{{amssymb}}
\usepackage{{multirow}}
\usepackage{{xcolor}}
\usepackage{{enumitem}}
\setlist{{nosep,leftmargin=*}}
\hypersetup{{colorlinks=true,allcolors=blue!50!black}}
\graphicspath{{{{figures/}}}}
\newcommand{{\figw}}{{0.72\textwidth}}
\newcommand{{\figwide}}{{\textwidth}}
{MACROS}
\newcommand{{\codeurl}}{{{code}}}
\def\month{{MM}}
\def\year{{YYYY}}
\def\openreview{{\url{{https://openreview.net/forum?id=XXXX}}}}

\title{{{ACL_TITLE}}}
{author}

\begin{{document}}
\maketitle
\begin{{abstract}}
{ABSTRACT}
\end{{abstract}}

{BODY}

\section*{{Limitations}}
{LIM}

\section*{{Broader Impact Statement}}
{ETH}
{ack}
\bibliography{{refs}}
\bibliographystyle{{tmlr}}

\appendix
{APP}

\end{{document}}
"""


REVIEW_META = r"""\setcopyright{none}
\settopmatter{printacmref=false}
\renewcommand\footnotetextcopyrightpermission[1]{}"""

VENUES = {
    # name: (tex, style files, description)
    "acl-preprint": (acl("preprint", True), ["acl.sty", "acl_natbib.bst"], "ACL style, named, page numbers - arXiv / personal page"),
    "acl-final": (acl("final", True), ["acl.sty", "acl_natbib.bst"], "ACL camera-ready style (after acceptance)"),
    "arr-review": (acl("review", False), ["acl.sty", "acl_natbib.bst"], "ARR / OpenReview anonymous review version (line numbers)"),
    "www2027-review": (acm("sigconf,anonymous,review", False,
        REVIEW_META + "\n\\acmConference[WWW '27]{The ACM Web Conference 2027}{May 10--14, 2027}{Dublin, Ireland}"), [],
        "The Web Conference 2027, research track, double-blind (8 pages + refs/appendix, max 12 pages)"),
    "kdd2027-db": (acm("sigconf,review", True,
        REVIEW_META + "\n\\acmConference[KDD '27]{Proceedings of the 33rd ACM SIGKDD Conference on Knowledge Discovery and Data Mining}{2027}{TBA}"), [],
        "KDD 2027 Datasets & Benchmarks track, single-blind (named)"),
    "tmlr-review": (tmlr("", False), ["tmlr.sty", "tmlr.bst", "fancyhdr.sty"],
        "TMLR anonymous submission via OpenReview (no page limit; single column)"),
    "tmlr-preprint": (tmlr("preprint", True), ["tmlr.sty", "tmlr.bst", "fancyhdr.sty"],
        "TMLR style, named, no TMLR mentions (optional preprint)"),
    "tist": (acm("manuscript,screen,review", True,
        REVIEW_META + "\n\\acmJournal{TIST}", fig_single="0.72\\textwidth"), [],
        "ACM TIST journal manuscript (single column, max 25 pages incl. references)"),
}


def run(cmd, cwd):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def build(name, tex, styles):
    d = BUILD / name
    if d.exists():
        shutil.rmtree(d)
    (d / "figures").mkdir(parents=True)
    (d / "main.tex").write_text(tex)
    shutil.copy(SRC / "refs.bib", d / "refs.bib")
    for f in FIG.glob("fig_*.pdf"):
        shutil.copy(f, d / "figures" / f.name)
    for s in styles:
        shutil.copy(TEX / s, d / s)
    r = run(["tectonic", "-X", "compile", "--keep-intermediates", "main.tex"], d)
    log = r.stdout + r.stderr
    errs = [l for l in log.splitlines() if l.startswith("error")]
    over = [l for l in log.splitlines() if "Overfull" in l]
    pages = None
    if (d / "main.pdf").exists():
        info = run(["pdfinfo", "main.pdf"], d).stdout
        m = re.search(r"Pages:\s+(\d+)", info)
        pages = int(m.group(1)) if m else None
    # keep only what an upload needs
    for junk in d.glob("main.*"):
        if junk.suffix not in (".tex", ".pdf", ".bbl"):
            junk.unlink()
    return errs, over, pages


def zipdir(src, dst, arc_root=""):
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(src.rglob("*")):
            if f.is_file():
                z.write(f, pathlib.Path(arc_root) / f.relative_to(src))


if __name__ == "__main__":
    DIST.mkdir(exist_ok=True)
    only = set(sys.argv[1:])
    for name, (tex, styles, desc) in VENUES.items():
        if only and name not in only:
            continue
        errs, over, pages = build(name, tex, styles)
        status = "OK" if not errs else "ERROR"
        print(f"{name:16s} {status:5s} pages={pages} overfull={len(over)}  {desc}")
        for e in errs[:3] + over[:3]:
            print("    ", e[:160])
        if errs:
            continue
        d = BUILD / name
        shutil.copy(d / "main.pdf", DIST / f"{name}.pdf")
        # Overleaf / upload-ready source bundle (includes .bbl so no BibTeX run is needed)
        zipdir(d, DIST / f"{name}-source.zip")
    # arXiv: gzipped tar of the ACL preprint project (main.tex + main.bbl + style + figures)
    d = BUILD / "acl-preprint"
    if (d / "main.bbl").exists():
        with tarfile.open(DIST / "arxiv-source.tar.gz", "w:gz") as t:
            for f in sorted(d.rglob("*")):
                if f.is_file() and f.name != "main.pdf":
                    t.add(f, arcname=str(f.relative_to(d)))
        print("arxiv-source.tar.gz written")
