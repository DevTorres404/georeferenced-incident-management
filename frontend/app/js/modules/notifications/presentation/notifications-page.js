import { escapeHtml } from '../../../shared/sanitizer.js?v=20';
import { hidePageLoading, showPageLoading } from '../../incidents/presentation/incidents-ui.js?v=16';

const PER_PAGE = 15;
let currentPage = 1;
let currentFilter = 'all';
let allNotifications = [];

document.addEventListener('DOMContentLoaded', initNotificationsPage);
globalThis.addEventListener('sgi:notification-created', handleRealtimeNotification);
globalThis.addEventListener('sgi:notifications-refreshed', handleNotificationsRefresh);

async function initNotificationsPage() {
  globalThis.renderLayout?.('notifications');

  showPageLoading('Cargando notificaciones', 'Obteniendo historial...');
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 12000);

  try {
    await loadAllNotifications();
    renderList();
    bindActions();
  } catch (error) {
    console.error('[SGI] Error loading notifications:', error);
    showGlobalAlert('Error al cargar las notificaciones.', 'danger');
  } finally {
    globalThis.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

function handleRealtimeNotification(event) {
  const notification = event?.detail;
  if (!notification?.id) return;
  if (allNotifications.some((item) => Number(item.id) === Number(notification.id))) return;

  allNotifications.unshift(notification);
  currentPage = 1;
  renderList();
}

function handleNotificationsRefresh(event) {
  const items = Array.isArray(event?.detail?.items) ? event.detail.items : [];
  const newItems = items.filter((notification) => (
    notification?.id && !allNotifications.some((item) => Number(item.id) === Number(notification.id))
  ));
  if (!newItems.length) return;

  allNotifications = [...newItems, ...allNotifications];
  currentPage = 1;
  renderList();
}

async function loadAllNotifications() {
  let page = 1;
  let hasMore = true;
  allNotifications = [];

  while (hasMore) {
    const response = await requestBackend(`/notifications?per_page=50&page=${page}`, { noCache: true });
    const data = Array.isArray(response?.data) ? response.data : [];
    allNotifications = allNotifications.concat(data);
    hasMore = data.length === 50;
    page++;
    if (page > 20) break;
  }

  allNotifications = allNotifications.filter((notification, index, items) => (
    items.findIndex((item) => Number(item.id) === Number(notification.id)) === index
  ));
}

function renderList() {
  const list = document.getElementById('notifHistoryList');
  const empty = document.getElementById('notifHistoryEmpty');
  if (!list) return;

  const filtered = filterNotifications(allNotifications, currentFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PER_PAGE;
  const pageItems = filtered.slice(start, start + PER_PAGE);

  const existingItems = list.querySelectorAll('.notif-history-item');
  existingItems.forEach((item) => item.remove());

  if (!pageItems.length) {
    if (empty) empty.style.display = 'flex';
    updatePagination(0);
    return;
  }

  if (empty) empty.style.display = 'none';

  const fragment = document.createDocumentFragment();
  pageItems.forEach((notification) => {
    fragment.appendChild(createNotificationElement(notification));
  });
  list.appendChild(fragment);

  updatePagination(filtered.length);
}

function createNotificationElement(notification) {
  const isUnread = !notification.is_read && !notification.isRead;
  const iconClass = getIconClass(notification.type);
  const typeClass = getTypeClass(notification.type);
  const time = formatDateTime(notification.created_at || notification.createdAt);

  const el = document.createElement('div');
  el.className = `notif-history-item ${isUnread ? 'is-unread' : ''}`;
  el.dataset.notificationId = String(notification.id);

  const incidentId = notification.incident_id ?? notification.incidentId ?? '';

  el.innerHTML = `
    <div class="notif-history-icon ${typeClass}">
      <i class="fas ${iconClass}"></i>
    </div>
    <div class="notif-history-body">
      <span class="notif-history-title">${escapeHtml(notification.title || 'Notificación')}</span>
      <span class="notif-history-message">${escapeHtml(notification.message || '')}</span>
      <div class="notif-history-meta">
        <span class="notif-history-time"><i class="far fa-clock mr-1"></i>${escapeHtml(time)}</span>
        <span class="notif-history-status ${isUnread ? 'status-unread' : 'status-read'}">
          <i class="fas fa-circle"></i>${isUnread ? 'No leida' : 'Leida'}
        </span>
      </div>
    </div>
    ${isUnread ? `
    <div class="notif-history-actions">
      <button type="button" class="js-mark-read" data-notification-id="${escapeHtml(String(notification.id))}"
              title="Marcar como leida">
        <i class="fas fa-check"></i>
      </button>
    </div>` : ''}
  `;

  if (incidentId) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.js-mark-read')) return;
      if (isUnread) {
        try {
          await mutateBackend(`/notifications/${notification.id}/read`, { method: 'PATCH' });
        } catch { /* silent */ }
      }
      globalThis.location.href = `/html/incident-detail.html?id=${incidentId}`;
    });
  }

  if (isUnread) {
    el.querySelector('.js-mark-read')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await mutateBackend(`/notifications/${notification.id}/read`, { method: 'PATCH' });
        notification.is_read = true;
        notification.isRead = true;
        el.classList.remove('is-unread');
        const actions = el.querySelector('.notif-history-actions');
        if (actions) actions.remove();
        const status = el.querySelector('.notif-history-status');
        if (status) {
          status.className = 'notif-history-status status-read';
          status.innerHTML = '<i class="fas fa-circle"></i>Leida';
        }
        showGlobalAlert('Notificación marcada como leída.', 'success');
      } catch {
        showGlobalAlert('No se pudo marcar la notificación.', 'danger');
      }
    });
  }

  return el;
}

