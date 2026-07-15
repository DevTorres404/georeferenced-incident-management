# Plan de remediacion SonarQube

Este documento concentra las tareas pendientes del proyecto `sgi`, ordenadas por riesgo y por dependencia. El siguiente analisis oficial solo debe ejecutarse desde un arbol Git limpio.

## Ruta critica

1. Cerrar las tareas **P0**.
2. Confirmar que la suite PHP permanece verde.
3. Revisar y confirmar los ocho Security Hotspots.
4. Ejecutar SonarScanner desde un commit limpio.
5. Conservar evidencia del Quality Gate y de la linea base generada.

## Estado verificado

| Dato | Resultado |
| --- | ---: |
| Fecha de referencia | 2026-07-15 |
| Rama | `fix/email-verification-production-https` |
| Version analizada | `3c4eadcbe9b8` |
| Estado del arbol analizado | `DIRTY=true` |
| Quality Gate | `ERROR` |
| Bugs | 13 |
| Vulnerabilidades | 39 |
| Security Hotspots | 8 |
| Code Smells | 616 |
| Cobertura global | 41,0 % |
| Cobertura de codigo nuevo | 2,7 % |
| Duplicacion global | 2,0 % |
| Deuda tecnica | 3.417 min (56 h 57 min) |
| Lineas de codigo | 36.860 |
| Complejidad ciclomatica | 5.797 |
| Complejidad cognitiva | 3.016 |
| Confiabilidad / Seguridad / Mantenibilidad | D / C / A |

La evidencia local mas reciente, pendiente de importacion en el siguiente analisis de SonarQube, termino con **117 pruebas efectivas, 645 assertions y cero fallos**. Persisten 110 warnings relacionados principalmente con la lectura de `/usr/src/backend/.env` dentro de la imagen de analisis.

## P0 — Bloqueadores del Quality Gate

### SQ-P0-01 — Establecer una linea base limpia

- [ ] Revisar y confirmar todos los cambios actuales del working tree.
- [ ] Crear commits coherentes sin mezclar trabajo no relacionado.
- [ ] Verificar que `git status --short` no produzca salida.
- [ ] Ejecutar el flujo oficial, no el scanner directo:

```powershell
.\scripts\sonarqube-scan.ps1
```

**Aceptacion:** el script no reporta `DIRTY=true`, publica la version del commit y genera `docs/e6/logs/linea-base-analisis.txt`.

### SQ-P0-02 — Corregir el bug nuevo

- [ ] Corregir `javascript:S7727` en `frontend/app/js/modules/incidents/presentation/incident-detail-page.js:1070`.
- [ ] No pasar `escapeHtml` directamente a `.map()`; usar una funcion que reciba solo el elemento esperado.
- [ ] Agregar o ajustar una prueba JavaScript cuando exista infraestructura de tests.

**Aceptacion:** `new_bugs=0` en el siguiente analisis.

### SQ-P0-03 — Revisar todos los Security Hotspots

- [ ] Revisar tres expresiones regulares con posible ReDoS en creacion/detalle de incidencias.
- [ ] Revisar tres usos de generadores pseudoaleatorios.
- [ ] Revisar dos usos de algoritmos hash debiles.
- [ ] Marcar cada hotspot como `SAFE`, `FIXED` o `ACKNOWLEDGED` con justificacion tecnica.

**Aceptacion:** `new_security_hotspots_reviewed=100%` y los ocho hotspots tienen resolucion documentada.

### SQ-P0-04 — Elevar la cobertura del codigo nuevo

- [ ] Identificar las lineas nuevas sin cobertura desde SonarQube.
- [ ] Agregar pruebas PHP enfocadas antes de modificar implementacion.
- [ ] Mantener la suite completa verde.
- [ ] No inventar cobertura JavaScript mientras no exista un runner real.

**Aceptacion:** `new_coverage>=70%` con Clover valido y suite sin fallos.

## P1 — Seguridad

### SQ-P1-01 — Restringir CORS

- [ ] Sustituir `allowed_origins => ['*']` por una allowlist configurable por entorno.
- [ ] Mantener separados desarrollo y produccion.
- [ ] Agregar pruebas para origen permitido y origen rechazado.

Archivo: `backend/config/cors.php:22`.

### SQ-P1-02 — Revisar el limite de adjuntos

- [ ] Confirmar si el limite de 10 MB responde a una regla de negocio.
- [ ] Validar MIME real, extension, almacenamiento y protecciones contra archivos maliciosos.
- [ ] Documentar la decision o ajustar el limite.

