import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { loginThresholds } from '../config/thresholds.js';
import { BASE_URL, HEADERS } from '../config/env.js';

const loginDuration = new Trend('login_duration');
const loginSuccessRate = new Rate('login_success');

export const options = {
  stages: [
    { duration: '30s', target: 1 },
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    ...loginThresholds,
    login_duration: ['p(95)<3000'],
  },
  tags: { test: 'login' },
};

export default function () {
  const email = __ENV.TEST_EMAIL;
  const password = __ENV.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error('TEST_EMAIL y TEST_PASSWORD son requeridas');
  }

  group('Autenticación', () => {
    const payload = JSON.stringify({ email, password });
    const res = http.post(`${BASE_URL}/api/login`, payload, {
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      tags: { endpoint: 'login' },
    });

    loginDuration.add(res.timings.duration);
    const passed = check(res, {
      'status 200 o esperado': (r) => [200, 401, 422, 429].includes(r.status),
      'respuesta tiene message': (r) => r.json('message') !== undefined,
    });
    loginSuccessRate.add(passed);

    if (res.status === 200) {
      const token = res.json('access_token');
      check(token, {
        'token recibido': (t) => t !== undefined && t !== '',
      });
    }

    if (res.status === 429) {
      console.warn('⚠️ Rate limit alcanzado en login');
    }
  });

  sleep(1);
}
