"""Convert raw datasets that need Python parsers into jsonl for build_cases.mjs."""
import json, sys, os

def parquet_to_jsonl(src, dst, cols=None):
    import pandas as pd
    df = pd.read_parquet(src)
    if cols:
        df = df[cols]
    df.to_json(dst, orient="records", lines=True, force_ascii=False)
    print(f"{src} -> {dst}  rows={len(df)} cols={list(df.columns)}")

def pkl_to_jsonl(src, dst):
    import pandas as pd
    df = pd.read_pickle(src)
    print("routerbench shape:", df.shape)
    print("routerbench columns:", list(df.columns))
    print(df.head(2).to_string()[:1500])
    df.to_json(dst, orient="records", lines=True, force_ascii=False)
    print(f"{src} -> {dst}")

if __name__ == "__main__":
    what = sys.argv[1]
    if what == "all":
        parquet_to_jsonl("data/raw/injections/train.parquet", "data/raw/injections/train.jsonl")
        parquet_to_jsonl("data/raw/injections/test.parquet", "data/raw/injections/test.jsonl")
        pkl_to_jsonl("data/raw/routerbench/routerbench_0shot.pkl", "data/raw/routerbench/routerbench_0shot.jsonl")
