$ErrorActionPreference = "Stop"

$resultsDir = Join-Path $PSScriptRoot "..\results"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null
}

$csvFile = Join-Path $resultsDir "docker-stats.csv"

Write-Host "Iniciando monitoreo de Docker. Guardando en: $csvFile"
Write-Host "Presiona Ctrl+C para detener."

# Escribir cabecera
"Timestamp,Container,CPU %,Mem Usage,Mem Limit,Mem %" | Out-File -FilePath $csvFile -Encoding UTF8

try {
    while ($true) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $stats = docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}"
        
        foreach ($line in $stats) {
            if (-not [string]::IsNullOrWhiteSpace($line)) {
                # Format: ContainerName,CPU%,MemUsage / MemLimit,Mem%
                # Descomponer MemUsage
                $parts = $line.Split(',')
                if ($parts.Length -eq 4) {
                    $container = $parts[0]
                    $cpu = $parts[1].Replace("%", "")
                    $memParts = $parts[2].Split('/')
                    $memUsage = $memParts[0].Trim()
                    $memLimit = if ($memParts.Length -gt 1) { $memParts[1].Trim() } else { "" }
                    $memPerc = $parts[3].Replace("%", "")
                    
                    "$timestamp,$container,$cpu,$memUsage,$memLimit,$memPerc" | Out-File -FilePath $csvFile -Encoding UTF8 -Append
                }
            }
        }
        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Host "`nMonitoreo detenido."
}
