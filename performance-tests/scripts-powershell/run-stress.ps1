param(
    [string]$BaseUrl = "",
    [string]$Email = "",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    Write-Error "k6 no está instalado."
    exit 1
}

$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
        }
    }
}

$baseUrl = if ($BaseUrl) { $BaseUrl } else { [Environment]::GetEnvironmentVariable("BASE_URL") }
$email = if ($Email) { $Email } else { [Environment]::GetEnvironmentVariable("TEST_EMAIL") }
$password = if ($Password) { $Password } else { [Environment]::GetEnvironmentVariable("TEST_PASSWORD") }

if (-not $baseUrl) { Write-Error "BASE_URL requerida"; exit 1 }
if (-not $email -or -not $password) { Write-Error "TEST_EMAIL y TEST_PASSWORD requeridas"; exit 1 }

$resultsDir = Join-Path $PSScriptRoot "..\results"
$jsonDir = Join-Path $resultsDir "json"
$htmlDir = Join-Path $resultsDir "html"
New-Item -ItemType Directory -Force -Path $jsonDir | Out-Null
New-Item -ItemType Directory -Force -Path $htmlDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$jsonFile = Join-Path $jsonDir "stress-$timestamp.json"
$htmlFile = Join-Path $htmlDir "stress-$timestamp.html"

Write-Host "⚠️  STRESS TEST - Ejecutar solo si el equipo lo autoriza" -ForegroundColor Red
Write-Host "URL: $baseUrl"
Write-Host "50 VUs pico, ~5 minutos"
Write-Host ""

$confirmation = Read-Host "¿Continuar? (s/N)"
if ($confirmation -ne "s") {
    Write-Host "Cancelado."
    exit 0
}

$envVars = "-e BASE_URL=$baseUrl -e TEST_EMAIL=$email -e TEST_PASSWORD=$password"
$scriptFile = Join-Path $PSScriptRoot "..\scripts\stress.js"
Invoke-Expression "k6 run $envVars --out json=$jsonFile --summary-export=$htmlFile $scriptFile"

Write-Host "=== Stress Test completado ===" -ForegroundColor Green
Write-Host "Resultados: $jsonFile"
