import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../core/auth-session.js', () => ({
  isEmailVerified: vi.fn(),
  suggestUsername: vi.fn(),
  updateUser: vi.fn(),
  userHasPermission: vi.fn((user, code) => user?.permissions?.includes(code) || false),
}));

vi.mock('../../../shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setupValidationListeners: vi.fn(),
  validateFormFrontend: vi.fn(() => true),
  setFieldError: vi.fn(),
}));

vi.mock('../application/auth-service.js', () => ({
  loginWithEmail: vi.fn(),
  registerLocal: vi.fn(),
  registerWithGoogle: vi.fn(),
  requestPasswordResetCode: vi.fn(),
  resetPasswordWithCode: vi.fn(),
  restoreSession: vi.fn(() => Promise.resolve(null)),
  verifyPasswordResetCode: vi.fn(),
  verifyTwoFactorLogin: vi.fn(),
  resendVerificationEmail: vi.fn(),
}));

describe('auth-page — helper functions', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('togglePasswordVisibility', () => {
    it('changes input type from password to text', async () => {
      const { togglePasswordVisibility } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<input type="password" id="pw"><button id="btn"><i class="fa fa-eye"></i></button>';
      const input = document.getElementById('pw');
      const button = document.getElementById('btn');
      togglePasswordVisibility(input, button);
      expect(input.type).toBe('text');
    });

    it('changes input type from text to password', async () => {
      const { togglePasswordVisibility } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<input type="text" id="pw"><button id="btn"><i class="fa fa-eye"></i></button>';
      const input = document.getElementById('pw');
      const button = document.getElementById('btn');
      togglePasswordVisibility(input, button);
      expect(input.type).toBe('password');
    });

    it('toggles icon class', async () => {
      const { togglePasswordVisibility } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<input type="password" id="pw"><button id="btn"><i class="fa fa-eye"></i></button>';
      const input = document.getElementById('pw');
      const button = document.getElementById('btn');
      const icon = button.querySelector('i');

      togglePasswordVisibility(input, button);
      expect(icon.classList.contains('fa-eye-slash')).toBe(true);
      expect(icon.classList.contains('fa-eye')).toBe(false);

      togglePasswordVisibility(input, button);
      expect(icon.classList.contains('fa-eye')).toBe(true);
      expect(icon.classList.contains('fa-eye-slash')).toBe(false);
    });
  });

  describe('showAlert', () => {
    it('sets alert content and removes d-none', async () => {
      const { showAlert } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<div id="alert" class="d-none"></div>';
      const alert = document.getElementById('alert');
      showAlert(alert, 'Test message', 'success');
      expect(alert.textContent).toBe('Test message');
      expect(alert.className).toContain('alert-success');
      expect(alert.classList.contains('d-none')).toBe(false);
    });

    it('uses danger as default type', async () => {
      const { showAlert } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<div id="alert"></div>';
      const alert = document.getElementById('alert');
      showAlert(alert, 'Error');
      expect(alert.className).toContain('alert-danger');
    });

    it('does nothing when target is null', async () => {
      const { showAlert } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(() => showAlert(null, 'test')).not.toThrow();
    });
  });

  describe('hideAlert', () => {
    it('adds d-none and clears content', async () => {
      const { hideAlert } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<div id="alert" class="alert alert-danger">Some message</div>';
      const alert = document.getElementById('alert');
      hideAlert(alert);
      expect(alert.classList.contains('d-none')).toBe(true);
      expect(alert.textContent).toBe('');
    });

    it('does nothing when target is null', async () => {
      const { hideAlert } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(() => hideAlert(null)).not.toThrow();
    });
  });

  describe('normalizeCode', () => {
    it('returns string as-is', async () => {
      const { normalizeCode } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(normalizeCode('ADMIN')).toBe('ADMIN');
    });

    it('extracts code from object', async () => {
      const { normalizeCode } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(normalizeCode({ code: 'ADMIN' })).toBe('ADMIN');
    });

    it('falls back to codigo if code not present', async () => {
      const { normalizeCode } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(normalizeCode({ codigo: 'OPERATOR' })).toBe('OPERATOR');
    });

    it('returns empty string for empty object', async () => {
      const { normalizeCode } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(normalizeCode({})).toBe('');
    });
  });

  describe('hasRoleAdmin', () => {
    it('returns true when user has ADMIN role with code', async () => {
      const { hasRoleAdmin } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(hasRoleAdmin({ roles: [{ code: 'ADMIN' }] })).toBe(true);
    });

    it('returns true when user has ADMIN role as string', async () => {
      const { hasRoleAdmin } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(hasRoleAdmin({ roles: ['ADMIN'] })).toBe(true);
    });

    it('returns false when user lacks ADMIN role', async () => {
      const { hasRoleAdmin } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(hasRoleAdmin({ roles: [{ code: 'USER' }] })).toBe(false);
    });

    it('returns false for null user', async () => {
      const { hasRoleAdmin } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(hasRoleAdmin(null)).toBe(false);
    });

    it('returns false for user with no roles', async () => {
      const { hasRoleAdmin } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(hasRoleAdmin({})).toBe(false);
    });
  });

  describe('getPostAuthPage', () => {
    it.each([
      ['dashboard capability', ['dashboard.view'], 'dashboard.html'],
      ['create capability without dashboard', ['incidents.create'], 'incident-create.html'],
      ['both capabilities', ['dashboard.view', 'incidents.create'], 'dashboard.html'],
    ])('routes %s by capability', async (_label, permissions, expected) => {
      const { getPostAuthPage } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(getPostAuthPage({ permissions })).toBe(expected);
    });
  });

  describe('toggleSubmitState', () => {
    it('disables submit button when loading', async () => {
      const { toggleSubmitState } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<button id="btn">Submit</button>';
      const btn = document.getElementById('btn');
      toggleSubmitState(btn, null, null, true);
      expect(btn.disabled).toBe(true);
    });

    it('enables submit button when not loading', async () => {
      const { toggleSubmitState } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<button id="btn" disabled>Submit</button>';
      const btn = document.getElementById('btn');
      toggleSubmitState(btn, null, null, false);
      expect(btn.disabled).toBe(false);
    });

    it('shows spinner when loading', async () => {
      const { toggleSubmitState } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<button id="btn">Submit</button><span id="spinner" class="d-none"></span>';
      const btn = document.getElementById('btn');
      const spinner = document.getElementById('spinner');
      toggleSubmitState(btn, spinner, null, true);
      expect(spinner.classList.contains('d-none')).toBe(false);
    });

    it('sets button text when loading', async () => {
      const { toggleSubmitState } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<button id="btn">Submit</button>';
      const btn = document.getElementById('btn');
      toggleSubmitState(btn, null, btn, true);
      expect(btn.textContent).toBe('Procesando...');
    });
  });

  describe('switchView', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="login-view"></div>
        <div id="register-view" class="d-none"></div>
        <div id="email-verification-view" class="d-none"></div>
        <div id="profile-view" class="d-none"></div>
        <div id="two-factor-view" class="d-none"></div>
        <div id="setup-2fa-view" class="d-none"></div>
        <div id="forgot-password-view" class="d-none"></div>
        <div id="login-alert" class="d-none"></div>
        <div id="register-alert" class="d-none"></div>
        <div id="profile-alert" class="d-none"></div>
        <div id="two-factor-alert" class="d-none"></div>
        <div id="setup-2fa-alert" class="d-none"></div>
        <div id="forgot-password-alert" class="d-none"></div>
      `;
    });

    it('shows login view and hides others', async () => {
      const { switchView } = await import('../app/js/modules/auth/presentation/auth-page.js');
      switchView('login');
      expect(document.getElementById('login-view').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('register-view').classList.contains('d-none')).toBe(true);
      expect(document.getElementById('profile-view').classList.contains('d-none')).toBe(true);
    });

    it('shows register view and hides login', async () => {
      const { switchView } = await import('../app/js/modules/auth/presentation/auth-page.js');
      switchView('register');
      expect(document.getElementById('register-view').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('login-view').classList.contains('d-none')).toBe(true);
    });

    it('shows profile view', async () => {
      const { switchView } = await import('../app/js/modules/auth/presentation/auth-page.js');
      switchView('profile');
      expect(document.getElementById('profile-view').classList.contains('d-none')).toBe(false);
    });

    it('shows two-factor view', async () => {
      const { switchView } = await import('../app/js/modules/auth/presentation/auth-page.js');
      switchView('two-factor');
      expect(document.getElementById('two-factor-view').classList.contains('d-none')).toBe(false);
    });

    it('sets auth mode class on body', async () => {
      const { switchView } = await import('../app/js/modules/auth/presentation/auth-page.js');
      switchView('login');
      expect(document.body.classList.contains('auth-login-mode')).toBe(true);
    });

    it('hides alerts from other views', async () => {
      const { switchView, showAlert } = await import('../app/js/modules/auth/presentation/auth-page.js');
      const loginAlert = document.getElementById('login-alert');
      showAlert(loginAlert, 'test', 'success');
      expect(loginAlert.classList.contains('d-none')).toBe(false);
      switchView('register');
      expect(loginAlert.classList.contains('d-none')).toBe(true);
    });
  });

  describe('validateFormGroup', () => {
    it('returns true for valid form group', async () => {
      const { validateFormGroup } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<form id="f"><input required value="test"></form>';
      expect(validateFormGroup(document.getElementById('f'))).toBe(true);
    });

    it('returns false for invalid required field', async () => {
      const { validateFormGroup } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<form id="f"><input required value=""></form>';
      expect(validateFormGroup(document.getElementById('f'))).toBe(false);
    });

    it('adds is-invalid class to empty required fields', async () => {
      const { validateFormGroup } = await import('../app/js/modules/auth/presentation/auth-page.js');
      document.body.innerHTML = '<form id="f"><input required value="" id="testInput"></form>';
      validateFormGroup(document.getElementById('f'));
      expect(document.getElementById('testInput').classList.contains('is-invalid')).toBe(true);
    });

    it('returns false for null formGroup', async () => {
      const { validateFormGroup } = await import('../app/js/modules/auth/presentation/auth-page.js');
      expect(validateFormGroup(null)).toBe(false);
    });
  });
});
