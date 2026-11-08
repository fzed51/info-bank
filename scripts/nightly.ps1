# Traitement nocturne : synchro connect-bank -> données chiffrées -> publication GitHub Pages.
# Lancé par le Planificateur de tâches (voir register-task.ps1). Journal : <IB_DATA_DIR>\logs.
# Un échec de la synchro n'empêche pas la publication : l'app affiche alors un avertissement
# avec les données précédentes. Chaque échec est aussi signalé par mail (notify.ps1).

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env.ps1")
Set-Location $root

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
  return @{ Label = $label; Code = $code; Output = ($output | Out-String) }
}

# Motif d'échec d'une étape : sa première ligne « Erreur : … », à défaut son code de sortie.
# Seule cette ligne part dans le mail, jamais la sortie complète (qui peut contenir des données).
function Get-FailureReason($step) {
  $reason = ($step.Output -split "`r?`n" | Where-Object { $_ -match "Erreur" } | Select-Object -First 1)
  if (-not $reason) { return "code $($step.Code)" }
  return ($reason -replace "^\s*Erreur\s*:\s*", "").Trim()
}

# Un échec de notification est journalisé mais ne change pas le résultat du traitement.
function Send-Alert([string]$title, [string]$stepLabel, [string]$reason, [string]$hint) {
  $lines = @(
    ("Traitement nocturne info-bank du {0:dd/MM/yyyy HH:mm} : {1}." -f (Get-Date), $title),
    "",
    "Étape : $stepLabel",
    "Motif : $reason"
  )
  if ($hint) { $lines += $hint }
  $lines += @("", "Journal : $log")
  try {
    & (Join-Path $PSScriptRoot "notify.ps1") -Subject "info-bank : $title" -Body ($lines -join "`r`n")
    Write-Log "    notification envoyée"
  } catch {
    $messages = @()
    $e = $_.Exception
    while ($e) { $messages += $e.Message; $e = $e.InnerException }
    Write-Log "    notification impossible : $($messages -join ' / ')"
  }
}

Write-Log "=== Début"

try {
  # 1. Synchro bancaire (seule étape interactive de connect-bank : eb:link, tous les ~180 jours).
  $fetch = Invoke-Step "connect-bank fetch" $connectBank @("node", "src/cli.ts", "fetch")
  if ($fetch.Code -ne 0) {
    $env:IB_SYNC_ERROR = Get-FailureReason $fetch
  } else {
    Remove-Item Env:IB_SYNC_ERROR -ErrorAction SilentlyContinue
  }

  # 2. Données chiffrées, puis 3. publication.
  $data = Invoke-Step "build:data" $root @("npm.cmd", "run", "--silent", "build:data")
  if ($data.Code -ne 0) {
    Write-Log "=== Échec (données)"
    Send-Alert "échec de la génération des données" $data.Label (Get-FailureReason $data) "Le site garde les données de la veille."
    exit $data.Code
  }
  $deploy = Invoke-Step "deploy" $root @("npm.cmd", "run", "--silent", "deploy")
  if ($deploy.Code -ne 0) {
    Write-Log "=== Échec (publication)"
    Send-Alert "échec de la publication" $deploy.Label (Get-FailureReason $deploy) "Le site garde les données de la veille."
    exit $deploy.Code
  }

  # Journaux de plus de 30 jours supprimés.
  Get-ChildItem $logDir -Filter "nightly-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

  if ($fetch.Code -ne 0) {
    Write-Log "=== Terminé avec une synchro en échec"
    Send-Alert "synchro bancaire en échec" $fetch.Label $env:IB_SYNC_ERROR "Données de la veille republiées. Consentement expiré ? Relancer eb:link dans connect-bank."
    exit 2
  }
  Write-Log "=== Terminé"
} catch {
  Write-Log "=== Erreur inattendue : $($_.Exception.Message)"
  Send-Alert "erreur inattendue" "nightly.ps1" $_.Exception.Message ""
  exit 1
}
