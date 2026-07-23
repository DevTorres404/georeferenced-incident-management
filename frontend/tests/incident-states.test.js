import { describe, expect, it } from 'vitest'

import {
  INCIDENT_STATE_GROUPS,
  INCIDENT_STATES,
  isIncidentState,
  isIncidentStateIn,
  normalizeIncidentState
} from '../app/js/modules/incidents/domain/incident-states.js'

describe('incident state catalog', () => {
  it('exposes canonical backend values as immutable constants', () => {
    expect(INCIDENT_STATES.IN_PROGRESS).toBe('EN_PROGRESO')
    expect(INCIDENT_STATES.CLOSED).toBe('CERRADA')
    expect(Object.isFrozen(INCIDENT_STATES)).toBe(true)
  })

  it('normalizes catalog values and state objects consistently', () => {
    expect(normalizeIncidentState('En progreso')).toBe('EN_PROGRESO')
    expect(normalizeIncidentState({ name: 'reabierta' })).toBe('REABIERTA')
    expect(normalizeIncidentState('En atención')).toBe('EN_ATENCION')
  })

  it('matches canonical values and compatibility aliases through shared groups', () => {
    expect(isIncidentState('resuelta', INCIDENT_STATES.RESOLVED)).toBe(true)
    expect(isIncidentStateIn('IN_PROGRESS', INCIDENT_STATE_GROUPS.IN_PROGRESS)).toBe(true)
    expect(isIncidentStateIn('ASIGNADA', INCIDENT_STATE_GROUPS.IN_PROGRESS_OR_BEYOND)).toBe(true)
    expect(isIncidentStateIn('PENDIENTE', INCIDENT_STATE_GROUPS.IN_PROGRESS)).toBe(false)
  })
})
