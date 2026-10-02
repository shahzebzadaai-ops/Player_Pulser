$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "Set DATABASE_URL first." }
New-Item -ItemType Directory -Force -Path backups | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path "backups" "playerpulser-$stamp.dump"
pg_dump $env:DATABASE_URL --format=custom --file=$target
Write-Output "Wrote $target"
