# Skill: Estabilización Preventiva del Frontend Estático

## Propósito

Aplicar mejoras incrementales de estabilidad, seguridad y mantenibilidad en el frontend estático del Sistema de Gestión de Incidencias Georreferenciadas, respetando la pila tecnológica original del proyecto.

Este skill debe usarse cuando se modifiquen archivos del frontend relacionados con:

* HTML estático.
* Vanilla JavaScript.
* AdminLTE.
* Comunicación HTTP con Laravel/Sanctum.
* Renderizado dinámico de datos.
* Formularios.
* Listados.
* Dashboard.
* Mapa o filtros geográficos.
* Detalle de incidencias.
* Modales dinámicos.

---

## Stack permitido

El frontend debe mantenerse en:

* HTML estático.
* CSS existente del proyecto.
* AdminLTE.
* Bootstrap si ya está incluido.
* Vanilla JavaScript.
* Cliente HTTP propio del proyecto.
* Laravel Sanctum como mecanismo de autenticación del backend.

---

## Restricciones obligatorias

No se permite:

* Migrar a React.
* Migrar a Vue.
* Migrar a Angular.
* Agregar Alpine.js.
* Convertir el frontend en una SPA nueva.
* Agregar frameworks o dependencias externas innecesarias.
* Cambiar endpoints del backend.
* Cambiar contratos de respuesta de la API.
* Romper estilos o componentes de AdminLTE.
* Traducir nombres internos del backend si ya están en inglés.
* Cambiar textos visibles al usuario a otro idioma que no sea español.
* Hacer refactor masivo sin necesidad técnica.

---

## Objetivos técnicos

Toda intervención en el frontend debe priorizar:

1. Reducir riesgos XSS por interpolación insegura.
2. Centralizar llamadas HTTP.
3. Evitar `fetch` dispersos.
4. Evitar `innerHTML` inseguro.
5. Evitar eventos duplicados en elementos dinámicos.
6. Reducir fugas de memoria por listeners repetidos.
7. Mejorar manejo de errores HTTP.
8. Mostrar errores de validación por campo.
9. Mantener sincronizados badges, contadores, timelines y vistas dinámicas.
10. Preservar la apariencia visual actual del sistema.

---

## Archivos base esperados

El proyecto debe contar con estos utilitarios o crearlos si no existen:

```text
frontend/app/js/infrastructure/backend-client.js
frontend/app/js/infrastructure/store.js
frontend/app/js/presentation/dom-utils.js
```

---

## backend-client.js

Debe centralizar toda comunicación HTTP con el backend.

Debe exponer, como mínimo:

```js
request()
requestRaw()
```

Responsabilidades:

* Agregar automáticamente credenciales o token si el proyecto lo utiliza.
* Enviar headers necesarios.
* Procesar respuestas JSON.
* Capturar errores HTTP.
* Evitar duplicación de lógica de sesión en cada página.

Manejo obligatorio de errores:

| Código | Acción esperada                                                             |
| ------ | --------------------------------------------------------------------------- |
| 401    | Limpiar sesión/token local y redirigir a `login.html` con mensaje amigable. |
| 403    | Mostrar mensaje de acceso denegado sin romper la página.                    |
| 419    | Tratar como sesión expirada o problema CSRF. Limpiar sesión si corresponde. |
| 422    | Propagar errores estructurados para formularios.                            |
| 500    | Mostrar mensaje genérico sin exponer detalles internos.                     |

Regla:

```text
No debe agregarse fetch directo en archivos nuevos o refactorizados.
```

Si queda algún `fetch`, debe estar justificado.

---

## dom-utils.js

Debe contener utilidades seguras para manipulación del DOM.

Funciones mínimas:

```js
escapeHtml(value)
html(strings, ...values)
delegateEvent(container, selector, eventName, callback)
```

### escapeHtml(value)

Debe:

* Recibir cualquier valor.
* Retornar cadena vacía si recibe `null` o `undefined`.
* Escapar:

  * `&`
  * `<`
  * `>`
  * `"`
  * `'`

Uso esperado:

```js
element.textContent = escapeHtml(value);
```

Cuando sea posible, preferir `textContent` para texto simple.

---

