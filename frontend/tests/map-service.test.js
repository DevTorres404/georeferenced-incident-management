import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../app/js/modules/map/infrastructure/map-repository.js', () => ({
  fetchIncidentMapPoints: vi.fn(),
  fetchMapCatalogs: vi.fn()
}))

describe('map-service', () => {
  it('listIncidentMapPoints calls fetchIncidentMapPoints with filters', async () => {
    const { fetchIncidentMapPoints } = await import('../app/js/modules/map/infrastructure/map-repository.js')
    const { listIncidentMapPoints } = await import('../app/js/modules/map/application/map-service.js')
    fetchIncidentMapPoints.mockResolvedValue([{ id: 1 }])
    const result = await listIncidentMapPoints({ state: 'active' })
    expect(fetchIncidentMapPoints).toHaveBeenCalledWith({ state: 'active' })
    expect(result).toEqual([{ id: 1 }])
  })

  it('getMapCatalogs calls fetchMapCatalogs', async () => {
    const { fetchMapCatalogs } = await import('../app/js/modules/map/infrastructure/map-repository.js')
    const { getMapCatalogs } = await import('../app/js/modules/map/application/map-service.js')
    fetchMapCatalogs.mockResolvedValue({ states: [] })
    const result = await getMapCatalogs()
    expect(fetchMapCatalogs).toHaveBeenCalledOnce()
    expect(result).toEqual({ states: [] })
  })
})
