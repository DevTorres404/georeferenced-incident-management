import { request } from '../../../infrastructure/backend-client.js?v=21';

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

async function getIncident(incidentId, options = {}) {
  return request(`/incidents/${incidentId}`, options);
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

async function assignIncidentOperators(incidentId, payload) {
  return request(`/incidents/${incidentId}/assignments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function listAssignmentOperators() {
  return request('/incidents/assignment-operators');
}

async function listStates() {
  return request('/catalogs/states');
}

async function listStateTransitions() {
  return request('/catalogs/transitions');
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
  assignIncidentOperators,
  changeIncidentState,
  listStates,
  listStateTransitions,
  listAssignmentOperators,
  listPriorities,
};

window.SGIGIncidentsService = incidentsService;

export {
  addIncidentComment,
  assignIncidentOperators,
  changeIncidentState,
  createIncident,
  deleteIncident,
  getIncident,
  listAssignmentOperators,
  listIncidents,
  listPriorities,
  listStates,
  listStateTransitions,
  updateIncident,
  uploadIncidentAttachment,
};
