[CmdletBinding()]
param([string]$HealthTimeoutSeconds = $env:SONARQUBE_HEALTH_TIMEOUT)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ComposeFile = Join-Path $RootDir 'docker-compose.sonar.yml'
$Compose = @('compose', '--project-directory', $RootDir, '-f', $ComposeFile)

function Invoke-NativeCapture([string]$FilePath, [string[]]$Arguments) {
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $Output = @(& $FilePath @Arguments 2>&1)
        $ExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
    [pscustomobject]@{ Output = $Output; ExitCode = $ExitCode }
}

function Convert-OutputToText($Result) {
    (($Result.Output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Invoke-Docker([string[]]$Arguments) {
    $Result = Invoke-NativeCapture 'docker' $Arguments
    $Result.Output | ForEach-Object { Write-Host "$_" }
    if ($Result.ExitCode -ne 0) { throw "Docker command failed with exit code $($Result.ExitCode)." }
}

if ([string]::IsNullOrWhiteSpace($HealthTimeoutSeconds)) { $HealthTimeoutSeconds = '360' }
$TimeoutSeconds = 0
if (-not [int]::TryParse($HealthTimeoutSeconds, [ref]$TimeoutSeconds) -or $TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 1800) {
    throw 'SONARQUBE_HEALTH_TIMEOUT must be an integer from 1 to 1800 seconds.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed or is not in PATH.' }
$DockerInfo = Invoke-NativeCapture 'docker' @('info')
if ($DockerInfo.ExitCode -ne 0) { throw 'Docker is not running or the current user cannot access it.' }
$ComposeVersion = Invoke-NativeCapture 'docker' @('compose', 'version')
if ($ComposeVersion.ExitCode -ne 0) { throw 'Docker Compose v2 is required.' }
if (-not (Test-Path (Join-Path $RootDir '.env'))) { throw "Missing $RootDir\.env. Copy .env.example to .env and replace the placeholder passwords." }
$PlaceholderPassword = Select-String -Path (Join-Path $RootDir '.env') -Pattern '^\s*(SONAR_DB_PASSWORD|ANALYSIS_DB_PASSWORD)\s*=\s*change_this_' -Quiet
if ($PlaceholderPassword) { throw 'Replace the example database passwords in .env before starting SonarQube.' }

Invoke-Docker ($Compose + @('up', '-d', 'sonarqube-db', 'sonarqube'))

Write-Host "Waiting for SonarQube health (timeout: $TimeoutSeconds s)..."
$Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $Deadline) {
    $ContainerResult = Invoke-NativeCapture 'docker' ($Compose + @('ps', '-q', 'sonarqube'))
    $ContainerId = Convert-OutputToText $ContainerResult
    if ($ContainerResult.ExitCode -eq 0 -and $ContainerId) {
        $HealthResult = Invoke-NativeCapture 'docker' @('inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', $ContainerId)
        $Health = Convert-OutputToText $HealthResult
        if ($HealthResult.ExitCode -eq 0 -and $Health -eq 'healthy') {
            $PortResult = Invoke-NativeCapture 'docker' ($Compose + @('port', 'sonarqube', '9000'))
            $PublishedEndpoint = Convert-OutputToText $PortResult
            if (-not $PublishedEndpoint) { $PublishedEndpoint = '127.0.0.1:9002' }
            Write-Host "SonarQube is healthy at http://$PublishedEndpoint."
            return
        }
        $StateResult = Invoke-NativeCapture 'docker' @('inspect', '--format', '{{.State.Status}}', $ContainerId)
        if ((Convert-OutputToText $StateResult) -eq 'exited') {
            Invoke-Docker ($Compose + @('logs', '--tail=100', 'sonarqube'))
            throw 'SonarQube exited before becoming healthy.'
        }
    }
    Start-Sleep -Seconds 5
}

Invoke-Docker ($Compose + @('logs', '--tail=100', 'sonarqube'))
throw "SonarQube did not become healthy within $TimeoutSeconds seconds."
