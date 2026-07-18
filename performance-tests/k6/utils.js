// Shared utilities for k6 performance tests
import http from 'k6/http';

export const BASE_URL = 'https://api.labtorres.me';

export const HEADERS_JSON = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

export function headersAuth(token) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Authenticates and returns a Bearer token.
 * Uses the dedicated test-citizen account seeded in DemoUserSeeder.
 */
export function authenticate() {
  const res = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({ email: 'ciudadano1@incidents.local', password: 'password' }),
    { headers: HEADERS_JSON }
  );

  if (res.status !== 200) {
    console.error(`Login failed: ${res.status} ${res.body}`);
    return null;
  }

  const body = JSON.parse(res.body);
  return body.token || body.data?.token || body.access_token || null;
}
