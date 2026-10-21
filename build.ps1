$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir = Join-Path $ProjectDir 'dist'
$Manifest = Get-Content (Join-Path $ProjectDir 'manifest.json') -Raw | ConvertFrom-Json
$Version = $Manifest.version
$ZipPath = Join-Path $DistDir "structured-tags-$Version.zip"
$XpiPath = Join-Path $DistDir "structured-tags-$Version.xpi"

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $XpiPath -Force -ErrorAction SilentlyContinue

& node.exe (Join-Path $ProjectDir 'tests\validate-manifest.mjs')
if ($LASTEXITCODE -ne 0) { throw "Manifest validation failed" }

Push-Location $ProjectDir
try {
  & zip.exe -q -r $ZipPath manifest.json bootstrap.js icon.svg content
  if ($LASTEXITCODE -ne 0) { throw "zip.exe failed with exit code $LASTEXITCODE" }
}
finally {
  Pop-Location
}
Move-Item -LiteralPath $ZipPath -Destination $XpiPath
Write-Output $XpiPath
