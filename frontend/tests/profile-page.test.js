import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  requestBackend: vi.fn(),
}));

vi.mock('../app/js/shared/profile-photo.js', () => ({
  hydrateOwnProfilePhoto: vi.fn(),
  invalidateOwnProfilePhoto: vi.fn(),
}));

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  clearValidationErrors: vi.fn(),
}));

describe('profile-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.$ = vi.fn((selector) => ({
      on: vi.fn().mockReturnThis(),
      modal: vi.fn().mockReturnThis(),
    }));
  });

  describe('escapeHtml', () => {
    it('escapes HTML special characters', async () => {
      const { escapeHtml } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('returns empty string for null', async () => {
      const { escapeHtml } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(escapeHtml(null)).toBe('');
    });
  });

  describe('normalizeCode', () => {
    it('returns string as-is', async () => {
      const { normalizeCode } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(normalizeCode('ADMIN')).toBe('ADMIN');
    });

    it('extracts codigo from object', async () => {
      const { normalizeCode } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(normalizeCode({ codigo: 'SUPER' })).toBe('SUPER');
    });

    it('extracts code from object', async () => {
      const { normalizeCode } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(normalizeCode({ code: 'OPER' })).toBe('OPER');
    });

    it('returns empty for unknown type', async () => {
      const { normalizeCode } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(normalizeCode(42)).toBe('');
    });
  });

  describe('hasRole', () => {
    it('returns true when user has role', async () => {
      const { hasRole } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(hasRole('ADMIN', { roles: ['ADMIN'] })).toBe(true);
    });

    it('returns false when user lacks role', async () => {
      const { hasRole } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(hasRole('ADMIN', { roles: ['USER'] })).toBe(false);
    });

    it('returns false for null user', async () => {
      const { hasRole } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(hasRole('ADMIN', null)).toBe(false);
    });
  });

  describe('hasGoogleIdentity', () => {
    it('returns true when google identity exists', async () => {
      const { hasGoogleIdentity } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(hasGoogleIdentity({ identities: [{ provider: 'google' }] })).toBe(true);
    });

    it('returns false when no google identity', async () => {
      const { hasGoogleIdentity } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(hasGoogleIdentity({ identities: [{ provider: 'github' }] })).toBe(false);
    });
  });

  describe('formatDate', () => {
    it('formats valid date string', async () => {
      const { formatDate } = await import('../app/js/modules/profile/presentation/profile-page.js');
      const result = formatDate('2025-01-15T10:00:00Z');
      expect(result).toContain('2025');
      expect(result).toContain('enero');
      expect(result).toContain('15');
    });

    it('returns dash for null', async () => {
      const { formatDate } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(formatDate(null)).toBe('-');
    });

    it('returns dash for invalid date', async () => {
      const { formatDate } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(formatDate('invalid')).toBe('-');
    });
  });

  describe('formatDateTime', () => {
    it('formats date-time with locale', async () => {
      const { formatDateTime } = await import('../app/js/modules/profile/presentation/profile-page.js');
      const result = formatDateTime('2025-01-15T10:00:00Z');
      expect(result).toContain('2025');
    });

    it('returns dash for null', async () => {
      const { formatDateTime } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(formatDateTime(null)).toBe('-');
    });
  });

  describe('validateProfilePhoto', () => {
    it('accepts supported images up to 5 MB', async () => {
      const { validateProfilePhoto } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(validateProfilePhoto({ type: 'image/webp', size: 1024 })).toBeNull();
    });

    it('rejects unsupported formats and oversized images', async () => {
      const { validateProfilePhoto } = await import('../app/js/modules/profile/presentation/profile-page.js');
      expect(validateProfilePhoto({ type: 'image/svg+xml', size: 1024 })).toContain('JPG');
      expect(validateProfilePhoto({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 })).toContain('5 MB');
    });
  });
});
