'use strict'

export function showMainLoader() {
  const loader = document.getElementById('pageLoader')
  if (!loader) {
    return
  }

  loader.removeAttribute('hidden')
  loader.classList.remove('d-none')
  loader.setAttribute('aria-hidden', 'false')
  loader.style.display = 'flex'
}

export function hideMainLoader() {
  const loader = document.getElementById('pageLoader')
  if (!loader) {
    return
  }

  loader.setAttribute('hidden', '')
  loader.classList.add('d-none')
  loader.setAttribute('aria-hidden', 'true')
  loader.style.display = 'none'
}
