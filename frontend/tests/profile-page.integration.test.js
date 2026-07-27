import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ────────────────────────────────────────────────────────────
// Module-level mocks (hoisted by vitest)
// ────────────────────────────────────────────────────────────

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  requestBackend: vi.fn()
}))

vi.mock('../app/js/shared/profile-photo.js', () => ({
  hydrateOwnProfilePhoto: vi.fn().mockResolvedValue(true),
  invalidateOwnProfilePhoto: vi.fn()
}))

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  clearValidationErrors: vi.fn()
}))

// ────────────────────────────────────────────────────────────
// Static imports (mocked versions)
// ────────────────────────────────────────────────────────────

import { requestBackend } from '../app/js/infrastructure/backend-client.js'
import { handleBackendErrors, clearValidationErrors } from '../app/js/shared/validators/validation-utils.js'
import { hydrateOwnProfilePhoto, invalidateOwnProfilePhoto } from '../app/js/shared/profile-photo.js'

// ────────────────────────────────────────────────────────────
// DOM fixture – every id the source looks up
// ────────────────────────────────────────────────────────────

const DOM_FIXTURE = `
<div id="pageLoader" class="d-none" hidden></div>

<div id="profileAvatar" data-profile-avatar>
  <span data-profile-avatar-fallback></span>
  <img data-profile-avatar-image hidden>
</div>
<input id="profilePhotoInput" type="file">
<button id="btnChangeProfilePhoto" type="button">Cambiar foto</button>
<div id="profileFullName"></div>
<div id="profileEmail"></div>
<div id="profileUsername"></div>
<div id="profileStatus"></div>
<div id="profileMemberSince"></div>
<div id="profileLastLogin"></div>
<div id="securityContainer"></div>

<div id="modalEditProfile" class="modal fade">
  <form id="formEditProfile">
    <div class="form-group">
      <input id="editFirstName" type="text" class="form-control" />
    </div>
    <div class="form-group">
      <input id="editLastName" type="text" class="form-control" />
    </div>
    <div class="form-group">
      <input id="editUsername" type="text" class="form-control" />
    </div>
    <div id="editProfileAlert" class="d-none alert alert-danger"></div>
    <button id="btnSaveProfile" type="submit" class="btn btn-primary">
      <i class="fas fa-save mr-1"></i> Guardar Cambios
    </button>
  </form>
</div>
<button id="btnEditProfile" type="button" class="btn btn-outline-primary">
  <i class="fas fa-edit mr-1"></i> Editar
</button>

<div id="modalChangePassword" class="modal fade">
  <form id="formChangePassword">
    <div class="form-group">
      <input id="currentPassword" type="password" class="form-control" />
    </div>
    <div class="form-group">
      <input id="newPassword" type="password" class="form-control" />
    </div>
    <div class="form-group">
      <input id="newPasswordConfirm" type="password" class="form-control" />
    </div>
    <div id="changePasswordAlert" class="d-none alert alert-danger"></div>
    <button id="btnSavePassword" type="submit" class="btn btn-primary">
      <i class="fas fa-save mr-1"></i> Guardar Contraseña
    </button>
  </form>
</div>

<div id="modalSetup2fa" class="modal fade">
  <div id="qrcode-container"></div>
  <input id="tfaCodeInput" type="text" class="form-control" />
  <div id="tfaAlert" class="d-none"></div>
  <button id="btnConfirm2fa" type="button" class="btn btn-primary">Verificar</button>
</div>
`

const BASE_USER = {
  nombre: 'Juan',
  apellido: 'Pérez',
  username: 'juanperez',
  email: 'juan@test.com',
  roles: ['ADMIN'],
  identities: [],
  two_factor_enabled: false,
  is_active: true,
  created_at: '2025-01-15T10:00:00Z',
  last_login: '2026-07-14T08:30:00Z'
}

// ────────────────────────────────────────────────────────────
// Helper: set up jQuery mock with spyable modal
// ────────────────────────────────────────────────────────────

