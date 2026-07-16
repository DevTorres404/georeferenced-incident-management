import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────

function futureISO(secondsFromNow = 3600) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

function pastISO() {
  return new Date(Date.now() - 3600000).toISOString();
}

// ─── 1. Storage ──────────────────────────────────────────

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('get returns parsed JSON for valid JSON values', async () => {
    localStorage.setItem('test', '{"a":1}');
    const { StorageService } = await import('../app/js/core/storage.js');
    expect(StorageService.get('test')).toEqual({ a: 1 });
  });

  it('get returns raw string for non-JSON values', async () => {
    localStorage.setItem('test', 'plain text');
    const { StorageService } = await import('../app/js/core/storage.js');
    expect(StorageService.get('test')).toBe('plain text');
  });

  it('get returns null for missing keys', async () => {
    const { StorageService } = await import('../app/js/core/storage.js');
    expect(StorageService.get('nonexistent')).toBeNull();
  });

  it('set stringifies objects before storing', async () => {
    const { StorageService } = await import('../app/js/core/storage.js');
    StorageService.set('obj', { a: 1 });
    expect(localStorage.getItem('obj')).toBe('{"a":1}');
  });

  it('set stores strings directly', async () => {
    const { StorageService } = await import('../app/js/core/storage.js');
    StorageService.set('str', 'hello');
    expect(localStorage.getItem('str')).toBe('hello');
  });

  it('remove deletes a key', async () => {
    const { StorageService } = await import('../app/js/core/storage.js');
    localStorage.setItem('x', '1');
    StorageService.remove('x');
    expect(localStorage.getItem('x')).toBeNull();
  });

  it('clear removes all keys', async () => {
    const { StorageService } = await import('../app/js/core/storage.js');
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    StorageService.clear();
    expect(localStorage.length).toBe(0);
  });

  it('get returns null for missing keys', async () => {
    const { StorageService } = await import('../app/js/core/storage.js');
    expect(StorageService.get('nonexistent')).toBeNull();
  });

  it('get returns raw string when JSON.parse fails', async () => {
    const { StorageService } = await import('../app/js/core/storage.js');
    localStorage.setItem('bad', '{broken');
    expect(StorageService.get('bad')).toBe('{broken');
  });

  it('get returns null when localStorage.getItem returns null', async () => {
    const { StorageService } = await import('../app/js/core/storage.js');
    expect(StorageService.get('missing')).toBeNull();
  });
});

// ─── 2. Auth Session ─────────────────────────────────────

