import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { uploadThresholds } from '../config/thresholds.js';
import { gentleUpload } from '../config/scenarios.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

const uploadSize = new Trend('upload_size_bytes');
const uploadLatency = new Trend('upload_latency');

export const options = {
  scenarios: { upload: gentleUpload },
  thresholds: uploadThresholds,
  tags: { test: 'upload-image' },
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

// Genera una imagen PNG pequeña en memoria (1x1 pixel rojo)
function generateTestImage() {
  // PNG minimal: 1x1 pixel rojo
  const pngBytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, // PNG header
    0, 0, 0, 13, 73, 72, 68, 82, // IHDR chunk
    0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, // 1x1, 8-bit RGB
    0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 0, 3, 0, 1, 0, 5, 219, 62, 101, 210, // IDAT
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130, // IEND
  ]);
  return { data: http.file(pngBytes, 'test-image.png', 'image/png'), size: pngBytes.length };
}

export default function (data) {
  const authHeaders = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  group('Subida de imagen', () => {
    const testImage = generateTestImage();
    uploadSize.add(testImage.size);

    // Primero obtener o crear una incidencia para adjuntar la imagen
    const listRes = http.get(`${BASE_URL}/api/incidents?per_page=1`, {
      headers: authHeaders,
      tags: { endpoint: 'incidents-list' },
    });

    if (listRes.status !== 200) {
      console.warn('⚠️ No se pudo listar incidencias para adjuntar imagen');
      return;
    }

    const incidents = listRes.json('data');
    if (!incidents || incidents.length === 0) {
      console.warn('⚠️ No hay incidencias disponibles para adjuntar imágenes');
      return;
    }

    const incidentId = incidents[0].id;

    const formData = {
      file: testImage.data,
    };

    const uploadRes = http.post(`${BASE_URL}/api/incidents/${incidentId}/attachments`, formData, {
      headers: authHeaders,
      tags: { endpoint: 'upload-image' },
    });

    uploadLatency.add(uploadRes.timings.duration);

    check(uploadRes, {
      'upload exitoso (201)': (r) => r.status === 201,
      'respuesta tiene data': (r) => r.json('data') !== undefined,
    });

    if (uploadRes.status === 413) console.warn('⚠️ 413 - Archivo demasiado grande');
    if (uploadRes.status === 422) console.warn('⚠️ 422 - Validación fallida');
    if (uploadRes.status === 429) console.warn('⚠️ 429 - Rate limit');
    if (uploadRes.status === 500) console.error('❌ 500 - Error interno');
  });

  sleep(2);
}

export function teardown(data) {
  console.log('🧹 Limpieza manual: los attachments se pueden eliminar desde el panel de administración o vía DELETE /api/incidents/{id}/attachments/{attachmentId}');
}
