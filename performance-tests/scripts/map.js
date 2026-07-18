import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { readThresholds } from '../config/thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

const mapLatency = new Trend('map_latency');
const mapResponseSize = new Trend('map_response_size');
const mapErrorRate = new Rate('map_errors');

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    ...readThresholds,
    map_latency: ['p(95)<3000'],
  },
  tags: { test: 'map' },
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

export default function (data) {
  const authHeaders = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  group('Mapa de incidencias', () => {
    // Sin filtros geográficos
    const res1 = http.get(`${BASE_URL}/api/incidents/map?limit=200`, {
      headers: authHeaders,
      tags: { endpoint: 'map' },
    });

    mapLatency.add(res1.timings.duration);
    mapResponseSize.add(res1.body.length);
    mapErrorRate.add(res1.status !== 200);

    check(res1, {
      'map status 200': (r) => r.status === 200,
      'map devuelve data': (r) => r.json('data') !== undefined,
    });

    // Con filtros geográficos (bounds Ecuador continental)
    const res2 = http.get(`${BASE_URL}/api/incidents/map?limit=500&min_latitude=-5&max_latitude=2&min_longitude=-81&max_longitude=-75`, {
      headers: authHeaders,
      tags: { endpoint: 'map-filtered' },
    });

    mapLatency.add(res2.timings.duration);
    mapResponseSize.add(res2.body.length);

    check(res2, {
      'map filtrado status 200': (r) => r.status === 200,
    });
  });

  sleep(1);
}