describe('auth-session', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete globalThis.SGIGSession;
    delete globalThis.SGIGApi;
    vi.resetModules();
  });

  it('clearSession removes all auth keys and clears sessionStorage', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('user_data', '{"n":"t"}');
    localStorage.setItem('auth_expires_at', futureISO());
    sessionStorage.setItem('SGI_API_CACHE_foo', 'cached');
    sessionStorage.setItem('other', 'keep');

    const { clearSession } = await import('../app/js/core/auth-session.js');
    clearSession();

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_data')).toBeNull();
    expect(localStorage.getItem('auth_expires_at')).toBeNull();
    expect(sessionStorage.getItem('SGI_API_CACHE_foo')).toBeNull();
    expect(sessionStorage.getItem('other')).toBe('keep');
  });

  it('formatExpiry converts seconds to locale time string', async () => {
    const { formatExpiry } = await import('../app/js/core/auth-session.js');
    const result = formatExpiry('2025-06-15T14:30:00.000Z');
    expect(result).toBeTypeOf('string');
    expect(result).not.toBe('No definida');
  });

  it('formatExpiry returns No definida for invalid date', async () => {
    const { formatExpiry } = await import('../app/js/core/auth-session.js');
    expect(formatExpiry('not-a-date')).toBe('No definida');
  });

  it('formatExpiry reads from localStorage when called without args', async () => {
    localStorage.setItem('auth_expires_at', '2025-06-15T14:30:00.000Z');
    const { formatExpiry } = await import('../app/js/core/auth-session.js');
    const result = formatExpiry();
    expect(result).toBeTypeOf('string');
    expect(result).not.toBe('No definida');
  });

  it('getSession returns parsed auth data from localStorage', async () => {
    localStorage.setItem('auth_token', 'tok123');
    localStorage.setItem('user_data', '{"name":"test"}');
    localStorage.setItem('auth_expires_at', futureISO());
    const { getSession } = await import('../app/js/core/auth-session.js');
    const session = getSession();
    expect(session.token).toBe('tok123');
    expect(session.user).toEqual({ name: 'test' });
    expect(session.expiresAt).toBeTypeOf('string');
  });

  it('getSession returns null user when user_data is missing', async () => {
    localStorage.setItem('auth_token', 'tok123');
    const { getSession } = await import('../app/js/core/auth-session.js');
    const session = getSession();
    expect(session.token).toBe('tok123');
    expect(session.user).toBeNull();
  });

  it('hasValidSession returns true when token exists and not expired', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('auth_expires_at', futureISO());
    const { hasValidSession } = await import('../app/js/core/auth-session.js');
    expect(hasValidSession()).toBe(true);
  });

  it('hasValidSession returns false when no token', async () => {
    localStorage.setItem('auth_expires_at', futureISO());
    const { hasValidSession } = await import('../app/js/core/auth-session.js');
    expect(hasValidSession()).toBe(false);
  });

  it('hasValidSession returns false when expired', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('auth_expires_at', pastISO());
    const { hasValidSession } = await import('../app/js/core/auth-session.js');
    expect(hasValidSession()).toBe(false);
  });

  it('hasValidSession returns false when expiresAt is missing', async () => {
    localStorage.setItem('auth_token', 'tok');
    const { hasValidSession } = await import('../app/js/core/auth-session.js');
    expect(hasValidSession()).toBe(false);
  });

  it('isEmailVerified checks email_verificado_at', async () => {
    const { isEmailVerified } = await import('../app/js/core/auth-session.js');
    expect(isEmailVerified({ email_verificado_at: '2025-01-01' })).toBe(true);
  });

  it('isEmailVerified checks email_verified_at', async () => {
    const { isEmailVerified } = await import('../app/js/core/auth-session.js');
    expect(isEmailVerified({ email_verified_at: '2025-01-01' })).toBe(true);
  });

  it('isEmailVerified returns false when no verification fields', async () => {
    const { isEmailVerified } = await import('../app/js/core/auth-session.js');
    expect(isEmailVerified({})).toBe(false);
  });

  it('isEmailVerified returns false for null user', async () => {
    const { isEmailVerified } = await import('../app/js/core/auth-session.js');
    expect(isEmailVerified(null)).toBe(false);
  });

  it('suggestUsername extracts nombre', async () => {
    const { suggestUsername } = await import('../app/js/core/auth-session.js');
    expect(suggestUsername({ nombre: 'Juan Perez' })).toBe('juanperez');
  });

  it('suggestUsername extracts email prefix', async () => {
    const { suggestUsername } = await import('../app/js/core/auth-session.js');
    expect(suggestUsername({ email: 'maria@test.com' })).toBe('maria');
  });

  it('suggestUsername prefers nombre over email', async () => {
    const { suggestUsername } = await import('../app/js/core/auth-session.js');
    expect(suggestUsername({ nombre: 'Carlos', email: 'carlos@test.com' })).toBe('carlos');
  });

  it('suggestUsername returns usuario for empty user', async () => {
    const { suggestUsername } = await import('../app/js/core/auth-session.js');
    expect(suggestUsername({})).toBe('usuario');
  });

  it('suggestUsername returns usuario for null', async () => {
    const { suggestUsername } = await import('../app/js/core/auth-session.js');
    expect(suggestUsername(null)).toBe('usuario');
  });

  it('writeSession stores access_token, user, expires_at', async () => {
    const { writeSession } = await import('../app/js/core/auth-session.js');
    writeSession({ access_token: 'tok', user: { name: 'test' }, expires_at: futureISO() });
    expect(localStorage.getItem('auth_token')).toBe('tok');
    expect(localStorage.getItem('user_data')).toBe('{"name":"test"}');
    expect(localStorage.getItem('auth_expires_at')).toBeTypeOf('string');
  });

  it('writeSession handles expires_in by computing ISO date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const { writeSession } = await import('../app/js/core/auth-session.js');
    writeSession({ access_token: 'tok', user: { name: 'test' }, expires_in: 3600 });
    expect(localStorage.getItem('auth_expires_at')).toBe('2025-01-01T01:00:00.000Z');
    vi.useRealTimers();
  });

  it('writeSession returns null and clears session when data is null', async () => {
    localStorage.setItem('auth_token', 'old');
    const { writeSession } = await import('../app/js/core/auth-session.js');
    const result = writeSession(null);
    expect(result).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('readUser returns parsed user_data', async () => {
    localStorage.setItem('user_data', '{"name":"test"}');
    const { readUser } = await import('../app/js/core/auth-session.js');
    expect(readUser()).toEqual({ name: 'test' });
  });

  it('readUser returns null when no user_data', async () => {
    const { readUser } = await import('../app/js/core/auth-session.js');
    expect(readUser()).toBeNull();
  });

  it('readUser returns null on invalid JSON', async () => {
    localStorage.setItem('user_data', '{broken');
    const { readUser } = await import('../app/js/core/auth-session.js');
    expect(readUser()).toBeNull();
  });

  it('updateUser stores user and returns it', async () => {
    const { updateUser } = await import('../app/js/core/auth-session.js');
    const user = { name: 'updated' };
    const result = updateUser(user);
    expect(result).toEqual(user);
    expect(localStorage.getItem('user_data')).toBe('{"name":"updated"}');
  });

  it('updateUser returns null for null input', async () => {
    const { updateUser } = await import('../app/js/core/auth-session.js');
    expect(updateUser(null)).toBeNull();
  });

  it('clearSession removes all auth keys and clears sessionStorage', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('user_data', '{"n":"t"}');
    localStorage.setItem('auth_expires_at', futureISO());
    sessionStorage.setItem('SGI_API_CACHE_foo', 'cached');
    sessionStorage.setItem('other', 'keep');

    const { clearSession } = await import('../app/js/core/auth-session.js');
    clearSession();

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_data')).toBeNull();
    expect(localStorage.getItem('auth_expires_at')).toBeNull();
    expect(sessionStorage.getItem('SGI_API_CACHE_foo')).toBeNull();
    expect(sessionStorage.getItem('other')).toBe('keep');
  });

  it('clearSession calls clearApiCache on SGIGApi', async () => {
    const clearApiCache = vi.fn();
    globalThis.SGIGApi = { clearApiCache };
    const { clearSession } = await import('../app/js/core/auth-session.js');
    clearSession();
    expect(clearApiCache).toHaveBeenCalled();
  });

  it('isSessionExpired returns true when expired', async () => {
    localStorage.setItem('auth_expires_at', pastISO());
    const { isSessionExpired } = await import('../app/js/core/auth-session.js');
    expect(isSessionExpired()).toBe(true);
  });

  it('isSessionExpired returns false when not expired', async () => {
    localStorage.setItem('auth_expires_at', futureISO());
    const { isSessionExpired } = await import('../app/js/core/auth-session.js');
    expect(isSessionExpired()).toBe(false);
  });

  it('isSessionExpired returns false when no expires_at', async () => {
    const { isSessionExpired } = await import('../app/js/core/auth-session.js');
    expect(isSessionExpired()).toBe(false);
  });

  it('all functions handle null/undefined localStorage gracefully', async () => {
    const mod = await import('../app/js/core/auth-session.js');
    expect(() => mod.readUser()).not.toThrow();
    expect(() => mod.getSession()).not.toThrow();
    expect(() => mod.hasValidSession()).not.toThrow();
    expect(() => mod.isSessionExpired()).not.toThrow();
    expect(() => mod.formatExpiry()).not.toThrow();
  });
});

