import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
  requestBackend: vi.fn(),
  requestRaw: vi.fn()
}))

vi.mock('../app/js/core/auth-session.js', () => ({
  clearSession: vi.fn(),
  updateUser: vi.fn(),
  writeSession: vi.fn()
}))

vi.mock('../app/js/core/realtime-client.js', () => ({
  subscribePrivateChannel: vi.fn()
}))

vi.mock('../app/js/modules/audit/infrastructure/audit-repository.js', () => ({
  fetchAuditLogs: vi.fn()
}))

import { request, requestBackend } from '../app/js/infrastructure/backend-client.js'
import { clearSession, updateUser, writeSession } from '../app/js/core/auth-session.js'
import { subscribePrivateChannel } from '../app/js/core/realtime-client.js'
import { fetchAuditLogs } from '../app/js/modules/audit/infrastructure/audit-repository.js'

import {
  changeOwnPassword,
  completeProfile,
  confirmTwoFactor,
  disableTwoFactor,
  enableTwoFactor,
  loginWithEmail,
  logout,
  registerLocal,
  requestPasswordResetCode,
  resendVerificationEmail,
  resetPasswordWithCode,
  restoreSession,
  verifyPasswordResetCode,
  verifyTwoFactorLogin
} from '../app/js/modules/auth/application/auth-service.js'

import {
  addIncidentComment,
  assignIncidentOperators,
  changeIncidentState,
  createIncident,
  getIncident,
  getReportAnalytics,
  listIncidents,
  listPriorities,
  listStates,
  uploadIncidentAttachment
} from '../app/js/modules/incidents/application/incidents-service.js'

import {
  getAccessControlOverview,
  updateRolePermissions,
  getUsersAndRoles,
  assignUserRole
} from '../app/js/modules/roles/application/access-control-service.js'

import { getCategories, getSubcategories } from '../app/js/modules/catalogs/application/catalog-service.js'
import { getCatalogOverview } from '../app/js/modules/catalogs/application/catalogs-service.js'

import {
  listTerritorialUnits,
  getTerritorialTree,
  getTerritorialChildren,
  createTerritorialUnit,
  deactivateTerritorialUnit
} from '../app/js/modules/territorial-units/application/territorial-unit-service.js'

import {
  listOperationalZones,
  assignOperationalZoneSupervisor,
  replaceOperationalZoneOperator,
  listPriorityCatalog
} from '../app/js/modules/operations/application/operational-structure-service.js'

import { listAuditLogs } from '../app/js/modules/audit/application/audit-log-service.js'
import { getDashboardMetrics } from '../app/js/modules/dashboard/application/dashboard-service.js'
import { subscribeToUserNotifications } from '../app/js/modules/notifications/application/subscribe-notifications.usecase.js'
import { subscribeToIncidentRealtime } from '../app/js/modules/incidents/application/subscribe-incident-realtime.usecase.js'
import { subscribeToIncidentComments } from '../app/js/modules/incidents/application/subscribe-incident-comments.usecase.js'

