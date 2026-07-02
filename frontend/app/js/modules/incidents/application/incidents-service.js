import { request } from '../../../core/api-client.js?v=15';

async function listIncidents(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request(`/incidents${suffix}`);
}

async function getIncident(incidentId) {
  return request(`/incidents/${incidentId}`);
}

async function createIncident(payload) {
  return request('/incidents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function updateIncident(incidentId, payload) {
  return request(`/incidents/${incidentId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function uploadIncidentAttachment(incidentId, file) {
  const formData = new FormData();
  formData.append('file', file);

  return request(`/incidents/${incidentId}/attachments`, {
    method: 'POST',
    body: formData,
  });
}

async function deleteIncident(incidentId) {
  return request(`/incidents/${incidentId}`, {
    method: 'DELETE',
  });
}

async function addIncidentComment(incidentId, payload) {
  return request(`/incidents/${incidentId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function changeIncidentState(incidentId, payload) {
  return request(`/incidents/${incidentId}/state`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function listStates() {
  return request('/catalogs/states');
}

async function listPriorities() {
  return request('/catalogs/priorities');
}

const incidentsService = {
  listIncidents,
  createIncident,
  updateIncident,
  uploadIncidentAttachment,
  getIncident,
  deleteIncident,
  addIncidentComment,
  changeIncidentState,
  listStates,
  listPriorities,
};

window.SGIGIncidentsService = incidentsService;

export {
  addIncidentComment,
  changeIncidentState,
  createIncident,
  deleteIncident,
  getIncident,
  listIncidents,
  listPriorities,
  listStates,
  updateIncident,
  uploadIncidentAttachment,
};
