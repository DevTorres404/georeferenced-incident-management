# Stack Tecnológico: Sistema de Gestión de Incidencias Georreferenciadas (SGIG)

Este documento detalla la arquitectura, tecnologías, frameworks y librerías utilizadas en el desarrollo del proyecto SGIG, separado por sus capas lógicas.

---

## 1. Arquitectura General del Sistema

El proyecto sigue un enfoque de **Sistemas Distribuidos** con un acoplamiento débil entre el Frontend y el Backend. Se comunica exclusivamente a través de una **API RESTful**. 

El diseño del código (especialmente en el backend y la estructuración del frontend) está fuertemente inspirado en los principios de **Domain-Driven Design (DDD)**, dividiendo las responsabilidades en capas claras: Infraestructura, Aplicación, Dominio y Presentación.

---

## 2. Backend (API & Core Logic)

El motor principal de procesamiento, autenticación y manejo de base de datos.

- **Lenguaje Base:** PHP 8.3+
- **Framework Principal:** Laravel (Versiones recientes 11.x / 13.x)
- **Patrón de Diseño:** DDD Multicapa (Módulos independientes como `Auth`, `Incidents`, `Catalogs`, `Audit`).

### Dependencias y Librerías (Composer)
- **Autenticación y Seguridad:**
  - `laravel/sanctum`: Gestión de autenticación por Tokens (Bearer Tokens) para la API REST.
  - `pragmarx/google2fa`: Implementación de Autenticación de Dos Factores (2FA) basada en TOTP (Google Authenticator / Authy).
- **Documentación de API:**
  - `knuckleswtf/scribe`: Generación automática de documentación interactiva para la API basada en el código y comentarios.
- **Integraciones de Terceros:**
  - `kreait/laravel-firebase`: Integración con los servicios de Google Firebase (usualmente para notificaciones push en tiempo real u otros servicios cloud).
- **Manejo de Caché y Colas:**
  - `predis/predis`: Cliente de Redis para optimización de consultas, manejo de sesiones de alto rendimiento y colas de trabajos asíncronos.
- **Testing y Calidad de Código:**
  - `phpunit/phpunit`: Framework principal para pruebas unitarias y de integración (Feature tests).
  - `laravel/pint`: Linter y formateador de código estandarizado.
  - `fakerphp/faker`: Generación de datos falsos (dummy data) para pruebas y seeders.
  - `mockery/mockery`: Creación de mocks para pruebas unitarias complejas.

---

## 3. Frontend (Interfaz de Usuario)

La interfaz gráfica del usuario está construida utilizando un enfoque clásico y robusto de **Multi-Page Application (MPA)**, pero potenciado con JavaScript moderno para dar una sensación de fluidez similar a una SPA (Single-Page Application).

- **Lenguajes Base:** HTML5, CSS3, JavaScript Vanilla (ES6+)
- **Patrón de Estructura JS:** Separación modular en carpetas (`infrastructure`, `presentation`, `application`).

### Frameworks, Plantillas y Librerías UI
- **Plantilla Administrativa:** AdminLTE 3 (Provee la estructura visual, menú lateral responsivo y componentes de tarjetas).
- **Framework CSS:** Bootstrap 4 (Incluido como base de AdminLTE para la grilla y responsividad).
- **Librería de Componentes / DOM:** jQuery (Requisito fundamental de AdminLTE para el funcionamiento de los modales, dropdowns y colapsos del menú).
- **Iconografía:** FontAwesome 5/6 (Utilizado para toda la simbología visual del sistema, alertas, etc.).

### Técnicas de Rendimiento Nativas implementadas
- **Almacenamiento Local:** Uso intensivo de `sessionStorage` y `localStorage` para caché de notificaciones y persistencia de sesión JWT.
- **Anti-FOUC & Navigation Store:** Sistema personalizado en JavaScript (`layout.js`) para prevenir recargas innecesarias de API y evitar parpadeos de CSS.

---

## 4. Base de Datos e Infraestructura de Datos

- **Motor de Base de Datos Principal:** PostgreSQL (Con soporte para extensiones geográficas si es necesario, dado que el sistema maneja incidencias georreferenciadas).
- **ORM:** Eloquent (Nativo de Laravel).
- **Mecanismos adicionales:**
  - **Migraciones y Seeders:** Gestión versionada de la base de datos completamente controlada por scripts en el backend.
  - **Auditoría (Audit Trails):** Tablas específicas y middleware para registrar acciones críticas, inicios de sesión y flujos.

---

## 5. Herramientas de Desarrollo y DevOps

- **Gestores de Paquetes:** 
  - `Composer` (Backend PHP)
  - `npm / npx` (Para compilación de assets frontales).
- **Control de Versiones:** Git.
- **Entorno Local:** `php artisan serve`, herramientas nativas de Laravel, y servidores concurrentes.
