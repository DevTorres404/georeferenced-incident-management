# 🤖 Guía para Agentes de IA en este Backend

¡Hola futuro agente de IA! Si estás leyendo este archivo, es porque estás a punto de interactuar con el código base de este backend. 

Este proyecto **NO** sigue un patrón MVC tradicional de Laravel. Hemos implementado una **Arquitectura Hexagonal (Ports and Adapters)** estrictamente separada por **Dominios de Negocio (Bounded Contexts)**.

Para mantener la integridad del código, **DEBES** seguir las siguientes reglas arquitectónicas bajo cualquier circunstancia. No tomes atajos, no importa qué tan pequeño sea el cambio.

---

## 🏛️ Estructura de Capas (El Hexágono)

El código está organizado dentro de la carpeta `app/` en módulos (Ej. `Auth/`, `Incidents/`, `Users/`). Cada módulo tiene **siempre** 3 carpetas principales:

### 1. `Domain/` (La Capa más Interna)
**Regla de Oro:** Esta capa NO puede importar ABSOLUTAMENTE NADA de Laravel, Eloquent o de la capa de Infraestructura. Es código PHP puro y agnóstico.
- **`Entities/`**: Objetos PHP puros. No extienden de `Model`.
- **`Repositories/`** (Ports): Interfaces que definen los contratos para guardar o buscar datos. 
- **`Exceptions/`**: Clases de excepción personalizadas (Ej. `AuthException`).

### 2. `Application/` (El Orquestador)
**Regla de Oro:** Esta capa NO puede usar Facades de Laravel (`Log::info()`, `Auth::user()`) ni devolver respuestas HTTP. Solo dicta "qué debe hacer el sistema".
- **`UseCases/`**: Clases con un método `execute()` que orquestan el flujo de negocio.
- **`DTOs/`**: Clases de datos inmutables. **Está PROHIBIDO usar "arrays mágicos" (ej. `array $data`)** para pasar información desde el controlador al caso de uso o al dominio. Siempre crea y exige un DTO.
- **`Ports/`**: Interfaces para servicios externos (Ej. `LoggerPort`, `SessionManagerPort`).

### 3. `Infrastructure/` (La Capa Externa)
**Regla de Oro:** Es la única capa autorizada para tocar la base de datos (Eloquent), leer Request HTTP o enviar Responses.
- **`Http/Controllers/`**: Reciben el request, validan, construyen el DTO, lo pasan al UseCase, y envuelven la respuesta en un JSON.
- **`Persistence/Models/`**: Modelos clásicos de Eloquent.
- **`Persistence/Repositories/`**: Implementaciones de Eloquent que cumplen con el contrato de la capa de Dominio. 
  - **CRÍTICO:** Estos repositorios **NO DEBEN** devolver Modelos de Eloquent. Tienen la obligación de utilizar un `Mapper` para traducir el Modelo de Eloquent a una Entidad Pura del Dominio antes de retornarlo.

---

## 🛑 Lo que NUNCA debes hacer (Anti-patrones Prohibidos)

1. **NO usar helpers HTTP en el dominio o aplicación:** Nunca escribas `abort(403)` o `response()` dentro de un Caso de Uso o Entidad. Lanza una Excepción del Dominio y deja que el framework la maneje en la capa HTTP.
2. **NO pasar arrays genéricos (`$data`) a la capa de aplicación/dominio:** Usa y crea `DTOs` (Data Transfer Objects) con tipado estricto. (Ej. `CreateUserInputData`).
3. **NO filtrar la infraestructura hacia adentro:** NUNCA escribas un `use App\...\Infrastructure\Persistence\Models\User` dentro de la carpeta `Domain/` o `Application/`.

## ✅ Lo que SIEMPRE debes hacer
1. **Desacoplar con Puertos:** Si necesitas enviar un email, no uses la fachada `Mail::send` en el Caso de Uso. Crea un puerto `EmailSenderPort` en `Application/Ports`, inyéctalo en el Caso de Uso, y crea su adaptador real en `Infrastructure/`.
2. **Mantener la inversión de dependencias:** Los controladores dependen de los Casos de Uso, los Casos de Uso dependen de las Interfaces de Repositorio (Dominio). La Infraestructura implementa esas Interfaces de Repositorio.

---

## 🌐 Convenciones de Idioma (¡MUY IMPORTANTE!)

Todo este backend fue refactorizado para separar estrictamente el código de los datos del usuario:

1. **Código en INGLÉS:** Absolutamente todo el código (nombres de clases, archivos, métodos, controladores, rutas API, variables, propiedades DTO, columnas y tablas de base de datos) **debe estar en INGLÉS** (Ej. `IncidentController`, `title`, `description`).
2. **Datos en ESPAÑOL:** Toda la información de negocio y metadatos que se inyecte a la base de datos (Ej. los textos en los Seeders, descripciones de configuración, estados, y **nombres de permisos** como `incidencias.ver` o `comentarios.crear`) **deben permanecer estrictamente en ESPAÑOL**.

> Recuerda: El objetivo de este diseño es que el día de mañana podamos arrancar la carpeta `Domain` y `Application` y llevarlas a un framework de PHP distinto (como Symfony) sin cambiar ni una sola línea de código en ellas. ¡Actúa en consecuencia!
