# Enregistre la tâche planifiée nocturne (utilisateur courant, sans droits administrateur).
# Usage : powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1 [-At 04:00]
param([string]$At = "04:00")

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "nightly.ps1"
$taskName = "info-bank nightly"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`"" `
  -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# WakeToRun : sort l'ordinateur de veille. StartWhenAvailable : rattrape une exécution manquée.
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RunOnlyIfNetworkAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Description "Synchro connect-bank, données chiffrées et publication GitHub Pages" `
  -Force | Out-Null
Write-Output "Tâche « $taskName » enregistrée : tous les jours à $At."
Write-Output "Test immédiat : Start-ScheduledTask -TaskName '$taskName'"
