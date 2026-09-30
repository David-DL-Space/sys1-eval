$ErrorActionPreference = 'Continue'
$dir = 'F:\sys1-eval\wheels'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$whl = Join-Path $dir 'torch-2.14.0+cu126-cp311-cp311-win_amd64.whl'
$url = 'https://mirror.sjtu.edu.cn/pytorch-wheels/cu126/torch-2.14.0%2Bcu126-cp311-cp311-win_amd64.whl'
Write-Output '=== downloading torch cu126 from SJTU mirror ==='
curl.exe -L -C - --retry 5 --retry-delay 3 -o $whl $url
Write-Output ('downloaded MB: ' + [math]::Round((Get-Item $whl).Length/1MB))
Write-Output '=== installing (no-deps) ==='
& 'F:\sys1-eval\venv\Scripts\python.exe' -m pip install --no-deps --force-reinstall $whl
Write-Output '=== verify ==='
& 'F:\sys1-eval\venv\Scripts\python.exe' -c "import torch; print('torch', torch.__version__, '| cuda', torch.cuda.is_available(), '|', (torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'))"
Write-Output 'TORCH-CUDA-DONE'