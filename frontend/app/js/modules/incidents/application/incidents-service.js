import { request } from '../../../infrastructure/backend-client.js?v=21'

async function listIncidents(filters = {}) {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  })

  const suffix = params.toString() ? `?${params.toString()}` : ''
  return request(`/incidents${suffix}`)
}

async function getReportAnalytics(filters = {}) {
  const query = new URLSearchParams()
  if (filters.start_date) {
    query.append('start_date', filters.start_date)
  }

  if (filters.end_date) {
    query.append('end_date', filters.end_date)
  }

  if (filters.category) {
    query.append('category', filters.category)
  }

  if (filters.state) {
    query.append('state', filters.state)
  }

  query.append('_t', Date.now())

  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request(`/incidents/reports/analytics${suffix}`)
}

async function getIncident(incidentId, options = {}) {
  return request(`/incidents/${incidentId}`, options)
}

async function createIncident(payload) {
  return request('/incidents', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

async function updateIncident(incidentId, payload) {
  return request(`/incidents/${incidentId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

async function uploadIncidentAttachment(incidentId, file) {
  const formData = new FormData()
  formData.append('file', file)

  return request(`/incidents/${incidentId}/attachments`, {
    method: 'POST',
    body: formData
  })
}

async function deleteIncident(incidentId) {
  return request(`/incidents/${incidentId}`, {
    method: 'DELETE'
  })
}

async function addIncidentComment(incidentId, payload) {
  return request(`/incidents/${incidentId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

async function changeIncidentState(incidentId, payload) {
  return request(`/incidents/${incidentId}/state`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

async function assignIncidentOperators(incidentId, payload) {
  return request(`/incidents/${incidentId}/assignments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

async function classifyIncident(incidentId, payload) {
  return request(`/incidents/${incidentId}/classification`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

async function requestNewCategory(incidentId, payload) {
  return request(`/incidents/${incidentId}/category-requests`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

async function listIncidentCategories() {
  return request('/catalogs/categories')
}

async function listAssignmentOperators() {
  return request('/incidents/assignment-operators')
}

async function listStates() {
  return request('/catalogs/states')
}

async function listStateTransitions() {
  return request('/catalogs/transitions')
}

async function listPriorities() {
  return request('/catalogs/priorities')
}

async function requestStateChange(incidentId, payload) {
  return request(`/incidents/${incidentId}/state-requests`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

async function approveStateChangeRequest(incidentId, requestId, payload = {}) {
  return request(`/incidents/${incidentId}/state-requests/${requestId}/approve`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

async function rejectStateChangeRequest(incidentId, requestId, payload = {}) {
  return request(`/incidents/${incidentId}/state-requests/${requestId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

async function getStateChangeRequests(incidentId) {
  return request(`/incidents/${incidentId}/state-requests`)
}

async function getPendingStateChangeRequests() {
  return request('/state-requests/pending')
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
  classifyIncident,
  changeIncidentState,
  listStates,
  listStateTransitions,
  listAssignmentOperators,
  listPriorities,
  listIncidentCategories,
  requestStateChange,
  approveStateChangeRequest,
  rejectStateChangeRequest,
  getStateChangeRequests,
  getPendingStateChangeRequests,
  getReportAnalytics,
  requestNewCategory
}

globalThis.SGIGIncidentsService = incidentsService

export {
  addIncidentComment,
  approveStateChangeRequest,
  assignIncidentOperators,
  classifyIncident,
  changeIncidentState,
  createIncident,
  deleteIncident,
  getIncident,
  getPendingStateChangeRequests,
  getStateChangeRequests,
  listAssignmentOperators,
  listIncidents,
  listPriorities,
  listIncidentCategories,
  listStates,
  listStateTransitions,
  rejectStateChangeRequest,
  requestStateChange,
  updateIncident,
  uploadIncidentAttachment,
  getReportAnalytics,
  requestNewCategory
}
