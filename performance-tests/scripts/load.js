import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { readThresholds } from '../config/thresholds.js';
import { load } from '../config/scenarios.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.TEST_TOKEN || '';
const AUTH_HEADERS = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

export const options = {
  scenarios: { load },
  thresholds: readThresholds,
  tags: { test: 'load' },
};

const CATALOG_ENDPOINTS = [
  { url: '/api/catalogs/categories', tag: 'catalogs' },
  { url: '/api/catalogs/priorities', tag: 'catalogs' },
  { url: '/api/catalogs/states', tag: 'catalogs' },
];

const AUTH_ENDPOINTS = [
  { url: '/api/incidents?per_page=15', tag: 'incidents-list' },
  { url: '/api/me', tag: 'me' },
  { url: '/api/territorial-units', tag: 'territorial-units' },
];

export default function () {
  group('Catálogos públicos', () => {
    CATALOG_ENDPOINTS.forEach((ep) => {
      const res = http.get(`${BASE_URL}${ep.url}`, {
        tags: { endpoint: ep.tag },
      });
      check(res, {
        'catálogo status 200': (r) => r.status === 200,
      });
    });
  });

  if (TOKEN) {
    group('Lecturas autenticadas', () => {
      AUTH_ENDPOINTS.forEach((ep) => {
        const res = http.get(`${BASE_URL}${ep.url}`, {
          headers: AUTH_HEADERS,
          tags: { endpoint: ep.tag },
        });
        check(res, {
          [`${ep.tag} status ok`]: (r) => r.status === 200,
        });
      });
    });
  }

  sleep(1);
}
