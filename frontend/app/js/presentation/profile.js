import { requestBackend } from '../infrastructure/backend-client.js?v=14';

document.addEventListener('DOMContentLoaded', initProfilePage);

const AUTH_KEYS = { user: 'user_data' };

function readSessionUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCode(value) {
  if (typeof value === 'string') return value;
  return value?.codigo || value?.code || '';
}

function formatRoleLabel(role) {
  if (typeof role === 'string') return role;
  return role?.name || role?.nombre || role?.codigo || role?.code || '';
}

function hasRole(roleCode, user) {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((role) => normalizeCode(role) === roleCode);
}

function initProfilePage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('profile');
  }

  const user = readSessionUser();
  if (!user) {
    window.location.href = '../index.html';
    return;
  }

  renderUserData(user);
  renderSecurityData(user);
  renderRolesData(user);

  const loader = document.getElementById('pageLoader');
  if (loader) {
    loader.setAttribute('hidden', '');
    loader.classList.add('d-none');
    loader.style.display = 'none';
  }
}

function renderUserData(user) {
  const firstName = user.nombre || user.first_name || '';
  const lastName = user.apellido || user.last_name || '';
  const email = user.email || '';
  const initial = firstName ? firstName.charAt(0).toUpperCase() : 'U';

  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) avatarEl.textContent = initial;

  const fullNameEl = document.getElementById('profileFullName');
  if (fullNameEl) fullNameEl.textContent = `${firstName} ${lastName}`.trim() || 'Usuario SGI';

  const emailEl = document.getElementById('profileEmail');
  if (emailEl) emailEl.textContent = email;

  const firstNameEl = document.getElementById('profileFirstName');
  if (firstNameEl) firstNameEl.textContent = firstName || '-';

  const lastNameEl = document.getElementById('profileLastName');
  if (lastNameEl) lastNameEl.textContent = lastName || '-';

}

function renderSecurityData(user) {
  const container = document.getElementById('securityContainer');
  if (!container) return;

  const has2FA = user.two_factor_enabled;
  const isCiudadano = hasRole('CIUDADANO', user);

  if (has2FA) {
    container.innerHTML = `
      <div class="alert alert-success py-2 d-inline-block shadow-sm">
        <i class="fas fa-shield-alt mr-2"></i>Autenticación en 2 Pasos activa
      </div>
      <div class="mt-2">
        ${isCiudadano ? `<button type="button" class="btn btn-outline-danger btn-sm" id="btnDisable2fa"><i class="fas fa-ban mr-1"></i>Desactivar 2FA</button>` : ''}
      </div>
    `;
    const btnDisable2fa = document.getElementById('btnDisable2fa');
    if (btnDisable2fa) btnDisable2fa.addEventListener('click', disableTwoFactor);
  } else {
    container.innerHTML = `
      <p class="text-muted text-sm">Protege tu cuenta con verificación de dos pasos usando Google Authenticator u otra app similar.</p>
      <div id="tfaStep1">
        <button type="button" class="btn btn-primary btn-sm shadow-sm" id="btnSetup2fa">
          <i class="fas fa-qrcode mr-2"></i>Configurar 2FA
        </button>
      </div>
      <div id="tfaStep2" class="d-none mt-3">
        <p class="text-sm text-muted mb-2">Escanea este código QR con tu aplicación autenticadora:</p>
        <div id="qrcode-container" class="d-inline-block bg-white p-2 border rounded shadow-sm"></div>
        <div class="mt-3">
          <label class="text-sm">Ingresa el código generado:</label>
          <input type="text" id="tfaCodeInput" class="form-control text-center mx-auto" style="max-width: 200px; font-size: 1.25rem; letter-spacing: 0.2em;" maxlength="6" placeholder="000000">
        </div>
        <button type="button" class="btn btn-success btn-sm shadow-sm mt-3" id="btnConfirm2fa">Verificar y Activar</button>
      </div>
      <div id="tfaAlert" class="mt-3 text-left"></div>
    `;
    const btnSetup2fa = document.getElementById('btnSetup2fa');
    const btnConfirm2fa = document.getElementById('btnConfirm2fa');
    if (btnSetup2fa) btnSetup2fa.addEventListener('click', initSetup2FA);
    if (btnConfirm2fa) btnConfirm2fa.addEventListener('click', confirmSetup2FA);
  }
}

