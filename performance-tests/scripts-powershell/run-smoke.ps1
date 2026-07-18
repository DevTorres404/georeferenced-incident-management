param(
    [string]$BaseUrl = "",
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

# Validar k6
if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    Write-Error "k6 no está instalado. Instálalo desde https://k6.io/docs/getting-started/installation/"
    exit 1
}

# Cargar .env si existe
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
        }
    }
}

$baseUrl = if ($BaseUrl) { $BaseUrl } else { [Environment]::GetEnvironmentVariable("BASE_URL") }
$token = if ($Token) { $Token } else { [Environment]::GetEnvironmentVariable("TEST_TOKEN") }

if (-not $baseUrl) {
    Write-Error "BASE_URL no está definida. Configúrala en .env o pásala como parámetro -BaseUrl"
    exit 1
}

$resultsDir = Join-Path $PSScriptRoot "..\results"
$jsonDir = Join-Path $resultsDir "json"
$htmlDir = Join-Path $resultsDir "html"
New-Item -ItemType Directory -Force -Path $jsonDir | Out-Null
New-Item -ItemType Directory -Force -Path $htmlDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$jsonFile = Join-Path $jsonDir "smoke-$timestamp.json"
$htmlFile = Join-Path $htmlDir "smoke-$timestamp.html"

Write-Host "=== Smoke Test ===" -ForegroundColor Cyan
Write-Host "URL: $baseUrl"
Write-Host "JSON: $jsonFile"
Write-Host "HTML: $htmlFile"
Write-Host ""

$envVars = "-e BASE_URL=$baseUrl"
if ($token) {
    $envVars += " -e TEST_TOKEN=$token"
}

$scriptFile = Join-Path $PSScriptRoot "..\scripts\smoke.js"
$cmd = "k6 run $envVars --out json=$jsonFile --summary-export=$htmlFile $scriptFile"
Write-Host "Ejecutando: k6 run ..." -ForegroundColor Gray
Invoke-Expression $cmd

Write-Host ""
Write-Host "=== Smoke Test completado ===" -ForegroundColor Green
Write-Host "Resultados: $jsonFile"
Write-Host "Reporte: $htmlFile"