Archivo: `backend/app/Incidents/Infrastructure/Http/Controllers/IncidentController.php:475`.

### SQ-P1-03 — Proteger dependencias frontend externas

- [ ] Inventariar los 40 recursos CDN reportados por `Web:S5725`.
- [ ] Agregar `integrity` y `crossorigin` cuando el proveedor publique hashes estables.
- [ ] Preferir recursos locales versionados cuando SRI no sea viable.

**Aceptacion:** cero vulnerabilidades activas por ausencia injustificada de Subresource Integrity.

### SQ-P1-04 — Clasificar el falso positivo de contraseña

- [ ] Marcar `javascript:S2068` en `frontend/app/js/core/storage-keys.js:21` como falso positivo.
- [ ] Documentar que `passwordUpdated` es el nombre de una clave de mensaje y no contiene una contraseña.

## P1 — Confiabilidad funcional

- [ ] Corregir los 13 bugs activos, priorizando severidades Critical y Major.
- [ ] Verificar `frontend/app/js/layout/layout.js`: llamada con argumentos incompatibles.
- [ ] Verificar `frontend/app/js/modules/reports/presentation/reports-page.js`: `sort()` sin comparador.
- [ ] Corregir comparaciones `===` que Sonar identifica como siempre falsas.
- [ ] Confirmar que las instancias de `Chart` y `QRCode` se utilizan o eliminarlas.

**Aceptacion:** rating de confiabilidad A y cero bugs nuevos.

## P2 — Mantenibilidad

### Complejidad

- [ ] Dividir responsabilidades en `frontend/app/js/layout/layout.js` (complejidad cognitiva 289).
- [ ] Refactorizar `frontend/app/js/modules/auth/presentation/auth-page.js` (173).
- [ ] Refactorizar `backend/app/Incidents/Infrastructure/Persistence/Repositories/EloquentIncidentRepository.php` (160).
- [ ] Reducir funciones que incumplen `S3776` sin cambiar comportamiento.

### Duplicacion

- [ ] Revisar `frontend/app/js/layout/nav-items.js` (74,3 %).
- [ ] Revisar `frontend/app/html/register.html` (50,3 %).
- [ ] Revisar `frontend/app/index.html` (34,7 %).
- [ ] Extraer componentes o funciones solo cuando exista una abstraccion comun real.

### Accesibilidad y code smells

- [ ] Resolver problemas de contraste `css:S7924`.
- [ ] Agregar equivalentes de teclado a controles basados en eventos de mouse.
- [ ] Corregir etiquetas y atributos ARIA faltantes.
- [ ] Priorizar reglas Critical/Major antes de cambios cosmeticos como `window` a `globalThis`.

## P2 — Calidad de pruebas y analisis

- [ ] Eliminar los 110 warnings de PHPUnit sin copiar secretos a la imagen.
- [ ] Proveer configuracion de testing no sensible o evitar lecturas directas de `.env`.
- [ ] Incorporar un runner de pruebas JavaScript antes de configurar LCOV.
- [ ] Corregir los siete HTML con bytes invalidos para UTF-8.
- [ ] Evaluar acceso SCM de solo lectura para SonarScanner sin exponer secretos de `.git`.
- [ ] Mantener excluidos `backend/resources/views/scribe/**` y demas artefactos generados.

## Quality Gate objetivo

| Condicion sobre codigo nuevo | Criterio |
| --- | ---: |
| Bugs | 0 |
| Vulnerabilidades | 0 |
| Hotspots revisados | 100 % |
| Duplicacion | <= 3 % |
| Cobertura | >= 70 % |
| Mantenibilidad | A |

## Evidencia de cierre

Antes de considerar completada la remediacion:

- [ ] `git status --short` esta vacio.
- [ ] PHPUnit termina con exit code 0.
- [ ] Clover fue generado e importado.
- [ ] SonarScanner termina con exit code 0.
- [ ] Quality Gate aparece en verde.
- [ ] `docs/e6/logs/linea-base-analisis.txt` identifica commit, rama y versiones.
- [ ] Las capturas E6-01 a E6-10 fueron actualizadas.
- [ ] No existen tokens, contraseñas ni archivos `.env` versionados.

## Fuera de alcance del conteo actual

Los 623 issues historicos de `backend/resources/views/scribe/index.blade.php` estan cerrados y no forman parte de las metricas activas. No deben reabrirse ni corregirse manualmente; el archivo generado debe permanecer excluido.
