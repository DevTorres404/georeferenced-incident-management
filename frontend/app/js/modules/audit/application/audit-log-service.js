import { fetchAuditLogs } from '../infrastructure/audit-repository.js?v=1';

async function listAuditLogs(filters = {}) {
  const response = await fetchAuditLogs(filters);
  const items = Array.isArray(response?.data) ? response.data : [];
  const meta = response?.meta || {};

  return {
    items: items.map(normalizeAuditLog),
    meta: {
      currentPage: Number(meta.current_page || meta.currentPage || filters.page || 1),
      perPage: Number(meta.per_page || meta.perPage || filters.perPage || 25),
      total: Number(meta.total || 0),
      lastPage: Number(meta.last_page || meta.lastPage || 1),
    },
  };
}

function normalizeAuditLog(log = {}) {
  const user = log.user || {};

  return {
    id: log.id,
    event: log.event || '',
    auditableType: log.auditable_type || log.auditableType || '',
    auditableId: log.auditable_id || log.auditableId || '',
    oldValues: normalizeJsonValue(log.old_values || log.oldValues),
    newValues: normalizeJsonValue(log.new_values || log.newValues),
    url: log.url || '',
    ipAddress: log.ip_address || log.ipAddress || '',
    userAgent: log.user_agent || log.userAgent || '',
    tags: normalizeJsonValue(log.tags),
    createdAt: log.created_at || log.createdAt || '',
    user: {
      id: user.id || log.user_id || log.userId || null,
      name: user.name || [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
      email: user.email || '',
    },
  };
}

function normalizeJsonValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export { listAuditLogs };
