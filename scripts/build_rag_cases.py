"""Build the RAG-gate deep-dive case set (BEIR mix, BM25 hard negatives, multi-passage variant)."""
import json, math, os, random, re
from collections import Counter, defaultdict

SEED = 42
random.seed(SEED)
RAW = "data/raw"

PLAN = {                       # dataset -> (folder, positives, hard negatives, easy negatives)
    "SciFact": ("scifact", 200, 200, 80),
    "NFCorpus": ("nfcorpus", 200, 200, 80),
    "FiQA": ("fiqa", 200, 200, 80),
    "SciDocs": ("scidocs", 100, 100, 40),
    "CQADupStack-android": ("cqadupstack", 100, 100, 40),
}
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
    """Okapi BM25 with an inverted index (k1=1.2, b=0.75) -- fast enough for a 57k-doc corpus."""

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

    def score_all(self, q):
        acc = defaultdict(float)
        for t in set(q):
            post = self.post.get(t)
            if not post:
                continue
            idf = self.idf[t]
            for i, f in post:
                acc[i] += idf * (f * (self.k1 + 1)) / (f + self.k1 * (1 - self.b + self.b * self.len[i] / self.avg))
        return acc

    def top(self, q, k=50, exclude=()):
        acc = self.score_all(q)
        for e in exclude:
            acc.pop(e, None)
        return sorted(acc.items(), key=lambda kv: kv[1], reverse=True)[:k]


def doc_text(d):
    title = (d.get("title") or "").strip()
    text = (d.get("text") or "").strip()
    return (title + ". " + text) if title else text


cases = []
report = {}
index = {}                       # dataset -> (by_id, qtext, qrels, corpus_ids, bm25)

for name, (folder, n_pos, n_hard, n_easy) in PLAN.items():
    base = os.path.join(RAW, folder)
    corpus = load_jsonl(os.path.join(base, "corpus.jsonl"))
    queries = load_jsonl(os.path.join(base, "queries.jsonl"))
    qrels = load_qrels(os.path.join(base, "qrels_test.tsv"))
    by_id = {str(d.get("_id", d.get("id"))): d for d in corpus}
    qtext = {str(q.get("_id", q.get("id"))): q.get("text", "") for q in queries}
    corpus_ids = list(by_id)
    toks = [tokens(doc_text(by_id[c])) for c in corpus_ids]
    bm = BM25(toks)
    index[name] = (by_id, qtext, qrels, corpus_ids, bm, toks)

    q_with_pos = [q for q in qtext if qrels.get(q)]
    random.shuffle(q_with_pos)
    used, made_pos, made_hard, made_easy = set(), 0, 0, 0

    for qid in q_with_pos:
        if made_pos >= n_pos and made_hard >= n_hard and made_easy >= n_easy:
            break
        rel_idx = {corpus_ids.index(d) for d in qrels[qid] if d in by_id}
        if not rel_idx:
            continue
        qt = tokens(qtext[qid])
        gold_i = sorted(rel_idx)[0]
        gold_tokens = set(toks[gold_i])

        def jac(i):
            t = set(toks[i])
            return len(t & gold_tokens) / max(1, len(t | gold_tokens))

        if made_pos < n_pos and gold_i not in used:
            used.add(gold_i)
            made_pos += 1
            cases.append({"dataset": name, "neg_type": "pos", "query_id": qid, "corpus_id": corpus_ids[gold_i],
                          "query": qtext[qid], "passage": doc_text(by_id[corpus_ids[gold_i]]), "bm25": None, "jaccard": 1.0})
        if made_hard < n_hard:
            for i, sc in bm.top(qt, k=60, exclude=used | rel_idx):
                if jac(i) > 0.6:
                    continue
                used.add(i)
                made_hard += 1
                cases.append({"dataset": name, "neg_type": "hard_neg", "query_id": qid, "corpus_id": corpus_ids[i],
                              "query": qtext[qid], "passage": doc_text(by_id[corpus_ids[i]]),
                              "bm25": round(sc, 2), "jaccard": round(jac(i), 3)})
                break
        if made_easy < n_easy:
            for _ in range(60):
                i = random.randrange(len(corpus_ids))
                if i in rel_idx or i in used or jac(i) > 0.25:
                    continue
                used.add(i)
                made_easy += 1
                cases.append({"dataset": name, "neg_type": "easy_neg", "query_id": qid, "corpus_id": corpus_ids[i],
                              "query": qtext[qid], "passage": doc_text(by_id[corpus_ids[i]]), "bm25": None,
                              "jaccard": round(jac(i), 3)})
                break

    report[name] = {"corpus": len(corpus), "queries_with_qrels": len(q_with_pos),
                    "pos": made_pos, "hard_neg": made_hard, "easy_neg": made_easy}
    print(f"{name}: corpus={len(corpus)} qrels_queries={len(q_with_pos)} -> pos={made_pos} hard={made_hard} easy={made_easy}", flush=True)