// ─── 3. Router ───────────────────────────────────────────

describe('router', () => {
  beforeEach(() => {
    delete globalThis.SGINavigationStore;
    vi.resetModules();
  });

  it('returns empty object when SGINavigationStore is undefined', async () => {
    const { NavigationStore } = await import('../app/js/core/router.js');
    expect(NavigationStore).toEqual({});
  });

  it('returns the global store when it exists', async () => {
    globalThis.SGINavigationStore = { currentRoute: '/dashboard' };
    const { NavigationStore } = await import('../app/js/core/router.js');
    expect(NavigationStore).toEqual({ currentRoute: '/dashboard' });
  });
});

// ─── 4. Protected Page Guard ─────────────────────────────

describe('protected-page-guard', () => {
  let addEventListenerCalls;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete globalThis.SGIProtectedPageGuard;
    addEventListenerCalls = [];
    vi.stubGlobal('addEventListener', (event, handler) => {
      addEventListenerCalls.push({ event, handler });
    });
    vi.stubGlobal('location', {
      pathname: '/html/some-page.html',
      replace: vi.fn(),
    });
    vi.stubGlobal('dispatchEvent', vi.fn());
    document.documentElement.style = {};
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifyOrRedirect returns true when localStorage has valid session', async () => {
    localStorage.setItem('auth_token', 'valid-token');
    localStorage.setItem('user_data', JSON.stringify({ name: 'test' }));
    localStorage.setItem('auth_expires_at', futureISO());

    await import('../app/js/core/protected-page-guard.js');
    const result = globalThis.SGIProtectedPageGuard.verifyOrRedirect();
    expect(result).toBe(true);
  });

  it('verifyOrRedirect returns false when expired and redirects to login', async () => {
    localStorage.setItem('auth_token', 'expired-token');
    localStorage.setItem('user_data', JSON.stringify({ name: 'test' }));
    localStorage.setItem('auth_expires_at', pastISO());

    await import('../app/js/core/protected-page-guard.js');
    const result = globalThis.SGIProtectedPageGuard.verifyOrRedirect();
    expect(result).toBe(false);
    expect(globalThis.location.replace).toHaveBeenCalledWith('../index.html');
  });

  it('verifyOrRedirect returns false when no token', async () => {
    await import('../app/js/core/protected-page-guard.js');
    const result = globalThis.SGIProtectedPageGuard.verifyOrRedirect();
    expect(result).toBe(false);
  });

  it('reveal sets root style.visibility to empty string', async () => {
    document.documentElement.style.visibility = 'hidden';
    await import('../app/js/core/protected-page-guard.js');
    globalThis.SGIProtectedPageGuard.reveal();
    expect(document.documentElement.style.visibility).toBe('');
  });

  it('IIFE runs verifyOrRedirect on load', async () => {
    localStorage.setItem('auth_token', 'valid-token');
    localStorage.setItem('user_data', JSON.stringify({ name: 'test' }));
    localStorage.setItem('auth_expires_at', futureISO());

    await import('../app/js/core/protected-page-guard.js');
    expect(globalThis.location.replace).not.toHaveBeenCalled();
  });

  it('IIFE redirects on load when no session', async () => {
    await import('../app/js/core/protected-page-guard.js');
    expect(globalThis.location.replace).toHaveBeenCalledWith('../index.html');
  });

  it('registers pageshow event listener', async () => {
    await import('../app/js/core/protected-page-guard.js');
    const pageshowCall = addEventListenerCalls.find((c) => c.event === 'pageshow');
    expect(pageshowCall).toBeDefined();
  });

  it('registers storage event listener', async () => {
    await import('../app/js/core/protected-page-guard.js');
    const storageCall = addEventListenerCalls.find((c) => c.event === 'storage');
    expect(storageCall).toBeDefined();
  });

  it('storage event with auth_token removed triggers redirect', async () => {
    await import('../app/js/core/protected-page-guard.js');
    const storageCall = addEventListenerCalls.find((c) => c.event === 'storage');
    const handler = storageCall.handler;

    handler({ key: 'auth_token', newValue: null, oldValue: 'tok' });
    expect(globalThis.location.replace).toHaveBeenCalled();
  });

  it('storage event with other key does not trigger redirect', async () => {
    await import('../app/js/core/protected-page-guard.js');
    const storageCall = addEventListenerCalls.find((c) => c.event === 'storage');
    const handler = storageCall.handler;

    globalThis.location.replace.mockClear();
    handler({ key: 'other_key', newValue: null });
    expect(globalThis.location.replace).not.toHaveBeenCalled();
  });

  it('pageshow with valid session dispatches sgi:validate-session when persisted', async () => {
    localStorage.setItem('auth_token', 'valid-token');
    localStorage.setItem('user_data', JSON.stringify({ name: 'test' }));
    localStorage.setItem('auth_expires_at', futureISO());

    await import('../app/js/core/protected-page-guard.js');
    const pageshowCall = addEventListenerCalls.find((c) => c.event === 'pageshow');
    pageshowCall.handler({ persisted: true });
    expect(globalThis.dispatchEvent).toHaveBeenCalled();
  });
});

