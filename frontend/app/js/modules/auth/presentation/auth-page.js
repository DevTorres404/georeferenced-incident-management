import {
  completeProfile,
  loginWithEmail,
  registerLocal,
  registerWithGoogle,
  requestPasswordResetCode,
  resetPasswordWithCode,
  restoreSession,
  verifyPasswordResetCode,
  verifyTwoFactorLogin,
  resendVerificationEmail
} from '../application/auth-service.js?v=17';
import { isEmailVerified, suggestUsername, updateUser } from '../../../core/auth-session.js?v=15';
import { handleBackendErrors, setupValidationListeners, validateFormFrontend, setFieldError } from '../../../shared/validators/validation-utils.js?v=1';

document.addEventListener('DOMContentLoaded', initAuthPage);

function initAuthPage() {
    const el = {
      loginView: document.getElementById('login-view'),
      registerView: document.getElementById('register-view'),
      profileView: document.getElementById('profile-view'),
      twoFactorView: document.getElementById('two-factor-view'),
      setupTwoFactorView: document.getElementById('setup-2fa-view'),
    forgotPasswordView: document.getElementById('forgot-password-view'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    profileForm: document.getElementById('profile-form'),
    twoFactorForm: document.getElementById('two-factor-form'),
    setupTwoFactorForm: document.getElementById('setup-2fa-form'),
    forgotPasswordForm: document.getElementById('forgot-password-form'),
    resetCodeForm: document.getElementById('reset-code-form'),
    resetPasswordForm: document.getElementById('reset-password-form'),
    loginAlert: document.getElementById('login-alert'),
    registerAlert: document.getElementById('register-alert'),
    profileAlert: document.getElementById('profile-alert'),
    twoFactorAlert: document.getElementById('two-factor-alert'),
    setupTwoFactorAlert: document.getElementById('setup-2fa-alert'),
    forgotPasswordAlert: document.getElementById('forgot-password-alert'),
    loginSpinner: document.getElementById('login-spinner'),
    registerSpinner: document.getElementById('register-spinner'),
    profileSpinner: document.getElementById('profile-spinner'),
    twoFactorSpinner: document.getElementById('two-factor-spinner'),
    setupTwoFactorSpinner: document.getElementById('setup-2fa-spinner'),
    forgotPasswordSpinner: document.getElementById('forgot-password-spinner'),
    resetCodeSpinner: document.getElementById('reset-code-spinner'),
    resetPasswordSpinner: document.getElementById('reset-password-spinner'),
    loginBtnText: document.getElementById('login-btn-text'),
    registerBtnText: document.getElementById('register-btn-text'),
    profileBtnText: document.getElementById('profile-btn-text'),
    twoFactorBtnText: document.getElementById('two-factor-btn-text'),
    setupTwoFactorBtnText: document.getElementById('setup-2fa-btn-text'),
    forgotPasswordBtnText: document.getElementById('forgot-password-btn-text'),
    resetCodeBtnText: document.getElementById('reset-code-btn-text'),
    resetPasswordBtnText: document.getElementById('reset-password-btn-text'),
    loginSubmitBtn: document.getElementById('login-submit-btn'),
    registerSubmitBtn: document.getElementById('register-submit-btn'),
    profileSubmitBtn: document.getElementById('profile-submit-btn'),
    twoFactorSubmitBtn: document.getElementById('two-factor-submit-btn'),
    setupTwoFactorSubmitBtn: document.getElementById('setup-2fa-submit-btn'),
    forgotPasswordSubmitBtn: document.getElementById('forgot-password-submit-btn'),
    resetCodeSubmitBtn: document.getElementById('reset-code-submit-btn'),
    resetPasswordSubmitBtn: document.getElementById('reset-password-submit-btn'),
      openRegisterBtn: document.getElementById('open-register-btn'),
      openLoginBtn: document.getElementById('open-login-btn'),
      backToLoginBtn: document.getElementById('back-to-login-btn'),
    openForgotPasswordBtn: document.getElementById('open-forgot-password-btn'),
    backToLoginFromResetBtn: document.getElementById('back-to-login-from-reset-btn'),
    backToLoginFromResetBtn2: document.getElementById('back-to-login-from-reset-btn2'),
    backToLoginFromResetBtn3: document.getElementById('back-to-login-from-reset-btn3'),
    resendResetCodeBtn: document.getElementById('resend-reset-code-btn'),
    googleRegisterBtn: document.getElementById('google-register-btn'),
    googleLoginBtn: document.getElementById('google-login-btn'),
    togglePasswordBtn: document.getElementById('toggle-password-btn'),
    toggleRegisterPasswordBtn: document.getElementById('toggle-register-password-btn'),
    toggleRegisterPasswordConfirmBtn: document.getElementById('toggle-register-password-confirm-btn'),
    passwordInput: document.getElementById('password'),
    forgotEmailInput: document.getElementById('forgot-email'),
    resetCodeInput: document.getElementById('reset-code'),
    resetPasswordInput: document.getElementById('reset-password'),
    resetPasswordConfirmInput: document.getElementById('reset-password-confirm'),
    registerPasswordInput: document.getElementById('register-password'),
    loginEmailInput: document.getElementById('email'),
    registerNameInput: document.getElementById('register-name'),
    registerLastNameInput: document.getElementById('register-lastname'),
    registerUsernameInput: document.getElementById('register-username'),
    registerEmailInput: document.getElementById('register-email'),
    registerPasswordConfirmInput: document.getElementById('register-password-confirm'),
    usernameInput: document.getElementById('username'),
    twoFactorCodeInput: document.getElementById('two-factor-code'),
    setupTwoFactorCodeInput: document.getElementById('setup-2fa-code'),
    setupTwoFactorQrContainer: document.getElementById('mandatory-2fa-qr-container'),
    dashboardLink: document.getElementById('dashboard-link'),
  };

  let busy = false;
  let tempTwoFactorToken = null;
  let recoveryEmail = '';
  let recoveryCode = '';

  bindEvents();
  setupValidationListeners(el.loginForm);
  setupValidationListeners(el.registerForm);
  setupValidationListeners(el.profileForm);
  setupValidationListeners(el.twoFactorForm);
  setupValidationListeners(el.setupTwoFactorForm);
  setupValidationListeners(el.forgotPasswordForm);
  setupValidationListeners(el.resetCodeForm);
  setupValidationListeners(el.resetPasswordForm);
  
  bootstrap();

  async function bootstrap() {
    if (window.location.protocol === 'file:') {
      showAlert(el.loginAlert, 'Abre esta página desde http://localhost:5500 para que Firebase y el WebSocket funcionen.', 'danger');
      return;
    }

    showFlashMessage();
    showVerificationNotice();

    const sessionUser = await restoreSession();
    if (sessionUser) {
      routeAfterAuth(sessionUser);
    }
  }

  function bindEvents() {
    if (el.loginForm) el.loginForm.addEventListener('submit', handleLoginSubmit);
    if (el.registerForm) el.registerForm.addEventListener('submit', handleRegisterSubmit);
    if (el.profileForm) el.profileForm.addEventListener('submit', handleProfileSubmit);
    if (el.twoFactorForm) el.twoFactorForm.addEventListener('submit', handleTwoFactorSubmit);
    if (el.setupTwoFactorForm) el.setupTwoFactorForm.addEventListener('submit', handleSetupTwoFactorSubmit);
    if (el.forgotPasswordForm) el.forgotPasswordForm.addEventListener('submit', handleForgotPasswordSubmit);
    if (el.resetCodeForm) el.resetCodeForm.addEventListener('submit', handleResetCodeSubmit);
    if (el.resetPasswordForm) el.resetPasswordForm.addEventListener('submit', handleResetPasswordSubmit);
    
    if (el.openLoginBtn) el.openLoginBtn.addEventListener('click', (event) => {
      event.preventDefault();
      switchView('login');
    });
    if (el.openRegisterBtn) el.openRegisterBtn.addEventListener('click', (event) => {
      event.preventDefault();
      switchView('register');
    });
    if (el.backToLoginBtn) el.backToLoginBtn.addEventListener('click', () => switchView('login'));
    if (el.openForgotPasswordBtn) el.openForgotPasswordBtn.addEventListener('click', (event) => {
      event.preventDefault();
      beginPasswordRecovery();
    });
    if (el.backToLoginFromResetBtn) el.backToLoginFromResetBtn.addEventListener('click', cancelPasswordRecovery);
    if (el.backToLoginFromResetBtn2) el.backToLoginFromResetBtn2.addEventListener('click', cancelPasswordRecovery);
    if (el.backToLoginFromResetBtn3) el.backToLoginFromResetBtn3.addEventListener('click', cancelPasswordRecovery);
    if (el.resendResetCodeBtn) el.resendResetCodeBtn.addEventListener('click', resendPasswordResetCode);
    const backToLoginFrom2FaBtn = document.getElementById('back-to-login-from-2fa-btn');
    if (backToLoginFrom2FaBtn) backToLoginFrom2FaBtn.addEventListener('click', () => {
      tempTwoFactorToken = null;
      switchView('login');
    });
    
    if (el.googleRegisterBtn) el.googleRegisterBtn.addEventListener('click', (e) => handleGoogleAuth(e, 'register'));
    if (el.googleLoginBtn) el.googleLoginBtn.addEventListener('click', (e) => handleGoogleAuth(e, 'login'));
    
    if (el.togglePasswordBtn && el.passwordInput) {
      el.togglePasswordBtn.addEventListener('click', () => togglePasswordVisibility(el.passwordInput, el.togglePasswordBtn));
    }
    if (el.toggleRegisterPasswordBtn && el.registerPasswordInput) {
      el.toggleRegisterPasswordBtn.addEventListener('click', () => togglePasswordVisibility(el.registerPasswordInput, el.toggleRegisterPasswordBtn));
    }
    
    if (el.toggleRegisterPasswordConfirmBtn && el.registerPasswordConfirmInput) {
      el.toggleRegisterPasswordConfirmBtn.addEventListener('click', () => togglePasswordVisibility(el.registerPasswordConfirmInput, el.toggleRegisterPasswordConfirmBtn));
    }
    
    if (el.dashboardLink) {
      el.dashboardLink.addEventListener('click', () => {
        if (!busy) {
          window.location.href = getAppPath('dashboard.html');
        }
      });
    }

  }

  function showFlashMessage() {
    const message = localStorage.getItem('sgig_flash_message');
    if (!message) return;

    showAlert(el.loginAlert, message, 'success');
    localStorage.removeItem('sgig_flash_message');
  }

  function showLoginEmailNotVerified(alertEl, email) {
    if (!alertEl) return;
    alertEl.className = 'alert alert-warning py-3 mb-3 text-start small';
    alertEl.innerHTML = '';
    alertEl.classList.remove('d-none');

    const msg = document.createElement('p');
    msg.className = 'mb-2';
    msg.textContent = 'Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.';
    alertEl.appendChild(msg);

    if (email) {
      const resendBtn = document.createElement('button');
      resendBtn.type = 'button';
      resendBtn.className = 'btn btn-sm btn-outline-primary mt-1';
      resendBtn.innerHTML = '<i class="fas fa-redo-alt mr-1"></i> Reenviar correo de verificación';
      resendBtn.addEventListener('click', async () => {
        resendBtn.disabled = true;
        resendBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Enviando...';
        try {
          await resendVerificationEmail(email);
          showAlert(alertEl, 'Correo de verificación reenviado. Revisa tu bandeja de entrada.', 'success');
        } catch (e) {
          showAlert(alertEl, e.message || 'No se pudo reenviar el correo.', 'danger');
        } finally {
          resendBtn.disabled = false;
          resendBtn.innerHTML = '<i class="fas fa-redo-alt mr-1"></i> Reenviar correo de verificación';
        }
      });
      alertEl.appendChild(resendBtn);
    }
  }

  function showVerificationNotice() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') !== '1') return;

    showAlert(el.loginAlert, 'Correo verificado correctamente. Ya puedes iniciar sesion.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    if (!validateFormFrontend(el.loginForm)) {
      return;
    }
    setLoading('login', true);
    hideAlert(el.loginAlert);

    try {
      const data = await loginWithEmail(
        el.loginEmailInput.value.trim(),
        el.passwordInput.value
      );

      if (data.requires_2fa) {
        tempTwoFactorToken = data.two_factor_token;
        switchView('two-factor');
        if (el.twoFactorCodeInput) {
          el.twoFactorCodeInput.value = '';
          el.twoFactorCodeInput.focus();
        }
        return;
      }

      routeAfterAuth(data.user);
    } catch (error) {
      if (error?.status === 403 && (error?.data?.error_code === 'EMAIL_NOT_VERIFIED' || error?.message?.includes('verificar tu correo'))) {
        showLoginEmailNotVerified(el.loginAlert, el.loginEmailInput?.value?.trim() || '');
        return;
      }
      handleBackendErrors(error, el.loginForm, el.loginAlert);
    } finally {
      setLoading('login', false);
    }
  }

  async function handleTwoFactorSubmit(event) {
    event.preventDefault();
    
    if (!tempTwoFactorToken) {
      switchView('login');
      return;
    }

    setLoading('twoFactor', true);
    hideAlert(el.twoFactorAlert);

    try {
      const data = await verifyTwoFactorLogin(
        tempTwoFactorToken,
        el.twoFactorCodeInput.value.trim()
      );

      tempTwoFactorToken = null;
      routeAfterAuth(data.user);
    } catch (error) {
      handleBackendErrors(error, el.twoFactorForm, el.twoFactorAlert);
      el.twoFactorCodeInput.value = '';
      el.twoFactorCodeInput.focus();
    } finally {
      setLoading('twoFactor', false);
    }
  }

  function beginPasswordRecovery() {
    recoveryEmail = el.loginEmailInput?.value?.trim() || '';
    recoveryCode = '';
    if (el.forgotEmailInput) el.forgotEmailInput.value = recoveryEmail;
    if (el.resetCodeInput) el.resetCodeInput.value = '';
    if (el.resetPasswordInput) el.resetPasswordInput.value = '';
    if (el.resetPasswordConfirmInput) el.resetPasswordConfirmInput.value = '';
    hideAlert(el.forgotPasswordAlert);
    showRecoveryStep('request');
    switchView('forgot-password');
    el.forgotEmailInput?.focus();
  }

  function cancelPasswordRecovery() {
    recoveryEmail = '';
    recoveryCode = '';
    if (el.forgotEmailInput) el.forgotEmailInput.value = '';
    if (el.resetCodeInput) el.resetCodeInput.value = '';
    if (el.resetPasswordInput) el.resetPasswordInput.value = '';
    if (el.resetPasswordConfirmInput) el.resetPasswordConfirmInput.value = '';
    hideAlert(el.forgotPasswordAlert);
    showRecoveryStep('request');
    switchView('login');
  }

  async function handleForgotPasswordSubmit(event) {
    event.preventDefault();
    if (!validateFormFrontend(el.forgotPasswordForm)) return;

    setLoading('forgotPassword', true);
    hideAlert(el.forgotPasswordAlert);

    try {
      recoveryEmail = el.forgotEmailInput.value.trim();
      const response = await requestPasswordResetCode(recoveryEmail);
      showAlert(
        el.forgotPasswordAlert,
        response?.message || 'Si el correo esta registrado, recibiras un codigo de recuperacion.',
        'success'
      );
      showRecoveryStep('code');
      el.resetCodeInput?.focus();
    } catch (error) {
      handleBackendErrors(error, el.forgotPasswordForm, el.forgotPasswordAlert);
    } finally {
      setLoading('forgotPassword', false);
    }
  }

  async function resendPasswordResetCode() {
    if (!recoveryEmail) {
      showRecoveryStep('request');
      el.forgotEmailInput?.focus();
      return;
    }

    if (el.resendResetCodeBtn) el.resendResetCodeBtn.disabled = true;
    hideAlert(el.forgotPasswordAlert);

    try {
      const response = await requestPasswordResetCode(recoveryEmail);
      if (el.resetCodeInput) el.resetCodeInput.value = '';
      recoveryCode = '';
      showAlert(
        el.forgotPasswordAlert,
        response?.message || 'Si el correo está registrado, recibirás un código de recuperación.',
        'success'
      );
      showRecoveryStep('code');
      el.resetCodeInput?.focus();
    } catch (error) {
      handleBackendErrors(error, el.resetCodeForm, el.forgotPasswordAlert);
    } finally {
      if (el.resendResetCodeBtn) el.resendResetCodeBtn.disabled = false;
    }
  }

  async function handleResetCodeSubmit(event) {
    event.preventDefault();
    if (!validateFormFrontend(el.resetCodeForm)) return;

    setLoading('resetCode', true);
    hideAlert(el.forgotPasswordAlert);

    try {
      recoveryCode = el.resetCodeInput.value.trim();
      await verifyPasswordResetCode(recoveryEmail, recoveryCode);
      showAlert(el.forgotPasswordAlert, 'Código verificado. Ingresa tu nueva contraseña.', 'success');
      showRecoveryStep('password');
      el.resetPasswordInput?.focus();
    } catch (error) {
      handleBackendErrors(error, el.resetCodeForm, el.forgotPasswordAlert);
      if (el.resetCodeInput) {
        el.resetCodeInput.value = '';
        el.resetCodeInput.focus();
      }
    } finally {
      setLoading('resetCode', false);
    }
  }

  async function handleResetPasswordSubmit(event) {
    event.preventDefault();
    if (!validateFormFrontend(el.resetPasswordForm)) return;

    if (el.resetPasswordInput.value !== el.resetPasswordConfirmInput.value) {
      setFieldError(el.resetPasswordConfirmInput, 'Las contraseñas no coinciden.');
      return;
    }

    setLoading('resetPassword', true);
    hideAlert(el.forgotPasswordAlert);

    try {
      await resetPasswordWithCode(
        recoveryEmail,
        recoveryCode,
        el.resetPasswordInput.value,
        el.resetPasswordConfirmInput.value
      );

      recoveryCode = '';
      showAlert(el.loginAlert, 'Contraseña restablecida. Ya puedes iniciar sesión con tu nueva contraseña.', 'success');
      switchView('login');
      if (el.loginEmailInput && recoveryEmail) el.loginEmailInput.value = recoveryEmail;
      if (el.passwordInput) {
        el.passwordInput.value = '';
        el.passwordInput.focus();
      }
    } catch (error) {
      handleBackendErrors(error, el.resetPasswordForm, el.forgotPasswordAlert);
    } finally {
      setLoading('resetPassword', false);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    if (!validateFormFrontend(el.registerForm)) {
      return;
    }
    
    if (el.registerPasswordInput.value !== el.registerPasswordConfirmInput.value) {
      setFieldError(el.registerPasswordConfirmInput, 'Las contraseñas no coinciden.');
      return;
    }
    setLoading('register', true);
    hideAlert(el.registerAlert);

    try {
      const data = await registerLocal({
        first_name: el.registerNameInput.value.trim(),
        last_name: el.registerLastNameInput.value.trim(),
        username: el.registerUsernameInput.value.trim(),
        email: el.registerEmailInput.value.trim(),
        password: el.registerPasswordInput.value,
        password_confirmation: el.registerPasswordConfirmInput.value,
      });

      const registeredEmail = el.registerEmailInput.value.trim();
      el.registerForm.reset();
      showRegisterSuccess(el.registerAlert, registeredEmail, data.verification_sent, data.verification_error);
    } catch (error) {
      handleBackendErrors(error, el.registerForm, el.registerAlert);
    } finally {
      setLoading('register', false);
    }
  }

  function showRegisterSuccess(alertEl, email, verificationSent, verificationError) {
    alertEl.className = 'alert alert-success py-3 mb-3 text-start small';
    alertEl.innerHTML = '';
    alertEl.classList.remove('d-none');

    const msg = document.createElement('p');
    msg.className = 'mb-2 fw-bold';
    msg.textContent = 'Cuenta creada exitosamente.';
    alertEl.appendChild(msg);

    const detail = document.createElement('p');
    detail.className = 'mb-2';
    detail.textContent = 'Te enviamos un correo de verificación. Revisa tu bandeja de entrada y verifica tu cuenta antes de iniciar sesión.';
    alertEl.appendChild(detail);

    if (!verificationSent && verificationError) {
      const err = document.createElement('p');
      err.className = 'mb-2 text-warning';
      err.textContent = verificationError;
      alertEl.appendChild(err);
    }

    const resendBtn = document.createElement('button');
    resendBtn.type = 'button';
    resendBtn.className = 'btn btn-sm btn-outline-primary mr-2 mb-1';
    resendBtn.innerHTML = '<i class="fas fa-redo-alt mr-1"></i> Reenviar correo';
    resendBtn.addEventListener('click', async () => {
      resendBtn.disabled = true;
      resendBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Enviando...';
      try {
        await resendVerificationEmail(email);
        showAlert(alertEl, 'Correo de verificación reenviado.', 'success');
      } catch (e) {
        showAlert(alertEl, e.message || 'No se pudo reenviar el correo.', 'danger');
      } finally {
        resendBtn.disabled = false;
        resendBtn.innerHTML = '<i class="fas fa-redo-alt mr-1"></i> Reenviar correo';
      }
    });
    alertEl.appendChild(resendBtn);

    const loginLink = document.createElement('a');
    loginLink.href = '/index.html';
    loginLink.className = 'btn btn-sm btn-primary-gradient ml-1 mb-1';
    loginLink.innerHTML = '<i class="fas fa-sign-in-alt mr-1"></i> Ir a iniciar sesión';
    alertEl.appendChild(loginLink);
  }

  async function handleGoogleAuth(event, intent) {
    event.preventDefault();
    const scope = intent === 'login' ? 'login' : 'register';
    const alertEl = intent === 'login' ? el.loginAlert : el.registerAlert;
    
    setLoading(scope, true);
    hideAlert(alertEl);

    try {
      const data = await registerWithGoogle({
        intent,
        onStatus: (eventData) => {
          if (eventData.status === 'queued' || eventData.status === 'processing') {
            showAlert(alertEl, eventData.message || 'Estamos preparando tu acceso con Google.', 'info');
          }
        },
      });

      if (data.requires_2fa) {
        tempTwoFactorToken = data.two_factor_token;
        switchView('two-factor');
        if (el.twoFactorCodeInput) {
          el.twoFactorCodeInput.value = '';
          el.twoFactorCodeInput.focus();
        }
        showAlert(el.twoFactorAlert, 'Verifica el código de tu aplicación autenticadora para continuar.', 'info');
        return;
      }

      routeAfterAuth(data.user || data);
    } catch (error) {
      showAlert(alertEl, error.message || 'No se pudo completar la operación con Google.', 'danger');
    } finally {
      setLoading(scope, false);
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (!el.profileForm.checkValidity()) {
      el.profileForm.classList.add('was-validated');
      return;
    }
    setLoading('profile', true);
    hideAlert(el.profileAlert);

    try {
      const data = await completeProfile(el.usernameInput.value.trim());
      updateUser(data.user);
      window.location.href = getPostAuthPath(data.user);
    } catch (error) {
      showAlert(el.profileAlert, error.message || 'No se pudo guardar el nombre de usuario.', 'danger');
    } finally {
      setLoading('profile', false);
    }
  }

  async function handleSetupTwoFactorSubmit(event) {
    event.preventDefault();
    if (!el.setupTwoFactorForm.checkValidity()) {
      el.setupTwoFactorForm.classList.add('was-validated');
      return;
    }
    setLoading('setupTwoFactor', true);
    hideAlert(el.setupTwoFactorAlert);

    try {
      await window.SGIGAuthService.confirmTwoFactor(el.setupTwoFactorCodeInput.value.trim());
      const user = await window.SGIGAuthService.restoreSession();
      routeAfterAuth(user);
    } catch (error) {
      showAlert(el.setupTwoFactorAlert, error.message || 'Código incorrecto.', 'danger');
      el.setupTwoFactorCodeInput.value = '';
      el.setupTwoFactorCodeInput.focus();
    } finally {
      setLoading('setupTwoFactor', false);
    }
  }

  function getAppPath(page) {
    return window.location.pathname.includes('/html/') ? page : `html/${page}`;
  }

  function getPostAuthPath(user) {
    const roles = Array.isArray(user?.roles) ? user.roles.map(normalizeCode) : [];
    if (roles.includes('CIUDADANO')) {
      return getAppPath('incident-create.html');
    }

    return getAppPath('dashboard.html');
  }

  function normalizeCode(value) {
    if (typeof value === 'string') return value;
    return value?.code || value?.codigo || '';
  }

  function hasRoleAdmin(user) {
    if (!user || !user.roles) return false;
    return user.roles.some(r => {
      const code = typeof r === 'string' ? r : (r.code || r.codigo);
      return code === 'ADMIN';
    });
  }

  function routeAfterAuth(user, notice = {}) {
    if (!user) return;

    if (!user.username) {
      el.usernameInput.value = suggestUsername(user);
      switchView('profile');
      if (notice.verificationMessage) {
        showAlert(el.profileAlert, notice.verificationMessage, 'success');
      }
      return;
    }

    if (hasRoleAdmin(user) && !user.two_factor_enabled) {
      switchView('setup-2fa');
      initMandatorySetup2FA();
      return;
    }

    if (!isEmailVerified(user) && notice.verificationMessage) {
      localStorage.setItem('sgig_flash_message', notice.verificationMessage);
    }

    window.location.href = getPostAuthPath(user);
  }

  function showRecoveryStep(step) {
    el.forgotPasswordForm?.classList.toggle('d-none', step !== 'request');
    el.resetCodeForm?.classList.toggle('d-none', step !== 'code');
    el.resetPasswordForm?.classList.toggle('d-none', step !== 'password');
  }

  function switchView(viewName) {
    const isAuthMode = viewName === 'login' || viewName === 'register';
    if (isAuthMode) {
      document.body.classList.remove('auth-login-mode', 'auth-register-mode');
      document.body.classList.add(`auth-${viewName}-mode`);
    }

    if (el.loginView) el.loginView.classList.toggle('d-none', viewName !== 'login');
    if (el.registerView) el.registerView.classList.toggle('d-none', viewName !== 'register');
    if (el.profileView) el.profileView.classList.toggle('d-none', viewName !== 'profile');
    if (el.twoFactorView) el.twoFactorView.classList.toggle('d-none', viewName !== 'two-factor');
    if (el.setupTwoFactorView) el.setupTwoFactorView.classList.toggle('d-none', viewName !== 'setup-2fa');
    if (el.forgotPasswordView) el.forgotPasswordView.classList.toggle('d-none', viewName !== 'forgot-password');

    if (viewName !== 'login' && el.loginAlert) hideAlert(el.loginAlert);
    if (viewName !== 'register' && el.registerAlert) hideAlert(el.registerAlert);
    if (viewName !== 'profile' && el.profileAlert) hideAlert(el.profileAlert);
    if (viewName !== 'two-factor' && el.twoFactorAlert) hideAlert(el.twoFactorAlert);
    if (viewName !== 'setup-2fa' && el.setupTwoFactorAlert) hideAlert(el.setupTwoFactorAlert);
    if (viewName !== 'forgot-password' && el.forgotPasswordAlert) hideAlert(el.forgotPasswordAlert);
  }

  function setLoading(scope, isLoading) {
    busy = isLoading;

    const map = {
      login: {
        button: el.loginSubmitBtn,
        spinner: el.loginSpinner,
        text: el.loginBtnText,
        label: 'Iniciar sesión',
      },
      register: {
        button: el.registerSubmitBtn,
        spinner: el.registerSpinner,
        text: el.registerBtnText,
        label: 'Crear cuenta',
      },
      profile: {
        button: el.profileSubmitBtn,
        spinner: el.profileSpinner,
        text: el.profileBtnText,
        label: 'Guardar nombre de usuario',
      },
      twoFactor: {
        button: el.twoFactorSubmitBtn,
        spinner: el.twoFactorSpinner,
        text: el.twoFactorBtnText,
        label: 'Verificar y Entrar',
      },
      setupTwoFactor: {
        button: el.setupTwoFactorSubmitBtn,
        spinner: el.setupTwoFactorSpinner,
        text: el.setupTwoFactorBtnText,
        label: 'Verificar y Continuar',
      },
      forgotPassword: {
        button: el.forgotPasswordSubmitBtn,
        spinner: el.forgotPasswordSpinner,
        text: el.forgotPasswordBtnText,
        label: 'Enviar código',
      },
      resetCode: {
        button: el.resetCodeSubmitBtn,
        spinner: el.resetCodeSpinner,
        text: el.resetCodeBtnText,
        label: 'Verificar código',
      },
      resetPassword: {
        button: el.resetPasswordSubmitBtn,
        spinner: el.resetPasswordSpinner,
        text: el.resetPasswordBtnText,
        label: 'Cambiar contraseña',
      },
    }[scope];

    if (!map || !map.button) return;

    map.button.disabled = isLoading;
    if (map.spinner) map.spinner.classList.toggle('d-none', !isLoading);
    if (map.text) map.text.textContent = isLoading ? 'Procesando...' : map.label;
  }

  function togglePasswordVisibility(input, button) {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';

    const icon = button.querySelector('i');
    icon.classList.toggle('fa-eye', !isHidden);
    icon.classList.toggle('fa-eye-slash', isHidden);
  }

  async function initMandatorySetup2FA() {
    try {
      if (!el.setupTwoFactorQrContainer || !el.setupTwoFactorForm) return;

      el.setupTwoFactorQrContainer.textContent = '';
      const spinner = document.createElement('div');
      spinner.className = 'spinner-border text-primary';
      spinner.setAttribute('role', 'status');
      spinner.appendChild(document.createElement('span')).className = 'sr-only';
      el.setupTwoFactorQrContainer.appendChild(spinner);
      el.setupTwoFactorForm.classList.add('d-none');

      const data = await window.SGIGAuthService.enableTwoFactor();
      let qrLibraryReady = false;

      try {
        await ensureQrCodeLibrary();
        qrLibraryReady = Boolean(window.QRCode);
      } catch {
        qrLibraryReady = false;
      }

      renderMandatoryTwoFactorSetup(data.qr_url, data.secret, qrLibraryReady);

      if (!qrLibraryReady) {
        showAlert(
          el.setupTwoFactorAlert,
          'No se pudo generar el código QR. Ingresa la clave manual en tu aplicación autenticadora.',
          'warning'
        );
      }

      el.setupTwoFactorForm.classList.remove('d-none');
    } catch (e) {
      showAlert(el.setupTwoFactorAlert, e.message || 'No se pudo inicializar la autenticación en dos pasos.', 'danger');
    }
  }

  function ensureQrCodeLibrary() {
    if (window.QRCode) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-sgi-qrcode]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.async = true;
      script.dataset.sgiQrcode = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo cargar el generador de código QR.'));
      document.head.appendChild(script);
    });
  }

  function renderMandatoryTwoFactorSetup(qrUrl, secret, qrLibraryReady) {
    el.setupTwoFactorQrContainer.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'text-center';

    if (qrLibraryReady && qrUrl) {
      const qrBox = document.createElement('div');
      qrBox.className = 'd-inline-block';
      wrapper.appendChild(qrBox);

      new window.QRCode(qrBox, {
        text: qrUrl,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H,
      });
    }

    if (secret) {
      const help = document.createElement('p');
      help.className = 'small text-muted mb-1 mt-3';
      help.textContent = 'Clave manual';
      wrapper.appendChild(help);

      const code = document.createElement('code');
      code.className = 'd-inline-block bg-light border rounded px-3 py-2 text-break';
      code.textContent = secret;
      wrapper.appendChild(code);
    }

    el.setupTwoFactorQrContainer.appendChild(wrapper);
  }

  function showAlert(target, message, type = 'danger') {
    if (!target) return;
    target.className = `alert alert-${type} py-2 mb-3 text-start small`;
    target.textContent = message;
    target.classList.remove('d-none');
  }

  function hideAlert(target) {
    if (!target) return;
    target.classList.add('d-none');
    target.textContent = '';
  }
}