describe('auth-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.SGIGSession = undefined
  })

  describe('loginWithEmail', () => {
    it('sends POST /login with email and password, persists session with access_token', async () => {
      const response = { access_token: 'tok_abc', expires_in: 3600 }
      request.mockResolvedValue(response)

      const result = await loginWithEmail('user@test.com', 'secret123')

      expect(request).toHaveBeenCalledWith('/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@test.com', password: 'secret123' })
      })
      expect(writeSession).toHaveBeenCalledWith(response)
      expect(result).toEqual(response)
    })

    it('returns data with requires_2fa without persisting session', async () => {
      const response = { requires_2fa: true, two_factor_token: '2fa_tok' }
      request.mockResolvedValue(response)

      const result = await loginWithEmail('user@test.com', 'secret')

      expect(request).toHaveBeenCalledTimes(1)
      expect(writeSession).not.toHaveBeenCalled()
      expect(result).toEqual(response)
    })
  })

  describe('registerLocal', () => {
    it('sends POST /register with payload', async () => {
      const payload = { name: 'User', email: 'u@test.com', password: 'secret' }
      request.mockResolvedValue({ id: 1 })

      const result = await registerLocal(payload)

      expect(request).toHaveBeenCalledWith('/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      expect(result).toEqual({ id: 1 })
    })
  })

  describe('restoreSession', () => {
    it('clears session and returns null when no valid session exists', async () => {
      const result = await restoreSession()

      expect(clearSession).toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('fetches /me and returns user when a valid session exists', async () => {
      globalThis.SGIGSession = { hasValidSession: () => true }
      request.mockResolvedValue({ user: { id: 1, name: 'Test' } })

      const result = await restoreSession()

      expect(request).toHaveBeenCalledWith('/me', { noCache: true })
      expect(updateUser).toHaveBeenCalledWith({ id: 1, name: 'Test' })
      expect(result).toEqual({ id: 1, name: 'Test' })
    })

    it('clears session when GET /me throws', async () => {
      globalThis.SGIGSession = { hasValidSession: () => true }
      request.mockRejectedValue(new Error('Network error'))

      const result = await restoreSession()

      expect(clearSession).toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })

  describe('logout', () => {
    it('sends POST /logout and clears session', async () => {
      request.mockResolvedValue({})

      await logout()

      expect(request).toHaveBeenCalledWith('/logout', { method: 'POST' })
      expect(clearSession).toHaveBeenCalled()
    })

    it('clears session even when POST /logout fails', async () => {
      request.mockRejectedValue(new Error('Server error'))

      await logout()

      expect(clearSession).toHaveBeenCalled()
    })
  })

  describe('requestPasswordResetCode', () => {
    it('sends POST /auth/forgot-password with email', async () => {
      request.mockResolvedValue({ message: 'ok' })

      const result = await requestPasswordResetCode('user@test.com')

      expect(request).toHaveBeenCalledWith('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@test.com' })
      })
      expect(result).toEqual({ message: 'ok' })
    })
  })

  describe('changeOwnPassword', () => {
    it('sends PATCH /auth/password with current, new and confirmation', async () => {
      request.mockResolvedValue({ success: true })

      const result = await changeOwnPassword('current_pw', 'new_pw', 'new_pw')

      expect(request).toHaveBeenCalledWith('/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({
          current_password: 'current_pw',
          password: 'new_pw',
          password_confirmation: 'new_pw'
        })
      })
      expect(result).toEqual({ success: true })
    })
  })

  describe('completeProfile', () => {
    it('sends POST /auth/profile with username, updates user when response has user', async () => {
      const response = { user: { id: 1, username: 'john' } }
      request.mockResolvedValue(response)

      const result = await completeProfile('john')

      expect(request).toHaveBeenCalledWith('/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ username: 'john' })
      })
      expect(updateUser).toHaveBeenCalledWith({ id: 1, username: 'john' })
      expect(result).toEqual(response)
    })

    it('does not call updateUser when response has no user', async () => {
      request.mockResolvedValue({ success: true })

      const result = await completeProfile('john')

      expect(updateUser).not.toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })

    it('propagates error when request fails', async () => {
      request.mockRejectedValue(new Error('Network error'))

      await expect(completeProfile('john')).rejects.toThrow('Network error')
    })
  })

  describe('verifyTwoFactorLogin', () => {
    it('sends POST /auth/2fa/verify-login and persists session', async () => {
      globalThis.SGIGSession = { hasValidSession: () => true }
      const response = { access_token: 'tok_2fa' }
      request.mockResolvedValueOnce(response)
      request.mockResolvedValueOnce({ user: { id: 1 } })

      const result = await verifyTwoFactorLogin('2fa_token_val', '123456')

      expect(request).toHaveBeenCalledWith('/auth/2fa/verify-login', {
        method: 'POST',
        body: JSON.stringify({ two_factor_token: '2fa_token_val', code: '123456' })
      })
      expect(writeSession).toHaveBeenCalledWith(response)
      expect(result).toEqual({ ...response, user: { id: 1 } })
    })

    it('returns data without user when refresh fails', async () => {
      globalThis.SGIGSession = { hasValidSession: () => true }
      const response = { access_token: 'tok_2fa' }
      request.mockResolvedValueOnce(response)
      request.mockRejectedValueOnce(new Error('Refresh failed'))

      const result = await verifyTwoFactorLogin('tok', '000000')

      expect(writeSession).toHaveBeenCalledWith(response)
      expect(result).toEqual(response)
    })

    it('propagates error when initial request fails', async () => {
      request.mockRejectedValue(new Error('Invalid code'))

      await expect(verifyTwoFactorLogin('tok', '000000')).rejects.toThrow('Invalid code')
    })
  })

  describe('enableTwoFactor', () => {
    it('sends POST /auth/2fa/enable', async () => {
      request.mockResolvedValue({ secret: 'ABC123', qr_url: 'otpauth://...' })

      const result = await enableTwoFactor()

      expect(request).toHaveBeenCalledWith('/auth/2fa/enable', { method: 'POST' })
      expect(result).toEqual({ secret: 'ABC123', qr_url: 'otpauth://...' })
    })

    it('propagates error when request fails', async () => {
      request.mockRejectedValue(new Error('Server error'))

      await expect(enableTwoFactor()).rejects.toThrow('Server error')
    })
  })

  describe('confirmTwoFactor', () => {
    it('sends POST /auth/2fa/confirm with code', async () => {
      request.mockResolvedValue({ success: true, recovery_codes: ['A1', 'B2'] })

      const result = await confirmTwoFactor('654321')

      expect(request).toHaveBeenCalledWith('/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: '654321' })
      })
      expect(result).toEqual({ success: true, recovery_codes: ['A1', 'B2'] })
    })

    it('propagates error when request fails', async () => {
      request.mockRejectedValue(new Error('Wrong code'))

      await expect(confirmTwoFactor('000000')).rejects.toThrow('Wrong code')
    })
  })

  describe('disableTwoFactor', () => {
    it('sends POST /auth/2fa/disable', async () => {
      request.mockResolvedValue({ success: true })

      const result = await disableTwoFactor()

      expect(request).toHaveBeenCalledWith('/auth/2fa/disable', { method: 'POST' })
      expect(result).toEqual({ success: true })
    })

    it('propagates error when request fails', async () => {
      request.mockRejectedValue(new Error('Unauthorized'))

      await expect(disableTwoFactor()).rejects.toThrow('Unauthorized')
    })
  })

  describe('verifyPasswordResetCode', () => {
    it('sends POST /auth/password/verify-code with email and code', async () => {
      request.mockResolvedValue({ valid: true })

      const result = await verifyPasswordResetCode('user@test.com', 'RESET123')

      expect(request).toHaveBeenCalledWith('/auth/password/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@test.com', code: 'RESET123' })
      })
      expect(result).toEqual({ valid: true })
    })

    it('propagates error when request fails', async () => {
      request.mockRejectedValue(new Error('Invalid code'))

      await expect(verifyPasswordResetCode('user@test.com', 'BAD')).rejects.toThrow('Invalid code')
    })
  })

  describe('resetPasswordWithCode', () => {
    it('sends POST /auth/reset-password with all fields', async () => {
      request.mockResolvedValue({ success: true })

      const result = await resetPasswordWithCode('user@test.com', 'CODE', 'newPass123', 'newPass123')

      expect(request).toHaveBeenCalledWith('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: 'user@test.com',
          code: 'CODE',
          password: 'newPass123',
          password_confirmation: 'newPass123'
        })
      })
      expect(result).toEqual({ success: true })
    })

    it('propagates error when request fails', async () => {
      request.mockRejectedValue(new Error('Expired code'))

      await expect(resetPasswordWithCode('e@t.com', 'C', 'p', 'p')).rejects.toThrow('Expired code')
    })
  })

  describe('resendVerificationEmail', () => {
    it('sends POST /auth/email/resend-verification with email', async () => {
      request.mockResolvedValue({ message: 'Verification email sent' })

      const result = await resendVerificationEmail('user@test.com')

      expect(request).toHaveBeenCalledWith('/auth/email/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@test.com' })
      })
      expect(result).toEqual({ message: 'Verification email sent' })
    })

    it('propagates error when request fails', async () => {
      request.mockRejectedValue(new Error('Email not found'))

      await expect(resendVerificationEmail('unknown@test.com')).rejects.toThrow('Email not found')
    })
  })

  describe('registerLocal', () => {
    it('propagates error when request fails', async () => {
      request.mockRejectedValue(new Error('Registration failed'))

      await expect(registerLocal({ email: 'u@t.com' })).rejects.toThrow('Registration failed')
    })
  })
})

