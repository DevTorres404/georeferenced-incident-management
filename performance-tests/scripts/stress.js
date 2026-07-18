import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { stressThresholds } from '../config/thresholds.js';
import { stress } from '../config/scenarios.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.TEST_TOKEN || '';
const AUTH_HEADERS = {
  'Accept': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

const p95Trend = new Trend('p95_progression');
const errorTrend = new Rate('error_rate');
const throughputTrend = new Trend('throughput');

export const options = {
  scenarios: { stress },
  thresholds: stressThresholds,
  tags: { test: 'stress' },
};

export default function () {
  if (!TOKEN) {
    throw new Error('TEST_TOKEN es requerida para stress test');
  }

  group('Lecturas bajo estrés', () => {
    const endpoints = [
      { url: '/api/incidents?per_page=15', tag: 'incidents-list' },
      { url: '/api/me', tag: 'me' },
      { url: '/api/incidents/map?limit=200', tag: 'map' },
      { url: '/api/territorial-units', tag: 'territorial-units' },
      { url: '/api/incidents/datatable', tag: 'incidents-datatable', method: 'POST', body: JSON.stringify({ draw: 1, start: 0, length: 15 }) },
    ];

    endpoints.forEach((ep) => {
      const params = {
        headers: AUTH_HEADERS,
        tags: { endpoint: ep.tag },
      };

      let res;
      if (ep.method === 'POST') {
        params.headers['Content-Type'] = 'application/json';
        res = http.post(`${BASE_URL}${ep.url}`, ep.body, params);
      } else {
        res = http.get(`${BASE_URL}${ep.url}`, params);
      }

      p95Trend.add(res.timings.duration);
      errorTrend.add(res.status !== 200);
      throughputTrend.add(1);

      check(res, {
        [`${ep.tag} ok`]: (r) => r.status === 200 || r.status === 403,
        [`${ep.tag} < 5000ms`]: (r) => r.timings.duration < 5000,
      });
    });
  });

  sleep(0.5);
}