// ─── 5. Nav Items ────────────────────────────────────────

describe('nav-items', () => {
  it('NAV_ITEMS is an array with expected workspace categories', async () => {
    const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js');
    expect(Array.isArray(NAV_ITEMS)).toBe(true);
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(4);
  });

  it('each top-level item has id, label, icon, children', async () => {
    const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js');
    NAV_ITEMS.forEach((item) => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('icon');
      expect(Array.isArray(item.children)).toBe(true);
    });
  });

  it('each child has id, label, icon, route, permission', async () => {
    const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js');
    NAV_ITEMS.forEach((item) => {
      item.children.forEach((child) => {
        expect(child).toHaveProperty('id');
        expect(child).toHaveProperty('label');
        expect(child).toHaveProperty('icon');
        expect(child).toHaveProperty('route');
        expect(child).toHaveProperty('permission');
      });
    });
  });

  it('PAGE_ACCESS maps all page keys to required permissions', async () => {
    const { PAGE_ACCESS } = await import('../app/js/layout/nav-items.js');
    expect(PAGE_ACCESS).toHaveProperty('dashboard');
    expect(PAGE_ACCESS).toHaveProperty('incidents');
    expect(PAGE_ACCESS).toHaveProperty('incident-map');
    expect(PAGE_ACCESS).toHaveProperty('incident-create');
    expect(PAGE_ACCESS).toHaveProperty('assignment-management');
    expect(PAGE_ACCESS).toHaveProperty('operational-structure');
    expect(PAGE_ACCESS).toHaveProperty('role-permissions');
    expect(PAGE_ACCESS).toHaveProperty('user-roles');
    expect(PAGE_ACCESS).toHaveProperty('reports');
    expect(PAGE_ACCESS).toHaveProperty('audit-logs');
    expect(PAGE_ACCESS).toHaveProperty('notifications');
    expect(PAGE_ACCESS).toHaveProperty('profile');
    expect(PAGE_ACCESS).toHaveProperty('about');
    expect(PAGE_ACCESS).toHaveProperty('incident-detail');
    expect(PAGE_ACCESS).toHaveProperty('territorial-units');
  });

  it('ROLES.ADMIN exists', async () => {
    const { ROLES } = await import('../app/js/layout/nav-items.js');
    expect(ROLES.ADMIN).toBe('ADMIN');
  });

  it('workspace.dashboard child exists', async () => {
    const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js');
    const workspace = NAV_ITEMS.find((i) => i.id === 'workspace');
    expect(workspace).toBeDefined();
    expect(workspace.children.find((c) => c.id === 'dashboard')).toBeDefined();
  });

  it('incident-hub.list child exists', async () => {
    const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js');
    const hub = NAV_ITEMS.find((i) => i.id === 'incident-hub');
    expect(hub).toBeDefined();
    expect(hub.children.find((c) => c.id === 'incidents')).toBeDefined();
  });

  it('territorial-ops.zones child exists', async () => {
    const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js');
    const ops = NAV_ITEMS.find((i) => i.id === 'territorial-ops');
    expect(ops).toBeDefined();
    expect(ops.children.find((c) => c.id === 'operational-structure')).toBeDefined();
  });

  it('admin-tools.users child exists', async () => {
    const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js');
    const admin = NAV_ITEMS.find((i) => i.id === 'admin-tools');
    expect(admin).toBeDefined();
    expect(admin.children.find((c) => c.id === 'user-roles')).toBeDefined();
  });
});

