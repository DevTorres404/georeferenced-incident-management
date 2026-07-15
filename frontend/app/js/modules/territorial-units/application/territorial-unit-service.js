import { requestBackend } from '../../../infrastructure/backend-client.js?v=21';

function buildQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString() ? `?${params.toString()}` : '';
}

export async function listTerritorialUnits(filters = {}) {
  const response = await requestBackend(`/territorial-units${buildQuery(filters)}`, { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

export async function getTerritorialTree() {
  const response = await requestBackend('/territorial-units/tree', { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

export async function getTerritorialChildren(parentId) {
  if (!parentId) return [];
  const response = await requestBackend(`/territorial-units/${parentId}/children`, { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

export async function listTerritorialProvinces() {
  const response = await requestBackend('/territorial-units/provinces', { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

export async function listTerritorialCantons(provinceId) {
  if (!provinceId) return [];
  const response = await requestBackend(`/territorial-units/provinces/${provinceId}/cantons`, { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

export async function listTerritorialParishes(cantonId) {
  if (!cantonId) return [];
  const response = await requestBackend(`/territorial-units/cantons/${cantonId}/parishes`, { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

export async function createTerritorialUnit(payload) {
  return requestBackend('/territorial-units', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTerritorialUnit(id, payload) {
  return requestBackend(`/territorial-units/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deactivateTerritorialUnit(id) {
  return requestBackend(`/territorial-units/${id}`, {
    method: 'DELETE',
  });
}
