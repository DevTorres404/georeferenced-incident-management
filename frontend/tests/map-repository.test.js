import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  requestBackend: vi.fn()
}))

describe('map-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildQuery', () => {
    it('builds query string from filters', async () => {
      const { buildQuery } = await import('../app/js/modules/map/infrastructure/map-repository.js')
      const result = buildQuery({ state: 'active', priority: 'alta' })
      expect(result).toContain('state=active')
      expect(result).toContain('priority=alta')
    })

    it('omits undefined, null, and empty values', async () => {
      const { buildQuery } = await import('../app/js/modules/map/infrastructure/map-repository.js')
      const result = buildQuery({ state: 'active', priority: undefined, empty: '', nullable: null })
      expect(result).toContain('state=active')
      expect(result).not.toContain('priority')
      expect(result).not.toContain('empty')
      expect(result).not.toContain('nullable')
    })

    it('returns empty string for empty filters', async () => {
      const { buildQuery } = await import('../app/js/modules/map/infrastructure/map-repository.js')
      expect(buildQuery({})).toBe('')
      expect(buildQuery()).toBe('')
    })
  })

  describe('fetchIncidentMapPoints', () => {
    it('returns data array on success', async () => {
      const { requestBackend } = await import('../app/js/infrastructure/backend-client.js')
      const { fetchIncidentMapPoints } = await import('../app/js/modules/map/infrastructure/map-repository.js')
      requestBackend.mockResolvedValue({ data: [{ id: 1 }] })
      const result = await fetchIncidentMapPoints({ state: 'active' })
      expect(requestBackend).toHaveBeenCalledWith('/incidents/map?state=active', { noCache: true })
      expect(result).toEqual([{ id: 1 }])
    })

    it('returns empty array when no data', async () => {
      const { requestBackend } = await import('../app/js/infrastructure/backend-client.js')
      const { fetchIncidentMapPoints } = await import('../app/js/modules/map/infrastructure/map-repository.js')
      requestBackend.mockResolvedValue({})
      const result = await fetchIncidentMapPoints()
      expect(result).toEqual([])
    })

    it('returns empty array when response is null', async () => {
      const { requestBackend } = await import('../app/js/infrastructure/backend-client.js')
      const { fetchIncidentMapPoints } = await import('../app/js/modules/map/infrastructure/map-repository.js')
      requestBackend.mockResolvedValue(null)
      const result = await fetchIncidentMapPoints()
      expect(result).toEqual([])
    })
  })

  describe('fetchMapCatalogs', () => {
    it('fetches all catalogs in parallel', async () => {
      const { requestBackend } = await import('../app/js/infrastructure/backend-client.js')
      const { fetchMapCatalogs } = await import('../app/js/modules/map/infrastructure/map-repository.js')
      requestBackend.mockResolvedValue({ data: ['item'] })
      const result = await fetchMapCatalogs()
      expect(requestBackend).toHaveBeenCalledTimes(3)
      expect(result.states).toEqual(['item'])
      expect(result.priorities).toEqual(['item'])
      expect(result.categories).toEqual(['item'])
    })

    it('handles non-array responses', async () => {
      const { requestBackend } = await import('../app/js/infrastructure/backend-client.js')
      const { fetchMapCatalogs } = await import('../app/js/modules/map/infrastructure/map-repository.js')
      requestBackend.mockResolvedValue({})
      const result = await fetchMapCatalogs()
      // When data is missing, the source code does: Array.isArray(states?.data) ? states.data : states
      // And states is {} which is truthy, so result.states === {}
      expect(result.states).toEqual({})
    })
  })
})
