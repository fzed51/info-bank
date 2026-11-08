# Envoie un mail de notification (utilisé par nightly.ps1 en cas d'échec).
# Configuration dans .env : NOTIFY_FROM, NOTIFY_TO, NOTIFY_SMTP_PASSWORD (voir .env.example).
# Essai : powershell -ExecutionPolicy Bypass -File scripts\notify.ps1 -Subject "Test" -Body "Essai"
param(
  [Parameter(Mandatory = $true)][string]$Subject,
  [Parameter(Mandatory = $true)][string]$Body
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env.ps1")

$from = Get-EnvValue "NOTIFY_FROM" ""
$to = Get-EnvValue "NOTIFY_TO" ""
$password = Get-EnvValue "NOTIFY_SMTP_PASSWORD" ""
$missing = @(
  @{ Name = "NOTIFY_FROM"; Value = $from },
  @{ Name = "NOTIFY_TO"; Value = $to },
  @{ Name = "NOTIFY_SMTP_PASSWORD"; Value = $password }
) | Where-Object { -not $_.Value } | ForEach-Object { $_.Name }
if ($missing) { throw "notification non configurée : $($missing -join ', ') absent de .env" }

$user = Get-EnvValue "NOTIFY_SMTP_USER" $from
$smtpHost = Get-EnvValue "NOTIFY_SMTP_HOST" "ssl0.ovh.net"
$port = [int](Get-EnvValue "NOTIFY_SMTP_PORT" "587")

# .NET Framework peut encore proposer d'anciens protocoles par défaut : TLS 1.2 au minimum.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$utf8 = [Text.Encoding]::UTF8
$message = New-Object System.Net.Mail.MailMessage
$message.From = New-Object System.Net.Mail.MailAddress($from, "info-bank", $utf8)
$message.To.Add($to)
$message.Subject = $Subject
$message.Body = $Body
$message.SubjectEncoding = $utf8
$message.BodyEncoding = $utf8

# EnableSsl = STARTTLS : SmtpClient ne gère pas le TLS implicite du port 465, d'où le 587.
$client = New-Object System.Net.Mail.SmtpClient($smtpHost, $port)
$client.EnableSsl = $true
$client.Credentials = New-Object System.Net.NetworkCredential($user, $password)
$client.Timeout = 30000
try {
  $client.Send($message)
} finally {
  $message.Dispose()
  $client.Dispose()
}
