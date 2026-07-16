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

const GOOGLE_POPUP_CLOSED_BY_USER = 'auth/popup-closed-by-user';
const GOOGLE_POPUP_CANCELLED = 'auth/cancelled-popup-request';

export function togglePasswordVisibility(input, button) {
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const icon = button.querySelector('i');
  icon.classList.toggle('fa-eye', !isHidden);
  icon.classList.toggle('fa-eye-slash', isHidden);
}

export function showAlert(target, message, type = 'danger') {
  if (!target) return;
  target.className = `alert alert-${type} py-2 mb-3 text-start small`;
  target.textContent = message;
  target.classList.remove('d-none');
}

export function hideAlert(target) {
  if (!target) return;
  target.classList.add('d-none');
  target.textContent = '';
}

export function normalizeCode(value) {
  if (typeof value === 'string') return value;
  return value?.code || value?.codigo || '';
}

export function hasRoleAdmin(user) {
  if (!user || !user.roles) return false;
  return user.roles.some(r => {
    const code = typeof r === 'string' ? r : (r.code || r.codigo);
    return code === 'ADMIN';
  });
}

export function toggleSubmitState(submitBtn, spinner, btnText, state) {
  if (!submitBtn) return;
  submitBtn.disabled = state;
  if (spinner) spinner.classList.toggle('d-none', !state);
  if (btnText) {
    if (state) {
      btnText.textContent = 'Procesando...';
    } else {
      btnText.textContent = btnText.dataset.originalLabel || btnText.textContent;
    }
  }
}

export function switchView(viewName) {
  const isAuthMode = viewName === 'login' || viewName === 'register' || viewName === 'email-verification';
  if (isAuthMode) {
    document.body.classList.remove('auth-login-mode', 'auth-register-mode', 'auth-email-verification-mode');
    document.body.classList.add(`auth-${viewName}-mode`);
  }

  const viewMap = {
    'login-view': 'login',
    'register-view': 'register',
    'email-verification-view': 'email-verification',
    'profile-view': 'profile',
    'two-factor-view': 'two-factor',
    'setup-2fa-view': 'setup-2fa',
    'forgot-password-view': 'forgot-password',
  };

  Object.entries(viewMap).forEach(([id, name]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('d-none', viewName !== name);
  });

  if (viewName !== 'login') hideAlert(document.getElementById('login-alert'));
  if (viewName !== 'register') hideAlert(document.getElementById('register-alert'));
  if (viewName !== 'profile') hideAlert(document.getElementById('profile-alert'));
  if (viewName !== 'two-factor') hideAlert(document.getElementById('two-factor-alert'));
  if (viewName !== 'setup-2fa') hideAlert(document.getElementById('setup-2fa-alert'));
  if (viewName !== 'forgot-password') hideAlert(document.getElementById('forgot-password-alert'));
}

export function validateFormGroup(formGroup) {
  if (!formGroup) return false;
  const inputs = formGroup.querySelectorAll('input, select, textarea');
  let valid = true;
  inputs.forEach((input) => {
    if (input.hasAttribute('required') && !input.value.trim()) {
      input.classList.add('is-invalid');
      valid = false;
    }
  });
  return valid;
}


document.addEventListener('DOMContentLoaded', initAuthPage);

