import { requestBackend } from '../../../infrastructure/backend-client.js?v=21';
import { handleBackendErrors, clearValidationErrors } from '../../../shared/validators/validation-utils.js?v=1';
import { hydrateOwnProfilePhoto, invalidateOwnProfilePhoto } from '../../../shared/profile-photo.js?v=1';

document.addEventListener('DOMContentLoaded', initProfilePage);

const AUTH_KEYS = { user: 'user_data' };
const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let twoFactorQr = null;

globalThis.addEventListener('pagehide', (event) => {
  if (event.persisted) return;

  twoFactorQr?.clear?.();
  twoFactorQr = null;
});

function readSessionUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

export function normalizeCode(value) {
  if (typeof value === 'string') return value;
  return value?.codigo || value?.code || '';
}

export function hasRole(roleCode, user) {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((role) => normalizeCode(role) === roleCode);
}

export function hasGoogleIdentity(user) {
  if (!user || !Array.isArray(user.identities)) return false;
  return user.identities.some((id) => id?.provider === 'google');
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return '-'; }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '-';
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) {
      return 'Hoy ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '-'; }
}

export function initProfilePage() {
  if (typeof globalThis.renderLayout === 'function') {
    globalThis.renderLayout('profile');
  }

  const user = readSessionUser();
  if (!user) {
    globalThis.location.href = '../index.html';
    return;
  }

  renderUserData(user);
  void hydrateOwnProfilePhoto(user);
  renderSecurityData(user);
  initEditProfile(user);
  initProfilePhotoUpload(user);
  initChangePassword();

  const modal2fa = document.getElementById('modalSetup2fa');
  if (modal2fa) {
    $(modal2fa).on('hidden.bs.modal', function () {
      twoFactorQr?.clear?.();
      twoFactorQr = null;
      const qrContainer = document.getElementById('qrcode-container');
      if (qrContainer) qrContainer.innerHTML = '';
      const input = document.getElementById('tfaCodeInput');
      if (input) input.value = '';
      clearTwoFactorAlert();
    });
  }

  const loader = document.getElementById('pageLoader');
  if (loader) {
    loader.setAttribute('hidden', '');
    loader.classList.add('d-none');
    loader.style.display = 'none';
  }
}

export function renderUserData(user) {
  const firstName = user.nombre || user.first_name || user.name || '';
  const lastName = user.apellido || user.last_name || '';
  const username = user.username || '';
  const email = user.email || '';
  const isActive = user.is_active !== false;

  const displayFirst = firstName || username;
  const initial = displayFirst ? displayFirst.charAt(0).toUpperCase() : 'U';

  const avatarEl = document.getElementById('profileAvatar');
  const avatarFallback = avatarEl?.querySelector('[data-profile-avatar-fallback]') || avatarEl;
  if (avatarFallback) avatarFallback.textContent = initial;

  const fullNameEl = document.getElementById('profileFullName');
  if (fullNameEl) fullNameEl.textContent = `${firstName} ${lastName}`.trim() || username || 'Usuario SGI';

  const emailEl = document.getElementById('profileEmail');
  if (emailEl) emailEl.textContent = email;

  const usernameEl = document.getElementById('profileUsername');
  if (usernameEl) usernameEl.textContent = username || '-';

  const statusEl = document.getElementById('profileStatus');
  if (statusEl) {
    statusEl.textContent = isActive ? 'Activo' : 'Inactivo';
    statusEl.className = `profile-status-badge ${isActive ? 'active' : 'inactive'}`;
  }

  const memberSinceEl = document.getElementById('profileMemberSince');
  if (memberSinceEl) memberSinceEl.textContent = formatDate(user.created_at || user.createdAt);

  const lastLoginEl = document.getElementById('profileLastLogin');
  if (lastLoginEl) lastLoginEl.textContent = formatDateTime(user.last_login || user.lastLogin);
}

export function validateProfilePhoto(file) {
  if (!file || !PROFILE_PHOTO_MIME_TYPES.has(file.type)) {
    return 'Selecciona una imagen JPG, PNG o WebP.';
  }
  if (file.size <= 0 || file.size > PROFILE_PHOTO_MAX_BYTES) {
    return 'La foto debe pesar como máximo 5 MB.';
  }

  return null;
}

