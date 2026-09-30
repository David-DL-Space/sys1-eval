function dl($url, $out) {
  if (Test-Path $out) { Write-Output ("SKIP  " + $out); return }
  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
  $code = curl.exe -sL --fail --max-time 900 -o $out -w "%{http_code}" $url
  $sz = 0
  if (Test-Path $out) { $sz = [math]::Round((Get-Item $out).Length/1KB) }
  Write-Output ($code.ToString() + "  " + $sz.ToString() + "KB  " + $out)
}
dl "https://hf-mirror.com/datasets/mteb/nfcorpus/resolve/main/corpus.jsonl" "data\raw\nfcorpus\corpus.jsonl"
dl "https://hf-mirror.com/datasets/mteb/nfcorpus/resolve/main/queries.jsonl" "data\raw\nfcorpus\queries.jsonl"
dl "https://hf-mirror.com/datasets/mteb/nfcorpus/resolve/main/qrels/test.tsv" "data\raw\nfcorpus\test.tsv"
dl "https://hf-mirror.com/datasets/mteb/fiqa/resolve/main/corpus.jsonl" "data\raw\fiqa\corpus.jsonl"
dl "https://hf-mirror.com/datasets/mteb/fiqa/resolve/main/queries.jsonl" "data\raw\fiqa\queries.jsonl"
dl "https://hf-mirror.com/datasets/mteb/fiqa/resolve/main/qrels/test.tsv" "data\raw\fiqa\test.tsv"
dl "https://hf-mirror.com/datasets/mteb/scidocs/resolve/main/corpus.jsonl" "data\raw\scidocs\corpus.jsonl"
dl "https://hf-mirror.com/datasets/mteb/scidocs/resolve/main/queries.jsonl" "data\raw\scidocs\queries.jsonl"
dl "https://hf-mirror.com/datasets/mteb/scidocs/resolve/main/qrels/test.tsv" "data\raw\scidocs\test.tsv"
dl "https://hf-mirror.com/datasets/mteb/cqadupstack-android/resolve/main/corpus.jsonl" "data\raw\cqadupstack\corpus.jsonl"
dl "https://hf-mirror.com/datasets/mteb/cqadupstack-android/resolve/main/queries.jsonl" "data\raw\cqadupstack\queries.jsonl"
dl "https://hf-mirror.com/datasets/mteb/cqadupstack-android/resolve/main/qrels/test.tsv" "data\raw\cqadupstack\test.tsv"
# more attack/benign data + more MASSIVE languages
dl "https://hf-mirror.com/datasets/jackhhao/jailbreak-classification/resolve/main/default/jailbreak_dataset_train.csv" "data\raw\jailbreak\jailbreak_train.csv"
dl "https://hf-mirror.com/datasets/jackhhao/jailbreak-classification/resolve/main/default/jailbreak_dataset_test.csv" "data\raw\jailbreak\jailbreak_test.csv"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/fr.json.gz" "data\raw\massive\test_fr.json.gz"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/es.json.gz" "data\raw\massive\test_es.json.gz"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/ko.json.gz" "data\raw\massive\test_ko.json.gz"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/pt.json.gz" "data\raw\massive\test_pt.json.gz"
dl "https://hf-mirror.com/datasets/mteb/amazon_massive_intent/resolve/main/test/hi.json.gz" "data\raw\massive\test_hi.json.gz"
Write-Output "FETCH2-DONE"