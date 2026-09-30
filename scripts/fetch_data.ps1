function dl($url, $out) {
  if (Test-Path $out) { Write-Output ("SKIP  " + $out); return }
  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
  $code = curl.exe -sL --fail --max-time 900 -o $out -w "%{http_code}" $url
  $sz = 0
  if (Test-Path $out) { $sz = [math]::Round((Get-Item $out).Length/1KB) }
  Write-Output ($code.ToString() + "  " + $sz.ToString() + "KB  " + $out)
}
dl "https://hf-mirror.com/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard/resolve/main/BFCL_v3_live_simple.json" "data\raw\bfcl\BFCL_v3_live_simple.json"
dl "https://hf-mirror.com/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard/resolve/main/BFCL_v3_live_multiple.json" "data\raw\bfcl\BFCL_v3_live_multiple.json"
dl "https://hf-mirror.com/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard/resolve/main/BFCL_v3_live_irrelevance.json" "data\raw\bfcl\BFCL_v3_live_irrelevance.json"
dl "https://hf-mirror.com/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard/resolve/main/BFCL_v3_irrelevance.json" "data\raw\bfcl\BFCL_v3_irrelevance.json"
dl "https://hf-mirror.com/datasets/mteb/scifact/resolve/main/corpus.jsonl" "data\raw\scifact\corpus.jsonl"
dl "https://hf-mirror.com/datasets/mteb/scifact/resolve/main/queries.jsonl" "data\raw\scifact\queries.jsonl"
dl "https://hf-mirror.com/datasets/mteb/scifact/resolve/main/qrels/test.tsv" "data\raw\scifact\qrels_test.tsv"
dl "https://hf-mirror.com/datasets/mteb/banking77/resolve/main/test.jsonl" "data\raw\banking77\test.jsonl"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/en.json.gz" "data\raw\massive\test_en.json.gz"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/zh.json.gz" "data\raw\massive\test_zh.json.gz"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/ja.json.gz" "data\raw\massive\test_ja.json.gz"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/de.json.gz" "data\raw\massive\test_de.json.gz"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/ar.json.gz" "data\raw\massive\test_ar.json.gz"
dl "https://hf-mirror.com/datasets/jackhhao/jailbreak-classification/resolve/main/balanced/jailbreak_dataset_test_balanced.csv" "data\raw\jailbreak\jailbreak_test_balanced.csv"
dl "https://hf-mirror.com/datasets/deepset/prompt-injections/resolve/main/data/test-00000-of-00001-701d16158af87368.parquet" "data\raw\injections\test.parquet"
dl "https://hf-mirror.com/datasets/deepset/prompt-injections/resolve/main/data/train-00000-of-00001-9564e8b05b4757ab.parquet" "data\raw\injections\train.parquet"
dl "https://hf-mirror.com/datasets/withmartian/routerbench/resolve/main/routerbench_0shot.pkl" "data\raw\routerbench\routerbench_0shot.pkl"
Write-Output "FETCH-ALL-DONE"