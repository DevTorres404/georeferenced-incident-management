# Análisis de Fallos - Quality Gate de SonarQube (New Code)

El Quality Gate para el **Nuevo Código** ha fallado debido a que no se cumplieron tres umbrales obligatorios de calidad. A continuación, se detallan los problemas bloqueantes y las áreas de mejora detectadas en el análisis más reciente.

## 1. Bugs de Confiabilidad y Accesibilidad (Reliability Issues)
> [!WARNING]
> **Estado:** 8 Issues (El umbral exige 0)
> **Impacto:** Falla directa del Quality Gate.

SonarQube detectó problemas de accesibilidad (regla `Web:S5256`) en las plantillas PDF. Según los estándares web (WCAG), las tablas de datos deben contener obligatoriamente etiquetas de encabezado `<th>`.

**Archivos afectados:**
- [operator-work-report.blade.php](file:///c:/Users/Damian/Documents/Desarrollo%20Web/georeferenced-incident-management/backend/resources/views/pdf/operator-work-report.blade.php) (3 incidencias)
- [incident-analytics-report.blade.php](file:///c:/Users/Damian/Documents/Desarrollo%20Web/georeferenced-incident-management/backend/resources/views/pdf/incident-analytics-report.blade.php) (3 incidencias)

**Solución sugerida:**
Reemplazar los `<td>` utilizados como encabezados por `<th>` dentro de las secciones `<thead>` de las tablas en estas vistas Blade.

---

## 2. Cobertura de Código Insuficiente (Coverage)
> [!IMPORTANT]
> **Estado:** 69.5% (El umbral exige mínimo 70%)
> **Impacto:** Falla directa del Quality Gate.

Las pruebas unitarias y de integración actuales no cubren la cantidad mínima requerida del código nuevo añadido en el último período.

**Solución sugerida:**
Añadir o extender pruebas (en PHPUnit o Jest/Vitest) para cubrir al menos un 0.5% adicional del código nuevo (ej. nuevos métodos en Controladores, Seeders o Casos de Uso).

---

## 3. Acumulación de Code Smells (Violations)
> [!NOTE]
> **Estado:** 115 Violaciones (El umbral exige 0 violaciones graves adicionales)
> **Impacto:** Falla directa del Quality Gate por degradación de mantenibilidad.

Se han introducido más de 100 advertencias menores de mantenibilidad ("Code Smells"). Aunque no son bugs que rompan la aplicación, degradan la limpieza del código.

**Principales infractores:**
- **Accesibilidad HTML:** En [about.html](file:///c:/Users/Damian/Documents/Desarrollo%20Web/georeferenced-incident-management/frontend/app/html/about.html) se usa `role="list"` en lugar de etiquetas nativas de lista (`<ul>`, `<ol>`, `<menu>`) (Regla `Web:S6819`).
- **Clean Code en PHP:** 
  - En [EcuadorIncidentSeeder.php](file:///c:/Users/Damian/Documents/Desarrollo%20Web/georeferenced-incident-management/backend/database/seeders/EcuadorIncidentSeeder.php): Código comentado que debería ser eliminado y variables locales que no cumplen el estándar de nombres (Regla PSR).
  - En [EloquentIncidentRepository.php](file:///c:/Users/Damian/Documents/Desarrollo%20Web/georeferenced-incident-management/backend/app/Incidents/Infrastructure/Persistence/Repositories/EloquentIncidentRepository.php): Exceso de puntos de retorno (`return`) en funciones.
  - En [RustFsProfilePhotoStorageAdapter.php](file:///c:/Users/Damian/Documents/Desarrollo%20Web/georeferenced-incident-management/backend/app/Auth/Infrastructure/Storage/RustFsProfilePhotoStorageAdapter.php): Propiedades que deberían estar marcadas como `readonly`.
- **Javascript (Frontend):** Varios archivos de presentación (ej. en `modules/incidents/presentation`) suman 25 code smells por convenciones de limpieza y complejidad.

**Solución sugerida:**
Aplicar un barrido de refactorización rápida enfocada en eliminar código comentado y corregir accesibilidad básica en las plantillas HTML para reducir drásticamente el conteo de violaciones.