function setupJQueryMock() {
  const modalShow = vi.fn()
  const modalHide = vi.fn()
  const modalFns = { modalShow, modalHide }

  globalThis.$ = vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    modal: vi.fn(action => {
      if (action === 'show') {
        modalShow()
      }

      if (action === 'hide') {
        modalHide()
      }
    }),
    val: vi.fn(),
    text: vi.fn(),
    html: vi.fn(),
    toggle: vi.fn(),
    addClass: vi.fn().mockReturnThis(),
    removeClass: vi.fn().mockReturnThis(),
    hasClass: vi.fn(),
    find: vi.fn().mockReturnThis(),
    closest: vi.fn().mockReturnThis(),
    data: vi.fn(),
    prop: vi.fn(),
    attr: vi.fn(),
    trigger: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    empty: vi.fn(),
    append: vi.fn(),
    remove: vi.fn(),
    serialize: vi.fn(() => 'name=Test&email=test@test.com'),
    fadeIn: vi.fn(),
    fadeOut: vi.fn()
  }))
  globalThis.$.ajax = vi.fn()
  globalThis.$.post = vi.fn()

  return modalFns
}

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('profile-page — integration', () => {
  let modalFns
  let originalLocation

  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = DOM_FIXTURE
    localStorage.clear()

    globalThis.renderLayout = vi.fn()
    globalThis.showGlobalAlert = vi.fn()

    originalLocation = globalThis.location
    delete globalThis.location
    globalThis.location = { href: '', reload: vi.fn(), assign: vi.fn() }

    modalFns = setupJQueryMock()

    vi.mocked(requestBackend).mockReset()
    vi.mocked(handleBackendErrors).mockReset()
    vi.mocked(clearValidationErrors).mockReset()
    vi.mocked(hydrateOwnProfilePhoto).mockClear()
    vi.mocked(invalidateOwnProfilePhoto).mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true
    })
    delete globalThis.renderLayout
    delete globalThis.showGlobalAlert
    delete globalThis.$
  })

  // ── 1. Module exports ─────────────────────────────────

  describe('module exports', () => {
    it('exports all public functions', async () => {
      const mod = await import('../app/js/modules/profile/presentation/profile-page.js')
      expect(mod.escapeHtml).toBeTypeOf('function')
      expect(mod.normalizeCode).toBeTypeOf('function')
      expect(mod.hasRole).toBeTypeOf('function')
      expect(mod.hasGoogleIdentity).toBeTypeOf('function')
      expect(mod.formatDate).toBeTypeOf('function')
      expect(mod.formatDateTime).toBeTypeOf('function')
      expect(mod.renderUserData).toBeTypeOf('function')
      expect(mod.renderSecurityData).toBeTypeOf('function')
      expect(mod.initEditProfile).toBeTypeOf('function')
      expect(mod.initProfilePhotoUpload).toBeTypeOf('function')
      expect(mod.validateProfilePhoto).toBeTypeOf('function')
      expect(mod.initChangePassword).toBeTypeOf('function')
      expect(mod.initProfilePage).toBeTypeOf('function')
    })
  })

  // ── 2. DOMContentLoaded init ──────────────────────────

  describe('DOMContentLoaded init', () => {
    it('redirects to login when no user in localStorage', async () => {
      await import('../app/js/modules/profile/presentation/profile-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))
      expect(globalThis.location.href).toContain('../index.html')
    })

    it('renders profile and security data and hides loader', async () => {
      localStorage.setItem('user_data', JSON.stringify(BASE_USER))
      await import('../app/js/modules/profile/presentation/profile-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      expect(globalThis.renderLayout).toHaveBeenCalledWith('profile')

      expect(document.getElementById('profileFullName').textContent).toBe('Juan Pérez')
      expect(document.getElementById('profileEmail').textContent).toBe('juan@test.com')
      expect(document.getElementById('profileUsername').textContent).toBe('juanperez')

      const loader = document.getElementById('pageLoader')
      expect(loader.hasAttribute('hidden')).toBe(true)
      expect(loader.classList.contains('d-none')).toBe(true)
    })
  })

  // ── 3. Profile display (renderUserData) ───────────────

  describe('profile display (renderUserData)', () => {
    it('populates all display fields from user data', async () => {
      const { renderUserData } = await import('../app/js/modules/profile/presentation/profile-page.js')
      renderUserData(BASE_USER)

      expect(document.querySelector('#profileAvatar [data-profile-avatar-fallback]').textContent).toBe('J')
      expect(document.getElementById('profileFullName').textContent).toBe('Juan Pérez')
      expect(document.getElementById('profileEmail').textContent).toBe('juan@test.com')
      expect(document.getElementById('profileUsername').textContent).toBe('juanperez')

      const status = document.getElementById('profileStatus')
      expect(status.textContent).toBe('Activo')
      expect(status.className).toContain('active')

      const memberSince = document.getElementById('profileMemberSince')
      expect(memberSince.textContent).not.toBe('-')
      expect(memberSince.textContent).toContain('2025')

      const lastLogin = document.getElementById('profileLastLogin')
      expect(lastLogin.textContent).not.toBe('-')
    })

    it('shows first letter of first_name when nombre is absent', async () => {
      const { renderUserData } = await import('../app/js/modules/profile/presentation/profile-page.js')
      renderUserData({ first_name: 'Ana', username: 'ana123', is_active: true })
      expect(document.querySelector('#profileAvatar [data-profile-avatar-fallback]').textContent).toBe('A')
    })

    it('falls back to "U" when no display name exists', async () => {
      const { renderUserData } = await import('../app/js/modules/profile/presentation/profile-page.js')
      renderUserData({ username: '', is_active: true })
      expect(document.querySelector('#profileAvatar [data-profile-avatar-fallback]').textContent).toBe('U')
    })

    it('shows inactive status', async () => {
      const { renderUserData } = await import('../app/js/modules/profile/presentation/profile-page.js')
      renderUserData({ ...BASE_USER, is_active: false })
      const status = document.getElementById('profileStatus')
      expect(status.textContent).toBe('Inactivo')
      expect(status.className).toContain('inactive')
    })

    it('shows memberSince and lastLogin as dash when absent', async () => {
      const { renderUserData } = await import('../app/js/modules/profile/presentation/profile-page.js')
      renderUserData({ username: 'test', is_active: true })
      expect(document.getElementById('profileMemberSince').textContent).toBe('-')
      expect(document.getElementById('profileLastLogin').textContent).toBe('-')
    })
  })

  // ── 4. Profile edit form ─────────────────────────────

  describe('profile edit form', () => {
    async function initEditFlow() {
      localStorage.setItem('user_data', JSON.stringify(BASE_USER))
      const mod = await import('../app/js/modules/profile/presentation/profile-page.js')
      mod.initEditProfile(BASE_USER)
    }

    it('opens modal and populates username from localStorage', async () => {
      await initEditFlow()

      document.getElementById('btnEditProfile').click()

      expect(modalFns.modalShow).toHaveBeenCalled()
      expect(document.getElementById('editUsername').value).toBe('juanperez')
    })

    it('calls requestBackend on form submit and shows alert', async () => {
      vi.mocked(requestBackend).mockResolvedValue({
        user: { ...BASE_USER, username: 'updateduser' }
      })
      await initEditFlow()

      document.getElementById('btnEditProfile').click()
      document.getElementById('editUsername').value = 'updateduser'

      const form = document.getElementById('formEditProfile')
      form.dispatchEvent(new Event('submit', { cancelable: true }))

      await vi.waitFor(() => {
        expect(requestBackend).toHaveBeenCalledWith(
          '/auth/profile',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ username: 'updateduser', first_name: 'Juan', last_name: 'Pérez' })
          })
        )
      })

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          expect.stringContaining('actualizado'),
          'success'
        )
      })

      expect(modalFns.modalHide).toHaveBeenCalled()
    })

    it('calls handleBackendErrors on failure', async () => {
      const apiError = new Error('Network')
      apiError.status = 422
      vi.mocked(requestBackend).mockRejectedValue(apiError)
      await initEditFlow()

      document.getElementById('btnEditProfile').click()
      const form = document.getElementById('formEditProfile')
      form.dispatchEvent(new Event('submit', { cancelable: true }))

      await vi.waitFor(() => {
        expect(handleBackendErrors).toHaveBeenCalledWith(
          apiError,
          form,
          document.getElementById('editProfileAlert')
        )
      })
    })
  })

  // ── 5. Password change ───────────────────────────────

  describe('password change', () => {
    async function initPasswordFlow(googleUser = false) {
      const user = googleUser ?
        { ...BASE_USER, identities: [{ provider: 'google' }] } :
        BASE_USER
      localStorage.setItem('user_data', JSON.stringify(user))
      const mod = await import('../app/js/modules/profile/presentation/profile-page.js')
      mod.renderSecurityData(user)
      mod.initChangePassword()
    }

    it('shows alert when required fields are empty', async () => {
      await initPasswordFlow()

      document.getElementById('formChangePassword').dispatchEvent(
        new Event('submit', { cancelable: true })
      )

      const alert = document.getElementById('changePasswordAlert')
      expect(alert.textContent).toContain('Completa todos los campos obligatorios')
      expect(alert.classList.contains('d-none')).toBe(false)
    })

    it('shows field error when password is shorter than 8 characters', async () => {
      await initPasswordFlow()

      document.getElementById('currentPassword').value = 'oldpass'
      document.getElementById('newPassword').value = 'short'
      document.getElementById('newPasswordConfirm').value = 'short'

      document.getElementById('formChangePassword').dispatchEvent(
        new Event('submit', { cancelable: true })
      )

      const input = document.getElementById('newPassword')
      expect(input.classList.contains('is-invalid')).toBe(true)
      const feedback = input.parentElement.querySelector('.invalid-feedback')
      expect(feedback).toBeTruthy()
      expect(feedback.textContent).toContain('al menos 8 caracteres')
    })

    it('shows field error when new password equals current', async () => {
      await initPasswordFlow()

      document.getElementById('currentPassword').value = 'samepassword'
      document.getElementById('newPassword').value = 'samepassword'
      document.getElementById('newPasswordConfirm').value = 'samepassword'

      document.getElementById('formChangePassword').dispatchEvent(
        new Event('submit', { cancelable: true })
      )

      const input = document.getElementById('newPassword')
      expect(input.classList.contains('is-invalid')).toBe(true)
      const feedback = input.parentElement.querySelector('.invalid-feedback')
      expect(feedback.textContent).toContain('no puede ser igual a la actual')
    })

    it('shows field error when passwords do not match', async () => {
      await initPasswordFlow()

      document.getElementById('currentPassword').value = 'oldpass'
      document.getElementById('newPassword').value = 'newpass12'
      document.getElementById('newPasswordConfirm').value = 'different'

      document.getElementById('formChangePassword').dispatchEvent(
        new Event('submit', { cancelable: true })
      )

      const input = document.getElementById('newPasswordConfirm')
      expect(input.classList.contains('is-invalid')).toBe(true)
      const feedback = input.parentElement.querySelector('.invalid-feedback')
      expect(feedback.textContent).toContain('no coincide')
    })

    it('calls requestBackend on valid submission and shows success', async () => {
      vi.mocked(requestBackend).mockResolvedValue({ success: true })
      await initPasswordFlow()

      document.getElementById('currentPassword').value = 'oldpass'
      document.getElementById('newPassword').value = 'newpass123'
      document.getElementById('newPasswordConfirm').value = 'newpass123'

      document.getElementById('formChangePassword').dispatchEvent(
        new Event('submit', { cancelable: true })
      )

      await vi.waitFor(() => {
        expect(requestBackend).toHaveBeenCalledWith(
          '/auth/password',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({
              current_password: 'oldpass',
              password: 'newpass123',
              password_confirmation: 'newpass123'
            })
          })
        )
      })

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          expect.stringContaining('actualizada'),
          'success'
        )
      })

      expect(modalFns.modalHide).toHaveBeenCalled()
    })

    it('redirects to login on 401 error', async () => {
      const authError = new Error('Unauthorized')
      authError.status = 401
      vi.mocked(requestBackend).mockRejectedValue(authError)
      await initPasswordFlow()

      document.getElementById('currentPassword').value = 'oldpass'
      document.getElementById('newPassword').value = 'newpass123'
      document.getElementById('newPasswordConfirm').value = 'newpass123'

      document.getElementById('formChangePassword').dispatchEvent(
        new Event('submit', { cancelable: true })
      )

      await vi.waitFor(() => {
        expect(globalThis.location.href).toContain('../index.html')
      })
    })

    it('shows handleBackendErrors on non-401 error', async () => {
      const apiError = new Error('Validation error')
      apiError.status = 422
      vi.mocked(requestBackend).mockRejectedValue(apiError)
      await initPasswordFlow()

      document.getElementById('currentPassword').value = 'oldpass'
      document.getElementById('newPassword').value = 'newpass123'
      document.getElementById('newPasswordConfirm').value = 'newpass123'
      const form = document.getElementById('formChangePassword')

      form.dispatchEvent(new Event('submit', { cancelable: true }))

      await vi.waitFor(() => {
        expect(handleBackendErrors).toHaveBeenCalledWith(
          apiError,
          form,
          document.getElementById('changePasswordAlert')
        )
      })
    })
  })

  // ── 6. Avatar display ────────────────────────────────

  describe('avatar display', () => {
    it('shows initial letter from nombre', async () => {
      const { renderUserData } = await import('../app/js/modules/profile/presentation/profile-page.js')
      renderUserData({ nombre: 'Carlos', is_active: true })
      expect(document.querySelector('#profileAvatar [data-profile-avatar-fallback]').textContent).toBe('C')
    })

    it('shows initial from username when nombre is absent', async () => {
      const { renderUserData } = await import('../app/js/modules/profile/presentation/profile-page.js')
      renderUserData({ username: 'carlos123', is_active: true })
      expect(document.querySelector('#profileAvatar [data-profile-avatar-fallback]').textContent).toBe('C')
    })

    it('shows "U" when no display name available', async () => {
      const { renderUserData } = await import('../app/js/modules/profile/presentation/profile-page.js')
      renderUserData({ username: '', is_active: true })
      expect(document.querySelector('#profileAvatar [data-profile-avatar-fallback]').textContent).toBe('U')
    })
  })

  describe('profile photo upload', () => {
    it('uploads the selected image, refreshes the avatar, and persists the user', async () => {
      const updatedUser = { ...BASE_USER, foto_perfil: 'profile-photos/users/1/avatar.jpg' }
      vi.mocked(requestBackend).mockResolvedValue({ user: updatedUser })
      const { initProfilePhotoUpload } = await import('../app/js/modules/profile/presentation/profile-page.js')
      initProfilePhotoUpload(BASE_USER)

      const input = document.getElementById('profilePhotoInput')
      const file = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' })
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change'))

      await vi.waitFor(() => {
        expect(requestBackend).toHaveBeenCalledWith('/auth/profile/photo', {
          method: 'POST',
          body: expect.any(FormData)
        })
      })
      await vi.waitFor(() => expect(invalidateOwnProfilePhoto).toHaveBeenCalled())

      expect(JSON.parse(localStorage.getItem('user_data')).foto_perfil).toBe(updatedUser.foto_perfil)
      expect(hydrateOwnProfilePhoto).toHaveBeenCalledWith(updatedUser)
      expect(globalThis.renderLayout).toHaveBeenCalled()
      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          'Foto de perfil actualizada correctamente.',
          'success'
        )
      })
    })

    it('rejects unsupported files before calling the backend', async () => {
      const { initProfilePhotoUpload } = await import('../app/js/modules/profile/presentation/profile-page.js')
      initProfilePhotoUpload(BASE_USER)

      const input = document.getElementById('profilePhotoInput')
      const file = new File(['svg'], 'avatar.svg', { type: 'image/svg+xml' })
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change'))

      expect(requestBackend).not.toHaveBeenCalled()
      expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
        'Selecciona una imagen JPG, PNG o WebP.',
        'warning'
      )
    })
  })

  // ── 7. Form validation ───────────────────────────────

  describe('form validation', () => {
    describe('editUsername space validation', () => {
      async function setupEdit() {
        const mod = await import('../app/js/modules/profile/presentation/profile-page.js')
        mod.initEditProfile(BASE_USER)
      }

      it('shows error when username contains spaces', async () => {
        await setupEdit()
        document.getElementById('btnEditProfile').click()

        const input = document.getElementById('editUsername')
        input.value = 'user name'
        input.dispatchEvent(new Event('input'))

        expect(input.classList.contains('is-invalid')).toBe(true)
        const feedback = input.parentElement.querySelector('.invalid-feedback')
        expect(feedback).toBeTruthy()
        expect(feedback.textContent).toBe('El nombre de usuario no puede contener espacios.')
      })

      it('clears error when spaces are removed', async () => {
        await setupEdit()
        document.getElementById('btnEditProfile').click()

        const input = document.getElementById('editUsername')
        input.value = 'user name'
        input.dispatchEvent(new Event('input'))

        expect(input.classList.contains('is-invalid')).toBe(true)

        input.value = 'username'
        input.dispatchEvent(new Event('input'))

        expect(input.classList.contains('is-invalid')).toBe(false)
      })
    })

    describe('clearValidationErrors called on form submit', () => {
      it('calls clearValidationErrors when submitting password form', async () => {
        localStorage.setItem('user_data', JSON.stringify(BASE_USER))
        const mod = await import('../app/js/modules/profile/presentation/profile-page.js')
        mod.renderSecurityData(BASE_USER)
        mod.initChangePassword()

        document.getElementById('formChangePassword').dispatchEvent(
          new Event('submit', { cancelable: true })
        )

        expect(clearValidationErrors).toHaveBeenCalledWith(
          document.getElementById('formChangePassword')
        )
      })
    })
  })
})
