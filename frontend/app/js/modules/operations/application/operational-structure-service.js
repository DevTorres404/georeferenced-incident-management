import { requestBackend } from '../../../core/api-client.js?v=21';

async function listOperationalZones() {
  const response = await requestBackend('/admin/operations/zones', { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

async function listOperationalSupervisors() {
  const response = await requestBackend('/admin/operations/supervisors', { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

async function listOperationalOperators() {
  const response = await requestBackend('/admin/operations/operators', { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

async function getOperationalZonesGeoJson() {
  return requestBackend('/admin/operations/zones/geojson', { noCache: true });
}

async function updateOperationalOperatorProfile(operatorUserId, payload) {
  const response = await requestBackend(`/admin/operations/operators/${operatorUserId}/profile`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response?.data || null;
}

async function assignOperationalZoneSupervisor(zoneId, payload) {
  const response = await requestBackend(`/admin/operations/zones/${zoneId}/supervisor`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  return response?.data || null;
}

async function replaceOperationalZoneOperator(operatorUserId, payload) {
  const response = await requestBackend(`/admin/operations/operators/${operatorUserId}/replacement`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  return response?.data || null;
}

async function listPriorityCatalog() {
  const response = await requestBackend('/admin/catalogs/priorities', { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

async function updatePriorityCatalog(priorityId, payload) {
  const response = await requestBackend(`/admin/catalogs/priorities/${priorityId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return response?.data || null;
}

export {
  listOperationalZones,
  listOperationalSupervisors,
  listOperationalOperators,
  getOperationalZonesGeoJson,
  assignOperationalZoneSupervisor,
  replaceOperationalZoneOperator,
  updateOperationalOperatorProfile,
  listPriorityCatalog,
  updatePriorityCatalog,
};
