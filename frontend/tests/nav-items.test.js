import { describe, expect, it } from 'vitest'

import { NAV_ITEMS, PAGE_ACCESS, ROLES } from '../app/js/layout/nav-items.js?v=8'

describe('admin navigation contract', () => {
  it('defines only the requested admin areas and incident entries', () => {
    expect(NAV_ITEMS.map(item => item.id)).toEqual([
      'workspace',
      'incident-hub',
      'territorial-ops',
      'territorial-zonal',
      'admin-tools',
      'system-info'
    ])

    const incidentHub = NAV_ITEMS.find(item => item.id === 'incident-hub')
    expect(incidentHub.children.map(item => item.id)).toEqual([
      'incidents',
      'assignment-management',
      'incident-map',
      'incident-create'
    ])
    expect(
      incidentHub.children
        .filter(item => !item.allowedRoles || item.allowedRoles.includes(ROLES.ADMIN))
        .map(item => item.id)
    ).toEqual(['incidents', 'incident-map'])
    expect(PAGE_ACCESS['assignment-management'].allowedRoles).toEqual([ROLES.SUPERVISOR])
    expect(PAGE_ACCESS['incident-create'].allowedRoles).toEqual([ROLES.CITIZEN])
  })

  it('reserves zonal coverage for supervisors', () => {
    const zonalCoverage = NAV_ITEMS.find(item => item.id === 'territorial-zonal')

    expect(zonalCoverage.allowedRoles).toBeUndefined()
    expect(zonalCoverage.children[0].allowedRoles).toEqual([ROLES.SUPERVISOR])
  })
})
