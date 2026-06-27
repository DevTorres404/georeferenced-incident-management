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
    alert(message);
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
