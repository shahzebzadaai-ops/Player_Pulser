$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "Set DATABASE_URL first." }
if (-not $args[0]) { throw "Pass the dump file path." }
Write-Output "This replaces data in the database named by DATABASE_URL."
pg_restore --clean --if-exists --no-owner --dbname=$env:DATABASE_URL $args[0]
Write-Output "Restore finished."
