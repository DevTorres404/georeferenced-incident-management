import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';

// ── Module mocks (must match auth-page.js import specifiers) ──

const { authServiceMock, authSessionMock, valUtilsMock } = vi.hoisted(() => {
  const aSvc = {
    loginWithEmail: vi.fn(),
    registerLocal: vi.fn(),
    registerWithGoogle: vi.fn(),
    requestPasswordResetCode: vi.fn(),
    resetPasswordWithCode: vi.fn(),
    restoreSession: vi.fn(() => Promise.resolve(null)),
    verifyPasswordResetCode: vi.fn(),
    verifyTwoFactorLogin: vi.fn(),
    resendVerificationEmail: vi.fn(),
  };
  const aSes = {
    isEmailVerified: vi.fn(() => false),
    suggestUsername: vi.fn(() => 'suggested_user'),
    updateUser: vi.fn(),
  };
  const vUt = {
    handleBackendErrors: vi.fn(),
    setupValidationListeners: vi.fn(),
    validateFormFrontend: vi.fn(() => true),
    setFieldError: vi.fn(),
  };
  return { authServiceMock: aSvc, authSessionMock: aSes, valUtilsMock: vUt };
});

vi.mock('../app/js/core/auth-session.js', () => authSessionMock);
vi.mock('../app/js/shared/validators/validation-utils.js', () => valUtilsMock);
vi.mock('../app/js/modules/auth/application/auth-service.js', () => authServiceMock);

// ── Full DOM fixture matching every id initAuthPage looks up ──