describe('incidents-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listIncidents', () => {
    it('sends GET /incidents with no query string for empty filters', async () => {
      request.mockResolvedValue([])
      await listIncidents({})
      expect(request).toHaveBeenCalledWith('/incidents')
    })

    it('sends GET /incidents with URL params for each filter', async () => {
      request.mockResolvedValue([])
      await listIncidents({ state: 'open', priority: 'high', page: '1' })
      expect(request).toHaveBeenCalledWith('/incidents?state=open&priority=high&page=1')
    })

    it('omits null, undefined, and empty string filter values', async () => {
      request.mockResolvedValue([])
      await listIncidents({ state: 'open', page: null, search: undefined, empty: '' })
      expect(request).toHaveBeenCalledWith('/incidents?state=open')
    })
  })

  describe('getIncident', () => {
    it('sends GET /incidents/{id}', async () => {
      request.mockResolvedValue({ id: 5, title: 'Test' })
      const result = await getIncident(5)
      expect(request).toHaveBeenCalledWith('/incidents/5', {})
      expect(result).toEqual({ id: 5, title: 'Test' })
    })
  })

  describe('createIncident', () => {
    it('sends POST /incidents with JSON body', async () => {
      const payload = { title: 'New', description: 'Desc' }
      request.mockResolvedValue({ id: 1 })

      const result = await createIncident(payload)

      expect(request).toHaveBeenCalledWith('/incidents', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      expect(result).toEqual({ id: 1 })
    })
  })

  describe('uploadIncidentAttachment', () => {
    it('sends POST /incidents/{id}/attachments with FormData', async () => {
      const file = { name: 'doc.pdf', size: 1024 }
      request.mockResolvedValue({ id: 10 })

      const result = await uploadIncidentAttachment(3, file)

      expect(request).toHaveBeenCalledWith('/incidents/3/attachments', {
        method: 'POST',
        body: expect.any(FormData)
      })
      const { body } = request.mock.calls[0][1]
      expect(body.has('file')).toBe(true)
      expect(result).toEqual({ id: 10 })
    })
  })

  describe('changeIncidentState', () => {
    it('sends PATCH /incidents/{id}/state with JSON body', async () => {
      request.mockResolvedValue({ state: 'resolved' })

      const result = await changeIncidentState(5, { state: 'resolved' })

      expect(request).toHaveBeenCalledWith('/incidents/5/state', {
        method: 'PATCH',
        body: JSON.stringify({ state: 'resolved' })
      })
      expect(result).toEqual({ state: 'resolved' })
    })
  })

  describe('addIncidentComment', () => {
    it('sends POST /incidents/{id}/comments with JSON body', async () => {
      request.mockResolvedValue({ id: 99 })

      const result = await addIncidentComment(5, { body: 'Great!' })

      expect(request).toHaveBeenCalledWith('/incidents/5/comments', {
        method: 'POST',
        body: JSON.stringify({ body: 'Great!' })
      })
      expect(result).toEqual({ id: 99 })
    })
  })

  describe('assignIncidentOperators', () => {
    it('sends POST /incidents/{id}/assignments with JSON body', async () => {
      request.mockResolvedValue({ success: true })

      const result = await assignIncidentOperators(5, { operator_ids: [1, 2] })

      expect(request).toHaveBeenCalledWith('/incidents/5/assignments', {
        method: 'POST',
        body: JSON.stringify({ operator_ids: [1, 2] })
      })
      expect(result).toEqual({ success: true })
    })
  })

  describe('getReportAnalytics', () => {
    it('sends GET /incidents/reports/analytics with cache buster _t', async () => {
      request.mockResolvedValue({ total: 10 })
      const result = await getReportAnalytics({ state: 'open' })
      expect(request).toHaveBeenCalledWith(expect.stringMatching(/_t=\d+/))
      expect(request).toHaveBeenCalledWith(expect.stringMatching(/state=open/))
      expect(result).toEqual({ total: 10 })
    })
  })

  describe('listStates', () => {
    it('sends GET /catalogs/states', async () => {
      request.mockResolvedValue([{ id: 1, name: 'Open' }])
      const result = await listStates()
      expect(request).toHaveBeenCalledWith('/catalogs/states')
      expect(result).toEqual([{ id: 1, name: 'Open' }])
    })
  })

  describe('listPriorities', () => {
    it('sends GET /catalogs/priorities', async () => {
      request.mockResolvedValue([{ id: 1, name: 'High' }])
      const result = await listPriorities()
      expect(request).toHaveBeenCalledWith('/catalogs/priorities')
      expect(result).toEqual([{ id: 1, name: 'High' }])
    })
  })
})

