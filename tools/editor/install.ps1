param(
  [string]$BinDir = $env:TECHBLOG_EDITOR_BIN_DIR
)

$ErrorActionPreference = "Stop"
$editorDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($BinDir)) {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw "LOCALAPPDATA is not set. Pass -BinDir with an installation directory."
  }
  $BinDir = Join-Path $env:LOCALAPPDATA "Programs\techblog-editor\bin"
}

$resolvedBinDir = [System.IO.Path]::GetFullPath($BinDir)
New-Item -ItemType Directory -Path $resolvedBinDir -Force | Out-Null
$commandPath = Join-Path $resolvedBinDir "techblog-editor.cmd"
$runPath = (Join-Path $editorDir "run.cmd").Replace("%", "%%")
$launcher = "@echo off`r`ncall `"$runPath`" %*`r`n"
[System.IO.File]::WriteAllText(
  $commandPath,
  $launcher,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Output "Installed: $commandPath"
$pathEntries = @($env:PATH -split ";" | ForEach-Object {
  if ([string]::IsNullOrWhiteSpace($_)) { return }
  try { [System.IO.Path]::GetFullPath($_).TrimEnd("\") } catch { $_.TrimEnd("\") }
})
if ($pathEntries -notcontains $resolvedBinDir.TrimEnd("\")) {
  Write-Output "Add this directory to PATH before running techblog-editor:"
  Write-Output "  $resolvedBinDir"
  exit 0
}

Write-Output "Run anywhere with:"
Write-Output "  techblog-editor"
