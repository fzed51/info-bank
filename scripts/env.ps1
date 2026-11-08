# Lecture de la configuration, partagée par les scripts PowerShell (chargée par « . env.ps1 »).
# Même ordre que src/build/config.ts : variable d'environnement, puis .env, puis défaut.

$root = Split-Path -Parent $PSScriptRoot

function Get-EnvValue([string]$name, [string]$default) {
  $fromEnv = [Environment]::GetEnvironmentVariable($name)
  if ($fromEnv) { return $fromEnv.Trim() }
  $envFile = Join-Path $root ".env"
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -Encoding UTF8) {
      if ($line -match "^\s*$name\s*=\s*(.*)$") {
        $value = $Matches[1].Trim().Trim('"')
        if ($value) { return $value }
      }
    }
  }
  return $default
}