### html(strings, ...values)

Debe ser una tagged template function.

Uso esperado:

```js
container.innerHTML = html`
  <h3>${incident.title}</h3>
  <p>${incident.description}</p>
`;
```

Reglas:

* Toda variable interpolada debe pasar por `escapeHtml`.
* No debe permitir que datos del backend se interpreten como HTML ejecutable.
* No debe usarse para insertar HTML enriquecido no confiable.
* Si el sistema necesita HTML enriquecido en el futuro, debe sanitizarse en backend o con una librería especializada aprobada.

---

### delegateEvent(container, selector, eventName, callback)

Debe utilizar delegación de eventos.

Uso esperado:

```js
delegateEvent(document.body, '.btn-change-status', 'click', (event, target) => {
  // lógica
});
```

Reglas:

* Usar contenedores estables.
* Evitar listeners en botones que se re-renderizan.
* Evitar listeners dentro de funciones de render si no hay limpieza.
* Evitar duplicación de eventos.

---

## store.js

Debe implementar un Store/PubSub ligero en Vanilla JS.

Funciones mínimas:

```js
getState()
setState(partialState)
subscribe(listener)
unsubscribe(listener)
```

Uso permitido:

* Detalle de incidencia.
* Timeline.
* Cambio de estado.
* Contadores.
* Badges.
* Dashboard con múltiples widgets dependientes del mismo dato.
* Mapa con filtros y panel lateral sincronizado.

Uso no recomendado:

* Login.
* Registro.
* Formularios simples.
* Páginas sin estado compartido.

Regla principal:

```text
No usar Store/PubSub si una función simple resuelve el flujo de forma clara.
```

---

## Reglas de renderizado seguro

Antes de modificar cualquier renderizado, buscar:

```text
innerHTML =
insertAdjacentHTML
onclick=
template strings con datos de API
concatenación HTML con variables
```

Debe corregirse cualquier interpolación insegura de datos provenientes de:

* API.
* Base de datos.
* Formularios.
* Query params.
* LocalStorage.
* Respuestas externas.
* Campos de título, descripción, comentario, dirección, usuario, categoría, estado o prioridad.

Payloads que deben quedar neutralizados:

```html
<script>alert('hack')</script>
<img src=x onerror=alert('hack')>
<a href="javascript:alert('hack')">Click</a>
<svg onload=alert('hack')>
```

Resultado esperado:

```text
No debe ejecutarse ningún alert.
El contenido debe mostrarse como texto plano o quedar neutralizado.
```

---

## Reglas para formularios

Todo formulario refactorizado debe:

* Usar `request`.
* Manejar errores `422`.
* Mostrar errores por campo.
* Usar clases visuales compatibles con Bootstrap/AdminLTE.
* Limpiar errores cuando el usuario vuelva a escribir.
* No mostrar trazas técnicas del backend.
* Mantener mensajes visibles en español.

Ejemplo de comportamiento esperado:

```text
Campo requerido → mostrar mensaje debajo del campo.
Correo inválido → mostrar mensaje debajo del campo de correo.
Error 500 → mostrar alerta genérica, no detalles internos.
```

---

## Reglas para dashboard

Al modificar dashboard o panel principal:

* Sanitizar cards, contadores, tablas y últimos reportes.
* Evitar `innerHTML` inseguro.
* Usar `request`.
* Usar Store/PubSub solo si varios widgets dependen de la misma data.
* Mantener AdminLTE.
* No cambiar diseño general sin indicación explícita.

---

## Reglas para listado de incidencias

Al modificar tablas o listados:

* Sanitizar columnas dinámicas.
* Usar `html` para filas generadas.
* Usar delegación para botones de acción.
* No usar `onclick` inline.
* Mantener filtros, búsqueda y paginación existentes.
* Validar URLs dinámicas antes de insertarlas en atributos.
* No insertar datos crudos en badges, labels o tooltips.

Campos sensibles:

```text
título
descripción
categoría
estado
prioridad
reportante
ubicación
dirección
comentarios
fechas recibidas desde API
```

---

## Reglas para mapa y georreferenciación

Al modificar mapa, marcadores, popups o filtros:

