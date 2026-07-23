export const INCIDENT_STATES = Object.freeze({
  NEW: 'NUEVA',
  PENDING: 'PENDIENTE',
  UNDER_REVIEW: 'EN_REVISION',
  IN_PROGRESS: 'EN_PROGRESO',
  IN_ATTENTION: 'EN_ATENCION',
  ASSIGNED: 'ASIGNADA',
  RESOLVED: 'RESUELTA',
  CLOSED: 'CERRADA',
  REJECTED: 'RECHAZADA',
  REOPENED: 'REABIERTA',
  CANCELLED: 'CANCELADA'
})

export const INCIDENT_STATE_ALIASES = Object.freeze({
  NEW: 'NEW',
  PENDING: 'PENDING',
  IN_PROCESS: 'EN PROCESO',
  IN_PROGRESS: 'IN_PROGRESS',
  ASSIGNED: 'ASSIGNED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
  REOPENED: 'REOPENED',
  CANCELLED: 'CANCELLED'
})

export const INCIDENT_STATE_GROUPS = Object.freeze({
  PENDING: Object.freeze([
    INCIDENT_STATES.NEW,
    INCIDENT_STATES.PENDING,
    INCIDENT_STATE_ALIASES.NEW,
    INCIDENT_STATE_ALIASES.PENDING
  ]),
  IN_PROGRESS: Object.freeze([
    INCIDENT_STATES.IN_PROGRESS,
    INCIDENT_STATE_ALIASES.IN_PROGRESS
  ]),
  IN_PROGRESS_OR_BEYOND: Object.freeze([
    INCIDENT_STATES.IN_PROGRESS,
    INCIDENT_STATE_ALIASES.IN_PROGRESS,
    INCIDENT_STATES.ASSIGNED,
    INCIDENT_STATE_ALIASES.ASSIGNED,
    INCIDENT_STATES.RESOLVED,
    INCIDENT_STATE_ALIASES.RESOLVED,
    INCIDENT_STATES.CLOSED,
    INCIDENT_STATE_ALIASES.CLOSED,
    INCIDENT_STATES.REJECTED,
    INCIDENT_STATE_ALIASES.REJECTED,
    INCIDENT_STATES.CANCELLED,
    INCIDENT_STATE_ALIASES.CANCELLED
  ])
})

export function normalizeIncidentState(value) {
  return String(value?.code || value?.codigo || value?.name || value?.nombre || value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .trim()
    .replace(/[\s_]+/g, '_')
    .toUpperCase()
}

export function isIncidentState(value, ...expectedStates) {
  const normalized = normalizeIncidentState(value)
  return expectedStates.some(expected => normalizeIncidentState(expected) === normalized)
}

export function isIncidentStateIn(value, expectedStates) {
  const normalized = normalizeIncidentState(value)
  return expectedStates.some(expected => normalizeIncidentState(expected) === normalized)
}
