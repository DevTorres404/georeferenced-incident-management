import { describe, expect, it } from 'vitest'

import {
  getNotificationTarget,
  isCategoryRequestNotification
} from '../app/js/modules/notifications/presentation/notification-navigation.js?v=1'

describe('notification navigation', () => {
  it('routes new category request notifications to pending requests', () => {
    const notification = {
      type: 'CATEGORY_REQUEST',
      incident_id: 42
    }

    expect(isCategoryRequestNotification(notification)).toBe(true)
    expect(getNotificationTarget(notification)).toBe('/html/category-management.html#tabRequests')
  })

  it('routes legacy category request notifications to pending requests', () => {
    const notification = {
      type: 'STATUS_CHANGE',
      title: 'Nueva solicitud de categoría y subtipo',
      incident_id: 42
    }

    expect(isCategoryRequestNotification(notification)).toBe(true)
    expect(getNotificationTarget(notification)).toBe('/html/category-management.html#tabRequests')
  })

  it('keeps resolved request and incident notifications linked to the incident', () => {
    expect(getNotificationTarget({
      type: 'STATUS_CHANGE',
      title: 'Solicitud de clasificación aprobada',
      incident_id: 42
    })).toBe('/html/incident-detail.html?id=42')

    expect(getNotificationTarget({
      type: 'INCIDENT_ASSIGNED',
      incidentId: 7
    })).toBe('/html/incident-detail.html?id=7')
  })
})
