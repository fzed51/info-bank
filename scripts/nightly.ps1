# Traitement nocturne : synchro connect-bank -> données chiffrées -> publication GitHub Pages.
# Lancé par le Planificateur de tâches (voir register-task.ps1). Journal : <IB_DATA_DIR>\logs.
# Un échec de la synchro n'empêche pas la publication : l'app affiche alors un avertissement
# avec les données précédentes.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Même ordre que src/build/config.ts : variable d'environnement, puis .env, puis défaut.
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

$dataDir = Get-EnvValue "IB_DATA_DIR" (Join-Path $env:APPDATA "info-bank")
$connectBank = Get-EnvValue "CONNECT_BANK_DIR" "..\connect-bank"
if (-not [System.IO.Path]::IsPathRooted($connectBank)) { $connectBank = Join-Path $root $connectBank }
$logDir = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("nightly-{0:yyyy-MM-dd}.log" -f (Get-Date))

function Write-Log([string]$message) {
  $line = "{0:HH:mm:ss} {1}" -f (Get-Date), $message
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

# Lance une commande native, journalise sa sortie, renvoie son code de sortie.
function Invoke-Step([string]$label, [string]$dir, [string[]]$command) {
  Write-Log "--- $label"
  Push-Location $dir
  # En PowerShell 5.1, la sortie d'erreur d'une commande native redirigée devient une
  # ErrorRecord : avec « Stop », la moindre ligne sur stderr interromprait le script.
  $ErrorActionPreference = "Continue"
  try {
    $output = & $command[0] $command[1..($command.Length - 1)] 2>&1
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  # Les lignes de stderr arrivent en ErrorRecord : on garde leur texte, sans les lignes vides.
  $output = @($output | ForEach-Object { "$_".TrimEnd() } | Where-Object { $_ -and $_ -ne "System.Management.Automation.RemoteException" })
  foreach ($line in $output) { Write-Log "  $line" }
  Write-Log "    code de sortie : $code"
  return @{ Code = $code; Output = ($output | Out-String) }
}

Write-Log "=== Début"

# 1. Synchro bancaire (seule étape interactive de connect-bank : eb:link, tous les ~180 jours).
$fetch = Invoke-Step "connect-bank fetch" $connectBank @("node", "src/cli.ts", "fetch")
if ($fetch.Code -ne 0) {
  $reason = ($fetch.Output -split "`r?`n" | Where-Object { $_ -match "Erreur" } | Select-Object -First 1)
  if (-not $reason) { $reason = "code $($fetch.Code)" }
  $env:IB_SYNC_ERROR = ($reason -replace "^Erreur\s*:\s*", "").Trim()
} else {
  Remove-Item Env:IB_SYNC_ERROR -ErrorAction SilentlyContinue
}

# 2. Données chiffrées, puis 3. publication.
$data = Invoke-Step "build:data" $root @("npm.cmd", "run", "--silent", "build:data")
if ($data.Code -ne 0) { Write-Log "=== Échec (données)"; exit $data.Code }
$deploy = Invoke-Step "deploy" $root @("npm.cmd", "run", "--silent", "deploy")
if ($deploy.Code -ne 0) { Write-Log "=== Échec (publication)"; exit $deploy.Code }

# Journaux de plus de 30 jours supprimés.
Get-ChildItem $logDir -Filter "nightly-*.log" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force

if ($fetch.Code -ne 0) { Write-Log "=== Terminé avec une synchro en échec"; exit 2 }
Write-Log "=== Terminé"
