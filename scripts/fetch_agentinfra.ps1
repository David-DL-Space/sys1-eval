function dl($url, $out) {
  if (Test-Path $out) { Write-Output ("SKIP  " + $out); return }
  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
  $code = curl.exe -sL --fail --max-time 900 -o $out -w "%{http_code}" $url
  $sz = 0
  if (Test-Path $out) { $sz = [math]::Round((Get-Item $out).Length/1KB) }
  Write-Output ($code.ToString() + "  " + $sz.ToString() + "KB  " + $out)
}
dl "https://hf-mirror.com/datasets/pminervini/HaluEval/resolve/main/qa/data-00000-of-00001.parquet" "data\raw\halueval\qa.parquet"
dl "https://hf-mirror.com/datasets/pminervini/HaluEval/resolve/main/dialogue/data-00000-of-00001.parquet" "data\raw\halueval\dialogue.parquet"
dl "https://hf-mirror.com/datasets/PKU-Alignment/BeaverTails/resolve/main/round0/30k/test.jsonl.gz" "data\raw\beavertails\test.jsonl.gz"
dl "https://hf-mirror.com/datasets/allenai/wildguardmix/resolve/main/test/wildguard_test.parquet" "data\raw\wildguard\test.parquet"
dl "https://hf-mirror.com/datasets/LibrAI/do-not-answer/resolve/main/data_en.csv" "data\raw\donotanswer\data_en.csv"
dl "https://hf-mirror.com/datasets/ai4privacy/pii-masking-300k/resolve/main/openpii_220k_27032024_QA.json" "data\raw\pii\qa.json"
dl "https://hf-mirror.com/datasets/ai4privacy/pii-masking-300k/resolve/main/data/validation/1english_openpii_8k.jsonl" "data\raw\pii\val_en_8k.jsonl"
dl "https://raw.githubusercontent.com/centerforaisafety/HarmBench/main/data/behavior_datasets/harmbench_behaviors_text_all.csv" "data\raw\harmbench\behaviors.csv"
Write-Output "AGENTINFRA-FETCH-DONE"