import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

vi.mock('../app/js/shared/sanitizer.js', () => ({
  escapeHtml: v => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}))

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

const DOM_FIXTURE = `
<div id="notifications-test">
  <div class="notif-filters">
    <button class="notif-filter-btn active" data-filter="all">Todas</button>
    <button class="notif-filter-btn" data-filter="unread">No leidas</button>
    <button class="notif-filter-btn" data-filter="read">Leidas</button>
  </div>
  <div id="notifHistoryList"></div>
  <div id="notifHistoryEmpty" style="display:none;">
    <span>No hay notificaciones</span>
  </div>
  <div id="notifHistoryPagination" style="display:none;">
    <button id="btnPrevPage" type="button" class="notif-page-btn">&laquo; Anterior</button>
    <span class="notif-page-info"></span>
    <button id="btnNextPage" type="button" class="notif-page-btn">Siguiente &raquo;</button>
  </div>
  <div id="notifPageInfo"></div>
  <button id="btnMarkAllHistory" type="button">Marcar todas leidas</button>
</div>
`

function clone(data) {
  return JSON.parse(JSON.stringify(data))
}

const sampleNotifications = [
  { id: 1, title: 'Asignado', message: 'Te han asignado un incidente', type: 'assigned', is_read: false, created_at: '2026-07-13T10:00:00', incident_id: 10 },
  { id: 2, title: 'Comentario nuevo', message: 'Nuevo comentario en INC-002', type: 'comment', is_read: false, created_at: '2026-07-14T11:30:00', incident_id: 11 },
  { id: 3, title: 'Estado actualizado', message: 'El incidente cambio a En Progreso', type: 'status', is_read: true, created_at: '2026-07-15T09:15:00', incident_id: 12 },
  { id: 4, title: 'Incidente cerrado', message: 'El incidente fue resuelto', type: 'closed', is_read: true, created_at: '2026-07-16T14:00:00' },
  { id: 5, title: 'Tarea vencida', message: 'Un incidente esta vencido', type: 'overdue', is_read: false, created_at: '2026-07-17T08:45:00', incident_id: 13 }
]

function manyNotifications(length = 25) {
  return Array.from({ length }, (_, i) => ({
    id: i + 1,
    title: `Notificacion ${i + 1}`,
    message: `Mensaje de prueba numero ${i + 1}`,
    type: i % 4 === 0 ? 'assigned' : i % 4 === 1 ? 'comment' : (i % 4 === 2 ? 'status' : 'closed'),
    is_read: i >= Math.floor(length * 0.6),
    created_at: `2026-07-${String(13 + Math.floor(i / 3)).padStart(2, '0')}T10:00:00`,
    incident_id: i + 10
  }))
}

let origDocAddListener
let origGlobalAddListener
const capturedListeners = []

function captureListener(target, type, handler) {
  capturedListeners.push({ target, type, handler })
}

beforeEach(() => {
  capturedListeners.length = 0

  origDocAddListener = document.addEventListener.bind(document)
  document.addEventListener = (type, handler, ...rest) => {
    captureListener(document, type, handler)
    return origDocAddListener(type, handler, ...rest)
  }

  origGlobalAddListener = globalThis.addEventListener.bind(globalThis)
  globalThis.addEventListener = (type, handler, ...rest) => {
    captureListener(globalThis, type, handler)
    return origGlobalAddListener(type, handler, ...rest)
  }

  document.body.innerHTML = DOM_FIXTURE
  globalThis.requestBackend = vi.fn()
  globalThis.mutateBackend = vi.fn().mockResolvedValue({})
  globalThis.showGlobalAlert = vi.fn()
  globalThis.renderLayout = vi.fn()

  globalThis.$ = vi.fn(() => ({
    on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(),
    val: vi.fn(), text: vi.fn(), html: vi.fn(),
    toggle: vi.fn(), addClass: vi.fn().mockReturnThis(), removeClass: vi.fn().mockReturnThis(),
    hasClass: vi.fn(), find: vi.fn().mockReturnThis(), closest: vi.fn().mockReturnThis(),
    data: vi.fn(), prop: vi.fn(), attr: vi.fn(), trigger: vi.fn(),
    show: vi.fn(), hide: vi.fn(), empty: vi.fn(), append: vi.fn(), remove: vi.fn()
  }))
  globalThis.$.ajax = vi.fn()
  globalThis.$.post = vi.fn()

  vi.resetModules()
})