// ─── 6. Store ────────────────────────────────────────────

describe('store', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getState returns current state copy', async () => {
    const { getState, setState } = await import('../app/js/infrastructure/store.js');
    setState({ a: 1 });
    const state = getState();
    expect(state).toEqual({ a: 1 });
    state.a = 2;
    expect(getState().a).toBe(1);
  });

  it('getState returns empty object initially', async () => {
    const { getState } = await import('../app/js/infrastructure/store.js');
    expect(getState()).toEqual({});
  });

  it('setState merges into state', async () => {
    const { getState, setState } = await import('../app/js/infrastructure/store.js');
    setState({ a: 1 });
    setState({ b: 2 });
    expect(getState()).toEqual({ a: 1, b: 2 });
  });

  it('setState overwrites existing keys', async () => {
    const { getState, setState } = await import('../app/js/infrastructure/store.js');
    setState({ a: 1 });
    setState({ a: 2 });
    expect(getState()).toEqual({ a: 2 });
  });

  it('subscribe adds listener and calls it immediately', async () => {
    const { getState, setState, subscribe } = await import('../app/js/infrastructure/store.js');
    const listener = vi.fn();
    subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(getState());
  });

  it('unsubscribe removes listener', async () => {
    const { setState, subscribe, unsubscribe } = await import('../app/js/infrastructure/store.js');
    const listener = vi.fn();
    subscribe(listener);
    listener.mockClear();
    unsubscribe(listener);
    setState({ a: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple subscribers all get notified', async () => {
    const { setState, subscribe } = await import('../app/js/infrastructure/store.js');
    const a = vi.fn();
    const b = vi.fn();
    subscribe(a);
    subscribe(b);
    a.mockClear();
    b.mockClear();
    setState({ x: 1 });
    expect(a).toHaveBeenCalledWith(expect.objectContaining({ x: 1 }));
    expect(b).toHaveBeenCalledWith(expect.objectContaining({ x: 1 }));
  });

  it('setState with empty object does not crash', async () => {
    const { getState, setState } = await import('../app/js/infrastructure/store.js');
    setState({ a: 1 });
    setState({});
    expect(getState()).toEqual({ a: 1 });
  });
});

