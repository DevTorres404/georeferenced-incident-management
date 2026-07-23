import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../app/js/shared/sanitizer.js', () => ({
  escapeHtml: v => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}))

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

vi.mock('../app/js/modules/audit/application/audit-log-service.js', () => ({
  listAuditLogs: vi.fn()
}))

describe('audit-logs-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('EVENT_LABELS', () => {
    it('defines all event types', async () => {
      const { EVENT_LABELS } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(EVENT_LABELS.created.label).toBe('Creado')
      expect(EVENT_LABELS.updated.badge).toBe('badge-info')
      expect(EVENT_LABELS.deleted.badge).toBe('badge-danger')
      expect(EVENT_LABELS.restored.badge).toBe('badge-warning')
    })
  })

  describe('formatAuditableType', () => {
    it('maps known class names', async () => {
      const { formatAuditableType } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(formatAuditableType('App\\Models\\Incident')).toBe('Incidencia')
      expect(formatAuditableType('App\\Models\\User')).toBe('Usuario')
    })

    it('returns last segment for unknown', async () => {
      const { formatAuditableType } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(formatAuditableType('App\\Models\\Category')).toBe('Category')
    })
  })

  describe('eventBadge', () => {
    it('generates badge HTML for known event', async () => {
      const { eventBadge } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      const html = eventBadge('created')
      expect(html).toContain('badge-success')
      expect(html).toContain('Creado')
    })

    it('generates badge for unknown event', async () => {
      const { eventBadge } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      const html = eventBadge('custom_event')
      expect(html).toContain('badge-secondary')
    })
  })

  describe('parseValues', () => {
    it('returns empty object for null', async () => {
      const { parseValues } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(parseValues(null)).toEqual({})
    })

    it('returns object as-is', async () => {
      const { parseValues } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(parseValues({ field: 'value' })).toEqual({ field: 'value' })
    })

    it('parses JSON string', async () => {
      const { parseValues } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(parseValues('{"key": "val"}')).toEqual({ key: 'val' })
    })

    it('returns empty for invalid JSON', async () => {
      const { parseValues } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(parseValues('not-json')).toEqual({})
    })
  })

  describe('formatDiffValue', () => {
    it('returns dash for null/undefined', async () => {
      const { formatDiffValue } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(formatDiffValue(null)).toBe('-')
      expect(formatDiffValue()).toBe('-')
    })

    it('converts boolean to Si/No', async () => {
      const { formatDiffValue } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(formatDiffValue(true)).toBe('Si')
      expect(formatDiffValue(false)).toBe('No')
    })

    it('stringifies objects', async () => {
      const { formatDiffValue } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(formatDiffValue({ a: 1 })).toBe('{"a":1}')
    })

    it('returns string for primitives', async () => {
      const { formatDiffValue } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(formatDiffValue('hello')).toBe('hello')
      expect(formatDiffValue(42)).toBe('42')
    })
  })

  describe('stringifyValues', () => {
    it('returns empty for null', async () => {
      const { stringifyValues } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(stringifyValues(null)).toBe('')
    })

    it('returns string as-is', async () => {
      const { stringifyValues } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(stringifyValues('hello')).toBe('hello')
    })

    it('pretty-prints objects', async () => {
      const { stringifyValues } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      const result = stringifyValues({ name: 'test' })
      expect(result).toContain('"name"')
      expect(result).toContain('"test"')
    })
  })

  describe('formatDateTime', () => {
    it('formats date with locale es-EC', async () => {
      const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      const result = mod.formatDateTime('2025-01-15T10:00:00')
      expect(result).toContain('2025')
      expect(result).toContain('01')
      expect(result).toContain('15')
    })

    it('returns dash for invalid', async () => {
      const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(mod.formatDateTime(null)).toBe('-')
    })
  })

  describe('buildPageList', () => {
    it('returns all pages when <= 7', async () => {
      const { buildPageList } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      expect(buildPageList(1, 4)).toEqual(['1', '2', '3', '4'])
    })

    it('includes ellipsis for large counts', async () => {
      const { buildPageList } = await import('../app/js/modules/audit/presentation/audit-logs-page.js')
      const pages = buildPageList(10, 50)
      expect(pages).toContain('ellipsis')
      expect(pages[0]).toBe('1')
      expect(pages[pages.length - 1]).toBe('50')
    })
  })
})