export function initProfilePhotoUpload(user) {
  const button = document.getElementById('btnChangeProfilePhoto');
  const input = document.getElementById('profilePhotoInput');
  if (!button || !input) return;

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    const validationMessage = validateProfilePhoto(file);
    if (validationMessage) {
      input.value = '';
      globalThis.showGlobalAlert?.(validationMessage, 'warning');
      return;
    }

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Subiendo...';

    try {
      const formData = new FormData();
      formData.append('photo', file);
      const response = await requestBackend('/auth/profile/photo', {
        method: 'POST',
        body: formData,
      });
      const updatedUser = response?.user || user;
      localStorage.setItem(AUTH_KEYS.user, JSON.stringify(updatedUser));

      invalidateOwnProfilePhoto();
      renderUserData(updatedUser);
      await hydrateOwnProfilePhoto(updatedUser);
      if (typeof globalThis.renderLayout === 'function') {
        await globalThis.renderLayout();
      }
      globalThis.showGlobalAlert?.('Foto de perfil actualizada correctamente.', 'success');
    } catch (error) {
      globalThis.showGlobalAlert?.(error?.message || 'No se pudo actualizar la foto de perfil.', 'danger');
    } finally {
      input.value = '';
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  });
}

export function initEditProfile(user) {
  const btnEdit = document.getElementById('btnEditProfile');
  const modalEdit = document.getElementById('modalEditProfile');
  const formEdit = document.getElementById('formEditProfile');

  if (!btnEdit || !modalEdit || !formEdit) return;

  btnEdit.addEventListener('click', () => {
    const editUsername = document.getElementById('editUsername');
    // Read the latest user data from localStorage to ensure we have the most up-to-date username
    const currentUserData = localStorage.getItem(globalThis.AUTH_KEYS?.user || 'user_data');
    const currentUser = currentUserData ? JSON.parse(currentUserData) : user;
    editUsername.value = currentUser.username || '';

    editUsername.addEventListener('input', function () {
      this.value = this.value.toLowerCase();
      if (/\s/.test(this.value)) {
        this.classList.add('is-invalid');
        let feedback = this.parentElement.querySelector('.invalid-feedback');
        if (!feedback) {
          feedback = document.createElement('div');
          feedback.className = 'invalid-feedback';
          this.parentElement.appendChild(feedback);
        }
        feedback.textContent = 'El nombre de usuario no puede contener espacios.';
        feedback.style.display = 'block';
      } else {
        this.classList.remove('is-invalid');
        const feedback = this.parentElement.querySelector('.invalid-feedback');
        if (feedback) feedback.style.display = 'none';
      }
    });

    document.getElementById('editProfileAlert').classList.add('d-none');

    $(modalEdit).modal('show');
  });

  formEdit.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnSave = document.getElementById('btnSaveProfile');
    const alertBox = document.getElementById('editProfileAlert');
    const username = document.getElementById('editUsername').value.trim();

    btnSave.disabled = true;
    btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Guardando...';
    alertBox.classList.add('d-none');

    try {
      const response = await requestBackend('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username })
      });

      const updatedUser = response?.user || { ...user, username };
      localStorage.setItem(AUTH_KEYS.user, JSON.stringify(updatedUser));

      $(modalEdit).modal('hide');

      if (globalThis.showGlobalAlert) {
        globalThis.showGlobalAlert('Perfil actualizado exitosamente', 'success');
      }

      renderUserData(updatedUser);
      if (typeof globalThis.renderLayout === 'function') {
        globalThis.renderLayout();
      }
    } catch (error) {
      handleBackendErrors(error, formEdit, alertBox);
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = '<i class="fas fa-save mr-1"></i> Guardar Cambios';
    }
  });
}

document.addEventListener('click', function (e) {
  const btn = e.target.closest('.sgi-pw-toggle');
  if (!btn) return;
  const input = btn.closest('.input-group')?.querySelector('input');
  if (!input) return;
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
});

export function initChangePassword() {
  const btnOpen = document.getElementById('btnOpenChangePassword');
  const modal = document.getElementById('modalChangePassword');
  const form = document.getElementById('formChangePassword');

  if (!btnOpen || !modal || !form) return;

  const user = readSessionUser();
  if (hasGoogleIdentity(user)) return;

  btnOpen.addEventListener('click', () => {
    form.reset();
    clearChangePasswordAlert();
    clearValidationErrors(form);
    $(modal).modal('show');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearChangePasswordAlert();
    clearValidationErrors(form);

    const currentPassword = document.getElementById('currentPassword')?.value || '';
    const newPassword = document.getElementById('newPassword')?.value || '';
    const confirmation = document.getElementById('newPasswordConfirm')?.value || '';

    if (!currentPassword || !newPassword || !confirmation) {
      showChangePasswordAlert('Completa todos los campos obligatorios.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordFieldError('newPassword', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordFieldError('newPassword', 'La nueva contraseña no puede ser igual a la actual.');
      return;
    }

    if (newPassword !== confirmation) {
      setPasswordFieldError('newPasswordConfirm', 'La confirmación de la contraseña no coincide.');
      return;
    }

    const btnSave = document.getElementById('btnSavePassword');
    btnSave.disabled = true;
    btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Guardando...';

    try {
      await requestBackend('/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({
          current_password: currentPassword,
          password: newPassword,
          password_confirmation: confirmation,
        }),
      });

      $(modal).modal('hide');
      form.reset();

      if (globalThis.showGlobalAlert) {
        globalThis.showGlobalAlert('Contraseña actualizada correctamente.', 'success');
      }
    } catch (error) {
      if (error?.status === 401) {
        localStorage.removeItem('user_data');
        localStorage.setItem('sgig_flash_message', 'Tu contraseña fue actualizada. Vuelve a iniciar sesión.');
        globalThis.location.href = '../index.html';
        return;
      }
      const alertBox = document.getElementById('changePasswordAlert');
      handleBackendErrors(error, form, alertBox);
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = '<i class="fas fa-save mr-1"></i> Guardar Contraseña';
    }
  });
}

