<#
Install repo-bundled Codex skills into the user's CODEX_HOME (Windows).

- Copies `.codex/skills/*` into `$CODEX_HOME/skills/*`
- If a target skill folder already exists, it will be replaced
- Does not touch any other skills
#>

$ErrorActionPreference = "Stop"

function Get-CodexHome {
  if ($env:CODEX_HOME -and (Test-Path $env:CODEX_HOME)) {
    return $env:CODEX_HOME
  }

  $default = Join-Path $env:USERPROFILE ".codex"
  if (-not (Test-Path $default)) {
    New-Item -ItemType Directory -Path $default | Out-Null
  }
  return $default
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repoRoot ".codex\\skills"
if (-not (Test-Path $sourceRoot)) {
  throw "Skills source folder not found: $sourceRoot"
}

$codexHome = Get-CodexHome
$destRoot = Join-Path $codexHome "skills"
if (-not (Test-Path $destRoot)) {
  New-Item -ItemType Directory -Path $destRoot | Out-Null
}

Write-Host "CODEX_HOME = $codexHome"
Write-Host "Source     = $sourceRoot"
Write-Host "Dest       = $destRoot"
Write-Host ""

Get-ChildItem -Path $sourceRoot -Directory | ForEach-Object {
  $name = $_.Name
  $src = $_.FullName
  $dst = Join-Path $destRoot $name

  if (Test-Path $dst) {
    Write-Host "Update: $name"
    Remove-Item -LiteralPath $dst -Recurse -Force
  } else {
    Write-Host "Install: $name"
  }

  Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
}

Write-Host ""
Write-Host "Done. Installed skills:"
Write-Host " - ai-yt-dlp-project"
Write-Host " - ai-yt-dlp-platform-integration"
