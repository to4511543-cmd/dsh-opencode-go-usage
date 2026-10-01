@echo off
chcp 65001 >nul
setlocal
set "DSH_OCG_SELF=%~f0"
rem LastIndexOf, not IndexOf: the marker string also appears literally on the
rem line below, so a forward search would find the wrapper's own copy of it.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$r = Get-Content -LiteralPath $env:DSH_OCG_SELF -Raw -Encoding UTF8; $m = '#==POWERSHELL=='; $i = $r.LastIndexOf($m); if ($i -lt 0) { Write-Host 'script file is damaged' -ForegroundColor Red; exit 1 }; Invoke-Expression $r.Substring($i + $m.Length)"
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%

#==POWERSHELL==
# ---------------------------------------------------------------------------
# dsh-opencode-go-usage installer
#
# Installs the plugin WITHOUT git and WITHOUT the user typing anything:
# the archive is fetched over plain HTTPS and registered with a `link:` spec,
# which pnpm resolves locally. A `github:` spec would have needed git on PATH —
# pnpm shells out to `git ls-remote` to resolve the ref — and that is exactly
# the dependency this script exists to avoid.
#
# Every step prints what it is doing, because a downloaded script that silently
# runs commands is indistinguishable from malware. Nothing here needs admin.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch { }

$REPO = 'to4511543-cmd/dsh-opencode-go-usage'
$NAME = 'dsh-opencode-go-usage'

function Step($n, $text) { Write-Host ''; Write-Host "  [$n] $text" -ForegroundColor White }
function Ok($text)   { Write-Host "      OK   $text" -ForegroundColor Green }
function Info($text) { Write-Host "      ..   $text" -ForegroundColor DarkGray }
function Die($text)  {
  Write-Host ''
  Write-Host "  安装失败：$text" -ForegroundColor Red
  Write-Host ''
  Write-Host '  可以把上面这段截图发给插件作者。' -ForegroundColor DarkGray
  exit 1
}

Write-Host ''
Write-Host '  ========================================================' -ForegroundColor Cyan
Write-Host '     dsh-opencode-go-usage   安装程序' -ForegroundColor Cyan
Write-Host '  ========================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '     把 OpenCode Go 套餐用量显示在 DSH 会话标题栏上。' -ForegroundColor Gray
Write-Host '     不需要 git，不需要敲命令，全程只读 GitHub 上的文件。' -ForegroundColor Gray

# --- 1. locate the harness -------------------------------------------------
Step 1 '查找 DSH'

$dshHome = $env:DSH_HOME
if ([string]::IsNullOrWhiteSpace($dshHome)) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
$profilesDir = Join-Path $dshHome 'profiles'
if (-not (Test-Path -LiteralPath $profilesDir)) {
  Die "找不到 DSH 的 profiles 目录：$profilesDir`n         请确认你装过并至少启动过一次 DeepSeek Harness。"
}
Ok "状态目录  $dshHome"

$cli = $null
$onPath = Get-Command dsh -ErrorAction SilentlyContinue
if ($onPath) { $cli = $onPath.Source; Ok "dsh 命令  $cli（来自 PATH）" }

if (-not $cli) {
  $proc = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue |
          Where-Object { $_.Path } | Select-Object -First 1
  if ($proc) {
    $candidate = Join-Path (Split-Path -Parent $proc.Path) 'resources\runtime\cli\bin\dsh.cmd'
    if (Test-Path -LiteralPath $candidate) { $cli = $candidate; Ok "dsh 命令  $cli（来自正在运行的 App）" }
  }
}

if (-not $cli) {
  $bases = @()
  if ($env:LOCALAPPDATA) { $bases += (Join-Path $env:LOCALAPPDATA 'Programs') }
  if ($env:ProgramFiles) { $bases += $env:ProgramFiles }
  if (${env:ProgramFiles(x86)}) { $bases += ${env:ProgramFiles(x86)} }
  foreach ($base in $bases) {
    $candidate = Join-Path $base 'DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
    if (Test-Path -LiteralPath $candidate) { $cli = $candidate; Ok "dsh 命令  $cli"; break }
  }
}

if (-not $cli) {
  Die "找不到 dsh 命令。`n         请先打开一次 DeepSeek Harness，然后重新双击本文件。"
}

# --- 2. choose the profile -------------------------------------------------
Step 2 '选择要装入的 profile'

