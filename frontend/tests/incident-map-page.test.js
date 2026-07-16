import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../app/js/core/config.js', () => ({
  MAP_DEFAULT_CENTER: [-78.5, -1.5],
  MAP_DEFAULT_ZOOM: 7,
  MAP_STYLE_URL: 'https://example.com/style.json',
}));

vi.mock('../app/js/core/auth-session.js', () => ({
  readUser: vi.fn(() => ({ roles: [{ code: 'ADMIN' }] })),
}));

vi.mock('../app/js/layout/loader.js', () => ({
  hideMainLoader: vi.fn(),
  showMainLoader: vi.fn(),
}));

vi.mock('../app/js/shared/sanitizer.js', () => ({
  escapeHtml: (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
}));

vi.mock('../app/js/modules/map/application/map-service.js', () => ({
  getMapCatalogs: vi.fn(),
  listIncidentMapPoints: vi.fn(),
}));

describe('incident-map-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('normalizeText', () => {
    it('removes accents and uppercases', async () => {
      const { normalizeText } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(normalizeText('Crítica')).toBe('CRITICA');
      expect(normalizeText('Média')).toBe('MEDIA');
    });

    it('handles empty string', async () => {
      const { normalizeText } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(normalizeText('')).toBe('');
    });
  });

  describe('normalizePriorityName', () => {
    it('normalizes priority name from object', async () => {
      const { normalizePriorityName } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(normalizePriorityName({ name: 'Crítica' })).toBe('CRITICA');
    });

    it('handles empty/undefined', async () => {
      const { normalizePriorityName } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(normalizePriorityName({})).toBe('');
      expect(normalizePriorityName(null)).toBe('');
    });
  });

  describe('getPriorityBadgeClass', () => {
    it('returns danger for critica', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(getPriorityBadgeClass('Crítica')).toBe('badge-danger');
    });

    it('returns warning for alta', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(getPriorityBadgeClass('Alta')).toBe('badge-warning');
    });

    it('returns info for media', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(getPriorityBadgeClass('Media')).toBe('badge-info');
    });

    it('returns success for baja', async () => {
      const { getPriorityBadgeClass } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(getPriorityBadgeClass('Baja')).toBe('badge-success');
    });
  });

  describe('formatLabel', () => {
    it('replaces underscores and capitalizes', async () => {
      const { formatLabel } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(formatLabel('en_proceso')).toBe('En Proceso');
    });

    it('returns dash for empty', async () => {
      const { formatLabel } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(formatLabel('')).toBe('-');
    });
  });

  describe('userHasRole', () => {
    it('returns true when user has role as string', async () => {
      const { userHasRole } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(userHasRole({ roles: ['ADMIN'] }, 'ADMIN')).toBe(true);
    });

    it('returns true when user has role as object', async () => {
      const { userHasRole } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(userHasRole({ roles: [{ code: 'ADMIN' }] }, 'ADMIN')).toBe(true);
    });

    it('returns false when user has no role', async () => {
      const { userHasRole } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(userHasRole({ roles: [] }, 'ADMIN')).toBe(false);
    });

    it('returns false for null user', async () => {
      const { userHasRole } = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(userHasRole(null, 'ADMIN')).toBe(false);
    });
  });
});
