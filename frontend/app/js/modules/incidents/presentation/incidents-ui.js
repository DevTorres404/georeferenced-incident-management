import { hideMainLoader, showMainLoader } from '../../../layout/loader.js?v=20'
import {
  INCIDENT_STATE_ALIASES,
  INCIDENT_STATES,
  isIncidentState
} from '../domain/incident-states.js?v=1'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function normalizeCatalogCode(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .trim()
    .replace(/[\s_]+/g, '_')
    .toUpperCase()
}

function formatCatalogLabel(value) {
  if (!value) {
    return '-'
  }

  const exactMatches = {
    [INCIDENT_STATES.UNDER_REVIEW]: 'En revisión',
    [INCIDENT_STATES.IN_PROGRESS]: 'En progreso',
    [INCIDENT_STATES.IN_ATTENTION]: 'En atención',
    [INCIDENT_STATES.NEW]: 'Nueva',
    [INCIDENT_STATES.PENDING]: 'Pendiente',
    [INCIDENT_STATES.RESOLVED]: 'Resuelta',
    [INCIDENT_STATES.CLOSED]: 'Cerrada',
    [INCIDENT_STATES.REJECTED]: 'Rechazada',
    [INCIDENT_STATES.REOPENED]: 'Reabierta'
  }

  const normalizedCode = normalizeCatalogCode(value)
  if (exactMatches[normalizedCode]) {
    return exactMatches[normalizedCode]
  }

  const normalized = String(value).replace(/[\s_]+/g, ' ').trim()

  if (/^[\d\sA-Z]+$/.test(normalized)) {
    return normalized
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase())
  }

  return normalized
}

function formatShortDate(value) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleDateString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getPriorityBadgeClass(priorityName) {
  const value = String(priorityName || '').toUpperCase()
  const map = {
    CRITICA: 'badge-critica',
    CRÍTICA: 'badge-critica',
    ALTA: 'badge-alta',
    MEDIA: 'badge-media',
    BAJA: 'badge-baja'
  }

  return map[value] || 'badge-secondary'
}

function getPriorityHexColor(priorityName) {
  const value = String(priorityName || '').toUpperCase()
  if (value.includes('CRIT') || value.includes('CRÍT')) {
    return '#dc3545'
  }

  if (value.includes('ALTA')) {
    return '#fd7e14'
  }

  if (value.includes('MEDIA')) {
    return '#0dcaf0'
  }

  if (value.includes('BAJA')) {
    return '#198754'
  }

  return '#6c757d'
}

function getStateBadgeClass(stateName) {
  const value = String(stateName || '').toUpperCase()
  const map = {
    [INCIDENT_STATES.NEW]: 'badge-pendiente',
    [INCIDENT_STATES.PENDING]: 'badge-pendiente',
    [INCIDENT_STATES.UNDER_REVIEW]: 'badge-proceso',
    [INCIDENT_STATE_ALIASES.IN_PROCESS]: 'badge-proceso',
    [INCIDENT_STATES.IN_ATTENTION]: 'badge-proceso',
    [INCIDENT_STATES.RESOLVED]: 'badge-resuelta',
    [INCIDENT_STATES.CLOSED]: 'badge-resuelta'
  }

  return map[value] || 'badge-secondary'
}

function getStateHexColor(stateName) {
  if (isIncidentState(stateName, INCIDENT_STATES.NEW, INCIDENT_STATES.PENDING)) {
    return '#90A4AE'
  }

  if (isIncidentState(stateName, INCIDENT_STATES.UNDER_REVIEW)) {
    return '#2196F3'
  }

  if (isIncidentState(stateName, INCIDENT_STATES.IN_PROGRESS, INCIDENT_STATES.IN_ATTENTION)) {
    return '#FFC107'
  }

  if (isIncidentState(stateName, INCIDENT_STATES.RESOLVED)) {
    return '#8BC34A'
  }

  if (isIncidentState(stateName, INCIDENT_STATES.CLOSED)) {
    return '#4CAF50'
  }

  if (isIncidentState(stateName, INCIDENT_STATES.REJECTED)) {
    return '#F44336'
  }

  if (isIncidentState(stateName, INCIDENT_STATES.REOPENED)) {
    return '#FF9800'
  }

  return '#6c757d'
}

function countByState(incidents, names) {
  const expected = new Set(names.map(normalizeCatalogCode))
  return incidents.filter(incident => expected.has(normalizeCatalogCode(incident.state?.name))).length
}

function showGlobalAlert(message, type = 'success') {
  const target = document.getElementById('alertaGlobal')
  if (!target) {
    return
  }

  const icons = {
    success: 'check-circle',
    danger: 'times-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle'
  }

  target.className = `alert alert-${type} alert-dismissible fade show`
  target.innerHTML = `
    <i class="fas fa-${icons[type] || 'info-circle'} mr-2"></i>
    ${escapeHtml(message)}
    <button type="button" class="close" data-dismiss="alert" aria-label="Cerrar">
      <span aria-hidden="true">&times;</span>
    </button>`
  target.style.display = 'block'

  globalThis.setTimeout(() => {
    target.style.display = 'none'
  }, 5000)
}

function showPageLoading(title, message) {
  showMainLoader()
}

function hidePageLoading() {
  hideMainLoader()
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
  normalizeCatalogCode,
  showGlobalAlert,
  showPageLoading,
  hidePageLoading
}