function renderRolesData(user) {
  const container = document.getElementById('rolesListContainer');
  if (!container) return;

  if (!Array.isArray(user.roles) || user.roles.length === 0) {
    container.innerHTML = '<span class="text-muted">Sin rol asignado</span>';
    return;
  }

  container.innerHTML = `
    <ul class="list-group list-group-flush mb-0">
      ${user.roles.map(role => {
        const label = escapeHtml(formatRoleLabel(role));
        const code = escapeHtml(normalizeCode(role));
        const isCiudadano = code === 'CIUDADANO';
        return `
          <li class="list-group-item px-0 border-0 bg-transparent">
            <div class="d-flex align-items-center">
              <i class="fas ${isCiudadano ? 'fa-user' : 'fa-user-shield'} text-${isCiudadano ? 'info' : 'primary'} mr-3 fa-lg"></i>
              <div>
                <h6 class="mb-0 font-weight-bold">${label}</h6>
                <small class="text-muted">Nivel de acceso: ${code}</small>
              </div>
            </div>
          </li>
        `;
      }).join('<hr class="my-1">')}
    </ul>
  `;
}

// 2FA Logic Ported from layout.js
async function initSetup2FA() {
  const btn = document.getElementById('btnSetup2fa');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generando QR...';
  try {
    const data = await requestBackend('/auth/2fa/enable', { method: 'POST' });
    await ensureQrCodeLibrary();
    document.getElementById('tfaStep1').classList.add('d-none');
    document.getElementById('tfaStep2').classList.remove('d-none');
    const qrContainer = document.getElementById('qrcode-container');
    qrContainer.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qrContainer, {
        text: data.qr_url,
        width: 180,
        height: 180
      });
    } else {
      qrContainer.innerHTML = '<span class="text-danger">Error: Librería QR no encontrada.</span>';
    }
  } catch (error) {
    const alert = document.getElementById('tfaAlert');
    alert.innerHTML = `<div class="alert alert-danger py-2 text-sm">${escapeHtml(error.message || 'Error al generar QR')}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-qrcode mr-2"></i>Configurar 2FA';
  }
}

function ensureQrCodeLibrary() {
  if (window.QRCode) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sgig-qrcode]');
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
    script.onerror = () => reject(new Error('No se pudo cargar la librería para generar el código QR.'));
    document.head.appendChild(script);
  });
}

async function confirmSetup2FA() {
  const btn = document.getElementById('btnConfirm2fa');
  const code = document.getElementById('tfaCodeInput').value.trim();
  if (!code || code.length !== 6) {
    document.getElementById('tfaAlert').innerHTML = `<div class="alert alert-warning py-2 text-sm">El código debe tener 6 dígitos.</div>`;
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verificando...';
  try {
    await requestBackend('/auth/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    document.getElementById('tfaAlert').innerHTML = `<div class="alert alert-success py-2 text-sm">¡Autenticación activada con éxito!</div>`;
    const user = readSessionUser();
    if (user) {
      user.two_factor_enabled = true;
      localStorage.setItem(AUTH_KEYS.user, JSON.stringify(user));
    }
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    document.getElementById('tfaAlert').innerHTML = `<div class="alert alert-danger py-2 text-sm">${escapeHtml(error.message || 'Código inválido')}</div>`;
    btn.disabled = false;
    btn.innerHTML = 'Verificar y Activar';
  }
}

async function disableTwoFactor() {
  const btn = document.getElementById('btnDisable2fa');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Desactivando...';

  try {
    await requestBackend('/auth/2fa/disable', { method: 'POST' });
    const user = readSessionUser();
    if (user) {
      user.two_factor_enabled = false;
      localStorage.setItem(AUTH_KEYS.user, JSON.stringify(user));
    }
    
    if (window.showGlobalAlert) {
      window.showGlobalAlert('Autenticación en 2 Pasos desactivada.', 'success');
    }
    
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    if (window.showGlobalAlert) {
      window.showGlobalAlert(error.message || 'Error al desactivar 2FA.', 'danger');
    } else {
      alert(error.message || 'Error al desactivar 2FA.');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-ban mr-2"></i>Desactivar 2FA';
  }
}
