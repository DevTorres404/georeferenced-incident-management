import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../app/js/layout/loader.js', () => ({
  showMainLoader: vi.fn(),
  hideMainLoader: vi.fn(),
}));

// ---------------------------------------------------------------------------
// A. incidents-ui.js pure functions
// ---------------------------------------------------------------------------
describe('A. incidents-ui.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ------- escapeHtml -------
  describe('escapeHtml', () => {
    it('escapes HTML special chars', async () => {
      const { escapeHtml } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('handles null/undefined', async () => {
      const { escapeHtml } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  // ------- formatCatalogLabel -------
  describe('formatCatalogLabel', () => {
    it('maps exact uppercase keys to Spanish labels', async () => {
      const { formatCatalogLabel } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(formatCatalogLabel('EN_REVISION')).toBe('En revisión');
      expect(formatCatalogLabel('EN PROGRESO')).toBe('En progreso');
      expect(formatCatalogLabel('EN_ATENCION')).toBe('En atención');
      expect(formatCatalogLabel('NUEVA')).toBe('Nueva');
      expect(formatCatalogLabel('PENDIENTE')).toBe('Pendiente');
      expect(formatCatalogLabel('RESUELTA')).toBe('Resuelta');
      expect(formatCatalogLabel('CERRADA')).toBe('Cerrada');
      expect(formatCatalogLabel('RECHAZADA')).toBe('Rechazada');
      expect(formatCatalogLabel('REABIERTA')).toBe('Reabierta');
    });

    it('normalizes spacing, case and accents before formatting known state labels', async () => {
      const { formatCatalogLabel, normalizeCatalogCode } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');

      expect(normalizeCatalogCode('EN_PROGRESO')).toBe('EN_PROGRESO');
      expect(normalizeCatalogCode('  En   progreso  ')).toBe('EN_PROGRESO');
      expect(normalizeCatalogCode('En revisión')).toBe('EN_REVISION');
      expect(formatCatalogLabel('  En   progreso  ')).toBe('En progreso');
      expect(formatCatalogLabel('En revisión')).toBe('En revisión');
    });

    it('renders unknown future state codes as readable labels', async () => {
      const { formatCatalogLabel } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      const label = formatCatalogLabel('PENDIENTE_VALIDACION');

      expect(label).toBe('Pendiente Validacion');
      expect(label).not.toContain('_');
    });

    it('converts ALL_UPPERCASE to Title Case', async () => {
      const { formatCatalogLabel } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(formatCatalogLabel('CRITICA')).toBe('Critica');
      expect(formatCatalogLabel('URGENTE')).toBe('Urgente');
    });

    it('replaces underscores with spaces for non-exact matches', async () => {
      const { formatCatalogLabel } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(formatCatalogLabel('EN_REVISION')).toBe('En revisión');
    });

    it('returns "-" for null/undefined/empty', async () => {
      const { formatCatalogLabel } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(formatCatalogLabel(null)).toBe('-');
      expect(formatCatalogLabel(undefined)).toBe('-');
      expect(formatCatalogLabel('')).toBe('-');
    });
  });

  // ------- formatShortDate -------
  describe('formatShortDate', () => {
    it('returns formatted date string for valid dates', async () => {
      const { formatShortDate } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      const result = formatShortDate('2025-01-15T10:30:00Z');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('returns "-" for null/undefined/invalid dates', async () => {
      const { formatShortDate } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(formatShortDate(null)).toBe('-');
      expect(formatShortDate(undefined)).toBe('-');
      expect(formatShortDate('not-a-date')).toBe('-');
      expect(formatShortDate('')).toBe('-');
    });
  });

  // ------- formatDateTime -------
  describe('formatDateTime', () => {
    it('returns formatted datetime string for valid dates', async () => {
      const { formatDateTime } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      const result = formatDateTime('2025-01-15T10:30:00Z');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('returns "-" for null/undefined/invalid dates', async () => {
      const { formatDateTime } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(formatDateTime(null)).toBe('-');
      expect(formatDateTime(undefined)).toBe('-');
      expect(formatDateTime('not-a-date')).toBe('-');
      expect(formatDateTime('')).toBe('-');
    });
  });

  // ------- getPriorityBadgeClass -------
  describe('getPriorityBadgeClass', () => {
    it('maps CRITICA/CRÍTICA to badge-critica', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getPriorityBadgeClass('CRITICA')).toBe('badge-critica');
      expect(getPriorityBadgeClass('CRÍTICA')).toBe('badge-critica');
    });

    it('maps ALTA to badge-alta', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getPriorityBadgeClass('ALTA')).toBe('badge-alta');
    });

    it('maps MEDIA to badge-media', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getPriorityBadgeClass('MEDIA')).toBe('badge-media');
    });

    it('maps BAJA to badge-baja', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getPriorityBadgeClass('BAJA')).toBe('badge-baja');
    });

    it('defaults to badge-secondary for unknown', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getPriorityBadgeClass('UNKNOWN')).toBe('badge-secondary');
    });

    it('is case insensitive', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getPriorityBadgeClass('critica')).toBe('badge-critica');
      expect(getPriorityBadgeClass('Alta')).toBe('badge-alta');
    });
  });

  // ------- getStateBadgeClass -------
  describe('getStateBadgeClass', () => {
    it('maps NUEVA/PENDIENTE to badge-pendiente', async () => {
      const { getStateBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getStateBadgeClass('NUEVA')).toBe('badge-pendiente');
      expect(getStateBadgeClass('PENDIENTE')).toBe('badge-pendiente');
    });

    it('maps EN_REVISION/EN PROCESO/EN_ATENCION to badge-proceso', async () => {
      const { getStateBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getStateBadgeClass('EN_REVISION')).toBe('badge-proceso');
      expect(getStateBadgeClass('EN PROCESO')).toBe('badge-proceso');
      expect(getStateBadgeClass('EN_ATENCION')).toBe('badge-proceso');
    });

    it('maps RESUELTA/CERRADA to badge-resuelta', async () => {
      const { getStateBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getStateBadgeClass('RESUELTA')).toBe('badge-resuelta');
      expect(getStateBadgeClass('CERRADA')).toBe('badge-resuelta');
    });

    it('defaults to badge-secondary', async () => {
      const { getStateBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getStateBadgeClass('UNKNOWN')).toBe('badge-secondary');
    });

    it('is case insensitive', async () => {
      const { getStateBadgeClass } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(getStateBadgeClass('nueva')).toBe('badge-pendiente');
      expect(getStateBadgeClass('En_Revision')).toBe('badge-proceso');
    });
  });

  // ------- countByState -------
  describe('countByState', () => {
    it('counts incidents by state names (case-insensitive)', async () => {
      const { countByState } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      const incidents = [
        { state: { name: 'NUEVA' } },
        { state: { name: 'EN_REVISION' } },
        { state: { name: 'RESUELTA' } },
        { state: { name: 'NUEVA' } },
      ];
      expect(countByState(incidents, ['NUEVA'])).toBe(2);
      expect(countByState(incidents, ['EN_REVISION'])).toBe(1);
      expect(countByState(incidents, ['RESUELTA', 'CERRADA'])).toBe(1);
    });

    it('matches canonical and display-name state variants', async () => {
      const { countByState } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      const incidents = [
        { state: { name: 'EN_PROGRESO' } },
        { state: { name: ' En progreso ' } },
        { state: { name: 'en   progreso' } },
      ];

      expect(countByState(incidents, ['EN_PROGRESO'])).toBe(3);
    });

    it('returns 0 for empty incidents array', async () => {
      const { countByState } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      expect(countByState([], ['NUEVA'])).toBe(0);
    });

    it('handles null/undefined state', async () => {
      const { countByState } = await import('../app/js/modules/incidents/presentation/incidents-ui.js');
      const incidents = [
        { state: null },
        { state: { name: undefined } },
        {},
      ];
      expect(countByState(incidents, ['NUEVA'])).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// B. backend-client.js
// ---------------------------------------------------------------------------
describe('B. backend-client.js', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('request calls fetch with Authorization header from localStorage', async () => {
    localStorage.setItem('auth_token', 'test-token');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ data: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { request } = await import('../app/js/infrastructure/backend-client.js');
    const result = await request('/test-path');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test-path'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          Accept: 'application/json',
        }),
      }),
    );
    expect(result).toEqual({ data: 'ok' });
  });

  it('request returns parsed JSON on success', async () => {
    localStorage.setItem('auth_token', 't');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ success: true, id: 42 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { request } = await import('../app/js/infrastructure/backend-client.js');
    const data = await request('/test');

    expect(data).toEqual({ success: true, id: 42 });
  });

  it('request handles 401 by dispatching sgi:unauthorized event', async () => {
    localStorage.setItem('auth_token', 't');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const dispatchSpy = vi.spyOn(globalThis, 'dispatchEvent');
    const { request } = await import('../app/js/infrastructure/backend-client.js');

    await expect(request('/test')).rejects.toThrow();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sgi:unauthorized' }),
    );
    dispatchSpy.mockRestore();
  });

  it('request handles network errors gracefully', async () => {
    localStorage.setItem('auth_token', 't');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const { request } = await import('../app/js/infrastructure/backend-client.js');
    await expect(request('/test')).rejects.toThrow('Network failure');
  });

  it('requestBackend is an alias for request (same function reference)', async () => {
    localStorage.setItem('auth_token', 't');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({}),
    }));

    const { request, requestBackend } = await import('../app/js/infrastructure/backend-client.js');
    expect(requestBackend).toBe(request);

    await requestBackend('/alias-test');
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls[0][0]).toContain('/alias-test');
  });

  it('requestRaw returns raw response without JSON parsing', async () => {
    localStorage.setItem('auth_token', 't');
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ parsed: 'data' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { requestRaw } = await import('../app/js/infrastructure/backend-client.js');
    const result = await requestRaw('/raw-test');

    expect(result.response).toBe(mockResponse);
    expect(result.data).toEqual({ parsed: 'data' });
  });

  it('requestBlob fetches authenticated binary content', async () => {
    localStorage.setItem('auth_token', 'photo-token');
    const expectedBlob = new Blob(['avatar'], { type: 'image/jpeg' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      blob: () => Promise.resolve(expectedBlob),
    }));

    const { requestBlob } = await import('../app/js/infrastructure/backend-client.js');
    const result = await requestBlob('/auth/profile/photo', { cache: 'no-store' });

    expect(result).toBe(expectedBlob);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/auth/profile/photo'),
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          Accept: 'image/*',
          Authorization: 'Bearer photo-token',
        }),
      }),
    );
  });

  it('includes Content-Type application/json when body is present', async () => {
    localStorage.setItem('auth_token', 't');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({}),
    }));

    const { request } = await import('../app/js/infrastructure/backend-client.js');
    await request('/test', { method: 'POST', body: JSON.stringify({ key: 'val' }) });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('forwards credentials option when provided', async () => {
    localStorage.setItem('auth_token', 't');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({}),
    }));

    const { request } = await import('../app/js/infrastructure/backend-client.js');
    await request('/test', { credentials: 'include' });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

