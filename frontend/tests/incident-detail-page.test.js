import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  addIncidentComment: vi.fn(),
  changeIncidentState: vi.fn(),
  getIncident: vi.fn(),
  listPriorities: vi.fn(),
  listStateTransitions: vi.fn(),
  updateIncident: vi.fn(),
  uploadIncidentAttachment: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/application/subscribe-incident-comments.usecase.js', () => ({
  subscribeToIncidentComments: vi.fn(() => Promise.resolve({ cleanup: vi.fn() })),
}));

vi.mock('../app/js/modules/incidents/application/subscribe-incident-realtime.usecase.js', () => ({
  subscribeToIncidentRealtime: vi.fn(() => Promise.resolve({ cleanup: vi.fn() })),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? ''),
  formatCatalogLabel: (v) => v || '-',
  formatDateTime: (v) => v || '-',
  formatShortDate: (v) => v || '-',
  getPriorityBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateHexColor: vi.fn(() => '#000000'),
  getPriorityHexColor: vi.fn(() => '#000000'),
  showGlobalAlert: vi.fn(),
}));

vi.mock('../app/js/core/config.js', () => ({
  API_URL: 'http://localhost/api',
  MAP_BASE_STYLES: { streets: { style: 'mapbox://styles/mapbox/streets-v11' } },
  MAP_ECUADOR_BOUNDS: [[-92.2, -5.25], [-75, 1.85]],
}));

