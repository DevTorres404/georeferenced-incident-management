/**
 * E1 — Disponibilidad Básica (Health Check)
 * Endpoint: GET /up
 * VUs: 50 (rampa 0→50 en 30s, sostenido 60s, bajada 10s)
 * Sin autenticación — mide disponibilidad pura del servidor
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
    health_check: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '10s', target: 0  },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed:   ['rate<0.01'],
    error_rate:        ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/up`, {
    headers: { Accept: 'application/json' },
    tags:    { scenario: 'E1_health' },
  });

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'duration < 1000ms': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!ok);
  reqDuration.add(res.timings.duration);
  reqCount.add(1);

  sleep(1);
}