describe('access-control-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAccessControlOverview', () => {
    it('sends GET /admin/access-control and normalizes all sections', async () => {
      request.mockResolvedValue({
        data: {
          roles: [
            { role_id: 1, codigo: 'admin', nombre: 'Administrador', descripcion: 'Full access', permissions: [] }
          ],
          permissions_by_module: {
            Users: [{ permission_id: 1, codigo: 'users.view', nombre: 'Ver usuarios', descripcion: 'D', modulo: 'Users' }]
          },
          navigation_items: [
            { navigation_item_id: 1, codigo: 'dashboard', nombre: 'Dashboard', href: '/', permission_code: 'dashboard.view' }
          ],
          users: [{ nombre: 'John', apellido: 'Doe', email: 'john@test.com' }]
        }
      })

      const result = await getAccessControlOverview()

      expect(request).toHaveBeenCalledWith('/admin/access-control')
      expect(result.roles[0]).toMatchObject({
        id: 1,
        code: 'admin',
        name: 'Administrador',
        description: 'Full access'
      })
      expect(result.permissionsByModule.Users[0].code).toBe('users.view')
      expect(result.navigationItems[0]).toMatchObject({
        id: 1,
        code: 'dashboard',
        label: 'Dashboard',
        route: '/',
        permission: 'dashboard.view'
      })
      expect(result.users[0].name).toBe('John Doe')
    })

    it('handles camelCase keys as alternative to snake_case', async () => {
      request.mockResolvedValue({
        data: {
          roles: [{ id: 1, code: 'editor', name: 'Editor', description: 'Can edit', permissions: [] }],
          permissionsByModule: { General: [] },
          navigationItems: [{ id: 1, code: 'home', label: 'Home', route: '/home', permission: 'home.view' }],
          users: [{ id: 1, firstName: 'Jane', lastName: 'Smith', email: 'jane@t.com' }]
        }
      })

      const result = await getAccessControlOverview()

      expect(result.roles[0].name).toBe('Editor')
      expect(result.users[0].name).toBe('Jane Smith')
    })

    it('returns defaults for empty/null data', async () => {
      request.mockResolvedValue({ data: {} })

      const result = await getAccessControlOverview()

      expect(result.roles).toEqual([])
      expect(result.permissionsByModule).toEqual({})
      expect(result.navigationItems).toEqual([])
      expect(result.users).toEqual([])
    })

    it('handles response without data wrapper', async () => {
      request.mockResolvedValue({ roles: [] })
      const result = await getAccessControlOverview()
      expect(result.roles).toEqual([])
    })
  })

  describe('updateRolePermissions', () => {
    it('sends PUT /admin/roles/{id}/permissions with permissions array', async () => {
      request.mockResolvedValue({ data: { id: 1, code: 'admin', name: 'Admin', permissions: [] } })

      const result = await updateRolePermissions('admin', ['users.view', 'users.edit'])

      expect(request).toHaveBeenCalledWith('/admin/roles/admin/permissions', {
        method: 'PUT',
        body: JSON.stringify({ permissions: ['users.view', 'users.edit'] })
      })
      expect(result.data).toBeDefined()
    })

    it('encodes roleId with encodeURIComponent', async () => {
      request.mockResolvedValue({ data: {} })

      await updateRolePermissions('role/with/slashes', [])

      expect(request).toHaveBeenCalledWith(
        '/admin/roles/role%2Fwith%2Fslashes/permissions',
        expect.any(Object)
      )
    })
  })

  describe('getUsersAndRoles', () => {
    it('returns users and roles from getAccessControlOverview', async () => {
      request.mockResolvedValue({
        data: {
          roles: [{ id: 1, code: 'admin', name: 'Admin', permissions: [] }],
          users: [{ id: 1, nombre: 'John', apellido: 'Doe' }]
        }
      })

      const result = await getUsersAndRoles()

      expect(result.users).toHaveLength(1)
      expect(result.roles).toHaveLength(1)
    })
  })

  describe('assignUserRole', () => {
    it('sends PUT /users/{id}/roles with role code in array', async () => {
      request.mockResolvedValue({ data: { id: 1, role: 'admin' } })

      const result = await assignUserRole(1, 'admin')

      expect(request).toHaveBeenCalledWith('/users/1/roles', {
        method: 'PUT',
        body: JSON.stringify({ roles: ['admin'] })
      })
      expect(result.data).toBeDefined()
    })
  })
})

