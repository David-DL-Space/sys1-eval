$ErrorActionPreference = 'Stop'
$root = 'F:\sys1-eval'
New-Item -ItemType Directory -Force -Path $root | Out-Null
$py = "$root\venv\Scripts\python.exe"
if (-not (Test-Path $py)) { Write-Output 'creating venv...'; python -m venv "$root\venv" }
& $py -m pip install --upgrade pip setuptools wheel --quiet
Write-Output '=== installing laya ==='
& $py -m pip install laya
Write-Output '=== versions ==='
& $py -c "import torch, transformers, huggingface_hub; print('torch', torch.__version__, '| cuda_avail', torch.cuda.is_available(), '| cuda_ver', torch.version.cuda); print('transformers', transformers.__version__, '| hub', huggingface_hub.__version__); print('device', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU-ONLY'); print('bf16_supported', torch.cuda.is_bf16_supported() if torch.cuda.is_available() else False)"
Write-Output '=== laya package files ==='
& $py -c "import laya, os; p=os.path.dirname(laya.__file__); print(p); [print('  ', f) for f in sorted(os.listdir(p))]"
Write-Output 'DEPLOY-DONE'