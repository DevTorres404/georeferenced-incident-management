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

export async function fetchIncidentMapPoints(filters = {}) {
  const suffix = buildQuery(filters);
  const response = await requestBackend(`/incidents/map${suffix}`, { noCache: true });
  return Array.isArray(response?.data) ? response.data : [];
}

export async function fetchMapCatalogs() {
  const [states, priorities, categories] = await Promise.all([
    requestBackend('/catalogs/states'),
    requestBackend('/catalogs/priorities'),
    requestBackend('/catalogs/categories'),
  ]);

  return {
    states: Array.isArray(states?.data) ? states.data : states || [],
    priorities: Array.isArray(priorities?.data) ? priorities.data : priorities || [],
    categories: Array.isArray(categories?.data) ? categories.data : categories || [],
  };
}