describe('catalog-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCategories', () => {
    it('sends GET /catalogs/categories and returns data array', async () => {
      requestBackend.mockResolvedValue({ data: [{ id: 1, name: 'Cat 1' }] })
      const result = await getCategories()
      expect(requestBackend).toHaveBeenCalledWith('/catalogs/categories')
      expect(result).toEqual([{ id: 1, name: 'Cat 1' }])
    })
  })

  describe('getSubcategories', () => {
    it('sends GET /catalogs/categories/{id}/subcategories with valid id', async () => {
      requestBackend.mockResolvedValue({ data: [{ id: 1, name: 'Sub 1' }] })
      const result = await getSubcategories(5)
      expect(requestBackend).toHaveBeenCalledWith('/catalogs/categories/5/subcategories')
      expect(result).toEqual([{ id: 1, name: 'Sub 1' }])
    })

    it('returns empty array for null id without calling API', async () => {
      const result = await getSubcategories(null)
      expect(requestBackend).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('returns empty array for undefined id', async () => {
      const result = await getSubcategories()
      expect(requestBackend).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })
})

describe('catalogs-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCatalogOverview', () => {
    it('sends GET /catalogs and returns data', async () => {
      requestBackend.mockResolvedValue({ data: { categories: [], states: [] } })
      const result = await getCatalogOverview()
      expect(requestBackend).toHaveBeenCalledWith('/catalogs')
      expect(result).toEqual({ categories: [], states: [] })
    })
  })
})

