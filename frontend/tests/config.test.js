import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('config module', () => {
  beforeEach(() => {
    // Clean up any test-injected globals
    delete globalThis.SGI_API_URL
    delete globalThis.SGI_REVERB_APP_KEY
    delete globalThis.SGI_REVERB_HOST
    delete globalThis.SGI_REVERB_PORT
    delete globalThis.SGI_REVERB_SCHEME
    delete globalThis.SGI_MAP_DEFAULT_CENTER
    delete globalThis.SGI_MAP_DEFAULT_ZOOM
    delete globalThis.SGI_MAP_STYLE_URL
    delete globalThis.SGI_MAP_ECUADOR_NAVIGATION_REGIONS
    delete globalThis.SGI_MAP_ECUADOR_BOUNDS
    delete globalThis.SGI_MAP_BASE_STYLES
    delete globalThis.SGI_REVERSE_GEOCODING_URL
    vi.resetModules()
  })

  it('uses local API URL for localhost', async () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
      configurable: true
    })

    const { API_URL } = await import('../app/js/core/config.js')
    expect(API_URL).toBe('http://127.0.0.1:8000/api')
  })

  it('uses production API URL for non-local host', async () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: 'app.labtorres.me' },
      writable: true,
      configurable: true
    })

    const { API_URL } = await import('../app/js/core/config.js')
    expect(API_URL).toBe('https://api.labtorres.me/api')
  })

  it('uses SGI_API_URL override when set', async () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
      configurable: true
    })
    globalThis.SGI_API_URL = 'https://custom.api.test/api'

    const { API_URL } = await import('../app/js/core/config.js')
    expect(API_URL).toBe('https://custom.api.test/api')
  })

  it('uses local Reverb config for localhost', async () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: '127.0.0.1' },
      writable: true,
      configurable: true
    })

    const { REVERB_HOST, REVERB_PORT, REVERB_SCHEME } = await import('../app/js/core/config.js')
    expect(REVERB_HOST).toBe('127.0.0.1')
    expect(REVERB_SCHEME).toBe('http')
  })

  it('uses production Reverb config for non-local host', async () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: 'app.labtorres.me' },
      writable: true,
      configurable: true
    })

    const { REVERB_HOST, REVERB_PORT, REVERB_SCHEME } = await import('../app/js/core/config.js')
    expect(REVERB_HOST).toBe('api.labtorres.me')
    expect(REVERB_PORT).toBe(443)
    expect(REVERB_SCHEME).toBe('https')
  })

  it('exports APP_NAME', async () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
      configurable: true
    })

    const { APP_NAME } = await import('../app/js/core/config.js')
    expect(APP_NAME).toBe('SGI')
  })

  it('exports API_CACHE_TTL_MS', async () => {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
      configurable: true
    })

    const { API_CACHE_TTL_MS } = await import('../app/js/core/config.js')
    expect(API_CACHE_TTL_MS).toBe(30000)
  })
})
