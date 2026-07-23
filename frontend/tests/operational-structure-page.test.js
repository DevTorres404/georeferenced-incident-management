import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: v => String(v ?? ''),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

vi.mock('../app/js/modules/operations/application/operational-structure-service.js', () => ({
  listOperationalZones: vi.fn(() => Promise.resolve([])),
  listOperationalSupervisors: vi.fn(() => Promise.resolve([])),
  listOperationalOperators: vi.fn(() => Promise.resolve([])),
  getOperationalZonesGeoJson: vi.fn(() => Promise.resolve({ type: 'FeatureCollection', features: [] })),
  updateOperationalOperatorProfile: vi.fn(),
  assignOperationalZoneSupervisor: vi.fn(),
  replaceOperationalZoneOperator: vi.fn()
}))

vi.mock('../app/js/core/config.js', () => ({
  MAP_DEFAULT_CENTER: [-78.5, -1.5],
  MAP_DEFAULT_ZOOM: 6,
  MAP_ECUADOR_BOUNDS: [[-92.2, -5.25], [-75, 1.85]],
  MAP_STYLE_URL: 'mapbox://styles/mapbox/streets-v11'
}))

describe('operational-structure-page — pure functions', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('buildProvinceZoneLookup', () => {
    it('builds lookup from zones with provinces_covered', async () => {
      const { buildProvinceZoneLookup } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const zones = [
        { zone: { id: 1, name: 'Zona 1' }, provinces_covered: [{ name: 'Pichincha' }, { name: 'Imbabura' }] },
        { zone: { id: 2, name: 'Zona 2' }, provinces_covered: [{ name: 'Guayas' }] }
      ]
      const lookup = buildProvinceZoneLookup(zones)
      expect(lookup.PICHINCHA).toBe(zones[0])
      expect(lookup.IMBABURA).toBe(zones[0])
      expect(lookup.GUAYAS).toBe(zones[1])
    })

    it('returns empty object for empty zones', async () => {
      const { buildProvinceZoneLookup } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(buildProvinceZoneLookup([])).toEqual({})
    })

    it('handles zones with no provinces_covered', async () => {
      const { buildProvinceZoneLookup } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const zones = [{ zone: { id: 1 } }]
      expect(buildProvinceZoneLookup(zones)).toEqual({})
    })
  })

  describe('extractCatalogItems', () => {
    it('returns array as-is', async () => {
      const { extractCatalogItems } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(extractCatalogItems([1, 2, 3])).toEqual([1, 2, 3])
    })

    it('extracts data property from response object', async () => {
      const { extractCatalogItems } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(extractCatalogItems({ data: [1, 2] })).toEqual([1, 2])
    })

    it('returns empty array for invalid input', async () => {
      const { extractCatalogItems } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(extractCatalogItems(null)).toEqual([])
      expect(extractCatalogItems({})).toEqual([])
    })
  })

  describe('zoneColor', () => {
    it('returns correct color for known zone codes', async () => {
      const { zoneColor } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(zoneColor('Z1')).toBe('#0f766e')
      expect(zoneColor('Z2')).toBe('#2563eb')
      expect(zoneColor('Z5')).toBe('#dc2626')
    })

    it('returns default color for unknown codes', async () => {
      const { zoneColor } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(zoneColor('Z99')).toBe('#64748b')
    })

    it('handles case insensitive input', async () => {
      const { zoneColor } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(zoneColor('z1')).toBe('#0f766e')
    })

    it('returns default for null/undefined', async () => {
      const { zoneColor } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(zoneColor(null)).toBe('#64748b')
      expect(zoneColor()).toBe('#64748b')
    })
  })

  describe('emptyGeoJson', () => {
    it('returns empty FeatureCollection', async () => {
      const { emptyGeoJson } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(emptyGeoJson()).toEqual({ type: 'FeatureCollection', features: [] })
    })
  })

  describe('fullName', () => {
    it('combines first_name and last_name', async () => {
      const { fullName } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(fullName({ first_name: 'John', last_name: 'Doe' })).toBe('John Doe')
    })

    it('returns single name if only one provided', async () => {
      const { fullName } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(fullName({ first_name: 'John' })).toBe('John')
    })

    it('returns empty string for null', async () => {
      const { fullName } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(fullName(null)).toBe('')
    })

    it('returns empty string for empty object', async () => {
      const { fullName } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(fullName({})).toBe('')
    })
  })

  describe('normalizeText', () => {
    it('uppercases and removes accents', async () => {
      const { normalizeText } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(normalizeText('Pichincha')).toBe('PICHINCHA')
      expect(normalizeText('Los Ríos')).toBe('LOS RIOS')
      expect(normalizeText('Cañar')).toBe('CANAR')
    })

    it('trims whitespace', async () => {
      const { normalizeText } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(normalizeText('  Guayas  ')).toBe('GUAYAS')
    })

    it('sanitizes malformed UTF-8 province names', async () => {
      const { normalizeText } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(normalizeText('GalÃ¡pagos')).toBe('GALAPAGOS')
      expect(normalizeText('BolÃ­var')).toBe('BOLIVAR')
    })
  })

  describe('sanitizeProvinceName', () => {
    it('replaces known malformed names', async () => {
      const { sanitizeProvinceName } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(sanitizeProvinceName('BolÃ­var')).toBe('Bolivar')
      expect(sanitizeProvinceName('GalÃ¡pagos')).toBe('Galapagos')
      expect(sanitizeProvinceName('Santo Domingo de los TsÃ¡chilas')).toBe('Santo Domingo de los Tsachilas')
    })

    it('returns original for correct names', async () => {
      const { sanitizeProvinceName } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(sanitizeProvinceName('Pichincha')).toBe('Pichincha')
    })

    it('handles empty string', async () => {
      const { sanitizeProvinceName } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(sanitizeProvinceName('')).toBe('')
    })
  })

  describe('formatDecimal', () => {
    it('formats to one decimal place', async () => {
      const { formatDecimal } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(formatDecimal(5)).toBe('5.0')
      expect(formatDecimal(5.123)).toBe('5.1')
      expect(formatDecimal(0)).toBe('0.0')
    })

    it('handles null/undefined', async () => {
      const { formatDecimal } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(formatDecimal(null)).toBe('0.0')
      expect(formatDecimal()).toBe('0.0')
    })
  })

  describe('clamp', () => {
    it('clamps value within range', async () => {
      const { clamp } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(clamp(5, 0, 10)).toBe(5)
      expect(clamp(-5, 0, 10)).toBe(0)
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('handles null/undefined with default 0', async () => {
      const { clamp } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(clamp(null, 0, 10)).toBe(0)
    })
  })

  describe('buildProvinceSummary', () => {
    it('returns single province name for 1 province', async () => {
      const { buildProvinceSummary } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(buildProvinceSummary(['Pichincha'])).toBe('Pichincha')
    })

    it('returns first province + count for multiple provinces', async () => {
      const { buildProvinceSummary } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(buildProvinceSummary(['Pichincha', 'Imbabura'])).toBe('Pichincha +1')
    })

    it('returns empty message for empty array', async () => {
      const { buildProvinceSummary } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(buildProvinceSummary([])).toBe('Sin provincias asociadas')
    })
  })

  describe('userHasRole', () => {
    it('returns true when user has the role', async () => {
      const { userHasRole } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const user = { roles: [{ code: 'ADMIN' }] }
      expect(userHasRole(user, 'ADMIN')).toBe(true)
    })

    it('returns false when user lacks the role', async () => {
      const { userHasRole } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const user = { roles: [{ code: 'OPERATOR' }] }
      expect(userHasRole(user, 'ADMIN')).toBe(false)
    })

    it('returns false for null user', async () => {
      const { userHasRole } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(userHasRole(null, 'ADMIN')).toBe(false)
    })

    it('returns false for user with no roles', async () => {
      const { userHasRole } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(userHasRole({}, 'ADMIN')).toBe(false)
    })
  })

  describe('buildZonePopupHtml', () => {
    it('returns HTML string with zone info', async () => {
      const { buildZonePopupHtml } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const zone = {
        zone: { id: 1, name: 'Zona 1', code: 'Z1' },
        provinces_covered: [{ name: 'Pichincha' }],
        active_incidents: 5,
        average_workload_points: 10
      }
      const html = buildZonePopupHtml(zone, 'Pichincha')
      expect(html).toContain('Zona 1')
      expect(html).toContain('Z1')
      expect(html).toContain('Pichincha')
      expect(html).toContain('5')
      expect(html).toContain('10')
    })
  })

  describe('emptyState', () => {
    it('returns HTML with message', async () => {
      const { emptyState } = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const html = emptyState('No data')
      expect(html).toContain('No data')
      expect(html).toContain('fa-sitemap')
    })
  })
})
