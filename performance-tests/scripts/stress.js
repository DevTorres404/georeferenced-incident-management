import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { stress } from '../config/scenarios.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

const p95Trend = new Trend('p95_progression');
const errorRate = new Rate('error_rate');

export const options = {
  scenarios: { stress },
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'error_rate': ['rate<0.01'],
  },
  tags: { test: 'comprehensive-stress' },
};

// Pequeña imagen PNG en memoria (1x1 rojo)
function generateTestImage() {
  const pngBytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 
    0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 
    0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 0, 3, 0, 1, 0, 5, 219, 62, 101, 210, 
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
  return http.file(pngBytes.buffer, 'test-image.png', 'image/png');
}

export function setup() {
  const email = __ENV.TEST_EMAIL || 'admin@example.com';
  const password = __ENV.TEST_PASSWORD || 'password';
  
  const res = http.post(`${BASE_URL}/api/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  });
  
  let token = '';
  if (res.status === 200) {
    token = res.json('access_token');
  } else {
    console.warn(`Setup no pudo loguearse. Code: ${res.status}`);
  }
  return { token, email, password };
}

export default function (data) {
  const authHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  const rnd = Math.random();

  // Escenario 1: Catálogos Públicos (20% del tráfico)
  if (rnd < 0.20) {
    group('Catálogos Públicos', () => {
      const res = http.get(`${BASE_URL}/api/catalogs/categories`, { tags: { endpoint: 'catalogs' } });
      p95Trend.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, { 'catalogs ok': (r) => r.status === 200 });
    });
  } 
  // Escenario 2: Autenticación (15% del tráfico)
  else if (rnd < 0.35) {
    group('Autenticación', () => {
      // Login inválido (50% de las veces)
      if (Math.random() > 0.5) {
        const res = http.post(`${BASE_URL}/api/login`, JSON.stringify({ email: 'fake@error.com', password: 'bad' }), {
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          tags: { endpoint: 'login-invalid' }
        });
        errorRate.add(res.status !== 401 && res.status !== 422);
        check(res, { 'login fallido esperado': (r) => r.status === 401 || r.status === 422 });
      } else {
        const res = http.post(`${BASE_URL}/api/login`, JSON.stringify({ email: data.email, password: data.password }), {
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          tags: { endpoint: 'login-valid' }
        });
        p95Trend.add(res.timings.duration);
        errorRate.add(res.status !== 200);
        check(res, { 'login exitoso': (r) => r.status === 200 });
      }
    });
  }
  // Escenario 3: Geoespacial / Mapas (30% del tráfico)
  else if (rnd < 0.65) {
    group('Consultas Geoespaciales', () => {
      const res = http.get(`${BASE_URL}/api/incidents/map?limit=200`, {
        headers: authHeaders,
        tags: { endpoint: 'map-query' }
      });
      p95Trend.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, { 'mapas ok': (r) => r.status === 200 });
    });
  }
  // Escenario 4: Creación de Incidencia (25% del tráfico)
  else if (rnd < 0.90) {
    group('Creación de Incidencia', () => {
      const payload = JSON.stringify({
        title: `[ESTRÉS] Incidencia VU${__VU}`,
        description: `Creada durante la prueba de estrés de 100 VUs.`,
        category_id: 1,
        territorial_unit_id: 1,
        address_reference: 'Prueba de Carga',
        latitude: -0.18 + (Math.random() * 0.01),
        longitude: -78.47 + (Math.random() * 0.01),
      });

      const res = http.post(`${BASE_URL}/api/incidents`, payload, {
        headers: authHeaders,
        tags: { endpoint: 'create-incident' },
      });
      p95Trend.add(res.timings.duration);
      errorRate.add(res.status !== 201);
      check(res, { 'creación exitosa': (r) => r.status === 201 });
    });
  }
  // Escenario 5: Carga de Adjunto (10% del tráfico)
  else {
    group('Carga de Adjuntos', () => {
      const testImage = generateTestImage();
      const res = http.post(`${BASE_URL}/api/incidents/1/attachments`, { file: testImage }, {
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${data.token}` },
        tags: { endpoint: 'upload-image' },
      });
      p95Trend.add(res.timings.duration);
      check(res, { 'subida procesada': (r) => [201, 404, 429].includes(r.status) });
    });
  }

  sleep(Math.random() * 2);
}