* Validar latitud y longitud antes de usarlas.
* No renderizar popups con datos sin escape.
* Construir contenido dinámico con `html`.
* Evitar listeners duplicados al recargar markers.
* Limpiar markers anteriores antes de renderizar nuevos.
* No permitir URLs peligrosas en popups.
* Mantener funcionalidad de filtros existentes.

---

## Manejo de sesión y localStorage

Si el sistema usa `localStorage` para guardar token:

* Mantener compatibilidad actual.
* Limpiar token ante `401` o `419`.
* Redirigir a login.
* No duplicar lógica de cierre de sesión.
* Documentar riesgo residual.

Comentario técnico recomendado:

```js
// Riesgo residual: localStorage es accesible desde JavaScript.
// Si ocurre un XSS, el token podría ser extraído.
// Mejora futura: migrar a cookies HttpOnly con Sanctum si el backend lo permite.
```

---

## Auditoría obligatoria antes y después

Antes y después de modificar, buscar:

```text
fetch(
innerHTML =
insertAdjacentHTML
onclick=
.addEventListener(
localStorage.getItem
localStorage.setItem
```

Cada aparición restante debe clasificarse como:

```text
Seguro: no involucra datos externos o está controlado.
Mitigado: usa request, html, escapeHtml o delegateEvent.
Pendiente: requiere refactor posterior.
```

No ocultar pendientes.

---

## Verificación manual mínima

Después de modificar, validar:

### Sesión expirada

1. Alterar o eliminar `auth_token`.
2. Entrar a una página protegida.
3. Debe redirigir a login con mensaje amigable.

### Acceso sin permiso

1. Simular o provocar `403`.
2. Debe mostrar acceso denegado.
3. La página no debe romperse.

### Validación 422

1. Enviar formulario vacío o inválido.
2. Deben aparecer errores por campo.
3. Los errores deben limpiarse al editar.

### XSS

Insertar o simular payloads en título, descripción o comentario:

```html
<script>alert('hack')</script>
<img src=x onerror=alert('hack')>
<a href="javascript:alert('hack')">Click</a>
<svg onload=alert('hack')>
```

Resultado esperado:

```text
Ningún alert debe ejecutarse.
El contenido debe mostrarse como texto plano o quedar neutralizado.
```

### Sincronización visual

1. Cambiar estado de una incidencia.
2. Agregar comentario.
3. Revisar badge, timeline, contador y vista lateral.
4. No debe quedar información desactualizada.

---

## Reporte final obligatorio

Cada intervención debe entregar:

```text
Archivos creados.
Archivos modificados.
Resumen técnico de cambios.
Patrones peligrosos encontrados antes.
Patrones peligrosos restantes después.
Clasificación: seguro, mitigado o pendiente.
Correcciones aplicadas por vista.
Riesgos mitigados.
Riesgos residuales.
Evidencia de verificación manual.
Pendientes reales.
Recomendaciones para siguiente iteración.
```

---

## Lenguaje técnico permitido

Usar afirmaciones realistas:

```text
riesgo mitigado
reducción significativa
vista refactorizada
pendiente de validación completa
riesgo residual
```

Evitar afirmaciones absolutas:

```text
XSS eliminado al 100%
riesgo erradicado globalmente
seguridad completamente garantizada
sin vulnerabilidades
```

---

## Prioridad de trabajo

Orden recomendado:

1. `backend-client.js`
2. `dom-utils.js`
3. `incident-detail-page.js`
4. `incidents-page.js`
5. `dashboard-page.js`
6. mapa/filtros geográficos
7. formularios creación/edición
8. modales dinámicos
9. auditoría final de patrones peligrosos

---

## Criterios de aceptación

Una refactorización se considera aceptable cuando:

1. No introduce frameworks nuevos.
2. No rompe AdminLTE.
3. No cambia endpoints.
4. No elimina funcionalidades existentes.
5. Los datos externos no se insertan como HTML sin escape.
6. Las llamadas HTTP pasan por `backend-client.js`.
7. Los eventos dinámicos usan delegación.
8. Los errores `401`, `403`, `419`, `422` y `500` tienen manejo centralizado.
9. Los formularios muestran errores por campo.
10. Los riesgos residuales quedan documentados.
