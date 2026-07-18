/**
 * Utilidades para manipular el DOM
 */

export function $(selector) {
  return document.querySelector(selector);
}

export function $$(selector) {
  return document.querySelectorAll(selector);
}

export function show(element) {
  if (element) {
    element.classList.remove('d-none');
  }
}

export function hide(element) {
  if (element) {
    element.classList.add('d-none');
  }
}

export function showErrorAlert(message) {
  const alert = $('#alertaGlobal');
  if (alert) {
    alert.className = 'alert alert-danger';
    alert.innerHTML = message;
    show(alert);
    setTimeout(() => hide(alert), 5000);
  } else {
    globalThis.alert(message);
  }
}

export function showSuccessAlert(message) {
  const alert = $('#alertaGlobal');
  if (alert) {
    alert.className = 'alert alert-success';
    alert.innerHTML = message;
    show(alert);
    setTimeout(() => hide(alert), 5000);
  }
}

export function showSpinner(spinnerId, buttonId = null) {
  const spinner = findElement(spinnerId);
  if (spinner) show(spinner);
  if (buttonId) {
    const btn = findElement(buttonId);
    if (btn) btn.disabled = true;
  }
}

export function hideSpinner(spinnerId, buttonId = null) {
  const spinner = findElement(spinnerId);
  if (spinner) hide(spinner);
  if (buttonId) {
    const btn = findElement(buttonId);
    if (btn) btn.disabled = false;
  }
}

function findElement(selectorOrId) {
  if (!selectorOrId) return null;
  if (selectorOrId instanceof Element) return selectorOrId;

  const value = String(selectorOrId);
  return document.querySelector(value.startsWith('#') || value.startsWith('.') ? value : `#${value}`);
}

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

export function html(strings, ...values) {
  return strings.reduce((acc, str, i) => {
    const value = values[i - 1];
    const escapedValue = (value === null || value === undefined) ? '' : escapeHtml(value);
    return acc + escapedValue + str;
  });
}

export function delegateEvent(container, selector, eventName, callback) {
  if (typeof container === 'string') {
    container = document.querySelector(container);
  }
  if (!container) return;

  container.addEventListener(eventName, (event) => {
    const targetElement = event.target.closest(selector);
    if (targetElement && container.contains(targetElement)) {
      callback(event, targetElement);
    }
  });
}
