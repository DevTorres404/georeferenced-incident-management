import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { writeThresholds } from '../config/thresholds.js';
import { gentleCreate } from '../config/scenarios.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export const options = {
  scenarios: { create: gentleCreate },
  thresholds: writeThresholds,
  tags: { test: 'create-incident' },
};

export function setup() {
  const email = __ENV.TEST_EMAIL;
  const password = __ENV.TEST_PASSWORD;
  if (!email || !password) throw new Error('TEST_EMAIL y TEST_PASSWORD requeridas');

  const res = http.post(`${BASE_URL}/api/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  });
  check(res, { 'login exitoso': (r) => r.status === 200 });
  return { token: res.json('access_token') };
}

const TEST_PREFIX = `PERF_TEST_${__VU}_${Date.now()}`;

export default function (data) {
  const authHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  group('Creación controlada de incidencias', () => {
    const payload = JSON.stringify({
      title: `[PERFORMANCE_TEST] Incidencia de prueba VU${__VU} ${Date.now()}`,
      description: `Creada por pruebas de rendimiento. Ignorar. ID: ${TEST_PREFIX}`,
      category_id: 1,
      territorial_unit_id: 10,
      address_reference: 'Dirección de prueba - ignorar',
      latitude: -0.18,
      longitude: -78.47,
    });

    const res = http.post(`${BASE_URL}/api/incidents`, payload, {
      headers: authHeaders,
      tags: { endpoint: 'create-incident' },
    });

    check(res, {
      'incidencia creada (201)': (r) => r.status === 201,
      'respuesta tiene message': (r) => r.json('message') !== undefined,
    });

    if (res.status === 201) {
      console.log(`✅ Incidencia creada: ${res.json('data')?.id || 'unknown'}`);
    }
    if (res.status === 429) {
      console.warn('⚠️ Rate limit en creación');
    }
  });

  sleep(2);
}

export function teardown(data) {
  // Documentación: para limpiar las incidencias creadas:
  // 1. Buscar: GET /api/incidents?search=PERFORMANCE_TEST
  // 2. Eliminar cada una vía DELETE /api/incidents/{id}
  // O desde BD: DELETE FROM incidents WHERE title LIKE '%PERFORMANCE_TEST%'
  console.log('🧹 Limpieza manual requerida: eliminar incidencias con título que contenga PERFORMANCE_TEST');
}
