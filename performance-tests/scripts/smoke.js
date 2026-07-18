import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { readThresholds } from '../config/thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.TEST_TOKEN || '';
const HEADERS = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: readThresholds,
  tags: { test: 'smoke' },
};

export default function () {
  group('Catálogos públicos', () => {
    const endpoints = [
      '/api/catalogs',
      '/api/catalogs/categories',
      '/api/catalogs/priorities',
      '/api/catalogs/states',
    ];

    endpoints.forEach((ep) => {
      const res = http.get(`${BASE_URL}${ep}`, {
        headers: HEADERS,
        tags: { endpoint: 'catalogs' },
      });
      check(res, {
        'status 200': (r) => r.status === 200,
        'respuesta en menos de 1500ms': (r) => r.timings.duration < 1500,
      });
    });
  });

  if (TOKEN) {
    group('Endpoints autenticados', () => {
      const authHeaders = { ...HEADERS, 'Authorization': `Bearer ${TOKEN}` };

      const res = http.get(`${BASE_URL}/api/me`, {
        headers: authHeaders,
        tags: { endpoint: 'me' },
      });
      check(res, {
        'status 200 en /me': (r) => r.status === 200,
      });
    });
  }

  sleep(1);
}
