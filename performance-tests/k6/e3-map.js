/**
 * E3 — Mapa de Incidencias Georreferenciadas (Función Crítica)
 * Endpoint: GET /api/incidents/map
 * Requiere: auth:sanctum + permiso incidents.map (rol ADMIN/SUPERVISOR)
 * VUs: 20 sostenidos durante 2 minutos
 *
 * NOTA: El endpoint /incidents/map requiere el permiso `incidents.map`
 * que el rol CIUDADANO no posee. Se usa la cuenta admin del seeder.
 * En producción real se usaría una cuenta dedicada de pruebas con ese permiso.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = 'https://api.labtorres.me';

const errorRate   = new Rate('error_rate');
const reqDuration = new Trend('req_duration', true);
const reqCount    = new Counter('req_count');

export const options = {
  scenarios: {
    map_load: {
      executor: 'constant-vus',
      vus:      20,
      duration: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed:   ['rate<0.01'],
    error_rate:        ['rate<0.05'],
  },
};

// Obtener token en setup (se comparte entre VUs)
export function setup() {
  const payload = JSON.stringify({
    email:    'supervisor@incidents.local',
    password: 'password',
  });
  const res = http.post(`${BASE_URL}/api/login`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
  });

  if (res.status !== 200) {
    throw new Error(`Login failed in setup: ${res.status}`);
  }
  const token = JSON.parse(res.body).access_token;
  return { token };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/incidents/map?limit=500`, {
    headers: {
      Accept:        'application/json',
      Authorization: `Bearer ${data.token}`,
    },
    tags: { scenario: 'E3_map' },
  });

  const ok = check(res, {
    'status is 200':      (r) => r.status === 200,
    'has data array':     (r) => {
      try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
    },
    'duration < 1000ms':  (r) => r.timings.duration < 1000,
  });

  errorRate.add(!ok);
  reqDuration.add(res.timings.duration);
  reqCount.add(1);

  sleep(1);
}
