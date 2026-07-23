import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
  requestAfter: vi.fn()
}))

function createMaplibreglMock() {
  return {
    Map: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      once: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      getCenter: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
      getZoom: vi.fn(() => 10),
      setCenter: vi.fn(),
      setZoom: vi.fn(),
      easeTo: vi.fn(),
      setStyle: vi.fn(),
      addControl: vi.fn(),
      resize: vi.fn(),
      flyTo: vi.fn(),
      getSource: vi.fn(() => ({ setData: vi.fn() })),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      removeLayer: vi.fn(),
      removeSource: vi.fn(),
      getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
      getBounds: vi.fn(() => ({
        getNorth: () => 0,
        getSouth: () => -1,
        getEast: () => -78,
        getWest: () => -79
      })),
      project: vi.fn(() => ({ x: 100, y: 200 })),
      unproject: vi.fn(() => ({ lat: -0.18, lng: -78.5 }))
    })),
    Marker: vi.fn(() => ({
      setLngLat: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      getLngLat: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
      setDraggable: vi.fn().mockReturnThis(),
      getElement: vi.fn(() => document.createElement('div')),
      setPopup: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis()
    })),
    Popup: vi.fn(() => ({
      setLngLat: vi.fn().mockReturnThis(),
      setHTML: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn()
    })),
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
    FullscreenControl: vi.fn()
  }
}

function setupDom() {
  document.body.innerHTML = `
    <div id="map-container"></div>
    <input id="lat-input" />
    <input id="lng-input" />
  `
}

function defaultConfig() {
  return {
    mapId: 'map-container',
    latitudeInputId: 'lat-input',
    longitudeInputId: 'lng-input'
  }
}

