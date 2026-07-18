import http from 'k6/http';
import { check, sleep } from 'k6';

// Configuración de la prueba (Escenarios operativos)
export const options = {
  stages: [
    { duration: '30s', target: 50 }, // Ramp-up de 0 a 50 usuarios
    { duration: '1m', target: 50 },  // Sustain (meseta) durante 1 minuto
    { duration: '30s', target: 0 },  // Ramp-down de 50 a 0 usuarios
  ],
  thresholds: {
    // Definimos nuestras métricas SLA (Acuerdos de Nivel de Servicio)
    http_req_duration: ['p(95)<500'], // El 95% de las peticiones deben responder en menos de 500ms
    http_req_failed: ['rate<0.01'],   // La tasa de error debe ser menor al 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://host.docker.internal:8000/api';

export default function () {
  // ESCENARIO 1: Login de Usuario (Estrés en CPU por Bcrypt)
  const loginPayload = JSON.stringify({
    email: 'admin@incidents.local',
    password: 'password',
  });

  const loginParams = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  const loginRes = http.post(`${BASE_URL}/login`, loginPayload, loginParams);

  // Verificamos que el login fue exitoso
  check(loginRes, {
    'login exitoso (status 200)': (r) => r.status === 200,
    'tiene token': (r) => r.json('token') !== undefined,
  });

  // Extraemos el token para la siguiente petición
  const token = loginRes.json('token');
  
  if (token) {
    // ESCENARIO 2: Obtención de mapa de incidencias (Estrés en BD y RAM)
    const mapParams = {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    };

    const mapRes = http.get(`${BASE_URL}/incidents/map`, mapParams);

    check(mapRes, {
      'mapa cargado (status 200)': (r) => r.status === 200,
    });
  }

  // Simulamos un tiempo de pensamiento (Think Time) de usuario real
  sleep(1);
}