afterEach(() => {
  for (const { target, type, handler } of capturedListeners) {
    target.removeEventListener(type, handler)
  }

  capturedListeners.length = 0

  if (origDocAddListener) {
    document.addEventListener = origDocAddListener
  }

  if (origGlobalAddListener) {
    globalThis.addEventListener = origGlobalAddListener
  }

  delete globalThis.requestBackend
  delete globalThis.mutateBackend
  delete globalThis.showGlobalAlert
  delete globalThis.renderLayout
  delete globalThis.$
  document.body.innerHTML = ''
})

async function initApp(data) {
  const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')

  if (data !== undefined) {
    globalThis.requestBackend.mockResolvedValue({ data: clone(data) })
  }

  await mod.initNotificationsPage()

  const expectedCount = data && data.length > 0 ? Math.min(data.length, 15) : 0
  if (expectedCount > 0) {
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.notif-history-item').length).toBe(expectedCount)
    })
  } else {
    await vi.waitFor(() => {
      const emptyEl = document.getElementById('notifHistoryEmpty')
      expect(emptyEl.style.display).toBe('flex')
    })
  }
}

// ─── 1. Module exports ──────────────────────────────────────────

describe('notifications-page — integration', () => {
  describe('1. Module exports', () => {
    it('all exported functions and constants exist', async () => {
      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      expect(mod.PER_PAGE).toBe(15)
      expect(typeof mod.filterNotifications).toBe('function')
      expect(typeof mod.buildPageList).toBe('function')
      expect(typeof mod.getIconClass).toBe('function')
      expect(typeof mod.getTypeClass).toBe('function')
      expect(typeof mod.formatDateTime).toBe('function')
      expect(typeof mod.initNotificationsPage).toBe('function')
    })
  })

  // ─── 2. DOMContentLoaded init ─────────────────────────────────

  describe('2. DOMContentLoaded init', () => {
    it('calls renderLayout, showPageLoading, and renders notification list', async () => {
      const incUi = await import('../app/js/modules/incidents/presentation/incidents-ui.js')
      await initApp(sampleNotifications)

      expect(globalThis.renderLayout).toHaveBeenCalledWith('notifications')
      expect(incUi.showPageLoading).toHaveBeenCalledWith('Cargando notificaciones', 'Obteniendo historial...')
      expect(incUi.hidePageLoading).toHaveBeenCalled()

      const items = document.querySelectorAll('.notif-history-item')
      expect(items.length).toBe(sampleNotifications.length)
    })

    it('calls requestBackend with the correct URL', async () => {
      await initApp(sampleNotifications)

      expect(globalThis.requestBackend).toHaveBeenCalledWith(
        '/notifications?per_page=50&page=1',
        { noCache: true }
      )
    })

    it('handles backend errors gracefully', async () => {
      const incUi = await import('../app/js/modules/incidents/presentation/incidents-ui.js')
      globalThis.requestBackend.mockRejectedValue(new Error('Network error'))

      const mod = await import('../app/js/modules/notifications/presentation/notifications-page.js')
      await mod.initNotificationsPage()

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          'Error al cargar las notificaciones.',
          'danger'
        )
      })

      expect(incUi.hidePageLoading).toHaveBeenCalled()
    })
  })

  // ─── 3. Notification list rendering ───────────────────────────

  describe('3. Notification list rendering', () => {
    it('renders title, message, and formatted time for each notification', async () => {
      await initApp(sampleNotifications)

      const titles = document.querySelectorAll('.notif-history-title')
      expect(titles.length).toBe(5)
      expect(titles[0].textContent).toBe('Asignado')
      expect(titles[4].textContent).toBe('Tarea vencida')

      const messages = document.querySelectorAll('.notif-history-message')
      expect(messages[0].textContent).toBe('Te han asignado un incidente')
    })

    it('applies unread / read styling correctly', async () => {
      await initApp(sampleNotifications)

      const items = document.querySelectorAll('.notif-history-item')
      expect(items[0].classList.contains('is-unread')).toBe(true)
      expect(items[1].classList.contains('is-unread')).toBe(true)
      expect(items[2].classList.contains('is-unread')).toBe(false)
      expect(items[3].classList.contains('is-unread')).toBe(false)
      expect(items[4].classList.contains('is-unread')).toBe(true)

      const statuses = document.querySelectorAll('.notif-history-status')
      expect(statuses[0].classList.contains('status-unread')).toBe(true)
      expect(statuses[2].classList.contains('status-read')).toBe(true)
    })

    it('renders mark-read button only for unread items', async () => {
      await initApp(sampleNotifications)

      const markBtns = document.querySelectorAll('.js-mark-read')
      expect(markBtns.length).toBe(3)

      const items = document.querySelectorAll('.notif-history-item')
      expect(items[2].querySelector('.js-mark-read')).toBeNull()
      expect(items[3].querySelector('.js-mark-read')).toBeNull()
    })

    it('shows actions div only for unread items', async () => {
      await initApp(sampleNotifications)

      const actions = document.querySelectorAll('.notif-history-actions')
      expect(actions.length).toBe(3)
    })

    it('shows empty state when no notifications', async () => {
      await initApp([])

      const items = document.querySelectorAll('.notif-history-item')
      expect(items.length).toBe(0)

      const emptyEl = document.getElementById('notifHistoryEmpty')
      expect(emptyEl.style.display).toBe('flex')
    })

    it('escapes HTML in title and message', async () => {
      const malicious = [
        { id: 99, title: '<script>alert("xss")</script>', message: '<b>bold</b>', type: 'status', is_read: false, created_at: '2026-07-20T10:00:00' }
      ]
      await initApp(malicious)

      const title = document.querySelector('.notif-history-title')
      expect(title.innerHTML).not.toContain('<script>')
      expect(title.innerHTML).toContain('&lt;script&gt;')

      const msg = document.querySelector('.notif-history-message')
      expect(msg.innerHTML).toContain('&lt;b&gt;')
    })

    it('assigns correct icon class based on notification type', async () => {
      await initApp(sampleNotifications)

      const icons = document.querySelectorAll('.notif-history-icon i')
      expect(icons[0].classList.contains('fa-user-check')).toBe(true)
      expect(icons[1].classList.contains('fa-comment-dots')).toBe(true)
      expect(icons[3].classList.contains('fa-check-circle')).toBe(true)
      expect(icons[4].classList.contains('fa-exclamation-triangle')).toBe(true)
    })
  })

  // ─── 4. Mark as read ──────────────────────────────────────────

  describe('4. Mark as read', () => {
    it('marks a single notification as read on button click', async () => {
      await initApp(sampleNotifications)

      const firstItem = document.querySelector('.notif-history-item')
      expect(firstItem.classList.contains('is-unread')).toBe(true)

      firstItem.querySelector('.js-mark-read').click()

      await vi.waitFor(() => {
        expect(globalThis.mutateBackend).toHaveBeenCalledWith(
          '/notifications/1/read',
          { method: 'PATCH' }
        )
      })

      expect(firstItem.classList.contains('is-unread')).toBe(false)
      expect(firstItem.querySelector('.notif-history-actions')).toBeNull()
      const status = firstItem.querySelector('.notif-history-status')
      expect(status.classList.contains('status-read')).toBe(true)
      expect(status.textContent).toContain('Leida')
    })

    it('shows success alert after marking as read', async () => {
      await initApp(sampleNotifications)

      document.querySelector('.js-mark-read').click()

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          'Notificación marcada como leída.',
          'success'
        )
      })
    })

    it('shows error alert when mark-as-read fails', async () => {
      globalThis.mutateBackend.mockRejectedValue(new Error('fail'))
      await initApp(sampleNotifications)

      document.querySelector('.js-mark-read').click()

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          'No se pudo marcar la notificación.',
          'danger'
        )
      })
    })

    it('marks all notifications as read via mark-all button', async () => {
      await initApp(sampleNotifications)

      const unreadItems = document.querySelectorAll('.is-unread')
      expect(unreadItems.length).toBe(3)

      document.getElementById('btnMarkAllHistory').click()

      await vi.waitFor(() => {
        expect(globalThis.mutateBackend).toHaveBeenCalledWith(
          '/notifications/mark-all-read',
          { method: 'PATCH' }
        )
      })

      const afterUnread = document.querySelectorAll('.is-unread')
      expect(afterUnread.length).toBe(0)
      const items = document.querySelectorAll('.notif-history-item')
      items.forEach(item => {
        expect(item.classList.contains('is-unread')).toBe(false)
      })
    })

    it('shows info alert when no unread notifications for mark-all', async () => {
      const readOnly = clone(sampleNotifications).map(n => ({ ...n, is_read: true }))
      await initApp(readOnly)

      document.getElementById('btnMarkAllHistory').click()

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          'No hay notificaciones sin leer.',
          'info'
        )
      })
    })

    it('shows error alert when mark-all fails', async () => {
      globalThis.mutateBackend.mockRejectedValue(new Error('fail'))
      await initApp(sampleNotifications)

      document.getElementById('btnMarkAllHistory').click()

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          'No se pudieron marcar las notificaciones.',
          'danger'
        )
      })
    })
  })

  // ─── 5. Filter notifications ──────────────────────────────────

  describe('5. Filter notifications', () => {
    it('shows only unread notifications when unread filter is active', async () => {
      await initApp(sampleNotifications)

      expect(document.querySelectorAll('.notif-history-item').length).toBe(5)

      document.querySelector('.notif-filter-btn[data-filter="unread"]').click()

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(3)
        items.forEach(item => {
          expect(item.classList.contains('is-unread')).toBe(true)
        })
      })
    })

    it('shows only read notifications when read filter is active', async () => {
      await initApp(sampleNotifications)

      document.querySelector('.notif-filter-btn[data-filter="read"]').click()

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(2)
        items.forEach(item => {
          expect(item.classList.contains('is-unread')).toBe(false)
        })
      })
    })

    it('shows all notifications when all filter is active', async () => {
      await initApp(sampleNotifications)

      document.querySelector('.notif-filter-btn[data-filter="unread"]').click()
      await vi.waitFor(() => {
        expect(document.querySelectorAll('.notif-history-item').length).toBe(3)
      })

      document.querySelector('.notif-filter-btn[data-filter="all"]').click()

      await vi.waitFor(() => {
        expect(document.querySelectorAll('.notif-history-item').length).toBe(5)
      })
    })

    it('updates active class on clicked filter button', async () => {
      await initApp(sampleNotifications)

      expect(document.querySelector('.notif-filter-btn.active').dataset.filter).toBe('all')

      document.querySelector('.notif-filter-btn[data-filter="unread"]').click()

      await vi.waitFor(() => {
        expect(document.querySelector('.notif-filter-btn.active').dataset.filter).toBe('unread')
      })
    })

    it('resets to page 1 when filter changes', async () => {
      const data = manyNotifications(25)
      await initApp(data)

      let items = document.querySelectorAll('.notif-history-item')
      expect(items.length).toBe(15)
      expect(items[0].dataset.notificationId).toBe('1')

      document.getElementById('btnNextPage').click()
      await vi.waitFor(() => {
        items = document.querySelectorAll('.notif-history-item')
        expect(items[0].dataset.notificationId).toBe('16')
      })

      document.querySelector('.notif-filter-btn[data-filter="unread"]').click()

      await vi.waitFor(() => {
        items = document.querySelectorAll('.notif-history-item')
        expect(items[0].dataset.notificationId).toBe('1')
      })
    })
  })

  // ─── 6. Realtime updates ──────────────────────────────────────

  describe('6. Realtime updates', () => {
    it('adds a new notification at the top via sgi:notification-created event', async () => {
      await initApp(sampleNotifications)

      expect(document.querySelectorAll('.notif-history-item').length).toBe(5)

      const newNotif = {
        id: 100,
        title: 'Nueva en tiempo real',
        message: 'Llego ahora mismo',
        type: 'warning',
        is_read: false,
        created_at: '2026-07-20T15:30:00',
        incident_id: 20
      }
      globalThis.dispatchEvent(new CustomEvent('sgi:notification-created', { detail: newNotif }))

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(6)
      })

      const items = document.querySelectorAll('.notif-history-item')
      expect(items[0].dataset.notificationId).toBe('100')
      expect(items[0].querySelector('.notif-history-title').textContent).toBe('Nueva en tiempo real')
    })

    it('does not add duplicate notifications', async () => {
      await initApp(sampleNotifications)

      globalThis.dispatchEvent(
        new CustomEvent('sgi:notification-created', { detail: sampleNotifications[0] })
      )

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(5)
      })
    })

    it('adds multiple notifications via sgi:notifications-refreshed event', async () => {
      await initApp(sampleNotifications)

      expect(document.querySelectorAll('.notif-history-item').length).toBe(5)

      const newItems = [
        { id: 200, title: 'Refreshed 1', message: 'Primera', type: 'assigned', is_read: false, created_at: '2026-07-21T08:00:00' },
        { id: 201, title: 'Refreshed 2', message: 'Segunda', type: 'comment', is_read: true, created_at: '2026-07-21T08:01:00' }
      ]
      globalThis.dispatchEvent(
        new CustomEvent('sgi:notifications-refreshed', { detail: { items: newItems } })
      )

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(7)
      })

      const items = document.querySelectorAll('.notif-history-item')
      expect(items[0].dataset.notificationId).toBe('200')
      expect(items[1].dataset.notificationId).toBe('201')
      expect(items[2].dataset.notificationId).toBe('1')
    })

    it('ignores refresh event with items that already exist', async () => {
      await initApp(sampleNotifications)

      const duplicateItems = [
        { id: 1, title: 'Duplicado', message: 'Ya existe', type: 'assigned', is_read: false, created_at: '2026-07-13T10:00:00' },
        { id: 200, title: 'Nuevo', message: 'No existe', type: 'comment', is_read: true, created_at: '2026-07-21T08:00:00' }
      ]
      globalThis.dispatchEvent(
        new CustomEvent('sgi:notifications-refreshed', { detail: { items: duplicateItems } })
      )

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(6)
      })
    })

    it('does not crash on realtime event with missing detail', async () => {
      await initApp(sampleNotifications)

      globalThis.dispatchEvent(new CustomEvent('sgi:notification-created', {}))

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(5)
      })
    })
  })

  // ─── 7. Pagination ────────────────────────────────────────────

  describe('7. Pagination', () => {
    it('shows first 15 items on page 1', async () => {
      const data = manyNotifications(25)
      await initApp(data)

      const items = document.querySelectorAll('.notif-history-item')
      expect(items.length).toBe(15)
      expect(items[0].dataset.notificationId).toBe('1')
      expect(items[14].dataset.notificationId).toBe('15')

      const pageInfo = document.getElementById('notifPageInfo')
      expect(pageInfo.textContent).toMatch(/Pagina 1 de 2/)
    })

    it('navigates to next page and shows remaining items', async () => {
      const data = manyNotifications(25)
      await initApp(data)

      expect(document.getElementById('btnNextPage').disabled).toBe(false)

      document.getElementById('btnNextPage').click()

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(10)
        expect(items[0].dataset.notificationId).toBe('16')

        const pageInfo = document.getElementById('notifPageInfo')
        expect(pageInfo.textContent).toMatch(/Pagina 2 de 2/)
      })

      expect(document.getElementById('btnNextPage').disabled).toBe(true)
      expect(document.getElementById('btnPrevPage').disabled).toBe(false)
    })

    it('navigates back to previous page', async () => {
      const data = manyNotifications(25)
      await initApp(data)

      document.getElementById('btnNextPage').click()
      await vi.waitFor(() => {
        expect(document.querySelectorAll('.notif-history-item')[0].dataset.notificationId).toBe('16')
      })

      expect(document.getElementById('btnPrevPage').disabled).toBe(false)

      document.getElementById('btnPrevPage').click()

      await vi.waitFor(() => {
        const items = document.querySelectorAll('.notif-history-item')
        expect(items.length).toBe(15)
        expect(items[0].dataset.notificationId).toBe('1')

        const pageInfo = document.getElementById('notifPageInfo')
        expect(pageInfo.textContent).toMatch(/Pagina 1 de 2/)
      })

      expect(document.getElementById('btnPrevPage').disabled).toBe(true)
      expect(document.getElementById('btnNextPage').disabled).toBe(false)
    })

    it('hides pagination controls when there are no items', async () => {
      await initApp([])

      const pagination = document.getElementById('notifHistoryPagination')
      expect(pagination.style.display).toBe('none')
    })

    it('renders page number buttons', async () => {
      const data = manyNotifications(25)
      await initApp(data)

      const pageButtons = document.querySelectorAll('.notif-page-num')
      expect(pageButtons.length).toBe(2)
      expect(pageButtons[0].textContent).toBe('1')
      expect(pageButtons[0].classList.contains('active')).toBe(true)
      expect(pageButtons[1].textContent).toBe('2')

      pageButtons[1].click()

      await vi.waitFor(() => {
        expect(document.querySelectorAll('.notif-history-item')[0].dataset.notificationId).toBe('16')
        expect(document.querySelector('.notif-page-num.active').textContent).toBe('2')
      })
    })
  })
})