describe('territorial-unit-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listTerritorialUnits', () => {
    it('sends GET /territorial-units with noCache and query params', async () => {
      requestBackend.mockResolvedValue({ data: [{ id: 1 }] })
      const result = await listTerritorialUnits({ province: 'P1' })
      expect(requestBackend).toHaveBeenCalledWith('/territorial-units?province=P1', { noCache: true })
      expect(result).toEqual([{ id: 1 }])
    })

    it('sends without query string for empty filters', async () => {
      requestBackend.mockResolvedValue({ data: [] })
      await listTerritorialUnits({})
      expect(requestBackend).toHaveBeenCalledWith('/territorial-units', { noCache: true })
    })

    it('omits null and empty string filter values', async () => {
      requestBackend.mockResolvedValue({ data: [] })
      await listTerritorialUnits({ province: null, type: '', name: undefined })
      expect(requestBackend).toHaveBeenCalledWith('/territorial-units', { noCache: true })
    })

    it('returns empty array when response data is not an array', async () => {
      requestBackend.mockResolvedValue({ data: null })
      const result = await listTerritorialUnits()
      expect(result).toEqual([])
    })
  })

  describe('getTerritorialTree', () => {
    it('sends GET /territorial-units/tree with noCache', async () => {
      requestBackend.mockResolvedValue({ data: [{ id: 1, children: [] }] })
      const result = await getTerritorialTree()
      expect(requestBackend).toHaveBeenCalledWith('/territorial-units/tree', { noCache: true })
      expect(result).toEqual([{ id: 1, children: [] }])
    })
  })

  describe('getTerritorialChildren', () => {
    it('sends GET /territorial-units/{id}/children with valid parentId', async () => {
      requestBackend.mockResolvedValue({ data: [{ id: 2 }] })
      const result = await getTerritorialChildren(1)
      expect(requestBackend).toHaveBeenCalledWith('/territorial-units/1/children', { noCache: true })
      expect(result).toEqual([{ id: 2 }])
    })

    it('returns empty array for null parentId without calling API', async () => {
      const result = await getTerritorialChildren(null)
      expect(requestBackend).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe('createTerritorialUnit', () => {
    it('sends POST /territorial-units with JSON body', async () => {
      const payload = { name: 'New Unit', type: 'province' }
      requestBackend.mockResolvedValue({ data: { id: 1 } })

      const result = await createTerritorialUnit(payload)

      expect(requestBackend).toHaveBeenCalledWith('/territorial-units', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      expect(result).toEqual({ data: { id: 1 } })
    })
  })

  describe('deactivateTerritorialUnit', () => {
    it('sends DELETE /territorial-units/{id}', async () => {
      requestBackend.mockResolvedValue({ success: true })

      const result = await deactivateTerritorialUnit(5)

      expect(requestBackend).toHaveBeenCalledWith('/territorial-units/5', {
        method: 'DELETE'
      })
      expect(result).toEqual({ success: true })
    })
  })
})

describe('operational-structure-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listOperationalZones', () => {
    it('sends GET /admin/operations/zones with noCache', async () => {
      requestBackend.mockResolvedValue({ data: [{ id: 1, name: 'Zone A' }] })
      const result = await listOperationalZones()
      expect(requestBackend).toHaveBeenCalledWith('/admin/operations/zones', { noCache: true })
      expect(result).toEqual([{ id: 1, name: 'Zone A' }])
    })

    it('returns empty array when response has no data', async () => {
      requestBackend.mockResolvedValue({})
      const result = await listOperationalZones()
      expect(result).toEqual([])
    })
  })

  describe('assignOperationalZoneSupervisor', () => {
    it('sends PUT /admin/operations/zones/{id}/supervisor with JSON body', async () => {
      requestBackend.mockResolvedValue({ data: { user_id: 5 } })

      const result = await assignOperationalZoneSupervisor(1, { user_id: 5 })

      expect(requestBackend).toHaveBeenCalledWith('/admin/operations/zones/1/supervisor', {
        method: 'PUT',
        body: JSON.stringify({ user_id: 5 })
      })
      expect(result).toEqual({ user_id: 5 })
    })
  })

  describe('replaceOperationalZoneOperator', () => {
    it('sends PUT /admin/operations/operators/{userId}/replacement with JSON body', async () => {
      requestBackend.mockResolvedValue({ data: { user_id: 10 } })

      const result = await replaceOperationalZoneOperator(3, { replacement_user_id: 10 })

      expect(requestBackend).toHaveBeenCalledWith('/admin/operations/operators/3/replacement', {
        method: 'PUT',
        body: JSON.stringify({ replacement_user_id: 10 })
      })
      expect(result).toEqual({ user_id: 10 })
    })
  })

  describe('listPriorityCatalog', () => {
    it('sends GET /admin/catalogs/priorities with noCache', async () => {
      requestBackend.mockResolvedValue({ data: [{ id: 1, name: 'High' }] })
      const result = await listPriorityCatalog()
      expect(requestBackend).toHaveBeenCalledWith('/admin/catalogs/priorities', { noCache: true })
      expect(result).toEqual([{ id: 1, name: 'High' }])
    })
  })
})

describe('audit-log-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listAuditLogs', () => {
    it('calls fetchAuditLogs with filters and normalizes response', async () => {
      fetchAuditLogs.mockResolvedValue({
        data: [
          {
            id: 1,
            event: 'created',
            auditable_type: 'App\\User',
            auditable_id: '5',
            old_values: null,
            new_values: '{"name":"John"}',
            url: '/users',
            ip_address: '127.0.0.1',
            user_agent: 'Chrome',
            tags: null,
            created_at: '2024-01-01T00:00:00Z',
            user: { id: 1, first_name: 'Admin', last_name: 'User', email: 'admin@t.com' }
          }
        ],
        meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 }
      })

      const result = await listAuditLogs({ page: 1 })

      expect(fetchAuditLogs).toHaveBeenCalledWith({ page: 1 })
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        id: 1,
        event: 'created',
        auditableType: 'App\\User',
        auditableId: '5',
        newValues: { name: 'John' },
        url: '/users',
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome'
      })
      expect(result.items[0].user).toMatchObject({
        id: 1,
        name: 'Admin User',
        email: 'admin@t.com'
      })
      expect(result.meta).toEqual({ currentPage: 1, perPage: 25, total: 1, lastPage: 1 })
    })

    it('handles empty/null data and missing meta', async () => {
      fetchAuditLogs.mockResolvedValue({})
      const result = await listAuditLogs()
      expect(result.items).toEqual([])
      expect(result.meta.currentPage).toBe(1)
      expect(result.meta.total).toBe(0)
    })

    it('handles newValues as already-parsed object', async () => {
      fetchAuditLogs.mockResolvedValue({
        data: [{ id: 1, newValues: { email: 'test@t.com' }, user: {} }]
      })
      const result = await listAuditLogs()
      expect(result.items[0].newValues).toEqual({ email: 'test@t.com' })
    })
  })
})

