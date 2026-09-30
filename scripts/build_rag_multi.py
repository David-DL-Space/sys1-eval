"""Multi-passage RAG gate: top-5 BM25 context WITH vs WITHOUT the judged-relevant doc."""
import json, math, os, random, re
from collections import Counter, defaultdict

SEED = 42
random.seed(SEED)
RAW = "data/raw"
PLAN = {"SciFact": "scifact", "NFCorpus": "nfcorpus", "FiQA": "fiqa", "SciDocs": "scidocs", "CQADupStack-android": "cqadupstack"}
PER_CLASS = 40                     # 40 hits + 40 misses per dataset = 400 cases
TOK = re.compile(r"[a-z0-9]+")


def tokens(s):
    return TOK.findall(s.lower())


def load_jsonl(p):
    with open(p, encoding="utf-8") as fh:
        return [json.loads(l) for l in fh if l.strip()]


def load_qrels(p):
    rel = defaultdict(set)
    with open(p, encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            if i == 0 and line.lower().startswith("query"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            try:
                if float(parts[2]) > 0:
                    rel[str(parts[0])].add(str(parts[1]))
            except ValueError:
                continue
    return rel


class BM25:
    def __init__(self, docs):
        self.k1, self.b = 1.2, 0.75
        self.n = len(docs)
        self.len = [len(d) for d in docs]
        self.avg = sum(self.len) / max(1, self.n)
        self.post = defaultdict(list)
        for i, d in enumerate(docs):
            for t, f in Counter(d).items():
                self.post[t].append((i, f))
        self.idf = {t: math.log(1 + (self.n - len(p) + 0.5) / (len(p) + 0.5)) for t, p in self.post.items()}

    def top(self, q, k=5):
        acc = defaultdict(float)
        for t in set(q):
            post = self.post.get(t)
            if not post:
                continue
            idf = self.idf[t]
            for i, f in post:
                acc[i] += idf * (f * (self.k1 + 1)) / (f + self.k1 * (1 - self.b + self.b * self.len[i] / self.avg))
        return sorted(acc.items(), key=lambda kv: kv[1], reverse=True)[:k]


def doc_text(d):
    title = (d.get("title") or "").strip()
    text = (d.get("text") or "").strip()
    return (title + ". " + text) if title else text


Q = "Do these passages together contain information that helps answer the question?"
out = []
for name, folder in PLAN.items():
    base = os.path.join(RAW, folder)
    corpus = load_jsonl(os.path.join(base, "corpus.jsonl"))
    queries = load_jsonl(os.path.join(base, "queries.jsonl"))
    qrels = load_qrels(os.path.join(base, "qrels_test.tsv"))
    by_id = {str(d.get("_id", d.get("id"))): d for d in corpus}
    qtext = {str(q.get("_id", q.get("id"))): q.get("text", "") for q in queries}
    ids = list(by_id)
    bm = BM25([tokens(doc_text(by_id[c])) for c in ids])
    hits = misses = 0
    qs = [q for q in qtext if qrels.get(q)]
    random.shuffle(qs)
    for qid in qs:
        if hits >= PER_CLASS and misses >= PER_CLASS:
            break
        rel = qrels[qid]
        ranked = bm.top(tokens(qtext[qid]), k=5)
        hit = any(ids[i] in rel for i, _ in ranked)
        if hit and hits >= PER_CLASS:
            continue
        if not hit and misses >= PER_CLASS:
            continue
        hits += hit
        misses += (not hit)
        passages = [doc_text(by_id[ids[i]]) for i, _ in ranked]
        body = "\n\n".join("Passage " + str(k + 1) + ": " + p for k, p in enumerate(passages))
        out.append({
            "id": "M" + str(len(out) + 1).zfill(4),
            "track": "D_rag_gate_multi",
            "dataset": name + "/top5",
            "source_id": qid, "lang": "en", "difficulty": "clear" if hit else "ambiguous",
            "has_unique_answer": True, "label_confidence": "high",
            "neg_type": "pos" if hit else "hard_neg",
            "bm25": None, "jaccard": None,
            "passage_words": sum(len(p.split()) for p in passages), "passage_chars": len(body), "n_passages": 5,
            "state": "Question: " + qtext[qid] + "\n\n" + body,
            "questions": {"relevant": {"type": "noul", "instructions": Q}},
            "gold": {"relevant": hit}, "gold_alt": [],
            "notes": ("top-5 contains the judged-relevant doc" if hit else "top-5 misses every judged-relevant doc"),
        })
    print(f"{name}: hits={hits} misses={misses}", flush=True)

with open("bench/rag-multi-cases.jsonl", "w", encoding="utf-8") as fh:
    fh.write("\n".join(json.dumps(c, ensure_ascii=False) for c in out) + "\n")
print("multi-passage cases:", len(out), "| pos:", sum(1 for c in out if c["gold"]["relevant"]), "| neg:", sum(1 for c in out if not c["gold"]["relevant"]))
ws = sorted(c["passage_words"] for c in out)
print("context words p50/p90:", ws[len(ws)//2], ws[int(len(ws)*0.9)])
