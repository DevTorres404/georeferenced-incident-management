import { hideMainLoader, showMainLoader } from '../../../layout/loader.js?v=20';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCatalogLabel(value) {
  if (!value) return '-';

  const exactMatches = {
    'EN_REVISION': 'En revisión',
    'EN REVISION': 'En revisión',
    'EN_PROGRESO': 'En progreso',
    'EN PROGRESO': 'En progreso',
    'EN_ATENCION': 'En atención',
    'EN ATENCION': 'En atención',
    'NUEVA': 'Nueva',
    'PENDIENTE': 'Pendiente',
    'RESUELTA': 'Resuelta',
    'CERRADA': 'Cerrada',
    'RECHAZADA': 'Rechazada',
  };

  const upperValue = String(value).toUpperCase().trim();
  if (exactMatches[upperValue]) {
    return exactMatches[upperValue];
  }

  const normalized = String(value).replace(/_/g, ' ').trim();

  if (/^[A-Z0-9\s]+$/.test(normalized)) {
    return normalized
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return normalized;
}

function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPriorityBadgeClass(priorityName) {
  const value = String(priorityName || '').toUpperCase();
  const map = {
    CRITICA: 'badge-critica',
    CRÍTICA: 'badge-critica',
    ALTA: 'badge-alta',
    MEDIA: 'badge-media',
    BAJA: 'badge-baja',
  };

  return map[value] || 'badge-secondary';
}

function getPriorityHexColor(priorityName) {
  const value = String(priorityName || '').toUpperCase();
  if (value.includes('CRIT') || value.includes('CRÍT')) return '#dc3545';
  if (value.includes('ALTA')) return '#fd7e14';
  if (value.includes('MEDIA')) return '#0dcaf0';
  if (value.includes('BAJA')) return '#198754';
  return '#6c757d';
}

function getStateBadgeClass(stateName) {
  const value = String(stateName || '').toUpperCase();
  const map = {
    NUEVA: 'badge-pendiente',
    PENDIENTE: 'badge-pendiente',
    EN_REVISION: 'badge-proceso',
    'EN PROCESO': 'badge-proceso',
    EN_ATENCION: 'badge-proceso',
    RESUELTA: 'badge-resuelta',
    CERRADA: 'badge-resuelta',
  };

  return map[value] || 'badge-secondary';
}

function getStateHexColor(stateName) {
  const normalized = String(stateName || '').toUpperCase().replace(/_/g, ' ');
  if (normalized === 'NUEVA' || normalized === 'PENDIENTE') return '#90A4AE';
  if (normalized === 'EN REVISION') return '#2196F3';
  if (normalized === 'EN PROGRESO' || normalized === 'EN ATENCION') return '#FFC107';
  if (normalized === 'RESUELTA') return '#8BC34A';
  if (normalized === 'CERRADA') return '#4CAF50';
  if (normalized === 'RECHAZADA') return '#F44336';
  if (normalized === 'REABIERTA') return '#FF9800';
  return '#6c757d';
}

function countByState(incidents, names) {
  const expected = new Set(names.map((item) => item.toUpperCase()));
  return incidents.filter((incident) => expected.has(String(incident.state?.name || '').toUpperCase())).length;
}

function showGlobalAlert(message, type = 'success') {
  const target = document.getElementById('alertaGlobal');
  if (!target) return;

  const icons = {
    success: 'check-circle',
    danger: 'times-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle',
  };

  target.className = `alert alert-${type} alert-dismissible fade show`;
  target.innerHTML = `
    <i class="fas fa-${icons[type] || 'info-circle'} mr-2"></i>
    ${escapeHtml(message)}
    <button type="button" class="close" data-dismiss="alert" aria-label="Cerrar">
      <span aria-hidden="true">&times;</span>
    </button>`;
  target.style.display = 'block';

  globalThis.setTimeout(() => {
    target.style.display = 'none';
  }, 5000);
}

function showPageLoading(title, message) {
  showMainLoader();
}

function hidePageLoading() {
  hideMainLoader();
}

export {
  countByState,
  escapeHtml,
  formatCatalogLabel,
  formatDateTime,
  formatShortDate,
  getPriorityBadgeClass,
  getPriorityHexColor,
  getStateBadgeClass,
  getStateHexColor,
  showGlobalAlert,
  showPageLoading,
  hidePageLoading,
};