describe('coordinate-picker', () => {
  let mod

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    globalThis.maplibregl = createMaplibreglMock()
    globalThis.fetch = vi.fn()
    delete globalThis.SGI_MAP_DEFAULT_CENTER
    delete globalThis.SGI_MAP_DEFAULT_ZOOM
    setupDom()
    mod = await import('../app/js/shared/components/coordinate-picker.js')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete globalThis.maplibregl
    delete globalThis.fetch
    document.body.innerHTML = ''
  })

  describe('module exports', () => {
    it('exports all expected functions', () => {
      expect(mod.createCoordinatePicker).toBeTypeOf('function')
      expect(mod.escapeHtml).toBeTypeOf('function')
      expect(mod.formatCoordinate).toBeTypeOf('function')
      expect(mod.isValidLatitude).toBeTypeOf('function')
      expect(mod.isValidLongitude).toBeTypeOf('function')
      expect(mod.readInputsAsLatLng).toBeTypeOf('function')
      expect(mod.readInputsAsLngLat).toBeTypeOf('function')
    })
  })

  describe('initialization', () => {
    it('creates maplibregl.Map with correct container and Ecuador defaults', () => {
      const picker = mod.createCoordinatePicker(defaultConfig())

      expect(picker).not.toBeNull()
      expect(picker.map).toBeDefined()
      expect(globalThis.maplibregl.Map).toHaveBeenCalledWith(
        expect.objectContaining({
          container: document.getElementById('map-container'),
          zoom: 6
        })
      )
      expect(globalThis.maplibregl.NavigationControl).toHaveBeenCalled()
      expect(globalThis.maplibregl.FullscreenControl).toHaveBeenCalled()
    })

    it('returns null when DOM elements are missing', () => {
      document.body.innerHTML = ''
      const picker = mod.createCoordinatePicker(defaultConfig())
      expect(picker).toBeNull()
    })

    it('returns null and shows empty state when maplibregl is unavailable', async () => {
      vi.resetModules()
      delete globalThis.maplibregl
      const m = await import('../app/js/shared/components/coordinate-picker.js')
      const picker = m.createCoordinatePicker(defaultConfig())

      expect(picker).toBeNull()
      const emptyState = document.querySelector('.map-empty-state')
      expect(emptyState).not.toBeNull()
      expect(emptyState.textContent).toContain('No se pudo cargar el mapa')
    })

    it('accepts custom center and zoom options', () => {
      const latInput = document.getElementById('lat-input')
      const lngInput = document.getElementById('lng-input')
      latInput.value = 'abc'
      lngInput.value = 'def'

      const picker = mod.createCoordinatePicker({
        ...defaultConfig(),
        center: [-78.5, -0.23],
        zoom: 12
      })

      expect(globalThis.maplibregl.Map).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [-78.5, -0.23],
          zoom: 12
        })
      )
    })
  })

  describe('coordinate input', () => {
    it('places marker and eases map when lat/lng inputs change', () => {
      const picker = mod.createCoordinatePicker({
        ...defaultConfig(),
        reverseGeocode: false
      })
      const latInput = document.getElementById('lat-input')
      const lngInput = document.getElementById('lng-input')

      latInput.value = '-2.123456'
      lngInput.value = '-79.123456'
      latInput.dispatchEvent(new Event('input'))

      const markerInstance = globalThis.maplibregl.Marker.mock.results[0].value
      expect(markerInstance.setLngLat).toHaveBeenCalledWith([-79.123456, -2.123456])
      expect(markerInstance.addTo).toHaveBeenCalledWith(picker.map)
      expect(picker.map.easeTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [-79.123456, -2.123456],
          duration: 350
        })
      )
    })

    it('ignores invalid coordinate values', () => {
      const picker = mod.createCoordinatePicker(defaultConfig())
      const latInput = document.getElementById('lat-input')
      const lngInput = document.getElementById('lng-input')

      latInput.value = '999'
      lngInput.value = '-78.5'
      latInput.dispatchEvent(new Event('input'))

      expect(globalThis.maplibregl.Marker).not.toHaveBeenCalled()
    })

    it('ignores values outside valid range', () => {
      const picker = mod.createCoordinatePicker(defaultConfig())
      const latInput = document.getElementById('lat-input')
      const lngInput = document.getElementById('lng-input')

      latInput.value = '-91'
      lngInput.value = '200'
      latInput.dispatchEvent(new Event('input'))

      expect(globalThis.maplibregl.Marker).not.toHaveBeenCalled()
    })
  })

  describe('marker interaction', () => {
    it('places marker on map click', () => {
      const picker = mod.createCoordinatePicker({
        ...defaultConfig(),
        reverseGeocode: false
      })
      const mapInstance = globalThis.maplibregl.Map.mock.results[0].value
      const clickHandler = mapInstance.on.mock.calls.find(c => c[0] === 'click')[1]

      clickHandler({ lngLat: { lat: -0.23, lng: -78.52 } })

      const markerInstance = globalThis.maplibregl.Marker.mock.results[0].value
      expect(markerInstance.setLngLat).toHaveBeenCalledWith([-78.52, -0.23])
      expect(globalThis.maplibregl.Marker).toHaveBeenCalledWith(
        expect.objectContaining({ draggable: true })
      )
      expect(picker.map.easeTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [-78.52, -0.23], duration: 650 })
      )
    })

    it('updates inputs and eases map on marker drag end', () => {
      const picker = mod.createCoordinatePicker({
        ...defaultConfig(),
        reverseGeocode: false
      })
      const mapInstance = globalThis.maplibregl.Map.mock.results[0].value
      const clickHandler = mapInstance.on.mock.calls.find(c => c[0] === 'click')[1]
      clickHandler({ lngLat: { lat: -0.23, lng: -78.52 } })

      const markerInstance = globalThis.maplibregl.Marker.mock.results[0].value
      const dragendHandler = markerInstance.on.mock.calls.find(c => c[0] === 'dragend')[1]

      markerInstance.getLngLat.mockReturnValue({ lat: -0.24, lng: -78.53 })
      dragendHandler()

      expect(document.getElementById('lat-input').value).toBe('-0.240000')
      expect(document.getElementById('lng-input').value).toBe('-78.530000')
      expect(picker.map.easeTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [-78.53, -0.24] })
      )
    })
  })

  describe('place search', () => {
    it('displays results and selects a location', async () => {
      const onReverseGeocode = vi.fn()
      const picker = mod.createCoordinatePicker({
        ...defaultConfig(),
        reverseGeocode: false,
        onReverseGeocode
      })

      const toggle = document.querySelector('.map-search-toggle')
      const input = document.querySelector('.map-search-input')
      const resultsEl = document.querySelector('.map-search-results')

      toggle.click()

      expect(input).toBeTruthy()
      expect(toggle.getAttribute('aria-expanded')).toBe('true')

      input.value = 'Quito'
      input.dispatchEvent(new Event('input'))

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { lat: '-0.22985', lon: '-78.52495', display_name: 'Quito, Ecuador' }
        ])
      })

      await vi.advanceTimersByTimeAsync(410)

      const resultBtn = resultsEl.querySelector('.map-search-result-item')
      expect(resultBtn).not.toBeNull()
      expect(resultBtn.textContent).toContain('Quito')

      resultBtn.click()

      expect(onReverseGeocode).toHaveBeenCalledWith({ display_name: 'Quito, Ecuador' })
      const markerInstance = globalThis.maplibregl.Marker.mock.results[0].value
      expect(markerInstance.setLngLat).toHaveBeenCalledWith([-78.52495, -0.22985])
    })

    it('shows empty state when no results found', async () => {
      mod.createCoordinatePicker(defaultConfig())

      const toggle = document.querySelector('.map-search-toggle')
      const input = document.querySelector('.map-search-input')
      const resultsEl = document.querySelector('.map-search-results')

      toggle.click()
      input.value = 'xyzxyz'
      input.dispatchEvent(new Event('input'))

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([])
      })

      await vi.advanceTimersByTimeAsync(410)

      const emptyEl = resultsEl.querySelector('.is-empty')
      expect(emptyEl).not.toBeNull()
      expect(emptyEl.textContent).toBe('Sin resultados')
    })

    it('shows error state on fetch failure', async () => {
      mod.createCoordinatePicker(defaultConfig())

      const toggle = document.querySelector('.map-search-toggle')
      const input = document.querySelector('.map-search-input')
      const resultsEl = document.querySelector('.map-search-results')

      toggle.click()
      input.value = 'quito'
      input.dispatchEvent(new Event('input'))

      globalThis.fetch.mockRejectedValueOnce(new Error('Network error'))

      await vi.advanceTimersByTimeAsync(410)

      const errorEl = resultsEl.querySelector('.is-error')
      expect(errorEl).not.toBeNull()
      expect(errorEl.textContent).toBe('Error al buscar')
    })
  })

  describe('reverse geocoding', () => {
    it('triggers reverse geocode after map click', async () => {
      const onReverseGeocode = vi.fn()
      mod.createCoordinatePicker({
        ...defaultConfig(),
        onReverseGeocode
      })

      const mapInstance = globalThis.maplibregl.Map.mock.results[0].value
      const clickHandler = mapInstance.on.mock.calls.find(c => c[0] === 'click')[1]

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ display_name: 'Quito, Ecuador' })
      })

      clickHandler({ lngLat: { lat: -0.18, lng: -78.5 } })
      await vi.advanceTimersByTimeAsync(1100)

      expect(onReverseGeocode).toHaveBeenCalledWith({ display_name: 'Quito, Ecuador' })
    })

    it('calls onReverseGeocode(null) on reverse geocode error', async () => {
      const onReverseGeocode = vi.fn()
      mod.createCoordinatePicker({
        ...defaultConfig(),
        onReverseGeocode
      })

      const mapInstance = globalThis.maplibregl.Map.mock.results[0].value
      const clickHandler = mapInstance.on.mock.calls.find(c => c[0] === 'click')[1]

      globalThis.fetch.mockResolvedValueOnce({
        ok: false
      })

      clickHandler({ lngLat: { lat: -0.18, lng: -78.5 } })
      await vi.advanceTimersByTimeAsync(1100)

      expect(onReverseGeocode).toHaveBeenCalledWith(null)
    })
  })

  describe('setPosition', () => {
    it('creates marker and updates inputs when called directly', () => {
      const picker = mod.createCoordinatePicker({
        ...defaultConfig(),
        reverseGeocode: false
      })

      picker.setPosition(-0.5, -78.5, 'search')

      const markerInstance = globalThis.maplibregl.Marker.mock.results[0].value
      expect(markerInstance.setLngLat).toHaveBeenCalledWith([-78.5, -0.5])
      expect(document.getElementById('lat-input').value).toBe('-0.500000')
      expect(document.getElementById('lng-input').value).toBe('-78.500000')
    })

    it('does nothing with invalid coordinates', () => {
      const picker = mod.createCoordinatePicker(defaultConfig())

      picker.setPosition(999, -78.5, 'search')
      expect(globalThis.maplibregl.Marker).not.toHaveBeenCalled()

      picker.setPosition(-0.5, 999, 'search')
      const calls = globalThis.maplibregl.Marker.mock.results.length
      expect(calls).toBe(0)
    })

    it('reuses existing marker when called multiple times', () => {
      const picker = mod.createCoordinatePicker({
        ...defaultConfig(),
        reverseGeocode: false
      })

      picker.setPosition(-0.5, -78.5, 'search')
      picker.setPosition(-0.6, -78.6, 'search')

      expect(globalThis.maplibregl.Marker).toHaveBeenCalledTimes(1)
    })

    it('sets initial position from inputs after map load event', () => {
      document.getElementById('lat-input').value = '-1.5'
      document.getElementById('lng-input').value = '-78.5'
      const picker = mod.createCoordinatePicker({
        ...defaultConfig(),
        reverseGeocode: false
      })

      const mapInstance = globalThis.maplibregl.Map.mock.results[0].value
      const loadHandler = mapInstance.once.mock.calls.find(c => c[0] === 'load')
      expect(loadHandler).toBeDefined()

      loadHandler[1]()

      const markerInstance = globalThis.maplibregl.Marker.mock.results[0].value
      expect(markerInstance.setLngLat).toHaveBeenCalledWith([-78.5, -1.5])
    })
  })

  describe('invalidateSize', () => {
    it('calls map.resize after 120ms delay', () => {
      const picker = mod.createCoordinatePicker(defaultConfig())

      picker.invalidateSize()
      expect(picker.map.resize).not.toHaveBeenCalled()

      vi.advanceTimersByTime(120)
      expect(picker.map.resize).toHaveBeenCalledOnce()
    })
  })

  describe('utility functions', () => {
    describe('formatCoordinate', () => {
      it('formats to 6 decimal places', () => {
        expect(mod.formatCoordinate(5.1234567)).toBe('5.123457')
        expect(mod.formatCoordinate(-0.18)).toBe('-0.180000')
        expect(mod.formatCoordinate(0)).toBe('0.000000')
      })
    })

    describe('isValidLatitude', () => {
      it('returns true for values in [-90, 90]', () => {
        expect(mod.isValidLatitude(0)).toBe(true)
        expect(mod.isValidLatitude(-90)).toBe(true)
        expect(mod.isValidLatitude(90)).toBe(true)
        expect(mod.isValidLatitude(-0.5)).toBe(true)
      })

      it('returns false for values outside [-90, 90]', () => {
        expect(mod.isValidLatitude(-90.1)).toBe(false)
        expect(mod.isValidLatitude(90.1)).toBe(false)
        expect(mod.isValidLatitude(NaN)).toBe(false)
        expect(mod.isValidLatitude(Infinity)).toBe(false)
      })
    })

    describe('isValidLongitude', () => {
      it('returns true for values in [-180, 180]', () => {
        expect(mod.isValidLongitude(0)).toBe(true)
        expect(mod.isValidLongitude(-180)).toBe(true)
        expect(mod.isValidLongitude(180)).toBe(true)
        expect(mod.isValidLongitude(-78.5)).toBe(true)
      })

      it('returns false for values outside [-180, 180]', () => {
        expect(mod.isValidLongitude(-180.1)).toBe(false)
        expect(mod.isValidLongitude(180.1)).toBe(false)
        expect(mod.isValidLongitude(NaN)).toBe(false)
      })
    })

    describe('escapeHtml', () => {
      it('escapes angle brackets', () => {
        expect(mod.escapeHtml('<script>')).toBe('&lt;script&gt;')
        expect(mod.escapeHtml('a & b')).toBe('a &amp; b')
      })
    })

    describe('readInputsAsLatLng', () => {
      it('returns [lat, lng] when inputs are valid', () => {
        const latInput = document.getElementById('lat-input')
        const lngInput = document.getElementById('lng-input')
        latInput.value = '-1.5'
        lngInput.value = '-78.5'
        expect(mod.readInputsAsLatLng(latInput, lngInput)).toEqual([-1.5, -78.5])
      })

      it('returns null when inputs are invalid', () => {
        const latInput = document.getElementById('lat-input')
        const lngInput = document.getElementById('lng-input')
        latInput.value = 'abc'
        lngInput.value = '-78.5'
        expect(mod.readInputsAsLatLng(latInput, lngInput)).toBeNull()
      })
    })

    describe('readInputsAsLngLat', () => {
      it('returns [lng, lat] when inputs are valid', () => {
        const latInput = document.getElementById('lat-input')
        const lngInput = document.getElementById('lng-input')
        latInput.value = '-1.5'
        lngInput.value = '-78.5'
        expect(mod.readInputsAsLngLat(latInput, lngInput)).toEqual([-78.5, -1.5])
      })
    })
  })
})