describe('incident-detail-page — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  describe('hasCoordinates', () => {
    it('returns true for valid Ecuador coordinates (Quito)', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates({ latitude: -0.18, longitude: -78.5 })).toBe(true);
    });

    it('returns true for valid coordinates at boundary', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates({ latitude: 0, longitude: -80 })).toBe(true);
    });

    it('returns false when latitude is out of range', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates({ latitude: -10, longitude: -78 })).toBe(false);
    });

    it('returns false when longitude is out of range', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates({ latitude: -0.18, longitude: -100 })).toBe(false);
    });

    it('returns false when no coordinates present', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates({})).toBe(false);
    });

    it('returns false for null input', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates(null)).toBe(false);
    });
  });

  describe('territoryLabel', () => {
    it('extracts full_path from territorial_unit', async () => {
      const { territoryLabel } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(territoryLabel({ territorial_unit: { full_path: 'Pichincha > Quito' } })).toBe('Pichincha > Quito');
    });

    it('extracts name from territorialUnit', async () => {
      const { territoryLabel } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(territoryLabel({ territorialUnit: { name: 'Quito' } })).toBe('Quito');
    });

    it('falls back to address_reference', async () => {
      const { territoryLabel } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(territoryLabel({ address_reference: 'Calle 1' })).toBe('Calle 1');
    });

    it('returns dash for empty object', async () => {
      const { territoryLabel } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(territoryLabel({})).toBe('-');
    });
  });

  describe('calculateDays', () => {
    it('returns positive number for a past date', async () => {
      const { calculateDays } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const result = calculateDays('2026-07-10');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 for null input', async () => {
      const { calculateDays } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(calculateDays(null)).toBe(0);
    });

    it('returns 0 for invalid date', async () => {
      const { calculateDays } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(calculateDays('not-a-date')).toBe(0);
    });
  });

  describe('formatFileSize', () => {
    it('returns bytes for size < 1024', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('returns KB for size < 1 MB', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(formatFileSize(2048)).toBe('2.0 KB');
    });

    it('returns MB for size >= 1 MB', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
    });

    it('handles negative values', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(formatFileSize(-100)).toBe('Tamano no disponible');
    });

    it('handles NaN', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(formatFileSize('abc')).toBe('Tamano no disponible');
    });
  });

  describe('getAvailableStateTransitions', () => {
    it('returns transition when source state matches', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'ADMIN' }] }));
      const { getAvailableStateTransitions } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const transitions = [{ source_state_id: 1, target_state_id: 2, is_active: true }];
      const result = getAvailableStateTransitions({ state_id: 1 }, transitions);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(transitions[0]);
    });

    it('filters out transitions where source_state_id does not match', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'ADMIN' }] }));
      const { getAvailableStateTransitions } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const transitions = [{ source_state_id: 2, target_state_id: 3, is_active: true }];
      const result = getAvailableStateTransitions({ state_id: 1 }, transitions);
      expect(result).toHaveLength(0);
    });

    it('filters out inactive transitions', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'ADMIN' }] }));
      const { getAvailableStateTransitions } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const transitions = [{ source_state_id: 1, target_state_id: 2, is_active: false }];
      const result = getAvailableStateTransitions({ state_id: 1 }, transitions);
      expect(result).toHaveLength(0);
    });

    it('de-duplicates by target_state_id (keeps first)', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'ADMIN' }] }));
      const { getAvailableStateTransitions } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const transitions = [
        { source_state_id: 1, target_state_id: 2, is_active: true, label: 'first' },
        { source_state_id: 1, target_state_id: 2, is_active: true, label: 'second' },
      ];
      const result = getAvailableStateTransitions({ state_id: 1 }, transitions);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('first');
    });

    it('filters transitions not allowed by user role', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'VIEWER' }] }));
      const { getAvailableStateTransitions } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const transitions = [{ source_state_id: 1, target_state_id: 2, is_active: true, allowed_roles: ['ADMIN'] }];
      const result = getAvailableStateTransitions({ state_id: 1 }, transitions);
      expect(result).toHaveLength(0);
    });

    it('allows transition when no allowed_roles specified', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'VIEWER' }] }));
      const { getAvailableStateTransitions } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const transitions = [{ source_state_id: 1, target_state_id: 2, is_active: true }];
      const result = getAvailableStateTransitions({ state_id: 1 }, transitions);
      expect(result).toHaveLength(1);
    });
  });

  describe('isTransitionAllowedForCurrentUser', () => {
    beforeEach(() => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'ADMIN' }] }));
    });

    it('returns true when no allowed_roles specified', async () => {
      const { isTransitionAllowedForCurrentUser } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(isTransitionAllowedForCurrentUser({})).toBe(true);
    });

    it('returns true when user has allowed role', async () => {
      const { isTransitionAllowedForCurrentUser } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(isTransitionAllowedForCurrentUser({ allowed_roles: ['ADMIN'] })).toBe(true);
    });

    it('returns false when user does not have allowed role', async () => {
      const { isTransitionAllowedForCurrentUser } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(isTransitionAllowedForCurrentUser({ allowed_roles: ['SUPERVISOR'] })).toBe(false);
    });
  });

  describe('renderComments', () => {
    it('returns empty state HTML when no comments', async () => {
      const { renderComments } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const html = renderComments([]);
      expect(html).toContain('Sin comentarios');
    });

    it('renders comments with author info', async () => {
      const { renderComments } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const comments = [
        { id: 1, comment: 'Test comment', user: { first_name: 'John', last_name: 'Doe' }, created_at: '2026-07-14', is_internal: false },
      ];
      const html = renderComments(comments);
      expect(html).toContain('John');
      expect(html).toContain('Test comment');
    });
  });

  describe('renderHistory', () => {
    it('returns empty state HTML when no history', async () => {
      const { renderHistory } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const html = renderHistory([]);
      expect(html).toContain('Sin historial');
    });

    it('renders history entries', async () => {
      const { renderHistory } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const history = [
        { id: 1, new_state_name: 'RESUELTA', created_at: '2026-07-14', user: { first_name: 'Admin', last_name: 'User' }, comment: 'Done' },
      ];
      const html = renderHistory(history);
      expect(html).toContain('RESUELTA');
      expect(html).toContain('Done');
    });
  });

  describe('renderAttachments', () => {
    it('returns empty state HTML when no attachments', async () => {
      const { renderAttachments } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const html = renderAttachments([]);
      expect(html).toContain('No hay evidencias');
    });
  });
});