QUESTION = "Does the passage contain information that helps answer the question?"
out = []
for i, c in enumerate(cases):
    words = len(c["passage"].split())
    out.append({
        "id": "r" + str(i + 1).zfill(4),
        "track": "D_rag_gate",
        "dataset": c["dataset"],
        "source_id": c["query_id"] + "/" + c["corpus_id"],
        "lang": "en",
        "difficulty": "clear" if c["neg_type"] == "pos" else ("ambiguous" if c["neg_type"] == "hard_neg" else "boundary"),
        "has_unique_answer": True, "label_confidence": "high",
        "neg_type": c["neg_type"], "bm25": c["bm25"], "jaccard": c["jaccard"],
        "passage_words": words, "passage_chars": len(c["passage"]), "n_passages": 1,
        "state": "Question: " + c["query"] + "\n\nPassage: " + c["passage"],
        "questions": {"relevant": {"type": "noul", "instructions": QUESTION}},
        "gold": {"relevant": c["neg_type"] == "pos"}, "gold_alt": [],
        "notes": c["neg_type"] + ("" if c["bm25"] is None else " bm25=" + str(c["bm25"])) + " jaccard=" + str(c["jaccard"]),
    })
with open("bench/rag-cases.jsonl", "w", encoding="utf-8") as fh:
    fh.write("\n".join(json.dumps(c, ensure_ascii=False) for c in out) + "\n")

# ---------------------------------------------------------------- multi-passage variant: real top-5 BM25 context
MULTI_Q = "Do these passages together contain information that helps answer the question?"
seen_q = {}
for c in cases:
    seen_q.setdefault((c["dataset"], c["query_id"]), True)

multi = []
i = 0
for name, (by_id, qtext, qrels, corpus_ids, bm, toks) in index.items():
    picked = 0
    for (ds, qid) in [k for k in seen_q if k[0] == name]:
        if picked >= 40:
            break
        qt = tokens(qtext[qid])
        ranked = bm.top(qt, k=5)
        rel = qrels.get(qid, set())
        if not any(corpus_ids[j] in rel for j, _ in ranked):
            continue
        picked += 1
        i += 1
        passages = [doc_text(by_id[corpus_ids[j]]) for j, _ in ranked]
        body = "\n\n".join("Passage " + str(k + 1) + ": " + p for k, p in enumerate(passages))
        multi.append({
            "id": "m" + str(i).zfill(4), "track": "D_rag_gate_multi", "dataset": name + "/top5",
            "source_id": qid, "lang": "en", "difficulty": "clear", "has_unique_answer": True,
            "label_confidence": "high", "neg_type": "pos", "bm25": None, "jaccard": None,
            "passage_words": sum(len(p.split()) for p in passages), "passage_chars": len(body), "n_passages": 5,
            "state": "Question: " + qtext[qid] + "\n\n" + body,
            "questions": {"relevant": {"type": "noul", "instructions": MULTI_Q}},
            "gold": {"relevant": True}, "gold_alt": [],
            "notes": "top-5 BM25 context contains the judged-relevant doc",
        })
with open("bench/rag-multi-cases.jsonl", "w", encoding="utf-8") as fh:
    fh.write("\n".join(json.dumps(c, ensure_ascii=False) for c in multi) + "\n")

with open("bench/rag-manifest.json", "w", encoding="utf-8") as fh:
    json.dump({"seed": SEED, "per_dataset": report, "single_passage": len(out), "multi_passage": len(multi),
               "question_single": QUESTION, "question_multi": MULTI_Q}, fh, ensure_ascii=False, indent=2)
print(f"single-passage: {len(out)} | multi-passage: {len(multi)}")
print("neg_type split:", dict(Counter(c["neg_type"] for c in out)))
ws = sorted(c["passage_words"] for c in out)
print("passage words p10/p50/p90/max:", ws[len(ws)//10], ws[len(ws)//2], ws[int(len(ws)*0.9)], ws[-1])
