<#
.SYNOPSIS
  System-1 决策层评测流水线：构建 case -> 两边跑分 -> 出报告 / 门控配置。
.EXAMPLE
  .\scripts\pipeline.ps1 -Mode sens -Seeds 42,99 -Wordings 1,2,3,4
  .\scripts\pipeline.ps1 -Mode gate
#>
param(
  [ValidateSet('sens', 'gate', 'all')][string]$Mode = 'all',
  [int[]]$Seeds = @(42, 99),
  [int[]]$Wordings = @(1, 2, 3, 4),
  [string]$Python = 'F:\sys1-eval\venv\Scripts\python.exe',
  [int]$Conc = 6,
  [switch]$Force
)
$ErrorActionPreference = 'Continue'
$env:CONC = "$Conc"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
function Step($msg) { Write-Output ("[" + (Get-Date -Format 'HH:mm:ss') + "] " + $msg) }

if ($Mode -in @('sens', 'all')) {
  Step 'building sensitivity sets'
  node scripts/build_sens_sets.mjs | Out-Null

  foreach ($seed in $Seeds) {
    foreach ($w in $Wordings) {
      $cases = "bench/sens-s$seed-w$w.jsonl"
      if (-not (Test-Path $cases)) { Write-Output "missing $cases"; continue }

      $jr = "results/sens-jev-s$seed-w$w.jsonl"
      if ($Force -or -not (Test-Path $jr)) {
        Step "run Jev  seed=$seed wording=v$w"
        node scripts/run_jev.mjs $cases $jr 2>&1 | Select-Object -Last 2
      } else { Write-Output "skip (exists) $jr" }

      $lr = "results/sens-laya-s$seed-w$w.jsonl"
      if ($Force -or -not (Test-Path $lr)) {
        Step "run Laya seed=$seed wording=v$w"
        & $Python scripts/run_laya.py $cases $lr 2>$null | Select-Object -Last 2
      } else { Write-Output "skip (exists) $lr" }
    }
  }

  Step 'aggregating sensitivity matrix'
  node scripts/sens_matrix.mjs
}

if ($Mode -in @('gate', 'all')) {
  Step 'deriving gate configuration from the RAG deep-dive results'
  node scripts/gate_config.mjs bench/rag-cases.jsonl results/laya-all.jsonl results/jev-all.jsonl
  Step 'multi-passage gate configuration'
  node scripts/gate_config.mjs bench/rag-multi-cases.jsonl results/laya-multi.jsonl results/jev-multi.jsonl
}
Step 'pipeline done'