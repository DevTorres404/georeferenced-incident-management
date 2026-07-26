export const CATEGORY_ICON_OPTIONS = Object.freeze([
  'fa-tags',
  'fa-lightbulb',
  'fa-road',
  'fa-water',
  'fa-fire',
  'fa-shield-alt',
  'fa-exclamation-triangle',
  'fa-wrench',
  'fa-building',
  'fa-tree',
  'fa-bus',
  'fa-car-crash',
  'fa-bolt',
  'fa-trash-alt',
  'fa-hospital',
  'fa-broadcast-tower',
  'fa-traffic-light',
  'fa-hard-hat',
  'fa-plug',
  'fa-first-aid',
  'fa-biohazard',
  'fa-tools',
  'fa-paw',
  'fa-cloud-showers-heavy',
  'fa-bullhorn',
  'fa-cog'
])

function normalizeIcon(icon, defaultIcon) {
  const normalizedIcon = String(icon || '').trim()
  return normalizedIcon || defaultIcon
}

export function setCategoryIconPickerValue(inputId, icon, defaultIcon = 'fa-tags') {
  const input = document.getElementById(inputId)
  if (!input) {
    return
  }

  input.value = normalizeIcon(icon, defaultIcon)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export function initializeCategoryIconPicker({
  inputId,
  previewId,
  toggleId,
  panelId,
  gridId,
  defaultIcon = 'fa-tags'
}) {
  const input = document.getElementById(inputId)
  const preview = document.getElementById(previewId)
  const toggle = document.getElementById(toggleId)
  const panel = document.getElementById(panelId)
  const grid = document.getElementById(gridId)

  if (!input || !toggle || !panel || !grid) {
    return null
  }

  const syncVisualState = () => {
    const selectedIcon = normalizeIcon(input.value, defaultIcon)
    input.value = selectedIcon

    if (preview) {
      preview.className = `fas ${selectedIcon}`
    }

    grid.querySelectorAll('[data-category-icon]').forEach(button => {
      const isSelected = button.dataset.categoryIcon === selectedIcon
      button.classList.toggle('btn-primary', isSelected)
      button.classList.toggle('btn-outline-secondary', !isSelected)
      button.setAttribute('aria-pressed', String(isSelected))
    })
  }

  if (grid.dataset.iconPickerInitialized !== 'true') {
    grid.innerHTML = CATEGORY_ICON_OPTIONS.map(icon => `
      <button type="button"
        class="btn btn-sm btn-outline-secondary p-1"
        data-category-icon="${icon}"
        title="${icon}"
        aria-label="Seleccionar icono ${icon}"
        aria-pressed="false"
        style="width: 36px; height: 36px;">
        <i class="fas ${icon}" aria-hidden="true"></i>
      </button>
    `).join('')

    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-category-icon]')
      if (!button) {
        return
      }

      setCategoryIconPickerValue(inputId, button.dataset.categoryIcon, defaultIcon)
      panel.classList.add('d-none')
      toggle.setAttribute('aria-expanded', 'false')
      toggle.focus()
    })
    grid.dataset.iconPickerInitialized = 'true'
  }

  if (toggle.dataset.iconPickerInitialized !== 'true') {
    toggle.addEventListener('click', () => {
      const willOpen = panel.classList.contains('d-none')
      panel.classList.toggle('d-none')
      toggle.setAttribute('aria-expanded', String(willOpen))
      syncVisualState()
    })
    toggle.dataset.iconPickerInitialized = 'true'
  }

  if (input.dataset.iconPickerInitialized !== 'true') {
    input.addEventListener('input', syncVisualState)
    input.form?.addEventListener('reset', () => {
      setTimeout(syncVisualState, 0)
    })
    input.dataset.iconPickerInitialized = 'true'
  }

  syncVisualState()

  return {
    setValue: icon => setCategoryIconPickerValue(inputId, icon, defaultIcon),
    sync: syncVisualState
  }
}
