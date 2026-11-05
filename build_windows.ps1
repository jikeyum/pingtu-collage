$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$manifest = Join-Path $root "src-tauri\Cargo.toml"
$target = Join-Path $root "src-tauri\target\release\pingtu-collage.exe"
$dist = Join-Path $root "dist"
$output = Join-Path $dist "拼图工坊.exe"

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
  $env:PATH = "$cargoBin;$env:PATH"
}

$vsCmd = $null
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
  $installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($installation) {
    $candidate = Join-Path $installation "Common7\Tools\VsDevCmd.bat"
    if (Test-Path $candidate) { $vsCmd = $candidate }
  }
}
if (-not $vsCmd) {
  $vsCandidates = @(
    "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat"
  )
  $vsCmd = $vsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $vsCmd) {
  throw "未找到 Visual Studio VsDevCmd.bat，请安装 C++ 桌面开发工作负载。"
}

Write-Host "==> 编译 Tauri release" -ForegroundColor Cyan
cmd.exe /d /c "`"$vsCmd`" -arch=x64 && cargo build --release --manifest-path `"$manifest`""
if ($LASTEXITCODE -ne 0) {
  throw "cargo build 失败，退出码 $LASTEXITCODE"
}

if (-not (Test-Path $target)) {
  throw "没有找到构建产物：$target"
}

New-Item -ItemType Directory -Force -Path $dist | Out-Null
Copy-Item -LiteralPath $target -Destination $output -Force
Write-Host "==> 构建完成：$output" -ForegroundColor Green