describe('dashboard-service.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDashboardMetrics', () => {
    it('calls requestBackend for metrics and listIncidents in parallel', async () => {
      requestBackend.mockResolvedValue({ data: { total_incidents: 42, open: 10 } })
      request.mockResolvedValue({ data: [{ id: 1, title: 'Recent' }] })

      const result = await getDashboardMetrics()

      expect(requestBackend).toHaveBeenCalledWith('/dashboard/metrics')
      expect(request).toHaveBeenCalledWith('/incidents?per_page=5')
      expect(result.total_incidents).toBe(42)
      expect(result.recentIncidents).toEqual([{ id: 1, title: 'Recent' }])
    })

    it('uses raw response when metrics has no data wrapper', async () => {
      requestBackend.mockResolvedValue({ total_incidents: 10 })
      request.mockResolvedValue({ data: [] })

      const result = await getDashboardMetrics()

      expect(result.total_incidents).toBe(10)
      expect(result.recentIncidents).toEqual([])
    })

    it('returns empty recentIncidents when incidents data is not an array', async () => {
      requestBackend.mockResolvedValue({ data: { total: 0 } })
      request.mockResolvedValue({ data: null })

      const result = await getDashboardMetrics()

      expect(result.recentIncidents).toEqual([])
    })
  })
})

describe('subscribe-notifications.usecase.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('subscribeToUserNotifications', () => {
    it('subscribes to users.{userId}.notifications channel', async () => {
      subscribePrivateChannel.mockResolvedValue({ cleanup: vi.fn() })
      const onNotification = vi.fn()

      const result = await subscribeToUserNotifications({ id: 5 }, onNotification)

      expect(subscribePrivateChannel).toHaveBeenCalledWith(
        'users.5.notifications',
        { 'notification.created': expect.any(Function) },
        { onStateChange: expect.any(Function) }
      )
      expect(result).not.toBeNull()
    })

    it('accepts user_id as alternative to id', async () => {
      subscribePrivateChannel.mockResolvedValue({ cleanup: vi.fn() })
      const result = await subscribeToUserNotifications({ user_id: 10 }, vi.fn())
      expect(subscribePrivateChannel).toHaveBeenCalledWith(
        'users.10.notifications',
        expect.any(Object),
        expect.any(Object)
      )
      expect(result).not.toBeNull()
    })

    it('returns null when user has no id', async () => {
      const result = await subscribeToUserNotifications({}, vi.fn())
      expect(result).toBeNull()
      expect(subscribePrivateChannel).not.toHaveBeenCalled()
    })

    it('returns null when onNotification is not a function', async () => {
      const result = await subscribeToUserNotifications({ id: 1 }, null)
      expect(result).toBeNull()
    })

    it('invokes onNotification when notification.created fires', async () => {
      let captured
      subscribePrivateChannel.mockImplementation((channel, events) => {
        captured = events['notification.created']
        return Promise.resolve({ cleanup: vi.fn() })
      })

      const onNotification = vi.fn()
      await subscribeToUserNotifications({ id: 1 }, onNotification)

      captured({ notification: { id: 10, message: 'Test' } })
      expect(onNotification).toHaveBeenCalledWith({ id: 10, message: 'Test' })
    })

    it('does not invoke onNotification without notification property in payload', async () => {
      let captured
      subscribePrivateChannel.mockImplementation((channel, events) => {
        captured = events['notification.created']
        return Promise.resolve({ cleanup: vi.fn() })
      })

      const onNotification = vi.fn()
      await subscribeToUserNotifications({ id: 1 }, onNotification)

      captured({})
      expect(onNotification).not.toHaveBeenCalled()
    })
  })
})

