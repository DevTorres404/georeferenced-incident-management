/**
 * E4 — Capacidad Controlada: Flujo Completo de Ciudadano
 * Flujo: POST /api/login → GET /api/incidents/{id} → POST /api/incidents
 * VUs: 10 sostenidos durante 2 minutos
 * Mide el pipeline completo de creación de incidencias bajo carga moderada
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = 'https://api.labtorres.me';

const errorRate        = new Rate('error_rate');
const loginDuration    = new Trend('login_duration', true);
const detailDuration   = new Trend('detail_duration', true);
const createDuration   = new Trend('create_duration', true);
const reqCount         = new Counter('req_count');

export const options = {
  scenarios: {
    full_flow: {
      executor: 'constant-vus',
      vus:      10,
      duration: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed:   ['rate<0.02'],
    error_rate:        ['rate<0.02'],
  },
};

export default function () {
  // Paso 1: Login
  const loginRes = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({ email: 'ciudadano1@incidents.local', password: 'password' }),
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, tags: { step: 'login' } }
  );

  const loginOk = check(loginRes, {
    'login 200': (r) => r.status === 200,
  });
  loginDuration.add(loginRes.timings.duration);
  reqCount.add(1);

  if (!loginOk) {
    errorRate.add(1);
    sleep(2);
    return;
  }

  const token = JSON.parse(loginRes.body).access_token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Accept:         'application/json',
    Authorization:  `Bearer ${token}`,
  };

  // Paso 2: Detalle de una incidencia (ID 1 como referencia)
  const detailRes = http.get(`${BASE_URL}/api/incidents/1`, {
    headers: authHeaders,
    tags:    { step: 'detail' },
  });

  check(detailRes, {
    'detail 200 or 403/404': (r) => [200, 403, 404].includes(r.status),
    'detail < 1000ms':       (r) => r.timings.duration < 1000,
  });
  detailDuration.add(detailRes.timings.duration);
  reqCount.add(1);

  // Paso 3: Crear una incidencia
  const incidentPayload = JSON.stringify({
    title:             `Incidencia de prueba k6 [VU=${__VU} ITER=${__ITER}]`,
    description:       'Prueba automatizada de rendimiento generada por k6. No requiere atención.',
    category_id:       1,
    territorial_unit_id: 1,
    address_reference: 'Av. de Prueba 100',
    latitude:          -0.2299,
    longitude:         -78.5249,
  });

  const createRes = http.post(`${BASE_URL}/api/incidents`, incidentPayload, {
    headers: authHeaders,
    tags:    { step: 'create' },
  });

  const createOk = check(createRes, {
    'create 201':     (r) => r.status === 201,
    'create < 1500ms': (r) => r.timings.duration < 1500,
  });

  errorRate.add(!createOk);
  createDuration.add(createRes.timings.duration);
  reqCount.add(1);

  sleep(2);
}
