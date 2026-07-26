const CATEGORY_REQUEST_TARGET = '/html/category-management.html#tabRequests'

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .trim()
}

export function isCategoryRequestNotification(notification = {}) {
  if (notification.type === 'CATEGORY_REQUEST') {
    return true
  }

  const title = normalizeText(notification.title)
  return title.includes('nueva solicitud de categoria')
}

export function getNotificationTarget(notification = {}) {
  if (isCategoryRequestNotification(notification)) {
    return CATEGORY_REQUEST_TARGET
  }

  const incidentId = notification.incident_id ?? notification.incidentId
  return incidentId ?
    `/html/incident-detail.html?id=${encodeURIComponent(incidentId)}` :
    null
}
