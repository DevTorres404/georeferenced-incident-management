import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
}));

vi.mock('../app/js/core/auth-session.js', async (importOriginal) => ({
  ...await importOriginal(),
  readUser: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? ''),
  formatCatalogLabel: (v) => v || '-',
  formatShortDate: (v) => v || '-',
  getPriorityBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateBadgeClass: vi.fn(() => 'badge-secondary'),
  showGlobalAlert: vi.fn(),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/presentation/dom-utils.js', () => ({
  html: { raw: (s) => s.join('') },
  delegateEvent: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  deleteIncident: vi.fn(),
  listStates: vi.fn(() => Promise.resolve({ data: [] })),
  listPriorities: vi.fn(() => Promise.resolve({ data: [] })),
}));

describe('incidents-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('normalizePriorityFilter', () => {
    it('removes accents from CRÍTICA', async () => {
      const { normalizePriorityFilter } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      expect(normalizePriorityFilter('CRÍTICA')).toBe('critica');
    });

    it('lowercases Alta', async () => {
      const { normalizePriorityFilter } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      expect(normalizePriorityFilter('Alta')).toBe('alta');
    });

    it('returns empty for empty string', async () => {
      const { normalizePriorityFilter } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      expect(normalizePriorityFilter('')).toBe('');
    });
  });

  describe('buildPriorityLookup', () => {
    it('builds normalized name to id map', async () => {
      const { buildPriorityLookup } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      const priorities = [{ name: 'Crítica', id: 1 }, { name: 'Alta', id: 2 }];
      expect(buildPriorityLookup(priorities)).toEqual({ critica: 1, alta: 2 });
    });

    it('returns empty object for empty array', async () => {
      const { buildPriorityLookup } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      expect(buildPriorityLookup([])).toEqual({});
    });

    it('handles null safely', async () => {
      const { buildPriorityLookup } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      expect(buildPriorityLookup(null)).toEqual({});
    });
  });

  describe('readStoredSearch / storeSearch', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    it('readStoredSearch returns empty string when nothing stored', async () => {
      const { readStoredSearch } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      expect(readStoredSearch()).toBe('');
    });

    it('storeSearch writes to sessionStorage and readStoredSearch reads it', async () => {
      const { storeSearch, readStoredSearch } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      storeSearch('test query');
      expect(readStoredSearch()).toBe('test query');
    });

    it('storeSearch handles empty string', async () => {
      const { storeSearch, readStoredSearch } = await import('../app/js/modules/incidents/presentation/incidents-page.js');
      storeSearch('');
      expect(readStoredSearch()).toBe('');
    });
  });

});