// ─── 7. DOM Utils ─────────────────────────────────────────

describe('dom-utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('$ calls document.querySelector with the selector', async () => {
    document.body.innerHTML = '<div id="test"></div>';
    const { $ } = await import('../app/js/presentation/dom-utils.js');
    const el = $('#test');
    expect(el).not.toBeNull();
    expect(el.id).toBe('test');
  });

  it('$ returns null for non-matching selector', async () => {
    const { $ } = await import('../app/js/presentation/dom-utils.js');
    expect($('#nonexistent')).toBeNull();
  });

  it('$$ calls document.querySelectorAll', async () => {
    document.body.innerHTML = '<span class="item"></span><span class="item"></span>';
    const { $$ } = await import('../app/js/presentation/dom-utils.js');
    const items = $$('.item');
    expect(items.length).toBe(2);
  });

  it('show removes d-none class', async () => {
    const { show } = await import('../app/js/presentation/dom-utils.js');
    const el = document.createElement('div');
    el.classList.add('d-none');
    show(el);
    expect(el.classList.contains('d-none')).toBe(false);
  });

  it('show does nothing for null element', async () => {
    const { show } = await import('../app/js/presentation/dom-utils.js');
    expect(() => show(null)).not.toThrow();
  });

  it('hide adds d-none class', async () => {
    const { hide } = await import('../app/js/presentation/dom-utils.js');
    const el = document.createElement('div');
    hide(el);
    expect(el.classList.contains('d-none')).toBe(true);
  });

  it('hide does nothing for null element', async () => {
    const { hide } = await import('../app/js/presentation/dom-utils.js');
    expect(() => hide(null)).not.toThrow();
  });

  it('escapeHtml escapes < > & " \'', async () => {
    const { escapeHtml } = await import('../app/js/presentation/dom-utils.js');
    expect(escapeHtml('<script> & "quoted"')).toBe('&lt;script&gt; &amp; &quot;quoted&quot;');
  });

  it('escapeHtml escapes single quotes', async () => {
    const { escapeHtml } = await import('../app/js/presentation/dom-utils.js');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapeHtml returns empty string for null', async () => {
    const { escapeHtml } = await import('../app/js/presentation/dom-utils.js');
    expect(escapeHtml(null)).toBe('');
  });

  it('escapeHtml returns empty string for undefined', async () => {
    const { escapeHtml } = await import('../app/js/presentation/dom-utils.js');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapeHtml returns string for numbers', async () => {
    const { escapeHtml } = await import('../app/js/presentation/dom-utils.js');
    expect(escapeHtml(42)).toBe('42');
  });

  it('html template tag escapes interpolated values', async () => {
    const { html } = await import('../app/js/presentation/dom-utils.js');
    const result = html`<div>${'<script>'}</div>`;
    expect(result).toBe('<div>&lt;script&gt;</div>');
  });

  it('html template tag handles null and undefined values as empty', async () => {
    const { html } = await import('../app/js/presentation/dom-utils.js');
    expect(html`<div>${null}</div>`).toBe('<div></div>');
    expect(html`<div>${undefined}</div>`).toBe('<div></div>');
  });

  it('html template tag escapes multiple interpolations', async () => {
    const { html } = await import('../app/js/presentation/dom-utils.js');
    const result = html`<a href="${'">'}" title="${'&'}">${'<b>'}text${'</b>'}</a>`;
    expect(result).toBe('<a href="&quot;&gt;" title="&amp;">&lt;b&gt;text&lt;/b&gt;</a>');
  });

  it('delegateEvent adds event listener on container', async () => {
    const { delegateEvent } = await import('../app/js/presentation/dom-utils.js');
    const container = document.createElement('div');
    const addEventListenerSpy = vi.spyOn(container, 'addEventListener');
    const callback = vi.fn();
    delegateEvent(container, '.btn', 'click', callback);
    expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('delegateEvent handles string container selector', async () => {
    document.body.innerHTML = '<div id="container"></div>';
    const { delegateEvent } = await import('../app/js/presentation/dom-utils.js');
    const container = document.getElementById('container');
    const addEventListenerSpy = vi.spyOn(container, 'addEventListener');
    const callback = vi.fn();
    delegateEvent('#container', '.btn', 'click', callback);
    expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('delegateEvent does nothing for null container', async () => {
    const { delegateEvent } = await import('../app/js/presentation/dom-utils.js');
    expect(() => delegateEvent(null, '.btn', 'click', vi.fn())).not.toThrow();
  });

  it('delegateEvent callback fires when target matches selector', async () => {
    const { delegateEvent } = await import('../app/js/presentation/dom-utils.js');
    const container = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'btn';
    container.appendChild(btn);
    const callback = vi.fn();
    delegateEvent(container, '.btn', 'click', callback);

    const event = new Event('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: btn });
    container.dispatchEvent(event);
    expect(callback).toHaveBeenCalled();
  });

  it('showErrorAlert exists and calls show on result', async () => {
    document.body.innerHTML = '<div id="alertaGlobal" class="d-none"></div>';
    const { showErrorAlert } = await import('../app/js/presentation/dom-utils.js');
    showErrorAlert('Error message');
    const alert = document.getElementById('alertaGlobal');
    expect(alert.classList.contains('d-none')).toBe(false);
    expect(alert.className).toContain('alert-danger');
    expect(alert.innerHTML).toBe('Error message');
  });

  it('showSuccessAlert exists and calls show on result', async () => {
    document.body.innerHTML = '<div id="alertaGlobal" class="d-none"></div>';
    const { showSuccessAlert } = await import('../app/js/presentation/dom-utils.js');
    showSuccessAlert('Success message');
    const alert = document.getElementById('alertaGlobal');
    expect(alert.classList.contains('d-none')).toBe(false);
    expect(alert.className).toContain('alert-success');
    expect(alert.innerHTML).toBe('Success message');
  });

  it('showErrorAlert does not crash when alert element is missing', async () => {
    globalThis.alert = vi.fn();
    const { showErrorAlert } = await import('../app/js/presentation/dom-utils.js');
    expect(() => showErrorAlert('Error')).not.toThrow();
  });

  it('showSuccessAlert does not crash when alert element is missing', async () => {
    const { showSuccessAlert } = await import('../app/js/presentation/dom-utils.js');
    expect(() => showSuccessAlert('Success')).not.toThrow();
  });
});
