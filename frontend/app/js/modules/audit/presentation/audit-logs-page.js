import { escapeHtml } from '../../../shared/sanitizer.js?v=20';
import { hidePageLoading, showPageLoading } from '../../incidents/presentation/incidents-ui.js?v=16';
import { listAuditLogs } from '../application/audit-log-service.js?v=1';

const EVENT_LABELS = {
  created: { label: 'Creado', badge: 'badge-success' },
  updated: { label: 'Actualizado', badge: 'badge-info' },
  deleted: { label: 'Eliminado', badge: 'badge-danger' },
  restored: { label: 'Restaurado', badge: 'badge-warning' },
};

const state = {
  page: 1,
  perPage: 25,
  table: '',
  tableId: '',
  event: '',
};

document.addEventListener('DOMContentLoaded', initAuditLogsPage);

async function initAuditLogsPage() {
  window.renderLayout?.('audit-logs');
  bindFilters();
  await loadAuditLogs();
}

function bindFilters() {
  document.getElementById('audit-filter-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.page = 1;
    readFilters();
    await loadAuditLogs();
  });

  document.getElementById('audit-clear-filters')?.addEventListener('click', async () => {
    resetFilters();
    await loadAuditLogs();
  });

  document.getElementById('audit-pagination')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;

    const nextPage = Number(button.dataset.page);
    if (!Number.isFinite(nextPage) || nextPage === state.page) return;

    state.page = nextPage;
    await loadAuditLogs();
  });
}

function readFilters() {
  state.table = document.getElementById('audit-table-filter')?.value.trim() || '';
  state.tableId = document.getElementById('audit-record-filter')?.value.trim() || '';
  state.event = document.getElementById('audit-event-filter')?.value || '';
  state.perPage = Number(document.getElementById('audit-per-page')?.value || 25);
}

function resetFilters() {
  state.page = 1;
  state.perPage = 25;
  state.table = '';
  state.tableId = '';
  state.event = '';

  setValue('audit-table-filter', '');
  setValue('audit-record-filter', '');
  setValue('audit-event-filter', '');
  setValue('audit-per-page', '25');
}

async function loadAuditLogs() {
  showPageLoading('Cargando auditoría', 'Consultando registros...');
  hideAlert();

  try {
    const result = await listAuditLogs({
      page: state.page,
      perPage: state.perPage,
      table: state.table,
      tableId: state.tableId,
      event: state.event,
    });

    state.page = result.meta.currentPage;
    state.perPage = result.meta.perPage;
    renderAuditLogs(result.items);
    renderSummary(result.meta);
    renderPagination(result.meta);
  } catch (error) {
    renderAuditLogs([]);
    renderSummary({ currentPage: 1, total: 0, lastPage: 1, perPage: state.perPage });
    renderPagination({ currentPage: 1, total: 0, lastPage: 1, perPage: state.perPage });
    showAlert(error.message || 'No se pudieron cargar los logs de auditoría.', 'danger');
  } finally {
    hidePageLoading();
  }
}

function renderAuditLogs(logs) {
  const tbody = document.getElementById('audit-log-table-body');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          <i class="fas fa-search d-block mb-2"></i>No se encontraron logs de auditoría.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = logs.map((log) => `
    <tr>
      <td>
        <span class="font-weight-bold">${escapeHtml(formatDateTime(log.createdAt))}</span>
        <small class="d-block text-muted">#${escapeHtml(log.id || '-')}</small>
      </td>
      <td>${eventBadge(log.event)}</td>
      <td>
        <span class="font-weight-bold">${escapeHtml(formatAuditableType(log.auditableType))}</span>
        <small class="d-block text-muted">ID ${escapeHtml(log.auditableId || '-')}</small>
      </td>
      <td>
        <span>${escapeHtml(log.user.name || 'Sistema')}</span>
        <small class="d-block text-muted">${escapeHtml(log.user.email || (log.user.id ? `Usuario #${log.user.id}` : 'Proceso interno'))}</small>
      </td>
      <td>
        <span>${escapeHtml(log.ipAddress || '-')}</span>
        <small class="d-block text-muted text-truncate audit-log-url" title="${escapeHtml(log.url || '')}">
          ${escapeHtml(log.url || 'Sin endpoint')}
        </small>
      </td>
      <td>${renderChanges(log)}</td>
    </tr>
  `).join('');
}

function renderChanges(log) {
  const oldValues = parseValues(log.oldValues);
  const newValues = parseValues(log.newValues);

  if (!Object.keys(oldValues).length && !Object.keys(newValues).length) {
    return '<span class="text-muted">Sin cambios registrados</span>';
  }

  const allKeys = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])];

  return `
    <details class="audit-log-details">
      <summary>${allKeys.length} campo(s) modificados</summary>
      <table class="table table-sm table-borderless mb-0 audit-log-diff-table" style="min-width:200px;">
        <thead>
          <tr>
            <th>Campo</th>
            ${oldValues ? '<th>Valor anterior</th>' : ''}
            <th>Valor nuevo</th>
          </tr>
        </thead>
        <tbody>
          ${allKeys.map((key) => `
            <tr>
              <td class="font-weight-bold">${escapeHtml(key)}</td>
              ${oldValues ? `<td class="text-muted">${escapeHtml(formatDiffValue(oldValues[key]))}</td>` : ''}
              <td>${escapeHtml(formatDiffValue(newValues[key]))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </details>`;
}

function parseValues(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function formatDiffValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderPagination(meta) {
  const pagination = document.getElementById('audit-pagination');
  if (!pagination) return;

  const current = Number(meta.currentPage || 1);
  const last = Math.max(Number(meta.lastPage || 1), 1);
  const pages = buildPageList(current, last);

  pagination.innerHTML = `
    <li class="page-item ${current === 1 ? 'disabled' : ''}">
      <button type="button" class="page-link" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>Anterior</button>
    </li>
    ${pages.map((page) => page === 'ellipsis'
      ? '<li class="page-item disabled"><span class="page-link">...</span></li>'
      : `<li class="page-item ${page === current ? 'active' : ''}">
          <button type="button" class="page-link" data-page="${page}">${page}</button>
        </li>`).join('')}
    <li class="page-item ${current === last ? 'disabled' : ''}">
      <button type="button" class="page-link" data-page="${current + 1}" ${current === last ? 'disabled' : ''}>Siguiente</button>
    </li>`;
}

function buildPageList(current, last) {
  if (last <= 7) {
    return Array.from({ length: last }, (_, index) => index + 1);
  }

  const pages = [1];
  const start = Math.max(current - 1, 2);
  const end = Math.min(current + 1, last - 1);

  if (start > 2) pages.push('ellipsis');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < last - 1) pages.push('ellipsis');
  pages.push(last);

  return pages;
}

function eventBadge(event) {
  const config = EVENT_LABELS[event] || { label: event || 'Evento', badge: 'badge-secondary' };
  return `<span class="badge ${config.badge}">${escapeHtml(config.label)}</span>`;
}

function formatAuditableType(value) {
  const name = String(value || '').split('\\').pop();
  const labels = {
    Incident: 'Incidencia',
    User: 'Usuario',
  };

  return labels[name] || name || 'Registro';
}

function stringifyValues(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function formatDateTime(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function showAlert(message, type) {
  const alert = document.getElementById('audit-alert');
  if (!alert) return;

  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alert.classList.remove('d-none');
}

function hideAlert() {
  document.getElementById('audit-alert')?.classList.add('d-none');
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