function showChangePasswordAlert(message) {
  const alertBox = document.getElementById('changePasswordAlert');
  if (!alertBox) return;

  alertBox.textContent = message;
  alertBox.classList.remove('d-none');
}

function clearChangePasswordAlert() {
  const alertBox = document.getElementById('changePasswordAlert');
  if (!alertBox) return;

  alertBox.textContent = '';
  alertBox.classList.add('d-none');
}

function setPasswordFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  if (!input) return;

  input.classList.add('is-invalid');
  const container = input.parentElement;
  if (!container) return;

  let feedback = container.querySelector('.invalid-feedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.className = 'invalid-feedback';
    container.appendChild(feedback);
  }
  feedback.textContent = message;
  feedback.style.display = 'block';
}

export function renderSecurityData(user) {
  const container = document.getElementById('securityContainer');
  if (!container) return;

  const isGoogleUser = hasGoogleIdentity(user);
  const has2FA = user.two_factor_enabled;
  const isCiudadano = hasRole('CIUDADANO', user);

  container.innerHTML = `
    <div class="security-grid">
      <!-- 2FA -->
      <div class="security-item d-flex flex-column">
        <div class="security-item-header">
          <div class="security-item-icon blue"><i class="fas fa-shield-alt"></i></div>
          <h5 class="security-item-title">Autenticación en 2 Pasos</h5>
        </div>
        <p class="security-item-desc">Añade una capa extra de seguridad con un código temporal desde tu dispositivo.</p>
        <div class="security-item-action mt-auto" id="tfaContainer">
          ${has2FA
      ? `<div class="d-flex align-items-center justify-content-between">
                 <span><span class="status-dot on"></span><strong class="text-success">Activado</strong></span>
                 ${isCiudadano
        ? `<button type="button" class="btn btn-outline-danger btn-sm" id="btnDisable2fa"><i class="fas fa-ban mr-1"></i>Desactivar</button>`
        : ''}
               </div>`
      : `<button type="button" class="btn btn-primary btn-sm" id="btnSetup2fa"><i class="fas fa-qrcode mr-1"></i>Configurar 2FA</button>`
    }
        </div>
      </div>

      <!-- Password -->
      <div class="security-item d-flex flex-column">
        <div class="security-item-header">
          <div class="security-item-icon teal"><i class="fas fa-key"></i></div>
          <h5 class="security-item-title">Contraseña</h5>
        </div>
        ${isGoogleUser
      ? `<p class="security-item-desc">Iniciaste sesión con Google, no necesitas contraseña.</p>`
      : `<p class="security-item-desc">Actualiza tu contraseña periódicamente para mantener tu cuenta segura.</p>
             <div class="security-item-action mt-auto">
               <button type="button" class="btn btn-outline-primary btn-sm" id="btnOpenChangePassword">
                 <i class="fas fa-redo-alt mr-1"></i>Cambiar contraseña
               </button>
             </div>`
    }
      </div>
    </div>
  `;

  if (has2FA) {
    const btnDisable2fa = document.getElementById('btnDisable2fa');
    if (btnDisable2fa) btnDisable2fa.addEventListener('click', disableTwoFactor);
  } else {
    const btnSetup2fa = document.getElementById('btnSetup2fa');
    if (btnSetup2fa) btnSetup2fa.addEventListener('click', initSetup2FA);
  }
  const btnConfirm2fa = document.getElementById('btnConfirm2fa');
  if (btnConfirm2fa) btnConfirm2fa.addEventListener('click', confirmSetup2FA);
}