describe('subscribe-incident-realtime.usecase.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('subscribeToIncidentRealtime', () => {
    it('subscribes to state and assignment channels', async () => {
      subscribePrivateChannel.mockResolvedValue({ cleanup: vi.fn() })
      const onStateChanged = vi.fn()
      const onAssigned = vi.fn()

      const result = await subscribeToIncidentRealtime(1, { onStateChanged, onAssigned })

      expect(subscribePrivateChannel).toHaveBeenCalledTimes(2)
      expect(subscribePrivateChannel).toHaveBeenCalledWith(
        'incidents.1.state',
        { 'incident.state.changed': expect.any(Function) },
        { onStateChange: expect.any(Function) }
      )
      expect(subscribePrivateChannel).toHaveBeenCalledWith(
        'incidents.1.assignments',
        { 'incident.assigned': expect.any(Function) },
        { onStateChange: expect.any(Function) }
      )
      expect(result).toHaveProperty('cleanup')
    })

    it('subscribes only to state channel when only onStateChanged is provided', async () => {
      subscribePrivateChannel.mockResolvedValue({ cleanup: vi.fn() })

      const result = await subscribeToIncidentRealtime(5, { onStateChanged: vi.fn() })

      expect(subscribePrivateChannel).toHaveBeenCalledTimes(1)
      expect(subscribePrivateChannel).toHaveBeenCalledWith(
        'incidents.5.state',
        expect.any(Object),
        expect.any(Object)
      )
      expect(result).not.toBeNull()
    })

    it('returns null when no incidentId is given', async () => {
      const result = await subscribeToIncidentRealtime(null, { onStateChanged: vi.fn() })
      expect(result).toBeNull()
      expect(subscribePrivateChannel).not.toHaveBeenCalled()
    })

    it('returns null when no callbacks match', async () => {
      const result = await subscribeToIncidentRealtime(1, {})
      expect(result).toBeNull()
      expect(subscribePrivateChannel).not.toHaveBeenCalled()
    })

    it('cleanup calls cleanup on all subscriptions', async () => {
      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()
      subscribePrivateChannel
        .mockResolvedValueOnce({ cleanup: cleanup1 })
        .mockResolvedValueOnce({ cleanup: cleanup2 })

      const result = await subscribeToIncidentRealtime(1, {
        onStateChanged: vi.fn(),
        onAssigned: vi.fn()
      })

      result.cleanup()
      expect(cleanup1).toHaveBeenCalled()
      expect(cleanup2).toHaveBeenCalled()
    })

    it('only invokes callbacks with truthy payloads', async () => {
      let captured
      subscribePrivateChannel.mockImplementation((channel, events) => {
        if (channel === 'incidents.1.state') {
          captured = events['incident.state.changed']
        }

        return Promise.resolve({ cleanup: vi.fn() })
      })

      const onStateChanged = vi.fn()
      await subscribeToIncidentRealtime(1, { onStateChanged })

      captured(null)
      expect(onStateChanged).not.toHaveBeenCalled()

      captured({ state: 'resolved' })
      expect(onStateChanged).toHaveBeenCalledWith({ state: 'resolved' })
    })
  })
})

describe('subscribe-incident-comments.usecase.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('subscribeToIncidentComments', () => {
    it('subscribes to public comments channel', async () => {
      subscribePrivateChannel.mockResolvedValue({ cleanup: vi.fn() })

      const result = await subscribeToIncidentComments(1, false, vi.fn())

      expect(subscribePrivateChannel).toHaveBeenCalledTimes(1)
      expect(subscribePrivateChannel).toHaveBeenCalledWith(
        'incidents.1.comments',
        { 'comment.created': expect.any(Function) },
        { onStateChange: expect.any(Function) }
      )
      expect(result).toHaveProperty('cleanup')
    })

    it('subscribes to both public and internal channels when includeInternal is true', async () => {
      subscribePrivateChannel.mockResolvedValue({ cleanup: vi.fn() })

      const result = await subscribeToIncidentComments(2, true, vi.fn())

      expect(subscribePrivateChannel).toHaveBeenCalledTimes(2)
      expect(subscribePrivateChannel).toHaveBeenCalledWith(
        'incidents.2.internal-comments',
        { 'comment.created': expect.any(Function) },
        { onStateChange: expect.any(Function) }
      )
      expect(result).not.toBeNull()
    })

    it('returns cleanup function', async () => {
      subscribePrivateChannel.mockResolvedValue({ cleanup: vi.fn() })
      const result = await subscribeToIncidentComments(1, false, vi.fn())
      expect(typeof result.cleanup).toBe('function')
    })

    it('returns null when incidentId is missing', async () => {
      const result = await subscribeToIncidentComments(null, false, vi.fn())
      expect(result).toBeNull()
      expect(subscribePrivateChannel).not.toHaveBeenCalled()
    })

    it('returns null when onComment is not a function', async () => {
      const result = await subscribeToIncidentComments(1, false, null)
      expect(result).toBeNull()
    })

    it('invokes onComment when comment.created fires', async () => {
      let captured
      subscribePrivateChannel.mockImplementation((channel, events) => {
        captured = events['comment.created']
        return Promise.resolve({ cleanup: vi.fn() })
      })

      const onComment = vi.fn()
      await subscribeToIncidentComments(1, false, onComment)

      captured({ comment: { id: 42, body: 'Nice!' } })
      expect(onComment).toHaveBeenCalledWith({ id: 42, body: 'Nice!' })
    })

    it('skips onComment when payload has no comment property', async () => {
      let captured
      subscribePrivateChannel.mockImplementation((channel, events) => {
        captured = events['comment.created']
        return Promise.resolve({ cleanup: vi.fn() })
      })

      const onComment = vi.fn()
      await subscribeToIncidentComments(1, false, onComment)

      captured({})
      expect(onComment).not.toHaveBeenCalled()
    })

    it('cleanup calls cleanup on every subscription', async () => {
      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()
      subscribePrivateChannel
        .mockResolvedValueOnce({ cleanup: cleanup1 })
        .mockResolvedValueOnce({ cleanup: cleanup2 })

      const result = await subscribeToIncidentComments(3, true, vi.fn())

      result.cleanup()
      expect(cleanup1).toHaveBeenCalled()
      expect(cleanup2).toHaveBeenCalled()
    })
  })
})
