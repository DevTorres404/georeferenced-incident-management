# SGI — Pruebas de Rendimiento y Estrés

Suite profesional de pruebas de rendimiento con [k6](https://k6.io/) para el Sistema Web de Gestión de Incidencias Georreferenciadas.

## Propósito

Evaluar el comportamiento del sistema bajo diferentes condiciones de carga, identificar cuellos de botella y garantizar que los thresholds de calidad se cumplan antes de liberar a producción.

## Requisitos

- [k6](https://k6.io/docs/getting-started/installation/) v0.48+
- Windows PowerShell 5.1+ (para scripts `.ps1`)
- Ubuntu Server 22.04+ (para monitoreo)

### Instalación de k6

**Windows (PowerShell):**
```powershell
winget install k6
# o
choco install k6
```

**Ubuntu:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## Variables de Entorno

Copia `.env.example` como `.env`:

```env
BASE_URL=https://api.labtorres.me
TEST_EMAIL=tu_usuario_de_prueba@ejemplo.com
TEST_PASSWORD=tu_contraseña_de_prueba
TEST_TOKEN=token_generado_manualmente (opcional)
```

## Escenarios

| Escenario | Archivo | VUs | Duración | Ejecución |
|-----------|---------|-----|----------|-----------|
| Smoke | `scripts/smoke.js` | 1 | 30s | Automática |
| Carga normal | `scripts/load.js` | 0→10→0 | 3min | Automática |
| Concurrencia | `scripts/authenticated-read.js` | 25 | 2min | Automática |
| Login | `scripts/login.js` | 1→3→5 | 1.5min | Automática |
| Mapa | `scripts/map.js` | 10 | 1min | Automática |
| Estrés | `scripts/stress.js` | 0→50→0 | 5min | **Manual** |
| Creación | `scripts/create-incident.js` | 5 | 1min | **Manual** |
| Subida imágenes | `scripts/upload-image.js` | 3 | 1min | **Manual** |

## Ejecución

### Pruebas seguras (automáticas)

```powershell
# Smoke test
.\scripts-powershell\run-smoke.ps1

# Carga normal
.\scripts-powershell\run-load.ps1

# Todas las pruebas automáticas
.\scripts-powershell\run-all.ps1
```

### Pruebas con npm (requiere k6 en PATH)

```bash
npm run test:smoke
npm run test:load
npm run test:all
```

### Pruebas manuales (requieren autorización)

```powershell
.\scripts-powershell\run-stress.ps1
k6 run scripts\create-incident.js
k6 run scripts\upload-image.js
```

### Ejecución directa con k6

```bash
k6 run scripts/login.js -e BASE_URL=https://api.labtorres.me -e TEST_EMAIL=... -e TEST_PASSWORD=...
```

## Interpretación de Resultados

### p95 (Percentil 95)
El 95% de las peticiones se completaron en ese tiempo o menos. Si el p95 de lectura supera 2000ms, hay un problema de rendimiento.

### Throughput (requests/segundo)
Cuantas peticiones por segundo soporta el sistema. Disminuye cuando el servidor está saturado.

### Tasa de errores
Porcentaje de peticiones que fallaron. Sobre 1% en lecturas es señal de problema.

## Monitoreo del Servidor

Los scripts en `server-monitoring/` deben ejecutarse en el servidor Ubuntu:

```bash
cd server-monitoring
chmod +x *.sh

# Antes de las pruebas
./collect-system-info.sh

# Durante las pruebas (segundo plano)
./monitor-docker.sh 10 10 &
./collect-postgresql-metrics.sh

# Después de las pruebas
./collect-logs.sh
```

## Riesgos

- Ejecutar stress test contra producción puede degradar la experiencia de usuarios reales.
- La creación de incidencias de prueba puede llenar la BD si no se limpian.
- La subida de imágenes consume almacenamiento.
- El rate limiting (5 intentos/min en login) puede dar falsos positivos en login tests.

## Archivos Ignorados

Los siguientes archivos NO se suben a Git (`.gitignore`):

- `.env` — credenciales reales
- `results/` — reportes generados
- `screenshots/` — capturas
- `data/test-users.json` — usuarios reales
- `data/sample-image.jpg` — imágenes reales
