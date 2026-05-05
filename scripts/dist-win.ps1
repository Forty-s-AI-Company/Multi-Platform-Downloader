$ErrorActionPreference = "Stop"

function Merge-Directory {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
    $targetPath = Join-Path $Destination $_.Name

    if ($_.PSIsContainer) {
      Merge-Directory -Source $_.FullName -Destination $targetPath
      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
      return
    }

    Copy-Item -LiteralPath $_.FullName -Destination $targetPath -Force
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Get-Process ai_yd-dlp, ai_yt-dlp, electron -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$releaseRoot = Join-Path $projectRoot "release"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stagingRoot = Join-Path $releaseRoot ".build-$timestamp"
$latestInstaller = Join-Path $releaseRoot "ai_yt-dlp Setup 0.0.1.exe"
$latestBlockMap = Join-Path $releaseRoot "ai_yt-dlp Setup 0.0.1.exe.blockmap"
$latestUnpacked = Join-Path $releaseRoot "win-unpacked"
$latestManifest = Join-Path $releaseRoot "LATEST.txt"
$builderDebugFile = Join-Path $releaseRoot "builder-debug.yml"
$legacyInstaller = Join-Path $releaseRoot "ai_yd-dlp Setup 0.0.1.exe"
$legacyBlockMap = Join-Path $releaseRoot "ai_yd-dlp Setup 0.0.1.exe.blockmap"
$legacyZip = Join-Path $releaseRoot "ai_yd-dlp-win-unpacked.zip"

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

Get-ChildItem -Path $releaseRoot -Directory -Filter ".build-*" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

npm run build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

npx electron-builder --win "--config.directories.output=$stagingRoot"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$stagedInstaller = Join-Path $stagingRoot "ai_yt-dlp Setup 0.0.1.exe"
$stagedBlockMap = Join-Path $stagingRoot "ai_yt-dlp Setup 0.0.1.exe.blockmap"
$stagedUnpacked = Join-Path $stagingRoot "win-unpacked"

if (Test-Path $latestInstaller) {
  Remove-Item -LiteralPath $latestInstaller -Force
}
if (Test-Path $latestBlockMap) {
  Remove-Item -LiteralPath $latestBlockMap -Force
}
if (Test-Path $legacyInstaller) {
  Remove-Item -LiteralPath $legacyInstaller -Force
}
if (Test-Path $legacyBlockMap) {
  Remove-Item -LiteralPath $legacyBlockMap -Force
}
if (Test-Path $legacyZip) {
  Remove-Item -LiteralPath $legacyZip -Force
}

Get-ChildItem -Path $releaseRoot -Directory -Filter "win-unpacked*" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item -LiteralPath $stagedInstaller -Destination $latestInstaller -Force
Copy-Item -LiteralPath $stagedBlockMap -Destination $latestBlockMap -Force

Move-Item -LiteralPath $stagedUnpacked -Destination $latestUnpacked -Force

@(
  "Installer=$latestInstaller"
  "Unpacked=$latestUnpacked"
  "BuildTime=$timestamp"
) | Set-Content -LiteralPath $latestManifest -Encoding UTF8

if (Test-Path $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}

if (Test-Path $builderDebugFile) {
  Remove-Item -LiteralPath $builderDebugFile -Force
}
