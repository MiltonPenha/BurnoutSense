param(
  [Parameter(Mandatory=$true)][string]$EnvFile,
  [string]$Python = "$PSScriptRoot\.venv\Scripts\python.exe",
  [int]$Port = 8000
)
$ErrorActionPreference = 'Stop'
$configPath = (Resolve-Path -LiteralPath $EnvFile).Path
$repoPath = (Resolve-Path -LiteralPath "$PSScriptRoot\..").Path
if ($configPath.StartsWith($repoPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'A configuração privada deve estar fora do repositório.'
}
Push-Location -LiteralPath $PSScriptRoot
try {
  & $Python -m uvicorn app.main:app --host 127.0.0.1 --port $Port --env-file $configPath --no-access-log
  exit $LASTEXITCODE
} finally { Pop-Location }
