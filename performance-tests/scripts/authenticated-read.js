import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { readThresholds } from '../config/thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export const options = {
  vus: 25,
  duration: '2m',
  thresholds: readThresholds,
  tags: { test: 'authenticated-read' },
};

export function setup() {
  const email = __ENV.TEST_EMAIL;
  const password = __ENV.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error('TEST_EMAIL y TEST_PASSWORD son requeridas para authenticated-read');
  }

  const res = http.post(`${BASE_URL}/api/login`, JSON.stringify({
    email, password,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  check(res, {
    'login exitoso en setup': (r) => r.status === 200,
  });

  const token = res.json('access_token');
  return { token };
}

export default function (data) {
  const authHeaders = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  group('Lecturas autenticadas concurrentes', () => {
    const endpoints = [
      { url: '/api/incidents?per_page=15', tag: 'incidents-list' },
      { url: '/api/me', tag: 'me' },
      { url: '/api/incidents/map?limit=200', tag: 'map' },
    ];

    endpoints.forEach((ep) => {
      const res = http.get(`${BASE_URL}${ep.url}`, {
        headers: authHeaders,
        tags: { endpoint: ep.tag },
      });

      const isExpected = [200, 401, 403, 429, 500].includes(res.status);
      check(res, {
        'status esperado': () => isExpected,
        'no es 500': (r) => r.status !== 500,
      });

      if (res.status === 401) console.warn('⚠️ 401 - Token expirado?');
      if (res.status === 403) console.warn('⚠️ 403 - Sin permiso');
      if (res.status === 429) console.warn('⚠️ 429 - Rate limit');
      if (res.status === 500) console.error('❌ 500 - Error server');
    });
  });

  sleep(1);
}
