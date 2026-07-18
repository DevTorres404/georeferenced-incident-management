$ErrorActionPreference = "Stop"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SGI - Suite Completa de Rendimiento" -ForegroundColor Cyan
Write-Host "========================================"
Write-Host ""

$baseDir = Split-Path $PSScriptRoot -Parent
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$logFile = Join-Path $baseDir "results\run-all-$timestamp.log"
Start-Transcript -Path $logFile

try {
    Write-Host "1/3 Smoke Test" -ForegroundColor Yellow
    & "$PSScriptRoot\run-smoke.ps1"
    Write-Host ""

    Write-Host "2/3 Load Test" -ForegroundColor Yellow
    & "$PSScriptRoot\run-load.ps1"
    Write-Host ""

    Write-Host "3/3 Stress Test requiere confirmación manual" -ForegroundColor Yellow
    Write-Host "Ejecutar: .\scripts-powershell\run-stress.ps1"
    Write-Host ""

    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Suite completada" -ForegroundColor Green
    Write-Host "  Log: $logFile" -ForegroundColor Green
    Write-Host "========================================"
} finally {
    Stop-Transcript
}