$profiles = @(Get-ChildItem -LiteralPath $profilesDir -Directory -ErrorAction SilentlyContinue |
              Where-Object { $_.Name -ne 'node_modules' } | Select-Object -ExpandProperty Name)
if ($profiles.Count -eq 0) { Die "profiles 目录是空的，请先启动一次 DSH 让它生成 profile。" }

$profile = $null
foreach ($preferred in @('desktop', 'web')) {
  if ($profiles -contains $preferred) { $profile = $preferred; break }
}
if (-not $profile) {
  if ($profiles.Count -eq 1) {
    $profile = $profiles[0]
  } else {
    Write-Host ''
    Write-Host '      发现多个 profile，请选一个：' -ForegroundColor Yellow
    for ($i = 0; $i -lt $profiles.Count; $i++) { Write-Host "        $($i + 1)) $($profiles[$i])" -ForegroundColor Gray }
    $answer = Read-Host '      输入序号'
    $index = 0
    if (-not [int]::TryParse($answer, [ref]$index) -or $index -lt 1 -or $index -gt $profiles.Count) {
      Die '输入的序号不对。'
    }
    $profile = $profiles[$index - 1]
  }
}
Ok "profile   $profile"

# --- 3. download -----------------------------------------------------------
Step 3 '从 GitHub 下载（只读，HTTPS）'

$stamp = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$zip = Join-Path $env:TEMP "dsh-ocg-$stamp.zip"
$stage = Join-Path $env:TEMP "dsh-ocg-$stamp"

$target = Join-Path (Join-Path $dshHome 'plugins') $NAME

if (Test-Path -LiteralPath (Join-Path $target 'lib\client.js')) {
  Info "已经下载过了，跳过（$target）"
} else {
  $url = "https://github.com/$REPO/archive/refs/heads/main.zip"
  Info $url
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  } catch {
    Die "下载失败：$($_.Exception.Message)`n         检查一下网络能不能访问 github.com。"
  }
  Ok ("已下载  {0:N0} KB" -f ((Get-Item -LiteralPath $zip).Length / 1KB))

  try {
    Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
  } catch {
    Die "解压失败：$($_.Exception.Message)"
  }
  $inner = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1
  if (-not $inner) { Die '解压出来的目录是空的。' }

  $pluginsDir = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Move-Item -LiteralPath $inner.FullName -Destination $target
  Ok "已放到  $target"
}

Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath (Join-Path $target 'lib\client.js'))) {
  Die "文件不完整：找不到 lib\client.js"
}

# --- 4. register with the harness -----------------------------------------
Step 4 '注册到 DSH'

# pnpm wants forward slashes in a link: spec, even on Windows.
$spec = 'link:' + ($target -replace '\\', '/')
Info "dsh plugin --profile $profile add $spec"

& $cli plugin --profile $profile add $spec
if ($LASTEXITCODE -ne 0) {
  Die "DSH 拒绝了这次安装（退出码 $LASTEXITCODE）。"
}
Ok '已写入 profile'

$manifest = Join-Path $profilesDir "$profile\package.json"
if (Test-Path -LiteralPath $manifest) {
  $bundles = (Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).dsh.profile.bundles
  if ($bundles -contains $NAME) { Ok '已挂进 profile 的 bundles 列表' }
  else { Write-Host '      !!   没有出现在 bundles 里，可能需要在 DSH 设置里检查一下' -ForegroundColor Yellow }
}

# --- 5. done ---------------------------------------------------------------
Write-Host ''
Write-Host '  ========================================================' -ForegroundColor Green
Write-Host '     装好了！' -ForegroundColor Green
Write-Host '  ========================================================' -ForegroundColor Green
Write-Host ''
Write-Host '  接下来必须做这两步，否则看不到效果：' -ForegroundColor White
Write-Host ''
Write-Host '    1. 完全退出 DSH' -ForegroundColor White
Write-Host '       右下角托盘图标 -> 右键 -> 退出' -ForegroundColor DarkGray
Write-Host '       （只点窗口右上角的 X 不算，那只是收进托盘）' -ForegroundColor DarkGray
Write-Host ''
Write-Host '    2. 重新打开 DSH，然后按 Ctrl+Shift+R 硬刷新' -ForegroundColor White
Write-Host ''
Write-Host '  然后看对话区右上角，会出现一个显示用量的徽章。' -ForegroundColor Cyan
Write-Host ''
exit 0