const DOM_FIXTURE = `
<div id="login-view">
  <form id="login-form" novalidate>
    <input id="email" name="email" type="email" required />
    <div class="input-group">
      <input id="password" type="password" required />
      <button id="toggle-password-btn" type="button"><i class="fa fa-eye"></i></button>
    </div>
    <button id="login-submit-btn" type="submit">
      <span id="login-btn-text" data-original-label="Iniciar sesión">Iniciar sesión</span>
      <span id="login-spinner" class="d-none spinner-border spinner-border-sm"></span>
    </button>
  </form>
  <div id="login-alert" class="d-none alert"></div>
  <button id="open-register-btn" type="button">Crear cuenta</button>
  <button id="open-forgot-password-btn" type="button">Olvidé mi contraseña</button>
  <button id="google-login-btn" type="button"><i class="fab fa-google"></i> Google</button>
  <a id="dashboard-link" href="#">Ir al Dashboard</a>
</div>

<div id="register-view" class="d-none">
  <form id="register-form" novalidate>
    <input id="register-name" name="register-name" required />
    <input id="register-lastname" name="register-lastname" required />
    <input id="register-username" name="register-username" required />
    <input id="register-email" name="register-email" type="email" required />
    <div class="input-group">
      <input id="register-password" type="password" required />
      <button id="toggle-register-password-btn" type="button"><i class="fa fa-eye"></i></button>
    </div>
    <div class="input-group">
      <input id="register-password-confirm" type="password" required />
      <button id="toggle-register-password-confirm-btn" type="button"><i class="fa fa-eye"></i></button>
    </div>
    <button id="register-submit-btn" type="submit">
      <span id="register-btn-text" data-original-label="Crear cuenta">Crear cuenta</span>
      <span id="register-spinner" class="d-none spinner-border spinner-border-sm"></span>
    </button>
  </form>
  <div id="register-alert" class="d-none alert"></div>
  <button id="open-login-btn" type="button">Iniciar sesión</button>
  <button id="google-register-btn" type="button"><i class="fab fa-google"></i> Google</button>
</div>

<div id="email-verification-view" class="d-none">
  <p id="email-verification-eyebrow"></p>
  <h2 id="email-verification-title"></h2>
  <p id="email-verification-copy"></p>
  <p id="email-verification-email"></p>
  <p id="email-verification-help"></p>
  <div id="email-verification-status" class="d-none alert"></div>
  <button id="email-verification-login-btn" type="button">Volver al inicio</button>
  <button id="email-verification-resend-btn" type="button">
    <i class="fas fa-redo-alt mr-1"></i>Reenviar correo
  </button>
</div>

<div id="profile-view" class="d-none">
  <form id="profile-form" novalidate>
    <div class="input-group">
      <input id="username" name="username" required />
    </div>
    <button id="profile-submit-btn" type="submit">
      <span id="profile-btn-text" data-original-label="Guardar nombre de usuario">Guardar nombre de usuario</span>
      <span id="profile-spinner" class="d-none spinner-border spinner-border-sm"></span>
    </button>
  </form>
  <div id="profile-alert" class="d-none alert"></div>
</div>

<div id="two-factor-view" class="d-none">
  <form id="two-factor-form" novalidate>
    <input id="two-factor-code" name="two-factor-code" required />
    <button id="two-factor-submit-btn" type="submit">
      <span id="two-factor-btn-text" data-original-label="Verificar y Entrar">Verificar y Entrar</span>
      <span id="two-factor-spinner" class="d-none spinner-border spinner-border-sm"></span>
    </button>
  </form>
  <div id="two-factor-alert" class="d-none alert"></div>
  <button id="back-to-login-from-2fa-btn" type="button">Volver al inicio</button>
</div>

<div id="setup-2fa-view" class="d-none">
  <form id="setup-2fa-form" novalidate class="d-none">
    <input id="setup-2fa-code" name="setup-2fa-code" required />
    <button id="setup-2fa-submit-btn" type="submit">
      <span id="setup-2fa-btn-text" data-original-label="Verificar y Continuar">Verificar y Continuar</span>
      <span id="setup-2fa-spinner" class="d-none spinner-border spinner-border-sm"></span>
    </button>
  </form>
  <div id="setup-2fa-alert" class="d-none alert"></div>
  <div id="mandatory-2fa-qr-container"></div>
</div>

<div id="forgot-password-view" class="d-none">
  <form id="forgot-password-form" novalidate>
    <input id="forgot-email" name="forgot-email" type="email" required />
    <button id="forgot-password-submit-btn" type="submit">
      <span id="forgot-password-btn-text" data-original-label="Enviar código">Enviar código</span>
      <span id="forgot-password-spinner" class="d-none spinner-border spinner-border-sm"></span>
    </button>
  </form>
  <form id="reset-code-form" novalidate class="d-none">
    <input id="reset-code" name="reset-code" required />
    <button id="reset-code-submit-btn" type="submit">
      <span id="reset-code-btn-text" data-original-label="Verificar código">Verificar código</span>
      <span id="reset-code-spinner" class="d-none spinner-border spinner-border-sm"></span>
    </button>
    <button id="resend-reset-code-btn" type="button">Reenviar código</button>
  </form>
  <form id="reset-password-form" novalidate class="d-none">
    <input id="reset-password" name="reset-password" type="password" required />
    <input id="reset-password-confirm" name="reset-password-confirm" type="password" required />
    <button id="reset-password-submit-btn" type="submit">
      <span id="reset-password-btn-text" data-original-label="Cambiar contraseña">Cambiar contraseña</span>
      <span id="reset-password-spinner" class="d-none spinner-border spinner-border-sm"></span>
    </button>
  </form>
  <div id="forgot-password-alert" class="d-none alert"></div>
  <button id="back-to-login-btn" type="button">Volver</button>
  <button id="back-to-login-from-reset-btn" type="button">Volver</button>
  <button id="back-to-login-from-reset-btn2" type="button">Volver</button>
  <button id="back-to-login-from-reset-btn3" type="button">Volver</button>
</div>
`;

// ── Suite ──────────────────────────────────────────────────────

