import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

vi.mock('../app/js/shared/sanitizer.js', () => ({
  escapeHtml: v => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}))

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

describe('notifications-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules()
    globalThis.requestBackend = vi.fn()
    globalThis.mutateBackend = vi.fn()
    globalThis.showGlobalAlert = vi.fn()
  })

  afterEach(() => {
    delete globalThis.requestBackend
    delete globalThis.mutateBackend
    delete globalThis.showGlobalAlert
  })

  describe('PER_PAGE', () => {
    it('is 15', async () => {
      const { PER_PAGE } = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(PER_PAGE).toBe(15)
    })
  })

  describe('formatDateTime', () => {
    it('formats date to DD/MM/YYYY HH:mm', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      // Source uses getHours/getMinutes (local time), so result depends on TZ
      const result = mod.formatDateTime('2025-01-15T10:05:00')
      expect(result).toMatch(/^15\/01\/2025 \d{2}:05$/)
      expect(result).not.toBe('Invalid Date')
    })

    it('returns empty for truly invalid date string', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.formatDateTime('invalid')).toBe('')
    })
  })

  describe('getIconClass', () => {
    it('returns assigned icon', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.getIconClass('assigned')).toBe('fa-user-check')
      expect(mod.getIconClass('asignado')).toBe('fa-user-check')
    })

    it('returns comment icon', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.getIconClass('comment')).toBe('fa-comment-dots')
    })

    it('returns default icon', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.getIconClass('unknown')).toBe('fa-info-circle')
    })
  })

  describe('getTypeClass', () => {
    it('returns type-assigned for assigned', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.getTypeClass('assigned')).toBe('type-assigned')
    })

    it('returns type-closed for closed/resolved', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.getTypeClass('resolved')).toBe('type-closed')
    })

    it('returns type-warning for overdue', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.getTypeClass('overdue')).toBe('type-warning')
    })

    it('returns type-info as default', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.getTypeClass('other')).toBe('type-info')
    })
  })

  describe('filterNotifications', () => {
    it('returns all for "all" filter', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      const items = [{ id: 1, is_read: true }, { id: 2, is_read: false }]
      expect(mod.filterNotifications(items, 'all')).toHaveLength(2)
    })

    it('returns unread for "unread" filter', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      const items = [{ id: 1, is_read: true }, { id: 2, is_read: false }]
      expect(mod.filterNotifications(items, 'unread')).toHaveLength(1)
      expect(mod.filterNotifications(items, 'unread')[0].id).toBe(2)
    })

    it('returns read for "read" filter', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      const items = [{ id: 1, is_read: true }, { id: 2, is_read: false }]
      expect(mod.filterNotifications(items, 'read')).toHaveLength(1)
      expect(mod.filterNotifications(items, 'read')[0].id).toBe(1)
    })

    it('handles isRead camelCase property', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      const items = [{ id: 1, isRead: true }, { id: 2, isRead: false }]
      expect(mod.filterNotifications(items, 'read')).toHaveLength(1)
      expect(mod.filterNotifications(items, 'unread')).toHaveLength(1)
    })
  })

  describe('buildPageList', () => {
    it('returns all pages when <= 7', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.buildPageList(1, 5)).toEqual(['1', '2', '3', '4', '5'])
    })

    it('includes ellipsis for large sets', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      const pages = mod.buildPageList(10, 30)
      expect(pages[0]).toBe('1')
      expect(pages).toContain('ellipsis')
      expect(pages[pages.length - 1]).toBe('30')
    })
  })
})
