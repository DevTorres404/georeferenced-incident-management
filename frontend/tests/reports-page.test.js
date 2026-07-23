import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  listIncidents: vi.fn(),
  listStates: vi.fn()
}))

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: v => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  formatCatalogLabel: v => v || '-',
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setFieldError: vi.fn(),
  clearFieldError: vi.fn(),
  setupValidationListeners: vi.fn()
}))

describe('reports-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('CHART_COLORS', () => {
    it('defines all expected color keys', async () => {
      const { CHART_COLORS } = await import('../app/js/modules/reports/presentation/reports-page.js')
      expect(CHART_COLORS.primary).toBe('#0ea5e9')
      expect(CHART_COLORS.success).toBe('#10b981')
      expect(CHART_COLORS.warning).toBe('#f59e0b')
      expect(CHART_COLORS.danger).toBe('#ef4444')
      expect(CHART_COLORS.palette).toHaveLength(8)
    })
  })

  describe('CHART_DEFAULTS', () => {
    it('has responsive true', async () => {
      const { CHART_DEFAULTS } = await import('../app/js/modules/reports/presentation/reports-page.js')
      expect(CHART_DEFAULTS.responsive).toBe(true)
      expect(CHART_DEFAULTS.legend.position).toBe('bottom')
    })
  })

  describe('uniqueSortedValues', () => {
    it('returns sorted unique values from array', async () => {
      const { uniqueSortedValues } = await import('../app/js/modules/reports/presentation/reports-page.js')
      const result = uniqueSortedValues(['Z', 'a', 'b', 'a', ''])
      expect(result).toEqual(['a', 'b', 'Z'])
    })

    it('returns empty array for empty input', async () => {
      const { uniqueSortedValues } = await import('../app/js/modules/reports/presentation/reports-page.js')
      expect(uniqueSortedValues([])).toEqual([])
    })

    it('filters out falsy values', async () => {
      const { uniqueSortedValues } = await import('../app/js/modules/reports/presentation/reports-page.js')
      expect(uniqueSortedValues([null, undefined, '', 'a'])).toEqual(['a'])
    })
  })

  describe('adjustLayoutForRoles', () => {
    it('leaves Top Cities visible and keeps columns as col-lg-4 for SUPERVISOR', async () => {
      // Mock localStorage with SUPERVISOR role
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'SUPERVISOR' }] }))

      // Mock DOM
      document.body.innerHTML = `
        <div id="colTopCiudades" class="col-lg-4"></div>
        <div id="colTopTipos" class="col-lg-4"></div>
        <div id="colEficiencia" class="col-lg-4"></div>
      `

      // Import script and call function
      const { adjustLayoutForRoles } = await import('../app/js/modules/reports/presentation/reports-page.js')
      adjustLayoutForRoles()

      // Assert DOM changes
      const colTop = document.getElementById('colTopCiudades')
      const colTipos = document.getElementById('colTopTipos')
      const colInd = document.getElementById('colEficiencia')

      expect(colTop.style.display).not.toBe('none')
      expect(colTop.className).toBe('col-lg-4')
      expect(colTipos.className).toBe('col-lg-4')
      expect(colInd.className).toBe('col-lg-4')
    })
  })
})
