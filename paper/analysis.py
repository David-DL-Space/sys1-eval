"""Single source of truth for every number and figure in the paper.

Recomputes everything from raw result files with the corrected definitions:
  * gate accuracy vs end-to-end retention are reported separately
  * thresholds are selected on one half and evaluated on the other (repeated 2-fold)
  * two-tier cost includes the pre-screen
Run:  ../.venv/bin/python paper/analysis.py      (from sys1-eval/)
Writes paper/numbers.json and paper/figures/*.pdf
"""
import json, math, random, collections, pathlib, statistics as st

ROOT = pathlib.Path(__file__).resolve().parent.parent
R, B, P = ROOT / "results", ROOT / "bench", ROOT / "paper"
FIG = P / "figures"
FIG.mkdir(parents=True, exist_ok=True)
NUM = {}


def jl(p):
    with open(p, encoding="utf-8-sig") as fh:
        return [json.loads(l) for l in fh if l.strip()]


def idx(rows):
    return {r["id"]: r for r in rows}


# ----------------------------------------------------------------------------- scoring primitives
def score(case, row):
    """-> dict(correct, p_true_class, p_pos, conf) or None if unusable."""
    if row is None or not row.get("ok") or not row.get("answers"):
        return None
    k = list(case["gold"])[0]
    g = case["gold"][k]
    a = row["answers"].get(k)
    if a is None:
        return None
    if a["type"] == "choice":
        pr = a.get("probabilities") or {}
        conf = max(pr.values()) if pr else a.get("confidence")
        return {"correct": a["choice"] == g, "conf": conf, "choice": a["choice"], "p_pos": None, "gold": g}
    p = a["noul"]
    return {"correct": (p >= 0.5) == bool(g), "conf": max(p, 1 - p), "p_pos": p, "gold": bool(g), "choice": None}


def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"),) * 2
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - m) / d, (c + m) / d)


def mcnemar_p(b, c):
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def paired(cases, ra, rb):
    """accuracy of a and b on the cases both answered, discordant counts, diff CI, McNemar p."""
    A, Bv = [], []
    for c in cases:
        sa, sb = score(c, ra.get(c["id"])), score(c, rb.get(c["id"]))
        if sa is None or sb is None:
            continue
        A.append(sa["correct"]); Bv.append(sb["correct"])
    n = len(A)
    only_a = sum(1 for x, y in zip(A, Bv) if x and not y)
    only_b = sum(1 for x, y in zip(A, Bv) if y and not x)
    d = (only_b - only_a) / n
    se = math.sqrt(max(0.0, (only_a + only_b) - (only_b - only_a) ** 2 / n)) / n
    ka, kb = sum(A), sum(Bv)
    return {"n": n, "acc_a": ka / n, "acc_b": kb / n, "ci_a": wilson(ka, n), "ci_b": wilson(kb, n),
            "only_a": only_a, "only_b": only_b, "diff": d, "diff_ci": (d - 1.96 * se, d + 1.96 * se),
            "p": mcnemar_p(only_a, only_b)}


