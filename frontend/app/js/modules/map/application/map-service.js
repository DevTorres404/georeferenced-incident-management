import { fetchIncidentMapPoints, fetchMapCatalogs } from '../infrastructure/map-repository.js?v=1'

export async function listIncidentMapPoints(filters = {}) {
  return fetchIncidentMapPoints(filters)
}

export async function getMapCatalogs() {
  return fetchMapCatalogs()
}
