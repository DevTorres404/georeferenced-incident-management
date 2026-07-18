export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
export const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};
export const TOKEN = __ENV.TEST_TOKEN || '';
export const AUTH_HEADERS = TOKEN
  ? { ...HEADERS, 'Authorization': `Bearer ${TOKEN}` }
  : HEADERS;
