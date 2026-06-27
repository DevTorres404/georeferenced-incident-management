import { completeProfile, loginWithEmail, registerLocal, registerWithGoogle, restoreSession, verifyTwoFactorLogin } from '../application/auth-service.js?v=14';
import { isEmailVerified, suggestUsername, updateUser } from '../infrastructure/session-store.js?v=14';
import { handleBackendErrors, setupValidationListeners, validateFormFrontend, setFieldError } from './validation-utils.js?v=1';

document.addEventListener('DOMContentLoaded', initAuthPage);

function initAuthPage() {
    const el = {
      loginView: document.getElementById('login-view'),
      registerView: document.getElementById('register-view'),
      profileView: document.getElementById('profile-view'),
      twoFactorView: document.getElementById('two-factor-view'),
      setupTwoFactorView: document.getElementById('setup-2fa-view'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    profileForm: document.getElementById('profile-form'),
    twoFactorForm: document.getElementById('two-factor-form'),
    setupTwoFactorForm: document.getElementById('setup-2fa-form'),
    loginAlert: document.getElementById('login-alert'),
    registerAlert: document.getElementById('register-alert'),
    profileAlert: document.getElementById('profile-alert'),
    twoFactorAlert: document.getElementById('two-factor-alert'),
    setupTwoFactorAlert: document.getElementById('setup-2fa-alert'),
    loginSpinner: document.getElementById('login-spinner'),
    registerSpinner: document.getElementById('register-spinner'),
    profileSpinner: document.getElementById('profile-spinner'),
    twoFactorSpinner: document.getElementById('two-factor-spinner'),
    setupTwoFactorSpinner: document.getElementById('setup-2fa-spinner'),
    loginBtnText: document.getElementById('login-btn-text'),
    registerBtnText: document.getElementById('register-btn-text'),
    profileBtnText: document.getElementById('profile-btn-text'),
    twoFactorBtnText: document.getElementById('two-factor-btn-text'),
    setupTwoFactorBtnText: document.getElementById('setup-2fa-btn-text'),
    loginSubmitBtn: document.getElementById('login-submit-btn'),
    registerSubmitBtn: document.getElementById('register-submit-btn'),
    profileSubmitBtn: document.getElementById('profile-submit-btn'),
    twoFactorSubmitBtn: document.getElementById('two-factor-submit-btn'),
    setupTwoFactorSubmitBtn: document.getElementById('setup-2fa-submit-btn'),
      openRegisterBtn: document.getElementById('open-register-btn'),
      openLoginBtn: document.getElementById('open-login-btn'),
      backToLoginBtn: document.getElementById('back-to-login-btn'),
    googleRegisterBtn: document.getElementById('google-register-btn'),
    googleLoginBtn: document.getElementById('google-login-btn'),
    togglePasswordBtn: document.getElementById('toggle-password-btn'),
    toggleRegisterPasswordBtn: document.getElementById('toggle-register-password-btn'),
    passwordInput: document.getElementById('password'),
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

  bindEvents();
  setupValidationListeners(el.loginForm);
  setupValidationListeners(el.registerForm);
  setupValidationListeners(el.profileForm);
  setupValidationListeners(el.twoFactorForm);
  setupValidationListeners(el.setupTwoFactorForm);
  
  bootstrap();

  async function bootstrap() {
    if (window.location.protocol === 'file:') {
      showAlert(el.loginAlert, 'Abre esta página desde http://localhost:5500 para que Firebase y el WebSocket funcionen.', 'danger');
      return;
    }

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
    
    if (el.openLoginBtn) el.openLoginBtn.addEventListener('click', () => switchView('login'));
    if (el.openRegisterBtn) el.openRegisterBtn.addEventListener('click', () => switchView('register'));
    if (el.backToLoginBtn) el.backToLoginBtn.addEventListener('click', () => switchView('login'));
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
    
    if (el.dashboardLink) {
      el.dashboardLink.addEventListener('click', () => {
        if (!busy) {
          window.location.href = getAppPath('dashboard.html');
        }
      });
    }
  }

  function showVerificationNotice() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') !== '1') return;

    showAlert(el.loginAlert, 'Correo verificado. Ya puedes ingresar al sistema.', 'success');
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

      routeAfterAuth(data.user, {
        verificationMessage: data.verification_sent
          ? 'Te enviamos un correo para verificar tu cuenta.'
          : data.verification_error,
      });
    } catch (error) {
      handleBackendErrors(error, el.registerForm, el.registerAlert);
    } finally {
      setLoading('register', false);
    }
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
        showAlert(el.twoFactorAlert, 'Verifica el codigo de tu aplicacion autenticadora para continuar.', 'info');
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

  function switchView(viewName) {
    if (el.loginView) el.loginView.classList.toggle('d-none', viewName !== 'login');
    if (el.registerView) el.registerView.classList.toggle('d-none', viewName !== 'register');
    if (el.profileView) el.profileView.classList.toggle('d-none', viewName !== 'profile');
    if (el.twoFactorView) el.twoFactorView.classList.toggle('d-none', viewName !== 'two-factor');
    if (el.setupTwoFactorView) el.setupTwoFactorView.classList.toggle('d-none', viewName !== 'setup-2fa');

    if (viewName !== 'login' && el.loginAlert) hideAlert(el.loginAlert);
    if (viewName !== 'register' && el.registerAlert) hideAlert(el.registerAlert);
    if (viewName !== 'profile' && el.profileAlert) hideAlert(el.profileAlert);
    if (viewName !== 'two-factor' && el.twoFactorAlert) hideAlert(el.twoFactorAlert);
    if (viewName !== 'setup-2fa' && el.setupTwoFactorAlert) hideAlert(el.setupTwoFactorAlert);
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
      const { qr_url } = await window.SGIGAuthService.enableTwoFactor();
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = () => {
        el.setupTwoFactorQrContainer.innerHTML = '';
        new window.QRCode(el.setupTwoFactorQrContainer, {
          text: qr_url,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel.H
        });
        el.setupTwoFactorForm.classList.remove('d-none');
      };
      document.body.appendChild(script);
    } catch (e) {
      showAlert(el.setupTwoFactorAlert, 'Error inicializando 2FA: ' + e.message, 'danger');
    }
  }

  function showAlert(target, message, type = 'danger') {
    target.className = `alert alert-${type} py-2 mb-3 text-start small`;
    target.textContent = message;
    target.classList.remove('d-none');
  }

  function hideAlert(target) {
    target.classList.add('d-none');
    target.textContent = '';
  }
}