describe('auth-page integration', () => {
  let authPage;
  let authService;
  let authSession;
  let valUtils;

  beforeAll(async () => {
    document.body.innerHTML = DOM_FIXTURE;

    authService = authServiceMock;
    authSession = authSessionMock;
    valUtils = valUtilsMock;

    authService.loginWithEmail.mockResolvedValue({
      user: { id: 1, email: 'a@b.com', roles: [] },
    });
    authService.registerLocal.mockResolvedValue({ verification_sent: true });
    authService.registerWithGoogle.mockResolvedValue({
      user: { id: 2, email: 'google@test.com', roles: [] },
    });
    authService.requestPasswordResetCode.mockResolvedValue({
      message: 'Si el correo está registrado, recibirás un código.',
    });
    authService.verifyPasswordResetCode.mockResolvedValue({});
    authService.resetPasswordWithCode.mockResolvedValue({});
    authService.verifyTwoFactorLogin.mockResolvedValue({
      user: { id: 1, username: 'testuser', roles: [] },
    });
    authService.resendVerificationEmail.mockResolvedValue({});

    document.body.innerHTML = DOM_FIXTURE;
    authPage = await import(
      '../app/js/modules/auth/presentation/auth-page.js'
    );

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  beforeEach(() => {
    const views = [
      'login-view', 'register-view', 'email-verification-view',
      'profile-view', 'two-factor-view', 'setup-2fa-view',
      'forgot-password-view',
    ];
    views.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('d-none');
    });
    const loginView = document.getElementById('login-view');
    if (loginView) loginView.classList.remove('d-none');

    const fpForm = document.getElementById('forgot-password-form');
    if (fpForm) fpForm.classList.remove('d-none');
    const rcForm = document.getElementById('reset-code-form');
    if (rcForm) rcForm.classList.add('d-none');
    const rpForm = document.getElementById('reset-password-form');
    if (rpForm) rpForm.classList.add('d-none');

    document.body.className = '';

    const inputs = [
      'email', 'password', 'forgot-email', 'reset-code',
      'reset-password', 'reset-password-confirm', 'register-name',
      'register-lastname', 'register-username', 'register-email',
      'register-password', 'register-password-confirm', 'username',
      'two-factor-code', 'setup-2fa-code',
    ];
    inputs.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const alerts = [
      'login-alert', 'register-alert', 'profile-alert',
      'two-factor-alert', 'setup-2fa-alert', 'forgot-password-alert',
      'email-verification-status',
    ];
    alerts.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('d-none');
        el.textContent = '';
      }
    });

    document.querySelectorAll('[id$="-submit-btn"]').forEach((btn) => {
      btn.disabled = false;
    });
    document.querySelectorAll('[id$="-spinner"]').forEach((sp) => {
      sp.classList.add('d-none');
    });

    [
      'email-verification-eyebrow', 'email-verification-title',
      'email-verification-copy', 'email-verification-email',
      'email-verification-help',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });

    localStorage.clear();
  });

  // ── 1. Module exports ──────────────────────────────────────

  describe('module exports', () => {
    it('exports togglePasswordVisibility', () => {
      expect(authPage.togglePasswordVisibility).toBeTypeOf('function');
    });

    it('exports showAlert', () => {
      expect(authPage.showAlert).toBeTypeOf('function');
    });

    it('exports hideAlert', () => {
      expect(authPage.hideAlert).toBeTypeOf('function');
    });

    it('exports normalizeCode', () => {
      expect(authPage.normalizeCode).toBeTypeOf('function');
    });

    it('exports hasRoleAdmin', () => {
      expect(authPage.hasRoleAdmin).toBeTypeOf('function');
    });

    it('exports toggleSubmitState', () => {
      expect(authPage.toggleSubmitState).toBeTypeOf('function');
    });

    it('exports switchView', () => {
      expect(authPage.switchView).toBeTypeOf('function');
    });

    it('exports validateFormGroup', () => {
      expect(authPage.validateFormGroup).toBeTypeOf('function');
    });

    it('exports initAuthPage', () => {
      expect(authPage.initAuthPage).toBeTypeOf('function');
    });
  });

  // ── 2. DOMContentLoaded init ────────────────────────────────

  describe('DOMContentLoaded initialisation', () => {
    it('calls setupValidationListeners once per form (8 forms)', () => {
      expect(valUtils.setupValidationListeners).toHaveBeenCalledTimes(8);
    });

    it('calls restoreSession during bootstrap', () => {
      expect(authService.restoreSession).toHaveBeenCalled();
    });

    it('starts on login view (visible by default)', () => {
      expect(
        document.getElementById('login-view').classList.contains('d-none'),
      ).toBe(false);
    });
  });

  // ── 3. View switching ──────────────────────────────────────

  describe('view switching', () => {
    it('switches to register view on open-register-btn click', () => {
      document.getElementById('open-register-btn').click();

      expect(
        document.getElementById('register-view').classList.contains('d-none'),
      ).toBe(false);
      expect(
        document.getElementById('login-view').classList.contains('d-none'),
      ).toBe(true);
      expect(document.body.classList.contains('auth-register-mode')).toBe(true);
    });

    it('switches back to login view on open-login-btn click', () => {
      document.getElementById('open-login-btn').click();

      expect(
        document.getElementById('login-view').classList.contains('d-none'),
      ).toBe(false);
      expect(
        document.getElementById('register-view').classList.contains('d-none'),
      ).toBe(true);
      expect(document.body.classList.contains('auth-login-mode')).toBe(true);
    });

    it('switches to forgot-password view via open-forgot-password-btn', () => {
      document.getElementById('open-forgot-password-btn').click();

      expect(
        document
          .getElementById('forgot-password-view')
          .classList.contains('d-none'),
      ).toBe(false);
      expect(
        document.getElementById('login-view').classList.contains('d-none'),
      ).toBe(true);
    });

    it('switches to email-verification view via exported switchView', () => {
      authPage.switchView('email-verification');

      expect(
        document
          .getElementById('email-verification-view')
          .classList.contains('d-none'),
      ).toBe(false);
      expect(document.body.classList.contains('auth-email-verification-mode'))
        .toBe(true);
    });

    it('back-to-login-btn returns to login from forgot-password', () => {
      document.getElementById('open-forgot-password-btn').click();
      document.getElementById('back-to-login-btn').click();

      expect(
        document.getElementById('login-view').classList.contains('d-none'),
      ).toBe(false);
      expect(
        document
          .getElementById('forgot-password-view')
          .classList.contains('d-none'),
      ).toBe(true);
    });
  });

  // ── 4. Alert display ───────────────────────────────────────

  describe('alert display', () => {
    it('showAlert sets content, type class, and removes d-none', () => {
      const target = document.getElementById('login-alert');
      authPage.showAlert(target, 'Email no encontrado', 'warning');

      expect(target.textContent).toBe('Email no encontrado');
      expect(target.classList.contains('d-none')).toBe(false);
      expect(target.className).toContain('alert-warning');
    });

    it('showAlert defaults to danger type', () => {
      const target = document.getElementById('login-alert');
      authPage.showAlert(target, 'Error genérico');

      expect(target.className).toContain('alert-danger');
    });

    it('showAlert returns early on null target', () => {
      expect(() => authPage.showAlert(null, 'msg')).not.toThrow();
    });

    it('hideAlert adds d-none and clears content', () => {
      const target = document.getElementById('login-alert');
      target.textContent = 'Some message';
      target.classList.remove('d-none');
      authPage.hideAlert(target);

      expect(target.classList.contains('d-none')).toBe(true);
      expect(target.textContent).toBe('');
    });

    it('hideAlert returns early on null target', () => {
      expect(() => authPage.hideAlert(null)).not.toThrow();
    });
  });

  // ── 5. Password visibility toggle ───────────────────────────

  describe('password visibility toggle', () => {
    it('toggles login password input type on button click', () => {
      const input = document.getElementById('password');
      input.type = 'password';

      document.getElementById('toggle-password-btn').click();
      expect(input.type).toBe('text');

      document.getElementById('toggle-password-btn').click();
      expect(input.type).toBe('password');
    });

    it('toggles register password input type', () => {
      const input = document.getElementById('register-password');
      input.type = 'password';

      document.getElementById('toggle-register-password-btn').click();
      expect(input.type).toBe('text');

      document.getElementById('toggle-register-password-btn').click();
      expect(input.type).toBe('password');
    });

    it('toggles register password confirm input type', () => {
      const input = document.getElementById('register-password-confirm');
      input.type = 'password';

      document.getElementById('toggle-register-password-confirm-btn').click();
      expect(input.type).toBe('text');
    });

    it('toggles icon classes on the password button', () => {
      const input = document.getElementById('password');
      const btn = document.getElementById('toggle-password-btn');
      const icon = btn.querySelector('i');
      input.type = 'password';

      btn.click();
      expect(icon.classList.contains('fa-eye-slash')).toBe(true);
      expect(icon.classList.contains('fa-eye')).toBe(false);

      btn.click();
      expect(icon.classList.contains('fa-eye')).toBe(true);
      expect(icon.classList.contains('fa-eye-slash')).toBe(false);
    });
  });

  // ── 6. Form validation ────────────────────────────────────

  describe('validateFormGroup', () => {
    it('returns false for empty required inputs', () => {
      const group = document.createElement('div');
      group.innerHTML = '<input required value="">';
      expect(authPage.validateFormGroup(group)).toBe(false);
    });

    it('adds is-invalid to empty required inputs', () => {
      const group = document.createElement('div');
      group.innerHTML = '<input required value="" id="test-input">';
      authPage.validateFormGroup(group);
      expect(
        group.querySelector('#test-input').classList.contains('is-invalid'),
      ).toBe(true);
    });

    it('returns true when all required inputs are filled', () => {
      const group = document.createElement('div');
      group.innerHTML = '<input required value="filled">';
      expect(authPage.validateFormGroup(group)).toBe(true);
    });

    it('ignores non-required empty inputs', () => {
      const group = document.createElement('div');
      group.innerHTML = '<input value="">';
      expect(authPage.validateFormGroup(group)).toBe(true);
    });

    it('returns false for null form group', () => {
      expect(authPage.validateFormGroup(null)).toBe(false);
    });
  });

  // ── 5. Additional coverage ──────────────────────────────────────

  describe('5. Additional coverage', () => {
    describe('password recovery flow', () => {
      it('navigates to forgot-password and pre-fills login email', () => {
        document.getElementById('email').value = 'user@test.com';
        document.getElementById('open-forgot-password-btn').click();

        expect(
          document.getElementById('forgot-password-view').classList.contains('d-none'),
        ).toBe(false);
        expect(
          document.getElementById('login-view').classList.contains('d-none'),
        ).toBe(true);
        expect(document.getElementById('forgot-email').value).toBe('user@test.com');
      });

      it('step 1: forgot-password form requests reset code and advances', async () => {
        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('forgot-email').value = 'user@test.com';
        document.getElementById('forgot-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(authService.requestPasswordResetCode).toHaveBeenCalledWith('user@test.com');
        expect(
          document.getElementById('reset-code-form').classList.contains('d-none'),
        ).toBe(false);
        expect(
          document.getElementById('forgot-password-form').classList.contains('d-none'),
        ).toBe(true);
        const alert = document.getElementById('forgot-password-alert');
        expect(alert.classList.contains('d-none')).toBe(false);
        expect(alert.className).toContain('alert-success');
      });

      it('step 2: reset-code form verifies code and advances to password step', async () => {
        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('forgot-email').value = 'user@test.com';
        document.getElementById('forgot-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        document.getElementById('reset-code').value = 'ABC123';
        document.getElementById('reset-code-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(authService.verifyPasswordResetCode).toHaveBeenCalledWith('user@test.com', 'ABC123');
        expect(
          document.getElementById('reset-password-form').classList.contains('d-none'),
        ).toBe(false);
        expect(
          document.getElementById('reset-code-form').classList.contains('d-none'),
        ).toBe(true);
      });

      it('step 3: reset-password form completes recovery and returns to login', async () => {
        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('forgot-email').value = 'user@test.com';
        document.getElementById('forgot-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        document.getElementById('reset-code').value = 'ABC123';
        document.getElementById('reset-code-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        document.getElementById('reset-password').value = 'NuevaP@ss1';
        document.getElementById('reset-password-confirm').value = 'NuevaP@ss1';
        document.getElementById('reset-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(authService.resetPasswordWithCode).toHaveBeenCalledWith(
          'user@test.com',
          'ABC123',
          'NuevaP@ss1',
          'NuevaP@ss1',
        );
        expect(
          document.getElementById('login-view').classList.contains('d-none'),
        ).toBe(false);
        expect(
          document.getElementById('forgot-password-view').classList.contains('d-none'),
        ).toBe(true);
        expect(document.getElementById('email').value).toBe('user@test.com');
      });

      it('cancel recovery returns to login via back-to-login-from-reset-btn', () => {
        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('back-to-login-from-reset-btn').click();

        expect(
          document.getElementById('login-view').classList.contains('d-none'),
        ).toBe(false);
        expect(
          document.getElementById('forgot-password-view').classList.contains('d-none'),
        ).toBe(true);
      });

      it('handles server error on forgot-password request', async () => {
        const err = new Error('Servicio no disponible');
        authService.requestPasswordResetCode.mockRejectedValueOnce(err);

        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('forgot-email').value = 'user@test.com';
        document.getElementById('forgot-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(valUtils.handleBackendErrors).toHaveBeenCalledWith(
          err,
          document.getElementById('forgot-password-form'),
          document.getElementById('forgot-password-alert'),
        );
        expect(
          document.getElementById('forgot-password-form').classList.contains('d-none'),
        ).toBe(false);
      });

      it('handles server error on reset-code verification', async () => {
        const err = new Error('Código inválido');
        authService.verifyPasswordResetCode.mockRejectedValueOnce(err);

        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('forgot-email').value = 'user@test.com';
        document.getElementById('forgot-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        document.getElementById('reset-code').value = 'BAD';
        document.getElementById('reset-code-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(valUtils.handleBackendErrors).toHaveBeenCalledWith(
          err,
          document.getElementById('reset-code-form'),
          document.getElementById('forgot-password-alert'),
        );
        expect(document.getElementById('reset-code').value).toBe('');
      });

      it('handles server error on reset-password', async () => {
        const err = new Error('Token expirado');
        authService.resetPasswordWithCode.mockRejectedValueOnce(err);

        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('forgot-email').value = 'user@test.com';
        document.getElementById('forgot-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        document.getElementById('reset-code').value = 'ABC123';
        document.getElementById('reset-code-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        document.getElementById('reset-password').value = 'NuevaP@ss1';
        document.getElementById('reset-password-confirm').value = 'NuevaP@ss1';
        document.getElementById('reset-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(valUtils.handleBackendErrors).toHaveBeenCalledWith(
          err,
          document.getElementById('reset-password-form'),
          document.getElementById('forgot-password-alert'),
        );
      });

      it('password mismatch on reset-password calls setFieldError', async () => {
        const callsBefore = authService.resetPasswordWithCode.mock.calls.length;

        document.getElementById('reset-password').value = 'Pass1';
        document.getElementById('reset-password-confirm').value = 'Pass2';
        document.getElementById('reset-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(valUtils.setFieldError).toHaveBeenCalledWith(
          document.getElementById('reset-password-confirm'),
          'Las contraseñas no coinciden.',
        );
        expect(authService.resetPasswordWithCode.mock.calls.length).toBe(callsBefore);
      });
    });

    describe('register validation edge cases', () => {
      it('password mismatch prevents submission', async () => {
        document.getElementById('open-register-btn').click();
        document.getElementById('register-name').value = 'Juan';
        document.getElementById('register-lastname').value = 'Pérez';
        document.getElementById('register-username').value = 'juanperez';
        document.getElementById('register-email').value = 'juan@test.com';
        document.getElementById('register-password').value = 'Password1';
        document.getElementById('register-password-confirm').value = 'Password2';
        document.getElementById('register-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(valUtils.setFieldError).toHaveBeenCalledWith(
          document.getElementById('register-password-confirm'),
          'Las contraseñas no coinciden.',
        );
        expect(authService.registerLocal).not.toHaveBeenCalled();
      });

      it('login: validateFormFrontend returning false prevents submission', async () => {
        valUtils.validateFormFrontend.mockReturnValueOnce(false);

        document.getElementById('email').value = 'test@test.com';
        document.getElementById('password').value = 'pass';
        document.getElementById('login-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(authService.loginWithEmail).not.toHaveBeenCalled();
      });

      it('forgot-password: validateFormFrontend returning false prevents submission', async () => {
        const callsBefore = authService.requestPasswordResetCode.mock.calls.length;
        valUtils.validateFormFrontend.mockReturnValueOnce(false);

        document.getElementById('forgot-email').value = 'test@test.com';
        document.getElementById('forgot-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(authService.requestPasswordResetCode.mock.calls.length).toBe(callsBefore);
      });
    });

    describe('error handling', () => {
      it('login: EMAIL_NOT_VERIFIED shows email verification screen', async () => {
        const error = {
          status: 403,
          data: { error_code: 'EMAIL_NOT_VERIFIED' },
          message: 'Debes verificar tu correo',
        };
        authService.loginWithEmail.mockRejectedValueOnce(error);

        document.getElementById('email').value = 'unverified@test.com';
        document.getElementById('password').value = 'pass';
        document.getElementById('login-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(
          document.getElementById('email-verification-view').classList.contains('d-none'),
        ).toBe(false);
        expect(document.getElementById('email-verification-email').textContent).toBe(
          'unverified@test.com',
        );
      });

      it('login: generic error calls handleBackendErrors', async () => {
        const err = new Error('Credenciales inválidas');
        authService.loginWithEmail.mockRejectedValueOnce(err);

        document.getElementById('email').value = 'bad@test.com';
        document.getElementById('password').value = 'pass';
        document.getElementById('login-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(valUtils.handleBackendErrors).toHaveBeenCalledWith(
          err,
          document.getElementById('login-form'),
          document.getElementById('login-alert'),
        );
      });

      it('register: server error calls handleBackendErrors', async () => {
        const err = new Error('Email ya registrado');
        authService.registerLocal.mockRejectedValueOnce(err);

        document.getElementById('open-register-btn').click();
        document.getElementById('register-name').value = 'Juan';
        document.getElementById('register-lastname').value = 'Pérez';
        document.getElementById('register-username').value = 'juanperez';
        document.getElementById('register-email').value = 'existing@test.com';
        document.getElementById('register-password').value = 'Password1';
        document.getElementById('register-password-confirm').value = 'Password1';
        document.getElementById('register-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(valUtils.handleBackendErrors).toHaveBeenCalledWith(
          err,
          document.getElementById('register-form'),
          document.getElementById('register-alert'),
        );
      });
    });

    describe('view switching additions', () => {
      it('email-verification: return to login button works', () => {
        authPage.switchView('email-verification');
        document.getElementById('email-verification-login-btn').click();

        expect(
          document.getElementById('login-view').classList.contains('d-none'),
        ).toBe(false);
        expect(
          document.getElementById('email-verification-view').classList.contains('d-none'),
        ).toBe(true);
      });

      it('two-factor: back-to-login-from-2fa-btn returns to login', () => {
        authPage.switchView('two-factor');
        document.getElementById('back-to-login-from-2fa-btn').click();

        expect(
          document.getElementById('login-view').classList.contains('d-none'),
        ).toBe(false);
        expect(
          document.getElementById('two-factor-view').classList.contains('d-none'),
        ).toBe(true);
      });

      it('forgot-password: back-to-login-from-reset-btn2/btn3 also return to login', () => {
        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('back-to-login-from-reset-btn2').click();

        expect(
          document.getElementById('login-view').classList.contains('d-none'),
        ).toBe(false);
        expect(
          document.getElementById('forgot-password-view').classList.contains('d-none'),
        ).toBe(true);
      });
    });

    describe('email verification resend', () => {
      it('resends verification email after registration', async () => {
        document.getElementById('open-register-btn').click();
        document.getElementById('register-name').value = 'Juan';
        document.getElementById('register-lastname').value = 'Pérez';
        document.getElementById('register-username').value = 'juanperez';
        document.getElementById('register-email').value = 'juan@test.com';
        document.getElementById('register-password').value = 'Password1';
        document.getElementById('register-password-confirm').value = 'Password1';
        document.getElementById('register-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(
          document.getElementById('email-verification-view').classList.contains('d-none'),
        ).toBe(false);
        expect(document.getElementById('email-verification-email').textContent).toBe(
          'juan@test.com',
        );

        document.getElementById('email-verification-resend-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(authService.resendVerificationEmail).toHaveBeenCalledWith('juan@test.com');
        expect(
          document.getElementById('email-verification-status').classList.contains('d-none'),
        ).toBe(false);
        expect(document.getElementById('email-verification-status').className).toContain(
          'alert-success',
        );
      });
    });

    describe('cooldown / rate limiting', () => {
      it('resend reset code button is disabled during request and re-enabled after', async () => {
        let resolveRequest;
        authService.requestPasswordResetCode.mockImplementationOnce(
          () => new Promise((resolve) => { resolveRequest = resolve; }),
        );

        document.getElementById('open-forgot-password-btn').click();
        document.getElementById('forgot-email').value = 'user@test.com';
        document.getElementById('forgot-password-form').dispatchEvent(new Event('submit'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const resendBtn = document.getElementById('resend-reset-code-btn');
        resendBtn.click();

        expect(resendBtn.disabled).toBe(true);

        resolveRequest({ message: 'Código reenviado' });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(resendBtn.disabled).toBe(false);
      });
    });

    describe('Google auth error handling', () => {
      it('shows error alert when Google auth fails with non-popup error', async () => {
        const err = new Error('Error de conexión con Google');
        authService.registerWithGoogle.mockRejectedValueOnce(err);

        document.getElementById('google-register-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const alert = document.getElementById('register-alert');
        expect(alert.classList.contains('d-none')).toBe(false);
        expect(alert.textContent).toContain('Error de conexión con Google');
      });

      it('silently ignores popup-closed-by-user error', async () => {
        const err = { code: 'auth/popup-closed-by-user' };
        authService.registerWithGoogle.mockRejectedValueOnce(err);

        document.getElementById('google-register-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const alert = document.getElementById('register-alert');
        expect(alert.classList.contains('d-none')).toBe(true);
      });
    });
  });
});

// ── 7. Flash message from URL and localStorage (fresh init per test) ──

describe('flash message and URL notices on init', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = DOM_FIXTURE;
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows flash message from localStorage on bootstrap', async () => {
    localStorage.setItem('sgig_flash_message', 'Cuenta verificada.');
    globalThis.location.href = 'http://localhost/index.html';

    await import('../app/js/modules/auth/presentation/auth-page.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const alert = document.getElementById('login-alert');
    expect(alert.classList.contains('d-none')).toBe(false);
    expect(alert.textContent).toBe('Cuenta verificada.');
    expect(alert.className).toContain('alert-success');
    expect(localStorage.getItem('sgig_flash_message')).toBeNull();
  });

  it('shows verified notice from URL param', async () => {
    globalThis.location.href = 'http://localhost/index.html?verified=1';

    await import('../app/js/modules/auth/presentation/auth-page.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const alert = document.getElementById('login-alert');
    expect(alert.classList.contains('d-none')).toBe(false);
    expect(alert.textContent).toContain('Correo verificado');
    expect(alert.className).toContain('alert-success');
  });

  it('shows invalid link error from URL param', async () => {
    globalThis.location.href = 'http://localhost/index.html?error=invalid_link';

    await import('../app/js/modules/auth/presentation/auth-page.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const alert = document.getElementById('login-alert');
    expect(alert.classList.contains('d-none')).toBe(false);
    expect(alert.textContent).toContain('expirado');
    expect(alert.className).toContain('alert-danger');
  });
});
