/**
 * E2 — Carga Nominal (Login)
 * Endpoint: POST /api/login
 * VUs: 10 sostenidos durante 2 minutos
 * Sin autenticación previa — mide rendimiento del endpoint más crítico
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
    login_nominal: {
      executor: 'constant-vus',
      vus:      10,
      duration: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed:   ['rate<0.01'],
    error_rate:        ['rate<0.01'],
  },
};

export default function () {
  const payload = JSON.stringify({
    email:    'ciudadano1@incidents.local',
    password: 'password',
  });

  const res = http.post(`${BASE_URL}/api/login`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    tags: { scenario: 'E2_login' },
  });

  const ok = check(res, {
    'status is 200':       (r) => r.status === 200,
    'has access_token':    (r) => JSON.parse(r.body).access_token !== undefined,
    'duration < 1000ms':   (r) => r.timings.duration < 1000,
  });

  errorRate.add(!ok);
  reqDuration.add(res.timings.duration);
  reqCount.add(1);

  sleep(1);
}
