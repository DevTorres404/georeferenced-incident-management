# Convenciones de Commits - GIC (Georeferenced Incident Management)

## 📋 Visión General

Este proyecto sigue **Conventional Commits** - una especificación para agregar significado a los mensajes de commit. Los commits siguen el formato:

```
type(scope): description

[optional body]

[optional footer(s)]
```

---

## 🏷️ Tipos de Commits

| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| **feat** | Nueva característica/funcionalidad | `feat(auth): agregar autenticación con OAuth` |
| **fix** | Corrección de bug | `fix(incidents): resolver filtro de estados` |
| **refactor** | Cambio de código sin alterar funcionalidad | `refactor(catalogs): extraer mappers a DTO` |
| **docs** | Cambios en documentación | `docs(readme): agregar guía de despliegue` |
| **test** | Agregar o actualizar tests | `test(auth): agregar tests de login` |
| **chore** | Tareas de mantenimiento, actualizaciones de dependencias | `chore(docker): actualizar versión de PostgreSQL` |
| **style** | Cambios de formato/estilos (no afectan lógica) | `style(code): aplicar PSR-12` |
| **perf** | Mejoras de performance | `perf(db): agregar índices en tabla incidents` |
| **ci** | Cambios en CI/CD | `ci(github): agregar workflow de tests` |

---

## 🎯 Scopes Principales

Los scopes definen **qué parte del proyecto** fue modificada:

### Backend (Laravel)
- **docker**: Docker Compose, configuración de contenedores
- **db**: Migraciones, seeders, schema de BD
- **auth**: Autenticación, usuarios, roles, permisos
- **incidents**: Módulo de incidencias
- **catalogs**: Datos de referencia (países, ciudades, estados)
- **audit**: Auditoría y trazabilidad
- **config**: Configuración general (.env, settings)
- **deps**: Dependencias (composer.json, package.json)
- **api**: Rutas y endpoints API
- **tests**: Tests unitarios y funcionales
- **arch**: Cambios arquitectónicos (hexagonal)

### Frontend (si aplica en el futuro)
- **ui**: Componentes visuales
- **pages**: Páginas/vistas
- **store**: Estado (Redux, Vuex, etc.)
- **api**: Cliente HTTP

### General
- **repo**: Archivos de repositorio (.gitignore, LICENSE, etc.)
- **readme**: Documentación principal
- **workflow**: Procesos y guías de trabajo

---

## ✍️ Reglas de Escritura

### Estructura Básica
```
type(scope): descripcion concisa
```

### Reglas Obligatorias

1. **Usa ESPAÑOL** en todo el commit (descripción, body, footer)
2. **Tipo en minúsculas**: `feat`, `fix`, `refactor` (NO `Feat`, `Fix`)
3. **Scope en minúsculas**: `auth`, `docker`, `incidents` (NO `Auth`, `Docker`)
4. **Descripción concisa** (máx 50 caracteres): sé directo y específico
5. **Imperativo presente**: "agregar", "corregir", "refactorizar" (NO "agregado", "corregido")
6. **Sin punto al final** de la descripción
7. **Primera línea es el resumen**: nunca incluyas detalles en la primera línea

### Descripción (Línea 1)
- Máximo **50 caracteres**
- Comienza con verbo en imperativo: "agregar", "actualizar", "corregir", "refactorizar"
- Describe QUÉ cambió, no por qué
- Específico y memorable

### Body (Opcional - línea 3+)
- Explicación detallada del cambio
- Por qué se hizo (motivación)
- Comportamiento anterior vs nuevo
- Problemas que resuelve
- Separado de la descripción por una línea en blanco

### Footer (Opcional)
- Referencias a issues/PRs: `Closes #123`, `Fixes #456`
- Breaking changes: `BREAKING CHANGE: descripción`
- Co-authored: `Co-authored-by: nombre <email>`

---

## 📝 Ejemplos

### ✅ CORRECTO

```
feat(auth): implementar OAuth con Google

Agrega autenticación con OAuth 2.0 usando Google como proveedor.
Permite a usuarios registrarse e iniciar sesión con sus cuentas de Google.
Incluye email verification y creación automática de usuario.

Closes #42
```

```
fix(incidents): resolver filtro de estados en listado

El filtro de estados estaba retornando resultados incorrectos porque
no consideraba los estados inactivos. Ahora valida correctamente
solo estados activos según el scope activos().

Fixes #128
```