async function initSetup2FA() {
  const btn = document.getElementById('btnSetup2fa');
  if (!btn) return;

  const modalEl = document.getElementById('modalSetup2fa');
  if (!modalEl) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generando QR...';

  try {
    const data = await requestBackend('/auth/2fa/enable', { method: 'POST' });
    let qrLibraryReady = false;

    try {
      await ensureQrCodeLibrary();
      qrLibraryReady = Boolean(globalThis.QRCode);
    } catch {
      qrLibraryReady = false;
    }

    const qrContainer = document.getElementById('qrcode-container');
    renderTwoFactorSetup(qrContainer, data.qr_url, data.secret, qrLibraryReady);

    clearTwoFactorAlert();

    if (!qrLibraryReady) {
      setTwoFactorAlert('No se pudo generar el código QR. Ingresa la clave manual en tu aplicación autenticadora.', 'warning');
    }

    $(modalEl).modal('show');
  } catch (error) {
    setTwoFactorAlert(error.message || 'Error al generar QR.', 'danger');
    $(modalEl).modal('show');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-qrcode mr-2"></i>Configurar 2FA';
  }
}

function renderTwoFactorSetup(container, qrUrl, secret, qrLibraryReady) {
  if (!container) return;

  twoFactorQr?.clear?.();
  twoFactorQr = null;
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'text-center';

  if (qrLibraryReady && qrUrl) {
    const qrBox = document.createElement('div');
    qrBox.className = 'd-inline-block';
    wrapper.appendChild(qrBox);

    twoFactorQr = new globalThis.QRCode(qrBox, {
      text: qrUrl,
      width: 160,
      height: 160
    });
  }

  if (secret) {
    const help = document.createElement('p');
    help.className = 'small text-muted mb-1 mt-2';
    help.textContent = 'Clave manual';
    wrapper.appendChild(help);

    const code = document.createElement('code');
    code.className = 'd-inline-block bg-light border rounded px-2 py-1 text-break';
    code.textContent = secret;
    wrapper.appendChild(code);
  }

  container.appendChild(wrapper);
}

function ensureQrCodeLibrary() {
  if (globalThis.QRCode) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sgig-qrcode], script[data-sgi-qrcode]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.async = true;
    script.dataset.sgigQrcode = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar el generador de código QR.'));
    document.head.appendChild(script);
  });
}

async function confirmSetup2FA() {
  const btn = document.getElementById('btnConfirm2fa');
  const modalEl = document.getElementById('modalSetup2fa');
  const input = document.getElementById('tfaCodeInput');
  const code = input?.value.trim() || '';

  if (!/^[0-9]{6}$/.test(code)) {
    setTwoFactorAlert('El código debe tener 6 dígitos.', 'warning');
    return;
  }

  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verificando...';

  try {
    await requestBackend('/auth/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code })
    });

    if (modalEl) $(modalEl).modal('hide');

    const user = readSessionUser();
    if (user) {
      user.two_factor_enabled = true;
      localStorage.setItem(AUTH_KEYS.user, JSON.stringify(user));
    }

    if (globalThis.showGlobalAlert) {
      globalThis.showGlobalAlert('Autenticación en 2 pasos activada con éxito.', 'success');
    }

    setTimeout(() => {
      globalThis.location.reload();
    }, 1500);
  } catch (error) {
    setTwoFactorAlert(error.message || 'Código inválido.', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check mr-1"></i>Verificar y activar';
  }
}

async function disableTwoFactor() {
  const btn = document.getElementById('btnDisable2fa');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Desactivando...';

  try {
    await requestBackend('/auth/2fa/disable', { method: 'POST' });
    const user = readSessionUser();
    if (user) {
      user.two_factor_enabled = false;
      localStorage.setItem(AUTH_KEYS.user, JSON.stringify(user));
    }

    if (globalThis.showGlobalAlert) {
      globalThis.showGlobalAlert('Autenticación en 2 pasos desactivada.', 'success');
    }

    setTimeout(() => {
      globalThis.location.reload();
    }, 1500);
  } catch (error) {
    if (globalThis.showGlobalAlert) {
      globalThis.showGlobalAlert(error.message || 'Error al desactivar 2FA.', 'danger');
    } else {
      alert(error.message || 'Error al desactivar 2FA.');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-ban mr-2"></i>Desactivar 2FA';
  }
}

function clearTwoFactorAlert() {
  const alert = document.getElementById('tfaAlert');
  if (!alert) return;
  alert.innerHTML = '';
  alert.classList.add('d-none');
}

function setTwoFactorAlert(message, type = 'danger') {
  const alert = document.getElementById('tfaAlert');
  if (!alert) return;

  alert.innerHTML = `<div class="alert alert-${type} py-2 mb-0">${escapeHtml(message)}</div>`;
  alert.classList.remove('d-none');
}
