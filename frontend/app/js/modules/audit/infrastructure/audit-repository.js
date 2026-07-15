import { request } from '../../../infrastructure/backend-client.js?v=21';

async function fetchAuditLogs(filters = {}) {
  const params = new URLSearchParams();

  if (filters.table) params.set('tabla', filters.table);
  if (filters.tableId) params.set('tabla_id', filters.tableId);
  if (filters.event) params.set('accion', filters.event);
  if (filters.userId) params.set('user_id', filters.userId);
  if (filters.page) params.set('page', filters.page);
  if (filters.perPage) params.set('per_page', filters.perPage);

  const queryString = params.toString();

  return request(`/audit/logs${queryString ? `?${queryString}` : ''}`, { noCache: true });
}

export { fetchAuditLogs };