```
refactor(catalogs): extraer mappers a DTOs

Crea mappers en Infrastructure para convertir Models a DTOs.
Elimina acoplamiento entre Application y Infrastructure.
Sigue patrón hexagonal de arquitectura.

- CountryMapper
- ProvinceMapper
- StateMapper
- RoleMapper
```

```
chore(docker): actualizar imagen de PostgreSQL a 15.1

Actualiza version de PostgreSQL en docker-compose.yml
de 14.5 a 15.1 para seguridad y performance.
```

```
docs(readme): agregar guia de despliegue local

Agrega sección de quick start y requisitos previos.
Documenta comando de docker-compose y migraciones.
```

### ❌ INCORRECTO

```
Agregado autenticación OAuth
- No especifica scope
- No usa tipo (feat/fix/etc)
- Verbo en pasado

Updated everything
- Muy vago, no describe qué cambió
- Sin scope

fix: corrección
- Scope faltante
- Descripción muy corta

Refactor(catalogs): Extraer mappers a DTOs
- Tipo con mayúscula
- Punto al final (removido)

feat(auth): agregamos OAuth con Google
- Verb no es imperativo
```

---

## 🚀 Flujo de Trabajo Recomendado

### 1. Antes de Hacer Commits
```bash
# Asegúrate de estar en rama de feature
git checkout -b damiantorres/nombre-feature

# Realiza los cambios
# ...

# Verifica qué cambió
git status
git diff
```

### 2. Crear Commits
```bash
# Commit individual (cambio atómico)
git commit -m "type(scope): descripcion concisa"

# Para multi-línea con body
git commit
# Se abre editor, escribes:
# type(scope): descripcion
#
# Body explicativo...
#
# Closes #123
```

### 3. Ejemplo Completo
```bash
# Feature completa con múltiples commits
git commit -m "feat(incidents): agregar estado de resolucion"
git commit -m "feat(incidents): crear transicion a estado resuelto"
git commit -m "test(incidents): agregar tests de resolucion"
git commit -m "docs(incidents): actualizar guia de flujo"

# Push a rama
git push origin damiantorres/nombre-feature
```

---

## 📊 Commit Patterns por Módulo

### Auth Module
```
feat(auth): implementar 2FA con TOTP
feat(auth): agregar recuperación de contraseña
fix(auth): validar email en registro
refactor(auth): extraer lógica de password hashing
```

### Incidents Module
```
feat(incidents): agregar filtro por prioridad
feat(incidents): implementar notificaciones en tiempo real
fix(incidents): corregir calculo de SLA
refactor(incidents): restructurar DTOs con mappers
```

### Catalogs Module
```
feat(catalogs): agregar CRUD para nuevas categorías
fix(catalogs): validar unicidad de códigos
refactor(catalogs): refactorizar repository a DTOs
```

### Database/Docker
```
chore(db): crear migración de tabla nueva
chore(docker): actualizar versión de Redis
fix(docker): resolver puerto ocupado en postgresql
```

### Documentation
```
docs(readme): agregar guia de instalación
docs(api): documentar endpoint de incidencias
docs(arch): explicar arquitectura hexagonal
```

---

## 🔍 Validación de Commits

Antes de hacer push, verifica que tu commit cumpla:

- [ ] Tipo válido: feat, fix, refactor, docs, test, chore, style, perf, ci
- [ ] Scope específico y minúsculo
- [ ] Descripción en imperativo presente
- [ ] Descripción máx 50 caracteres
- [ ] Sin punto al final
- [ ] Escrito en ESPAÑOL
- [ ] Body (si existe) explica el POR QUÉ
- [ ] Referencias a issues en footer

---

## 📌 Notas Importantes

1. **Un commit = Un cambio atómico**: cada commit debe ser independiente y funcional
2. **Commits pequeños > commits grandes**: es más fácil revisar y revertir
3. **Mensaje claro = menos preguntas**: invierte tiempo en escribir bien
4. **Historial limpio = equipo feliz**: commits bien nombrados hacen fácil navegar historia

---

## 🔗 Referencias

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Angular Commit Guidelines](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#commit)
- [Git Documentation](https://git-scm.com/doc)

---

## ✨ Última Actualización

**Versión:** 1.0  
**Fecha:** 2026-06-20  
**Autor:** GIC Team  
**Estado:** En vigencia