def auc(pos, neg):
    if not pos or not neg:
        return float("nan")
    # rank-based AUROC (ties count 1/2)
    allv = sorted([(v, 1) for v in pos] + [(v, 0) for v in neg])
    ranks, i = {}, 0
    rsum = 0.0
    while i < len(allv):
        j = i
        while j < len(allv) and allv[j][0] == allv[i][0]:
            j += 1
        r = (i + j + 1) / 2
        rsum += r * sum(1 for t in allv[i:j] if t[1] == 1)
        i = j
    return (rsum - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def ece(pairs, bins=10):
    pairs = [(c, ok) for c, ok in pairs if c is not None]
    e = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        inb = [(c, ok) for c, ok in pairs if (lo <= c < hi) or (b == bins - 1 and c == 1.0)]
        if inb:
            e += len(inb) / len(pairs) * abs(sum(ok for _, ok in inb) / len(inb) - sum(c for c, _ in inb) / len(inb))
    return e


def rates(cases, rr, thr=0.5):
    tp = fn = fp = tn = 0
    for c in cases:
        s = score(c, rr.get(c["id"]))
        if s is None:
            continue
        pred = s["p_pos"] >= thr
        if s["gold"]:
            tp += pred; fn += not pred
        else:
            fp += pred; tn += not pred
    return {"tpr": tp / max(1, tp + fn), "fnr": fn / max(1, tp + fn), "fpr": fp / max(1, fp + tn),
            "n_pos": tp + fn, "n_neg": fp + tn}


# ----------------------------------------------------------------------------- load
cases_large = jl(B / "cases-large.jsonl")
rag = jl(B / "rag-cases.jsonl")
ai = jl(B / "agentinfra-cases.jsonl")
v2 = jl(B / "v2-cases.jsonl")
LA, JA = idx(jl(R / "laya-all.jsonl")), idx(jl(R / "jev-all.jsonl"))
LI, JI = idx(jl(R / "laya-agentinfra.jsonl")), idx(jl(R / "jev-agentinfra.jsonl"))
L2, J2 = idx(jl(R / "mac" / "laya-v2.jsonl")), idx(jl(R / "mac" / "jev-v2.jsonl"))
D2 = idx(jl(R / "mac" / "ds-v2.jsonl")) if (R / "mac" / "ds-v2.jsonl").exists() else {}

TRACK_NAMES = {
    "A_model_router": "A  Model routing", "B_tool_selection": "B  Tool selection", "C_tool_guardrail": "C  Tool-call guardrail",
    "D_rag_gate": "D  RAG relevance gate", "E_injection_guard": "E  Injection guard", "F_cardinality_multilingual": "F  Large label set",
    "G_direct_injection": "G  Injection (user turn)", "G_indirect_injection": "G  Injection (tool output)",
    "H_groundedness": "H  Groundedness", "I_execution_safety": "I  Pre-execution safety", "J_pii_egress": "J  PII egress",
}

# ----------------------------------------------------------------------------- 1. main paired comparison
main = {}
bytrack = collections.defaultdict(list)
for c in cases_large:
    bytrack[c["track"]].append(c)
for c in ai:
    bytrack[c["track"]].append(c)
for t, cs in bytrack.items():
    la, ja = (LA, JA) if t[0] in "ABCDEF" else (LI, JI)
    main[t] = paired(cs, la, ja)
main["ALL_2100"] = paired(cases_large, LA, JA)
main["ALL_AI_1280"] = paired(ai, LI, JI)
main["D_rag_1920"] = paired(rag, LA, JA)
NUM["main"] = main

# AUROC / ECE / FNR-FPR per noul track, ECE for all
calib = {}
for t, cs in bytrack.items():
    la, ja = (LA, JA) if t[0] in "ABCDEF" else (LI, JI)
    out = {}
    for name, rr in (("laya", la), ("jev", ja)):
        ss = [(c, score(c, rr.get(c["id"]))) for c in cs]
        ss = [(c, s) for c, s in ss if s]
        d = {"ece": ece([(s["conf"], s["correct"]) for _, s in ss])}
        if ss and ss[0][1]["p_pos"] is not None:
            d["auc"] = auc([s["p_pos"] for _, s in ss if s["gold"]], [s["p_pos"] for _, s in ss if not s["gold"]])
            d.update(rates(cs, rr))
        hi = [s for _, s in ss if s["conf"] >= 0.9]
        d["cov90"] = len(hi) / len(ss)
        d["err_at90"] = 1 - sum(s["correct"] for s in hi) / max(1, len(hi))
        out[name] = d
    calib[t] = out
NUM["calib"] = calib

# pooled reliability data for the figure
def reliability(cases, rr, bins=10):
    pts = [(s["conf"], s["correct"]) for c in cases for s in [score(c, rr.get(c["id"]))] if s]
    out = []
    for b in range(bins):
        inb = [(cf, ok) for cf, ok in pts if b / bins <= cf < (b + 1) / bins or (b == bins - 1 and cf == 1)]
        if len(inb) >= 10:
            out.append((sum(cf for cf, _ in inb) / len(inb), sum(ok for _, ok in inb) / len(inb), len(inb)))
    return out, ece(pts)


# ----------------------------------------------------------------------------- 2. capacity: K sweep random vs hard
def by_k(cases, rr):
    g = collections.defaultdict(list)
    for c in cases:
        s = score(c, rr.get(c["id"]))
        if s:
            g[c["option_count"]].append(s["correct"])
    return {k: (sum(v) / len(v), len(v)) for k, v in sorted(g.items())}


Bcases = [c for c in v2 if c["track"] == "B_tool_selection"]
B2cases = [c for c in v2 if c["track"] == "B2_tool_selection_hard"]
audit = idx(jl(R / "mac" / "ds-audit-tools.jsonl")) if (R / "mac" / "ds-audit-tools.jsonl").exists() else {}


def unique_ok(c):
    a = audit.get(c["id"])
    return a is not None and a.get("ok") and a["valid"] == [c["gold"]["tool"]]


cap = {
    "random_day1": {"laya": by_k(Bcases, LA), "jev": by_k(Bcases, JA)},
    "random": {"laya": by_k(Bcases, L2), "jev": by_k(Bcases, J2)},
    "hard": {"laya": by_k(B2cases, L2), "jev": by_k(B2cases, J2)},
    "hard_unique": {"laya": by_k([c for c in B2cases if unique_ok(c)], L2), "jev": by_k([c for c in B2cases if unique_ok(c)], J2)},
    "random_unique": {"laya": by_k([c for c in Bcases if unique_ok(c)], L2), "jev": by_k([c for c in Bcases if unique_ok(c)], J2)},
    "overall": {
        "random": paired(Bcases, L2, J2), "hard": paired(B2cases, L2, J2),
        "hard_unique": paired([c for c in B2cases if unique_ok(c)], L2, J2),
        "random_unique": paired([c for c in Bcases if unique_ok(c)], L2, J2),
    },
}
if audit:
    for name, cs in (("random", Bcases), ("hard", B2cases)):
        au = [audit[c["id"]] for c in cs if c["id"] in audit and audit[c["id"]].get("ok")]
        cap["audit_" + name] = {
            "n": len(au),
            "unique_gold": sum(1 for a, c in zip(au, cs) if a["valid"] == [a["gold"]]) / max(1, len(au)),
            "gold_in_valid": sum(1 for a in au if a["gold"] in a["valid"]) / max(1, len(au)),
            "multi_valid": sum(1 for a in au if len(a["valid"]) > 1) / max(1, len(au)),
        }
    if D2:
        cap["deepseek"] = {"random": by_k(Bcases, D2), "hard": by_k(B2cases, D2),
                           "overall_random": sum(score(c, D2.get(c["id"]))["correct"] for c in Bcases if score(c, D2.get(c["id"]))) / max(1, sum(1 for c in Bcases if score(c, D2.get(c["id"])))),
                           "overall_hard": sum(score(c, D2.get(c["id"]))["correct"] for c in B2cases if score(c, D2.get(c["id"]))) / max(1, sum(1 for c in B2cases if score(c, D2.get(c["id"]))))}
NUM["capacity"] = cap

# multilingual
ml = {}
for c in cases_large:
    if c["track"] != "F_cardinality_multilingual":
        continue
    key = c["dataset"].split("/")[-1] if "MASSIVE" in c["dataset"] else "BANKING77"
    for name, rr in (("laya", LA), ("jev", JA)):
        s = score(c, rr.get(c["id"]))
        ml.setdefault(key, {}).setdefault(name, []).append(s["correct"])
NUM["multilingual"] = {k: {m: (sum(v) / len(v), len(v)) for m, v in d.items()} for k, d in ml.items()}

# ----------------------------------------------------------------------------- 3. robustness
flip_cases = idx(jl(B / "cases-large-flip.jsonl"))
LF, JF = idx(jl(R / "laya-large-flip.jsonl")), idx(jl(R / "jev-large-flip.jsonl"))
flip = {}
for name, orig, fl in (("laya", LA, LF), ("jev", JA, JF)):
    g = collections.defaultdict(lambda: [0, 0])
    for i, c in flip_cases.items():
        k = list(c["gold"])[0]
        a, b = orig.get(i), fl.get(i)
        if not (a and b and a["ok"] and b["ok"]):
            continue
        ch = a["answers"][k]["choice"] != b["answers"][k]["choice"]
        g[c["track"]][0] += ch; g[c["track"]][1] += 1
        g["ALL"][0] += ch; g["ALL"][1] += 1
    flip[name] = {t: (v[0] / v[1], v[1]) for t, v in g.items()}
NUM["order_flip"] = flip

# repeat & paraphrase
rep = {}
for name, base, f in (("laya", LA, "laya-repeat.jsonl"), ("jev", JA, "jev-repeat.jsonl")):
    rr = idx(jl(R / f))
    ch = n = 0
    for i, r in rr.items():
        if i in base and r["ok"] and base[i]["ok"]:
            k = list(r["answers"])[0]
            a, b = base[i]["answers"][k], r["answers"][k]
            n += 1
            ch += (a.get("choice") != b.get("choice")) if a["type"] == "choice" else ((a["noul"] >= .5) != (b["noul"] >= .5))
    rep[name] = (ch, n)
NUM["repeat"] = rep

# day-2 / cross-hardware reproducibility
def flips(base, new, ids):
    ch = n = 0
    for i in ids:
        a, b = base.get(i), new.get(i)
        if not (a and b and a["ok"] and b["ok"]):
            continue
        k = list(b["answers"])[0]
        x, y = a["answers"][k], b["answers"][k]
        n += 1
        ch += (x["choice"] != y["choice"]) if x["type"] == "choice" else ((x["noul"] >= .5) != (y["noul"] >= .5))
    return ch, n


orig_ids = [c["id"] for c in v2 if c["track"] in ("B_tool_selection", "G_direct_injection", "G_indirect_injection", "J_pii_egress")]
NUM["reproducibility"] = {
    "jev_day2": flips({**JA, **JI}, J2, orig_ids),
    "laya_mac_vs_win_v2": flips({**LA, **LI}, L2, orig_ids),
    "laya_mac_vs_win_pilot": flips(idx(jl(R / "laya.jsonl")), idx(jl(R / "mac" / "laya-pilot-cpu.jsonl")), [c["id"] for c in jl(B / "cases.jsonl")]),
}

# wording x seed
sens = {}
for seed in (42, 99):
    for w in (1, 2, 3, 4):
        cs = jl(B / f"sens-s{seed}-w{w}.jsonl")
        for name in ("laya", "jev"):
            rr = idx(jl(R / f"sens-{name}-s{seed}-w{w}.jsonl"))
            g = collections.defaultdict(list)
            for c in cs:
                s = score(c, rr.get(c["id"]))
                if s:
                    g[c["track"]].append(s["correct"])
            for t, v in g.items():
                sens.setdefault(t, {}).setdefault(name, []).append(sum(v) / len(v))
NUM["sensitivity"] = {t: {m: {"min": min(v), "max": max(v), "mean": sum(v) / len(v), "n": len(v)} for m, v in d.items()} for t, d in sens.items()}
lead = {}
for t, d in sens.items():
    diffs = [j - l for l, j in zip(d["laya"], d["jev"])]
    lead[t] = {"jev_leads": sum(x > 0 for x in diffs), "of": len(diffs), "min": min(diffs), "max": max(diffs)}
NUM["sensitivity_lead"] = lead

# ----------------------------------------------------------------------------- 4. channel effect 2x2
def chan(cases, rr):
    atk = [score(c, rr.get(c["id"])) for c in cases if c["gold"]["attack"]]
    ben = [score(c, rr.get(c["id"])) for c in cases if not c["gold"]["attack"]]
    atk, ben = [s for s in atk if s], [s for s in ben if s]
    return {"tpr": sum(s["p_pos"] >= .5 for s in atk) / len(atk), "fpr": sum(s["p_pos"] >= .5 for s in ben) / len(ben),
            "p_benign": sum(s["p_pos"] for s in ben) / len(ben), "p_attack": sum(s["p_pos"] for s in atk) / len(atk),
            "auc": auc([s["p_pos"] for s in atk], [s["p_pos"] for s in ben]), "n_atk": len(atk), "n_ben": len(ben),
            "acc": (sum(s["p_pos"] >= .5 for s in atk) + sum(s["p_pos"] < .5 for s in ben)) / (len(atk) + len(ben))}


def fpr_pair(cu, ct, rr):
    """paired benign FPR change user->tool on the same content: McNemar over benign pairs."""
    tu = {c["source_id"].replace("chB", "").replace("doc", ""): c for c in cu if not c["gold"]["attack"]}
    tt = {c["source_id"].replace("chA", "").replace("doc", ""): c for c in ct if not c["gold"]["attack"]}
    b = c_ = n = 0
    for k in tu.keys() & tt.keys():
        su, stt = score(tu[k], rr.get(tu[k]["id"])), score(tt[k], rr.get(tt[k]["id"]))
        if not (su and stt):
            continue
        n += 1
        fu, ft = su["p_pos"] >= .5, stt["p_pos"] >= .5
        b += fu and not ft; c_ += ft and not fu
    return {"n": n, "only_user_fp": b, "only_tool_fp": c_, "p": mcnemar_p(b, c_)}


short_u = [c for c in v2 if c["track"] == "G_direct_injection"]
short_t = [c for c in v2 if c["track"] == "G_indirect_injection"]
doc_u = [c for c in v2 if c["track"] == "G2_doc_user_turn"]
doc_t = [c for c in v2 if c["track"] == "G2_doc_tool_output"]
channel = {}
for name, rr in (("laya", L2), ("jev", J2)) + ((("deepseek", D2),) if D2 else ()):
    channel[name] = {
        "short_user": chan(short_u, rr), "short_tool": chan(short_t, rr),
        "doc_user": chan(doc_u, rr), "doc_tool": chan(doc_t, rr),
        "pair_short": fpr_pair(short_u, short_t, rr), "pair_doc": fpr_pair(doc_u, doc_t, rr),
    }
NUM["channel"] = channel
# day-1 numbers for the transplanted design (as originally reported)
NUM["channel_day1"] = {n: {"short_user": chan([c for c in ai if c["track"] == "G_direct_injection"], rr),
                           "short_tool": chan([c for c in ai if c["track"] == "G_indirect_injection"], rr)}
                       for n, rr in (("laya", LI), ("jev", JI))}

# ----------------------------------------------------------------------------- 5. PII with natural negatives
Jpos = [c for c in v2 if c["track"] == "J_pii_egress" and c["gold"]["has_pii"]]
Jph = [c for c in v2 if c["track"] == "J_pii_egress" and not c["gold"]["has_pii"]]
Jnat = [c for c in v2 if c["track"] == "J2_pii_natural_negative"]
pii = {}
for name, rr in (("laya", L2), ("jev", J2)) + ((("deepseek", D2),) if D2 else ()):
    pp = [score(c, rr.get(c["id"]))["p_pos"] for c in Jpos if score(c, rr.get(c["id"]))]
    ph = [score(c, rr.get(c["id"]))["p_pos"] for c in Jph if score(c, rr.get(c["id"]))]
    pn = [score(c, rr.get(c["id"]))["p_pos"] for c in Jnat if score(c, rr.get(c["id"]))]
    pii[name] = {"tpr": sum(p >= .5 for p in pp) / len(pp),
                 "fpr_placeholder": sum(p >= .5 for p in ph) / len(ph), "fpr_natural": sum(p >= .5 for p in pn) / len(pn),
                 "auc_placeholder": auc(pp, ph), "auc_natural": auc(pp, pn),
                 "mean_p_placeholder": sum(ph) / len(ph), "mean_p_natural": sum(pn) / len(pn), "n": (len(pp), len(ph), len(pn))}
NUM["pii"] = pii

# ----------------------------------------------------------------------------- 6. gates: in-sample vs held-out thresholds
def gate_rows(cases, rr, invert=False):
    out = []
    for c in cases:
        s = score(c, rr.get(c["id"]))
        if s:
            p = 1 - s["p_pos"] if invert else s["p_pos"]
            out.append((p, (not s["gold"]) if invert else s["gold"]))
    return out


def pick(rows, target):
    """largest threshold (fewest expensive calls) whose in-sample FNR <= target."""
    pos = sorted(p for p, g in rows if g)
    if not pos:
        return 0.0
    k = int(math.floor(target * len(pos)))          # may miss at most k positives
    return pos[k] if k < len(pos) else pos[-1]


def evaluate(rows, t):
    pos = [p for p, g in rows if g]
    fnr = sum(p < t for p in pos) / len(pos)
    call = sum(p >= t for p, _ in rows) / len(rows)
    return fnr, call


def cv_gate(rows, target=0.05, reps=500, seed=0):
    rng = random.Random(seed)
    fn, calls = [], []
    for _ in range(reps):
        r = rows[:]
        rng.shuffle(r)
        a, b = r[: len(r) // 2], r[len(r) // 2:]
        t = pick(a, target)
        f, cl = evaluate(b, t)
        fn.append(f); calls.append(cl)
    q = lambda v, x: sorted(v)[int(x * (len(v) - 1))]
    t_in = pick(rows, target)
    f_in, c_in = evaluate(rows, t_in)
    npos = sum(1 for _, g in rows if g)
    return {"in_sample": {"thr": t_in, "fnr": f_in, "call": c_in},
            "heldout": {"fnr_med": q(fn, .5), "fnr_p05": q(fn, .05), "fnr_p95": q(fn, .95), "p_exceed": sum(f > target for f in fn) / len(fn),
                        "call_med": q(calls, .5)},
            "n": len(rows), "n_pos": npos, "pos_share": npos / len(rows), "fnr_samples": fn}


gates = {}
for name, rr in (("laya", LA), ("jev", JA)):
    rows = gate_rows(rag, rr)
    g = cv_gate(rows)
    f, cl = g["in_sample"]["fnr"], g["in_sample"]["call"]
    pos_share = g["pos_share"]
    gpos = [p for p, gg in rows if gg]
    gneg = [p for p, gg in rows if not gg]
    t = g["in_sample"]["thr"]
    g["gate_accuracy"] = (sum(p >= t for p in gpos) + sum(p < t for p in gneg)) / len(rows)
    g["e2e_retained"] = 1 - f * pos_share
    g["max_saving"] = 1 - pos_share
    gates.setdefault("rag_single", {})[name] = g
for tr, inv in (("G_indirect_injection", False), ("H_groundedness", True), ("I_execution_safety", False), ("J_pii_egress", False)):
    for name, rr in (("laya", LI), ("jev", JI)):
        gates.setdefault(tr, {})[name] = cv_gate(gate_rows([c for c in ai if c["track"] == tr], rr, invert=inv))
NUM["gates"] = {k: {m: {kk: vv for kk, vv in v.items() if kk != "fnr_samples"} for m, v in d.items()} for k, d in gates.items()}

# RAG curve for figure (in-sample)
def curve(rows):
    pos = [p for p, g in rows if g]
    pts = []
    for t in [i / 200 for i in range(0, 201)]:
        pts.append((sum(p < t for p in pos) / len(pos), sum(p >= t for p, _ in rows) / len(rows)))
    return pts


# ----------------------------------------------------------------------------- 7. two-tier safety (corrected cost)
sc = idx(jl(B / "safety-cases.jsonl"))
gold = {r["id"]: bool(r["label"]) for r in jl(R / "safety-gold.jsonl") if r["ok"]}
t2 = {r["id"]: r for r in jl(R / "safety-tier2.jsonl") if r["ok"]}
t1 = {"laya": idx(jl(R / "laya-safety.jsonl")), "jev": idx(jl(R / "jev-safety.jsonl"))}
ids = [i for i in gold if i in t2 and all(i in m and m[i]["ok"] for m in t1.values())]
PR = {"in": 0.112e-6, "out": 0.336e-6, "jev": 0.042e-6}
t2cost = {i: t2[i].get("in_share", 0) * PR["in"] + t2[i].get("out_share", 0) * PR["out"] for i in ids}
jcost = {i: (t1["jev"][i]["usage"]["input_tokens"] + t1["jev"][i]["usage"]["output_tokens"]) * PR["jev"] for i in ids}


def two_tier(model, thr, sub, with_t1_cost=True):
    fn = fp = calls = 0
    cost = 0.0
    pos = [i for i in sub if gold[i]]
    neg = [i for i in sub if not gold[i]]
    for i in sub:
        if model == "llm_only":
            flag = True
        else:
            flag = t1[model][i]["answers"]["unsafe"]["noul"] >= thr
            if model == "jev" and with_t1_cost:
                cost += jcost[i]
        dec = False
        if flag:
            calls += 1; cost += t2cost[i]; dec = bool(t2[i]["label"])
        fn += gold[i] and not dec
        fp += (not gold[i]) and dec
    return {"call": calls / len(sub), "fnr": fn / len(pos), "fpr": fp / len(neg), "fn": fn, "cost_per_1m": cost / len(sub) * 1e6}


two = {"n": len(ids), "pos": sum(gold[i] for i in ids), "llm_only": two_tier("llm_only", 0, ids), "sweep": {}}
for m in ("laya", "jev"):
    for thr in (0.02, 0.05, 0.1, 0.2, 0.3, 0.5):
        two["sweep"][f"{m}@{thr}"] = {"corrected": two_tier(m, thr, ids), "as_reported": two_tier(m, thr, ids, with_t1_cost=False)}
# label agreement (fixed)
two["agree_gold_dataset"] = sum(gold[i] == bool(sc[i]["gold"]["unsafe"]) for i in ids) / len(ids)
two["agree_tier2_gold"] = sum(bool(t2[i]["label"]) == gold[i] for i in ids) / len(ids)
two["agree_tier2_dataset"] = sum(bool(t2[i]["label"]) == bool(sc[i]["gold"]["unsafe"]) for i in ids) / len(ids)
# held-out: choose the largest thr on one half s.t. two-tier FNR <= LLM-only FNR on that half; evaluate extra misses on the other half
rng = random.Random(1)
extra, calls_h = [], []
grid = [i / 100 for i in range(1, 60)]
for _ in range(500):
    s = ids[:]
    rng.shuffle(s)
    a, b = s[: len(s) // 2], s[len(s) // 2:]
    base_a = two_tier("llm_only", 0, a)["fn"]
    ok = [t for t in grid if two_tier("jev", t, a)["fn"] <= base_a]
    t = max(ok) if ok else grid[0]
    rb = two_tier("jev", t, b)
    extra.append(rb["fn"] - two_tier("llm_only", 0, b)["fn"]); calls_h.append(rb["call"])
two["heldout"] = {"extra_misses_mean": sum(extra) / len(extra), "p_any_extra": sum(e > 0 for e in extra) / len(extra),
                  "call_med": sorted(calls_h)[len(calls_h) // 2], "half_pos": two["pos"] / 2}
two["dropped"] = {"total": 603 - len(ids)}
NUM["two_tier"] = two

# ----------------------------------------------------------------------------- 8. cascade Laya -> Jev (2100)
casc = []
for thr in (0.5, 0.7, 0.8, 0.9, 0.95, 0.99):
    ok = n = local = 0
    cost = 0.0
    for c in cases_large:
        sl, sj = score(c, LA.get(c["id"])), score(c, JA.get(c["id"]))
        if not (sl and sj):
            continue
        n += 1
        if sl["conf"] >= thr:
            local += 1; ok += sl["correct"]
        else:
            ok += sj["correct"]; u = JA[c["id"]]["usage"]; cost += (u["input_tokens"] + u["output_tokens"]) * 0.042e-6
    casc.append({"thr": thr, "local": local / n, "acc": ok / n, "jev_cost_per_1m": cost / n * 1e6})
jev_only_cost = sum((JA[c["id"]]["usage"]["input_tokens"] + JA[c["id"]]["usage"]["output_tokens"]) * 0.042e-6 for c in cases_large) / len(cases_large) * 1e6
NUM["cascade"] = {"rows": casc, "jev_only_cost_per_1m": jev_only_cost, "jev_only_acc": main["ALL_2100"]["acc_b"], "laya_only_acc": main["ALL_2100"]["acc_a"]}

# ----------------------------------------------------------------------------- 9. latency & cost
def lat(rr, ids=None):
    v = sorted(r["ms"] for i, r in rr.items() if r.get("ok") and (ids is None or i in ids))
    return {"p50": v[len(v) // 2], "p95": v[int(.95 * (len(v) - 1))], "n": len(v)}


v2_ids = set(c["id"] for c in v2)
NUM["latency"] = {"laya_win_cuda": lat(LA), "jev_from_win_site": lat(JA), "laya_mac_cpu": lat(L2), "jev_from_mac_site": lat(J2)}
tok = [r["usage"]["input_tokens"] + r["usage"]["output_tokens"] for r in JA.values() if r.get("usage")]
NUM["cost"] = {"jev_tokens_per_decision_mean": sum(tok) / len(tok), "jev_usd_per_1m_decisions": sum(tok) / len(tok) * 0.042}
if D2:
    dt = [(r["usage"]["prompt_tokens"], r["usage"]["completion_tokens"]) for r in D2.values() if r.get("usage")]
    NUM["cost"]["deepseek_tokens_in_mean"] = sum(a for a, _ in dt) / len(dt)
    NUM["cost"]["deepseek_tokens_out_mean"] = sum(b for _, b in dt) / len(dt)
    NUM["latency"]["deepseek_from_mac_site"] = lat(D2)

# ----------------------------------------------------------------------------- 10. label audit (LLM judge) summary
def judge_summary(f):
    rows = [r for r in jl(R / f) if r.get("judge_ok")]
    out = {}
    for kind in ("disagree", "both_wrong", "both_right"):
        rs = [r for r in rows if r["audit_kind"] == kind]
        if not rs:
            continue
        agree = 0
        for r in rs:
            jl_ = r["judge_label"]
            if r["question_kind"] == "noul":
                agree += (str(jl_).lower() == "yes") == bool(r["dataset_gold"])
            else:
                agree += jl_ == r["dataset_gold"]
        out[kind] = (agree / len(rs), len(rs))
    dis = [r for r in rows if r["audit_kind"] == "disagree"]
    side_j = side_l = 0
    for r in dis:
        judge_gold = (str(r["judge_label"]).lower() == "yes") if r["question_kind"] == "noul" else r["judge_label"]
        dg = bool(r["dataset_gold"]) if r["question_kind"] == "noul" else r["dataset_gold"]
        jev_says = dg if r["jev_correct"] else ((not dg) if r["question_kind"] == "noul" else None)
        laya_says = dg if r["laya_correct"] else ((not dg) if r["question_kind"] == "noul" else None)
        if jev_says is not None and jev_says == judge_gold:
            side_j += 1
        elif laya_says is not None and laya_says == judge_gold:
            side_l += 1
    out["sides_with_jev"] = (side_j, side_l)
    return out


NUM["judge"] = {"main": judge_summary("judge.jsonl"), "agentinfra": judge_summary("judge-agentinfra.jsonl")}

# ----------------------------------------------------------------------------- 11. routing-label anatomy
A = [c for c in cases_large if c["track"] == "A_model_router"]
mc = ("mmlu", "arc", "hellaswag", "winogrande")
NUM["routing_labels"] = {"n": len(A), "mc_share": sum(any(m in c["dataset"].lower() for m in mc) for c in A) / len(A),
                         "binary_score_share": sum(c["cheap_score"] in (0, 1) and c["strong_score"] in (0, 1) for c in A) / len(A),
                         "jev_cheap_share": sum(JA[c["id"]]["answers"]["route"]["choice"] == "cheap" for c in A) / len(A)}

# ----------------------------------------------------------------------------- write numbers
def clean(o):
    if isinstance(o, float):
        return round(o, 5)
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    return o


(P / "numbers.json").write_text(json.dumps(clean(NUM), indent=1, ensure_ascii=False))
print("wrote paper/numbers.json")

# ============================================================================= FIGURES
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

C_LAYA, C_JEV, C_DS = "#2a78d6", "#eb6834", "#1baf7a"
INK, INK2, MUTED, GRID = "#0b0b0b", "#52514e", "#898781", "#e1e0d9"
plt.rcParams.update({
    "font.family": "serif", "font.serif": ["Times New Roman", "Times", "DejaVu Serif"], "mathtext.fontset": "stix",
    "font.size": 8, "axes.titlesize": 8, "axes.labelsize": 8, "xtick.labelsize": 7, "ytick.labelsize": 7, "legend.fontsize": 7,
    "axes.edgecolor": "#c3c2b7", "axes.linewidth": 0.6, "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "xtick.major.width": 0.5, "ytick.major.width": 0.5, "xtick.major.size": 2.5, "ytick.major.size": 2.5,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.5, "axes.axisbelow": True,
    "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False, "savefig.bbox": "tight", "savefig.pad_inches": 0.02,
    "pdf.fonttype": 42,
})
COL1, COL2 = 3.1, 6.3   # ACL single / double column widths (inches)


def save(fig, name):
    fig.savefig(FIG / (name + ".pdf"))
    fig.savefig(FIG / (name + ".png"), dpi=200)
    plt.close(fig)


# --- Fig 1: dumbbell of accuracy per decision point, with paired diff annotation
order = ["B_tool_selection", "F_cardinality_multilingual", "E_injection_guard", "G_indirect_injection", "G_direct_injection",
         "H_groundedness", "C_tool_guardrail", "I_execution_safety", "J_pii_egress", "D_rag_gate", "A_model_router"]
fig, ax = plt.subplots(figsize=(COL1, 2.9))
for y, t in enumerate(reversed(order)):
    m = main[t] if t != "D_rag_gate" else main["D_rag_1920"]
    ax.plot([m["acc_a"] * 100, m["acc_b"] * 100], [y, y], color="#c3c2b7", lw=1.2, zorder=1)
    for acc, ci, col, mk in ((m["acc_a"], m["ci_a"], C_LAYA, "o"), (m["acc_b"], m["ci_b"], C_JEV, "s")):
        ax.plot([ci[0] * 100, ci[1] * 100], [y, y], color=col, lw=2.2, alpha=0.35, solid_capstyle="butt", zorder=2)
        ax.scatter([acc * 100], [y], s=22, color=col, marker=mk, zorder=3, edgecolor="white", linewidth=0.6)
    sig = "" if m["p"] < 0.001 else (f"p={m['p']:.2f}" if m["p"] >= 0.01 else f"p={m['p']:.3f}")
    d = m["diff"] * 100
    ax.text(102.5, y, f"{d:+.1f}" + (f"  ({sig})" if sig else ""), va="center", ha="left", fontsize=6.5, color=INK2)
ax.set_yticks(range(len(order)))
ax.set_yticklabels([TRACK_NAMES[t] for t in reversed(order)])
ax.set_xlim(30, 101.5)
ax.set_xlabel("Accuracy (%)  —  bars: Wilson 95% CI")
ax.grid(axis="y", visible=False)
ax.scatter([], [], color=C_LAYA, marker="o", label="Laya (open weights, local)")
ax.scatter([], [], color=C_JEV, marker="s", label="Jev (hosted API)")
ax.legend(loc="upper center", bbox_to_anchor=(0.45, 1.13), ncol=2, handletextpad=0.2, columnspacing=1.0)
ax.text(102.5, len(order) - 0.35, "Δ pp", fontsize=6.5, color=MUTED, ha="left")
save(fig, "fig_main")

# --- Fig 2: K sweep, random vs hard decoys
fig, ax = plt.subplots(figsize=(COL1, 2.0))
Ks = [2, 5, 10, 20, 50]
for cond, ls, lab in (("random", "-", "random decoys"), ("hard", "--", "nearest decoys")):
    for m, col, mk in (("laya", C_LAYA, "o"), ("jev", C_JEV, "s")):
        d = cap[cond][m]
        ax.plot(range(len(Ks)), [d[k][0] * 100 for k in Ks], ls=ls, color=col, marker=mk, ms=4, lw=1.4,
                markeredgecolor="white", markeredgewidth=0.5)
if D2:
    for cond, ls in (("random", "-"), ("hard", "--")):
        d = cap["deepseek"][cond]
        ax.plot(range(len(Ks)), [d[k][0] * 100 for k in Ks], ls=ls, color=C_DS, marker="^", ms=4, lw=1.0, alpha=0.9,
                markeredgecolor="white", markeredgewidth=0.5)
ax.set_xticks(range(len(Ks)))
ax.set_xticklabels(Ks)
ax.set_xlabel("Candidate tools $K$ (n=80 per point)")
ax.set_ylabel("Top-1 accuracy (%)")
ax.set_ylim(25, 102)
from matplotlib.lines import Line2D
h = [Line2D([], [], color=C_LAYA, marker="o", lw=1.4, ms=4, label="Laya"), Line2D([], [], color=C_JEV, marker="s", lw=1.4, ms=4, label="Jev")]
if D2:
    h.append(Line2D([], [], color=C_DS, marker="^", lw=1.0, ms=4, label="DeepSeek-V4.1-Flash (ref.)"))
h += [Line2D([], [], color=INK2, ls="-", lw=1.0, label="random decoys"), Line2D([], [], color=INK2, ls="--", lw=1.0, label="nearest decoys")]
ax.legend(handles=h, loc="upper center", bbox_to_anchor=(0.5, -0.28), ncol=3, fontsize=6.3, handlelength=1.8, columnspacing=0.8)
save(fig, "fig_ksweep")

# --- Fig 3: robustness (a) order flip (b) wording x seed range
fig, axs = plt.subplots(1, 2, figsize=(COL2, 1.75), gridspec_kw={"width_ratios": [1, 1.9]})
ax = axs[0]
tr3 = ["A_model_router", "B_tool_selection", "F_cardinality_multilingual"]
labs = ["A routing", "B tools", "F 60–77 labels"]
w = 0.36
for j, (m, col) in enumerate((("laya", C_LAYA), ("jev", C_JEV))):
    vals = [flip[m][t][0] * 100 for t in tr3]
    ax.bar([i + (j - 0.5) * w for i in range(3)], vals, width=w - 0.04, color=col, label=m.capitalize())
    for i, v in enumerate(vals):
        ax.text(i + (j - 0.5) * w, v + 1.2, f"{v:.0f}", ha="center", fontsize=6.3, color=INK2)
ax.set_xticks(range(3))
ax.set_xticklabels(labs)
ax.set_ylabel("Decisions changed (%)")
ax.set_title("(a) Reversing option order", loc="left", color=INK)
ax.set_ylim(0, 62)
ax.grid(axis="x", visible=False)
ax.legend(loc="upper left")
ax = axs[1]
tr6 = ["A_model_router", "B_tool_selection", "C_tool_guardrail", "D_rag_gate", "E_injection_guard", "F_cardinality_multilingual"]
lab6 = ["A", "B", "C", "D", "E", "F"]
for j, (m, col) in enumerate((("laya", C_LAYA), ("jev", C_JEV))):
    for i, t in enumerate(tr6):
        v = [x * 100 for x in sens[t][m]]
        x0 = i + (j - 0.5) * 0.3
        ax.plot([x0, x0], [min(v), max(v)], color=col, lw=3.2, alpha=0.45, solid_capstyle="butt")
        ax.scatter([x0] * len(v), v, s=6, color=col, zorder=3, linewidth=0)
ax.set_xticks(range(6))
ax.set_xticklabels(lab6)
ax.set_ylabel("Accuracy (%)")
ax.set_title("(b) 4 wordings × 2 samples: range per track", loc="left", color=INK)
ax.grid(axis="x", visible=False)
save(fig, "fig_robust")

# --- Fig 4: channel 2x2
fig, axs = plt.subplots(1, 2, figsize=(COL1, 1.9), sharey=True)
models = [("laya", C_LAYA, "o"), ("jev", C_JEV, "s")] + ([("deepseek", C_DS, "^")] if D2 else [])
for ax, style, title in ((axs[0], "short", "(a) Transplanted short texts"), (axs[1], "doc", "(b) Native documents")):
    for m, col, mk in models:
        u, t = channel[m][style + "_user"], channel[m][style + "_tool"]
        off = {"laya": -0.06, "jev": 0.0, "deepseek": 0.06}[m]
        ax.plot([0 + off, 1 + off], [u["fpr"] * 100, t["fpr"] * 100], color=col, marker=mk, ms=4, lw=1.3, markeredgecolor="white", markeredgewidth=0.5)
    ax.set_xticks([0, 1])
    ax.set_xticklabels(["user turn", "tool output"])
    ax.set_xlim(-0.3, 1.3)
    ax.set_title(title, loc="left", color=INK)
    ax.grid(axis="x", visible=False)
axs[0].set_ylabel("False-positive rate on benign (%)")
h = [Line2D([], [], color=c, marker=mk, lw=1.3, ms=4, label=(m if m != "deepseek" else "DeepSeek (ref.)").capitalize() if m != "deepseek" else "DeepSeek (ref.)") for m, c, mk in models]
axs[1].legend(handles=h, loc="upper left", fontsize=6.3)
save(fig, "fig_channel")

# --- Fig 5: gates (a) RAG call-rate vs FNR, (b) held-out FNR distribution at 5% target
fig, axs = plt.subplots(1, 2, figsize=(COL2, 1.8), gridspec_kw={"width_ratios": [1.1, 1.6]})
ax = axs[0]
for m, col in (("laya", C_LAYA), ("jev", C_JEV)):
    pts = curve(gate_rows(rag, LA if m == "laya" else JA))
    ax.plot([f * 100 for f, _ in pts], [c * 100 for _, c in pts], color=col, lw=1.4, label=m.capitalize())
ps = gates["rag_single"]["jev"]["pos_share"] * 100
ax.axhline(ps, color=MUTED, lw=0.8)
ax.text(31, ps + 2, "perfect gate (share answerable)", fontsize=6, color=MUTED, ha="right")
ax.axvline(5, color=MUTED, lw=0.6)
ax.text(5.5, 37, "5%", fontsize=6, color=MUTED)
ax.set_xlim(0, 32)
ax.set_ylim(35, 101)
ax.set_xlabel("Answerable queries dropped (FNR, %)")
ax.set_ylabel("LLM calls kept (%)")
ax.set_title("(a) RAG gate operating curve", loc="left", color=INK)
ax.legend(loc="upper right")
ax = axs[1]
glabs = [("rag_single", "D RAG"), ("G_indirect_injection", "G tool-out inj."), ("H_groundedness", "H grounded."), ("I_execution_safety", "I safety"), ("J_pii_egress", "J PII")]
for i, (g, lab) in enumerate(glabs):
    for j, (m, col) in enumerate((("laya", C_LAYA), ("jev", C_JEV))):
        v = sorted(x * 100 for x in gates[g][m]["fnr_samples"])
        x0 = i + (j - 0.5) * 0.32
        lo, hi = v[int(.05 * (len(v) - 1))], v[int(.95 * (len(v) - 1))]
        ax.plot([x0, x0], [lo, hi], color=col, lw=3.0, alpha=0.45, solid_capstyle="butt")
        ax.scatter([x0], [v[len(v) // 2]], color=col, s=14, zorder=3, edgecolor="white", linewidth=0.5)
ax.axhline(5, color=INK2, lw=0.8)
ax.text(len(glabs) - 0.45, 5.6, "target 5%", fontsize=6, color=INK2, ha="right")
ax.set_xticks(range(len(glabs)))
ax.set_xticklabels([l for _, l in glabs])
ax.set_ylabel("Held-out FNR (%)")
ax.set_title("(b) Threshold picked on one half, FNR on the other (median, 5–95%)", loc="left", color=INK)
ax.grid(axis="x", visible=False)
save(fig, "fig_gates")

# --- Fig 6: two-tier safety cost, corrected vs as reported
fig, ax = plt.subplots(figsize=(COL1, 1.9))
thr = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5]
base = two["llm_only"]["cost_per_1m"]
cor = [two["sweep"][f"jev@{t}"]["corrected"] for t in thr]
rep_ = [two["sweep"][f"jev@{t}"]["as_reported"] for t in thr]
ax.plot([r["fnr"] * 100 for r in cor], [r["cost_per_1m"] / base * 100 for r in cor], color=C_JEV, marker="s", ms=4, lw=1.4, label="Jev pre-screen, incl. its own cost")
ax.plot([r["fnr"] * 100 for r in rep_], [r["cost_per_1m"] / base * 100 for r in rep_], color=C_JEV, marker="s", ms=4, lw=1.0, ls="--", alpha=0.55, mfc="white", label="as originally reported (pre-screen cost omitted)")
ax.scatter([two["llm_only"]["fnr"] * 100], [100], color=INK2, marker="D", s=16, zorder=3, label="LLM reviewer only")
for r, t in zip(cor, thr):
    if t in (0.05, 0.1, 0.2, 0.3):
        ax.annotate(f"τ={t}", (r["fnr"] * 100, r["cost_per_1m"] / base * 100), textcoords="offset points",
                    xytext={0.05: (6, 1), 0.1: (6, -9)}.get(t, (4, 3)), fontsize=6, color=INK2)
ax.set_xlabel("End-to-end miss rate on unsafe requests (%)")
ax.set_ylabel("Cost vs. LLM-only (%)")
ax.legend(loc="upper right", fontsize=6.2)
ax.set_ylim(45, 125)
save(fig, "fig_twotier")

# --- Fig 7: reliability diagrams (appendix)
fig, axs = plt.subplots(1, 2, figsize=(COL2 * 0.62, 1.9), sharey=True)
for ax, (title, cs, la, ja) in zip(axs, (("2,100-case suite (A–F)", cases_large, LA, JA), ("Agent-infra suite (G–J)", ai, LI, JI))):
    ax.plot([0, 1], [0, 1], color=MUTED, lw=0.8)
    for m, rr, col, mk in (("Laya", la, C_LAYA, "o"), ("Jev", ja, C_JEV, "s")):
        pts, e = reliability(cs, rr)
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color=col, marker=mk, ms=3.5, lw=1.2, label=f"{m} (ECE {e:.3f})")
    ax.set_xlim(0.4, 1.0); ax.set_ylim(0.2, 1.0)
    ax.set_title(title, loc="left", color=INK)
    ax.set_xlabel("Confidence = max prob.")
    ax.legend(loc="upper left", fontsize=6.2)
axs[0].set_ylabel("Accuracy")
save(fig, "fig_reliability")
print("figures written to", FIG)