function filterNotifications(notifications, filter) {
  if (filter === 'unread') return notifications.filter((n) => !n.is_read && !n.isRead);
  if (filter === 'read') return notifications.filter((n) => n.is_read || n.isRead);
  return notifications;
}

function updatePagination(totalItems) {
  const pagination = document.getElementById('notifHistoryPagination');
  const pageInfo = document.getElementById('notifPageInfo');
  const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));

  if (totalItems === 0) {
    if (pagination) pagination.style.display = 'none';
    return;
  }

  if (pagination) pagination.style.display = 'flex';
  if (pageInfo) pageInfo.textContent = `Pagina ${currentPage} de ${totalPages}`;

  const buttons = pagination ? pagination.querySelectorAll('[data-page]') : [];
  const existingNums = pagination ? pagination.querySelectorAll('.notif-page-num') : [];
  existingNums.forEach((el) => el.remove());

  const pageNums = buildPageList(currentPage, totalPages);
  const reference = pagination ? pagination.querySelector('.notif-page-info') : null;

  pageNums.forEach((page) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `notif-page-btn notif-page-num ${page === String(currentPage) ? 'active' : ''}`;
    if (page === 'ellipsis') {
      btn.className = 'notif-page-btn notif-page-num disabled';
      btn.textContent = '...';
      btn.disabled = true;
    } else {
      btn.dataset.page = String(page);
      btn.textContent = String(page);
      btn.addEventListener('click', () => {
        currentPage = Number(page);
        renderList();
        globalThis.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (reference?.parentNode) {
      reference.parentNode.insertBefore(btn, reference.nextSibling);
    }
  });

  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');
  if (btnPrev) btnPrev.disabled = currentPage <= 1;
  if (btnNext) btnNext.disabled = currentPage >= totalPages;
}

function buildPageList(current, last) {
  if (last <= 7) {
    return Array.from({ length: last }, (_, index) => String(index + 1));
  }

  const pages = ['1'];
  const start = Math.max(current - 1, 2);
  const end = Math.min(current + 1, last - 1);

  if (start > 2) pages.push('ellipsis');
  for (let page = start; page <= end; page += 1) pages.push(String(page));
  if (end < last - 1) pages.push('ellipsis');
  pages.push(String(last));

  return pages;
}

function bindActions() {
  document.querySelectorAll('.notif-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.notif-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'all';
      currentPage = 1;
      renderList();
    });
  });

  document.getElementById('btnPrevPage')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderList();
      globalThis.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btnNextPage')?.addEventListener('click', () => {
    const filtered = filterNotifications(allNotifications, currentFilter);
    const totalPages = Math.ceil(filtered.length / PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      renderList();
      globalThis.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btnMarkAllHistory')?.addEventListener('click', async () => {
    const unread = allNotifications.filter((n) => !n.is_read && !n.isRead);
    if (!unread.length) {
      showGlobalAlert('No hay notificaciones sin leer.', 'info');
      return;
    }
    try {
      await mutateBackend('/notifications/mark-all-read', { method: 'PATCH' });
      allNotifications.forEach((n) => { n.is_read = true; n.isRead = true; });
      renderList();
      showGlobalAlert('Todas las notificaciones marcadas como leidas.', 'success');
    } catch {
      showGlobalAlert('No se pudieron marcar las notificaciones.', 'danger');
    }
  });
}

function getIconClass(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('assigned') || value.includes('asign')) return 'fa-user-check';
  if (value.includes('status') || value.includes('cambio')) return 'fa-sync-alt';
  if (value.includes('closed') || value.includes('resolved') || value.includes('resuelta')) return 'fa-check-circle';
  if (value.includes('comment') || value.includes('comentario')) return 'fa-comment-dots';
  if (value.includes('overdue') || value.includes('vencida')) return 'fa-exclamation-triangle';
  if (value.includes('warning')) return 'fa-clock';
  if (value.includes('error') || value.includes('danger')) return 'fa-times-circle';
  return 'fa-info-circle';
}

function getTypeClass(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('assigned') || value.includes('asign')) return 'type-assigned';
  if (value.includes('closed') || value.includes('resolved') || value.includes('resuelta')) return 'type-closed';
  if (value.includes('status') || value.includes('cambio')) return 'type-info';
  if (value.includes('comment') || value.includes('comentario')) return 'type-info';
  if (value.includes('overdue') || value.includes('vencida')) return 'type-warning';
  if (value.includes('warning')) return 'type-warning';
  if (value.includes('error') || value.includes('danger')) return 'type-danger';
  if (value.includes('success')) return 'type-success';
  return 'type-info';
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