// ---------------------------------------------------------------------------
// C. realtime-client.js
// ---------------------------------------------------------------------------
describe('C. realtime-client.js', () => {
  let mockChannel;
  let mockConnection;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();

    mockChannel = {
      bind: vi.fn().mockReturnThis(),
      unbind: vi.fn(),
      subscribed: true,
    };

    mockConnection = {
      bind: vi.fn(),
      unbind: vi.fn(),
      state: 'connected',
    };

    globalThis.Pusher = vi.fn(() => ({
      subscribe: vi.fn(() => mockChannel),
      unsubscribe: vi.fn(),
      connection: mockConnection,
    }));
  });

  it('subscribePrivateChannel connects to Pusher and returns subscription object', async () => {
    localStorage.setItem('auth_token', 'valid-token');

    const { subscribePrivateChannel } = await import('../app/js/core/realtime-client.js');
    const subscription = await subscribePrivateChannel('user.1');

    expect(globalThis.Pusher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        wsHost: expect.any(String),
        auth: expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-token',
          }),
        }),
      }),
    );

    expect(subscription).not.toBeNull();
    expect(subscription.channelName).toBe('user.1');
    expect(subscription.channel).toBe(mockChannel);
    expect(typeof subscription.cleanup).toBe('function');
  });

  it('subscribePrivateChannel returns object with cleanup method', async () => {
    localStorage.setItem('auth_token', 'valid-token');

    const { subscribePrivateChannel } = await import('../app/js/core/realtime-client.js');
    const subscription = await subscribePrivateChannel('user.1');

    subscription.cleanup();
    expect(mockChannel.unbind).toHaveBeenCalled();
    expect(mockConnection.unbind).toHaveBeenCalled();
  });

  it('subscribePrivateChannel handles missing session gracefully (returns null)', async () => {
    const { subscribePrivateChannel } = await import('../app/js/core/realtime-client.js');
    const subscription = await subscribePrivateChannel('user.1');
    expect(subscription).toBeNull();
  });

  it('subscribePrivateChannel binds events passed in events parameter', async () => {
    localStorage.setItem('auth_token', 'valid-token');
    const handler = vi.fn();

    const { subscribePrivateChannel } = await import('../app/js/core/realtime-client.js');
    await subscribePrivateChannel('user.1', { 'new-incident': handler });

    expect(mockChannel.bind).toHaveBeenCalledWith('new-incident', handler);
    expect(mockChannel.bind).toHaveBeenCalledWith('pusher:subscription_succeeded', expect.any(Function));
    expect(mockChannel.bind).toHaveBeenCalledWith('pusher:subscription_error', expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// D. coordinate-picker.js — helper functions
// ---------------------------------------------------------------------------
describe('D. coordinate-picker.js — helper functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('isValidLatitude', () => {
    it('returns true for values in -90 to 90 range', async () => {
      const { isValidLatitude } = await import('../app/js/shared/components/coordinate-picker.js');
      expect(isValidLatitude(0)).toBe(true);
      expect(isValidLatitude(-90)).toBe(true);
      expect(isValidLatitude(90)).toBe(true);
      expect(isValidLatitude(-0.229)).toBe(true);
    });

    it('returns false for values outside range', async () => {
      const { isValidLatitude } = await import('../app/js/shared/components/coordinate-picker.js');
      expect(isValidLatitude(-91)).toBe(false);
      expect(isValidLatitude(91)).toBe(false);
    });

    it('returns false for non-numeric values', async () => {
      const { isValidLatitude } = await import('../app/js/shared/components/coordinate-picker.js');
      expect(isValidLatitude('abc')).toBe(false);
      expect(isValidLatitude(undefined)).toBe(false);
    });
  });

  describe('isValidLongitude', () => {
    it('returns true for values in -180 to 180 range', async () => {
      const { isValidLongitude } = await import('../app/js/shared/components/coordinate-picker.js');
      expect(isValidLongitude(0)).toBe(true);
      expect(isValidLongitude(-180)).toBe(true);
      expect(isValidLongitude(180)).toBe(true);
      expect(isValidLongitude(-78.524)).toBe(true);
    });

    it('returns false for values outside range', async () => {
      const { isValidLongitude } = await import('../app/js/shared/components/coordinate-picker.js');
      expect(isValidLongitude(-181)).toBe(false);
      expect(isValidLongitude(181)).toBe(false);
    });

    it('returns false for non-numeric values', async () => {
      const { isValidLongitude } = await import('../app/js/shared/components/coordinate-picker.js');
      expect(isValidLongitude('abc')).toBe(false);
      expect(isValidLongitude(undefined)).toBe(false);
    });
  });

  describe('formatCoordinate', () => {
    it('formats to 6 decimal places', async () => {
      const { formatCoordinate } = await import('../app/js/shared/components/coordinate-picker.js');
      expect(formatCoordinate(-0.229)).toBe('-0.229000');
      expect(formatCoordinate(-78.524)).toBe('-78.524000');
      expect(formatCoordinate(0)).toBe('0.000000');
    });
  });

  describe('readInputsAsLatLng', () => {
    it('reads from DOM inputs and returns [lat, lng] array', async () => {
      document.body.innerHTML = `
        <input id="lat" value="-0.229">
        <input id="lng" value="-78.524">
      `;
      const { readInputsAsLatLng } = await import('../app/js/shared/components/coordinate-picker.js');
      const result = readInputsAsLatLng(
        document.getElementById('lat'),
        document.getElementById('lng'),
      );
      expect(result).toEqual([-0.229, -78.524]);
    });

    it('returns null for invalid inputs', async () => {
      document.body.innerHTML = `
        <input id="lat" value="abc">
        <input id="lng" value="-78.524">
      `;
      const { readInputsAsLatLng } = await import('../app/js/shared/components/coordinate-picker.js');
      const result = readInputsAsLatLng(
        document.getElementById('lat'),
        document.getElementById('lng'),
      );
      expect(result).toBeNull();
    });
  });

  describe('readInputsAsLngLat', () => {
    it('returns [lng, lat] format from DOM inputs', async () => {
      document.body.innerHTML = `
        <input id="lat" value="-0.229">
        <input id="lng" value="-78.524">
      `;
      const { readInputsAsLngLat } = await import('../app/js/shared/components/coordinate-picker.js');
      const result = readInputsAsLngLat(
        document.getElementById('lat'),
        document.getElementById('lng'),
      );
      expect(result).toEqual([-78.524, -0.229]);
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML special chars using DOM', async () => {
      const { escapeHtml } = await import('../app/js/shared/components/coordinate-picker.js');
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });
  });
});