export function initAuthPage() { // NOSONAR - Inherently complex multi-view auth page with form handling, Google OAuth, 2FA setup, and password recovery flows
    const el = {
      loginView: document.getElementById('login-view'),
      registerView: document.getElementById('register-view'),
      emailVerificationView: document.getElementById('email-verification-view'),
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
    emailVerificationEyebrow: document.getElementById('email-verification-eyebrow'),
    emailVerificationTitle: document.getElementById('email-verification-title'),
    emailVerificationCopy: document.getElementById('email-verification-copy'),
    emailVerificationEmail: document.getElementById('email-verification-email'),
    emailVerificationHelp: document.getElementById('email-verification-help'),
    emailVerificationStatus: document.getElementById('email-verification-status'),
    emailVerificationLoginBtn: document.getElementById('email-verification-login-btn'),
    emailVerificationResendBtn: document.getElementById('email-verification-resend-btn'),
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
  let pendingVerificationEmail = '';
  let setupTwoFactorQr = null;

  globalThis.addEventListener('pagehide', (event) => {
    if (event.persisted) return;

    setupTwoFactorQr?.clear?.();
    setupTwoFactorQr = null;
  });

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
    if (globalThis.location.protocol === 'file:') {
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
    if (el.emailVerificationLoginBtn) el.emailVerificationLoginBtn.addEventListener('click', returnToLogin);
    if (el.emailVerificationResendBtn) el.emailVerificationResendBtn.addEventListener('click', resendPendingVerification);
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
          globalThis.location.href = getAppPath('dashboard.html');
        }
      });
    }

    bindUsernameValidation(el.registerUsernameInput);
    bindUsernameValidation(el.usernameInput);
  }

  function bindUsernameValidation(input) {
    if (!input) return;

    const showError = (message) => {
      input.classList.add('is-invalid');
      let container = input.parentElement;
      if (container?.classList.contains('input-group')) container = container.parentElement;
      let feedback = container?.querySelector('.invalid-feedback.username-feedback');
      if (!feedback && container) {
        feedback = document.createElement('div');
        feedback.className = 'invalid-feedback username-feedback';
        container.appendChild(feedback);
      }
      if (feedback) { feedback.textContent = message; feedback.style.display = 'block'; }
    };

    const clearError = () => {
      input.classList.remove('is-invalid');
      const container = input.parentElement;
      const feedback = (container?.classList.contains('input-group') ? container.parentElement : container)
        ?.querySelector('.invalid-feedback.username-feedback');
      if (feedback) feedback.style.display = 'none';
    };

    input.addEventListener('input', () => {
      const value = input.value;

      if (/\s/.test(value)) {
        showError('El nombre de usuario no puede contener espacios.');
        return;
      }

      if (/[A-Z]/.test(value)) {
        showError('Solo se permiten minúsculas. Se convertirá automáticamente.');
        return;
      }

      clearError();
    });
  }

  function showFlashMessage() {
    const message = localStorage.getItem('sgig_flash_message');
    if (!message) return;

    showAlert(el.loginAlert, message, 'success');
    localStorage.removeItem('sgig_flash_message');
  }

  function showLoginEmailNotVerified(email) {
    if (el.passwordInput) el.passwordInput.value = '';

    showEmailVerificationScreen({
      email,
      eyebrow: 'Cuenta pendiente de activación',
      title: 'Verifica tu correo para continuar',
      copy: 'Tu cuenta existe, pero todavía no está activa. Para iniciar sesión en SGI, verifica el correo enviado a:',
      help: 'Abre el enlace de verificación y luego vuelve al inicio de sesión.',
    });
  }

  function showVerificationNotice() {
    const params = new URLSearchParams(globalThis.location.search);
    if (params.get('verified') === '1') {
      showAlert(el.loginAlert, 'Correo verificado correctamente. Ya puedes iniciar sesion.', 'success');
      globalThis.history.replaceState({}, document.title, globalThis.location.pathname);
      return;
    }
    if (params.get('error') === 'invalid_link') {
      showAlert(el.loginAlert, 'El enlace de verificación ha expirado o no es válido. Solicita un nuevo enlace en la pantalla de inicio de sesión.', 'danger');
      globalThis.history.replaceState({}, document.title, globalThis.location.pathname);
    }
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
        showLoginEmailNotVerified(el.loginEmailInput?.value?.trim() || '');
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
      showRegisterSuccess(registeredEmail, data.verification_sent, data.verification_error);
    } catch (error) {
      handleBackendErrors(error, el.registerForm, el.registerAlert);
    } finally {
      setLoading('register', false);
    }
  }

  function showRegisterSuccess(email, verificationSent, verificationError) {
    showEmailVerificationScreen({
      email,
      eyebrow: 'Registro completado',
      title: 'Revisa tu correo',
      copy: 'Tu cuenta fue creada correctamente. Enviamos un enlace de verificación a:',
      help: 'Abre el enlace del correo para activar tu cuenta. Después podrás iniciar sesión en SGI.',
      warning: verificationSent ? '' : verificationError,
    });
  }

  function showEmailVerificationScreen({ email, eyebrow, title, copy, help, warning = '' }) {
    pendingVerificationEmail = email;
    if (el.emailVerificationEyebrow) el.emailVerificationEyebrow.textContent = eyebrow;
    if (el.emailVerificationTitle) el.emailVerificationTitle.textContent = title;
    if (el.emailVerificationCopy) el.emailVerificationCopy.textContent = copy;
    if (el.emailVerificationEmail) el.emailVerificationEmail.textContent = email;
    if (el.emailVerificationHelp) el.emailVerificationHelp.textContent = help;

    if (warning) {
      showEmailVerificationStatus(warning, 'warning');
    } else {
      hideAlert(el.emailVerificationStatus);
    }

    switchView('email-verification');
  }

  async function resendPendingVerification() {
    if (!pendingVerificationEmail || !el.emailVerificationResendBtn) return;

    const button = el.emailVerificationResendBtn;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Enviando correo...';

    try {
      await resendVerificationEmail(pendingVerificationEmail);
      showEmailVerificationStatus('Correo de verificación reenviado. Revisa tu bandeja de entrada.', 'success');
    } catch (error) {
      showEmailVerificationStatus(error.message || 'No se pudo reenviar el correo de verificación.', 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-redo-alt mr-1"></i>Reenviar correo de verificación';
    }
  }

  function showEmailVerificationStatus(message, type) {
    if (!el.emailVerificationStatus) return;
    showAlert(el.emailVerificationStatus, message, type);
  }

  function returnToLogin() {
    const email = pendingVerificationEmail;
    pendingVerificationEmail = '';

    if (globalThis.location.pathname.includes('register.html')) {
      globalThis.location.href = '/index.html#login';
      return;
    }

    switchView('login');
    if (el.loginEmailInput && email) el.loginEmailInput.value = email;
    if (el.passwordInput) {
      el.passwordInput.value = '';
      el.passwordInput.focus();
    }
  }

  async function handleGoogleAuth(event, intent) {
    event.preventDefault();
    const scope = intent === 'login' ? 'login' : 'register';
    const alertEl = intent === 'login' ? el.loginAlert : el.registerAlert;
    
    setLoading(scope, true);
    hideAlert(alertEl);

    let focusTimer;
    const onWindowFocus = () => {
      focusTimer = globalThis.setTimeout(() => {
        if (busy) setLoading(scope, false);
      }, 800);
    };
    globalThis.addEventListener('focus', onWindowFocus);

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
      if (error?.code === GOOGLE_POPUP_CLOSED_BY_USER || error?.code === GOOGLE_POPUP_CANCELLED) {
        return;
      }

      showAlert(alertEl, error.message || 'No se pudo completar la operación con Google.', 'danger');
    } finally {
      globalThis.removeEventListener('focus', onWindowFocus);
      globalThis.clearTimeout(focusTimer);
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
      globalThis.location.href = getPostAuthPath(data.user);
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
      await globalThis.SGIGAuthService.confirmTwoFactor(el.setupTwoFactorCodeInput.value.trim());
      const user = await globalThis.SGIGAuthService.restoreSession();
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
    return globalThis.location.pathname.includes('/html/') ? page : `html/${page}`;
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

    globalThis.location.href = getPostAuthPath(user);
  }

  function showRecoveryStep(step) {
    el.forgotPasswordForm?.classList.toggle('d-none', step !== 'request');
    el.resetCodeForm?.classList.toggle('d-none', step !== 'code');
    el.resetPasswordForm?.classList.toggle('d-none', step !== 'password');
  }

  function switchView(viewName) {
    const isAuthMode = viewName === 'login' || viewName === 'register' || viewName === 'email-verification';
    if (isAuthMode) {
      document.body.classList.remove('auth-login-mode', 'auth-register-mode', 'auth-email-verification-mode');
      document.body.classList.add(`auth-${viewName}-mode`);
    }

    if (el.loginView) el.loginView.classList.toggle('d-none', viewName !== 'login');
    if (el.registerView) el.registerView.classList.toggle('d-none', viewName !== 'register');
    if (el.emailVerificationView) el.emailVerificationView.classList.toggle('d-none', viewName !== 'email-verification');
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

      const data = await globalThis.SGIGAuthService.enableTwoFactor();
      let qrLibraryReady = false;

      try {
        await ensureQrCodeLibrary();
        qrLibraryReady = Boolean(globalThis.QRCode);
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
    if (globalThis.QRCode) return Promise.resolve();

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
    setupTwoFactorQr?.clear?.();
    setupTwoFactorQr = null;
    el.setupTwoFactorQrContainer.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'text-center';

    if (qrLibraryReady && qrUrl) {
      const qrBox = document.createElement('div');
      qrBox.className = 'd-inline-block';
      wrapper.appendChild(qrBox);

      setupTwoFactorQr = new globalThis.QRCode(qrBox, {
        text: qrUrl,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: globalThis.QRCode.CorrectLevel.H,
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
