import { $, $$, hideSpinner, showErrorAlert, showSpinner, showSuccessAlert } from '../../../presentation/dom-utils.js?v=14'
import { hidePageLoading, showPageLoading } from './incidents-ui.js?v=16'
import { getCatalogOverview } from '../../catalogs/application/catalogs-service.js?v=14'
import { createIncident, uploadIncidentAttachment } from '../application/incidents-service.js?v=15'
import { handleBackendErrors, setFieldError, clearFieldError } from '../../../shared/validators/validation-utils.js?v=1'
import { createCoordinatePicker } from '../../../shared/components/coordinate-picker.js?v=4'
import { hasPermission } from '../../../core/auth-session.js?v=16'
import {
  getTerritorialChildren,
  listTerritorialCantons,
  listTerritorialParishes,
  listTerritorialProvinces
} from '../../territorial-units/application/territorial-unit-service.js?v=2'

const STEPS = ['location', 'evidence', 'details', 'review']
const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024
const ALLOWED_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
const INCIDENT_CREATE_INITIAL_CENTER = [-78.55, -1.7]
const INCIDENT_CREATE_INITIAL_ZOOM = 6.15
const DRAFT_STORAGE_KEY = 'SGI_incident_draft'
const OTHER_SUBCATEGORY_VALUE = '__OTHER__'

let currentStepIndex = 0
let catalogs = {}
let coordinatePicker = null
let territorialProvinces = []
const lastAutofilledAddress = ''
let evidenceFiles = []
let isSubmitting = false
const territorialChildrenCache = new Map()
const manualTerritoryFields = {
  sector: 'fManualSector'
}
const selectTerritoryFields = {
  province: 'fTerritorialProvince',
  canton: 'fTerritorialCanton',
  parish: 'fTerritorialParish'
}

// ─── Auto-save: borrador del wizard ──────────────────────────────

export function getFormValue(id) {
  const el = document.getElementById(id)
  if (!el) {
    return ''
  }

  if (el.type === 'checkbox' || el.type === 'radio') {
    return el.checked ? '1' : ''
  }

  return el.value
}

export function setFormValue(id, value) {
  const el = document.getElementById(id)
  if (!el || value === undefined || value === null || value === '') {
    return
  }

  if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = value === '1' || value === true; return
  }

  el.value = value
}

const DRAFT_FIELDS = [
  'fTitulo',
  'fDescripcion',
  'fTipo',
  'fSubtipo',
  'fClassificationDetail',
  'fDireccion',
  'fReferencia',
  'fLatitud',
  'fLongitud',
  'fCorreo',
  'fTerritorialProvince',
  'fTerritorialCanton',
  'fTerritorialParish',
  'fManualSector',
  'fConfirmacion'
]

export function saveDraft() {
  if (isSubmitting) {
    return
  }

  try {
    const data = {}
    DRAFT_FIELDS.forEach(id => {
      data[id] = getFormValue(id)
    })
    data._currentStep = currentStepIndex
    data._savedAt = Date.now()
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data))
  } catch { /* localStorage lleno o no disponible — no crítico */ }
}

export function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      return false
    }

    const data = JSON.parse(raw)

    DRAFT_FIELDS.forEach(id => {
      if (id in data) {
        setFormValue(id, data[id])
      }
    })

    if (typeof data._currentStep === 'number' && data._currentStep > 0) {
      currentStepIndex = data._currentStep
    }

    return true
  } catch {
    return false
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch { /* no crítico */ }
}

export function hasDraft() {
  try {
    return localStorage.getItem(DRAFT_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

async function restoreDraftTerritorial() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      return
    }

    const data = JSON.parse(raw)

    const provinceId = data.fTerritorialProvince
    if (!provinceId) {
      return
    }

    const provinceEl = $('#fTerritorialProvince')
    if (provinceEl) {
      provinceEl.value = String(provinceId)
      await populateTerritorialLevel('province')
    }

    const cantonId = data.fTerritorialCanton
    if (!cantonId || !provinceId) {
      return
    }

    const cantonEl = $('#fTerritorialCanton')
    if (cantonEl) {
      cantonEl.value = String(cantonId)
      await populateTerritorialLevel('canton')
    }

    const parishId = data.fTerritorialParish
    if (!parishId || !cantonId) {
      return
    }

    const parishEl = $('#fTerritorialParish')
    if (parishEl) {
      parishEl.value = String(parishId)
      await populateTerritorialLevel('parish')
    }
  } catch { /* no crítico */ }
}

function bindAutoSave() {
  const debouncedSave = (() => {
    let timer = null
    return () => {
      if (timer) {
        clearTimeout(timer)
      }

      timer = setTimeout(saveDraft, 500)
    }
  })()

  DRAFT_FIELDS.forEach(id => {
    const el = document.getElementById(id)
    if (!el) {
      return
    }

    el.addEventListener('input', debouncedSave)
    el.addEventListener('change', debouncedSave)
  })
}

// ────────────────────────────────────────────────

export async function initCreateIncident() {
  if (!(await authorizeIncidentCreation())) {
    return
  }

  hydrateContactEmail()

  if (restoreDraft()) {
    // Se restauró un borrador; mostrar indicador sutil
    const banner = document.getElementById('draftBanner')
    if (banner) {
      banner.classList.remove('d-none')
    }
  }

  bindEvents()
  bindAutoSave()
  bindCounters()
  renderEvidencePreviews()
  renderStep()
  updateLocationSummary()

  showPageLoading('Cargando formulario', 'Preparando mapa y catalogos...')
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 12000)

  try {
    catalogs = await getCatalogOverview()
    populateCatalogs()
    await populateTerritorialProvinces()
    await restoreDraftTerritorial()
  } catch (error) {
    showErrorAlert(error.message || 'No se pudieron cargar los datos iniciales.')
  } finally {
    globalThis.clearTimeout(loadingFallback)
    hidePageLoading()
  }

  coordinatePicker = createCoordinatePicker({
    mapId: 'incidentLocationMap',
    latitudeInputId: 'fLatitud',
    longitudeInputId: 'fLongitud',
    center: INCIDENT_CREATE_INITIAL_CENTER,
    zoom: INCIDENT_CREATE_INITIAL_ZOOM,
    selectedZoom: 16,
    onReverseGeocode: applyReverseGeocode
  })

  coordinatePicker?.map?.once('load', () => {
    coordinatePicker.map.jumpTo({
      center: INCIDENT_CREATE_INITIAL_CENTER,
      zoom: INCIDENT_CREATE_INITIAL_ZOOM
    })
  })
}

async function authorizeIncidentCreation() {
  try {
    if (typeof globalThis.renderLayout === 'function') {
      await globalThis.renderLayout('incident-create')
      // renderLayout already redirected to the default page.
      return hasPermission('incidents.create')
    }
  } catch (error) {
    console.warn('authorizeIncidentCreation: renderLayout failed', error)
  }

  return false
}

document.addEventListener('DOMContentLoaded', () => {
  initCreateIncident()
})

function bindEvents() {
  $('#btnNextStep')?.addEventListener('click', goNext)
  $('#btnPrevStep')?.addEventListener('click', goPrevious)
  $('#formNuevaIncidencia')?.addEventListener('submit', handleSubmit)

  $('#formNuevaIncidencia')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') {
        return
      }

      e.preventDefault()
      if (activeStep !== 'review') {
        goNext()
      } else {
        $('#btnRegistrar')?.click()
      }
    }
  })

  $$('.wizard-step-button').forEach(button => {
    button.addEventListener('click', () => goToStep(button.dataset.stepTarget))
  })

  $('#fTipo')?.addEventListener('change', populateSubcategories)
  $('#fSubtipo')?.addEventListener('change', syncClassificationFallbackUi)
  $('#fTerritorialProvince')?.addEventListener('change', () => populateTerritorialLevel('province'))
  $('#fTerritorialCanton')?.addEventListener('change', () => populateTerritorialLevel('canton'))
  // Parroquia no tiene hijos que popular ahora que sector es manual
  $('#fTerritorialParish')?.addEventListener('change', updateLocationSummary);

  ['fDireccion', 'fReferencia', 'fLatitud', 'fLongitud'].forEach(id => {
    $(`#${id}`)?.addEventListener('input', e => {
      updateLocationSummary()
    })
  });

  ['fTerritorialProvince', 'fTerritorialCanton', 'fTerritorialParish'].forEach(id => {
    $(`#${id}`)?.addEventListener('change', updateLocationSummary)
  })

  Object.values(manualTerritoryFields).forEach(id => {
    $(`#${id}`)?.addEventListener('input', () => {
      clearFieldError(id)
      updateLocationSummary()
    })
  })

  $('#fTitulo')?.addEventListener('input', () => updateCounter('fTitulo', 'cntTitulo', 120))
  $('#fDescripcion')?.addEventListener('input', () => updateCounter('fDescripcion', 'cntDescripcion', 1000))

  bindEvidenceEvents()
}

function bindEvidenceEvents() {
  const dropzone = $('#evidenceDropzone')
  const fileInput = $('#fEvidence')

  dropzone?.addEventListener('click', () => fileInput?.click())
  dropzone?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      fileInput?.click()
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone?.addEventListener(eventName, event => {
      event.preventDefault()
      dropzone.classList.add('is-dragging')
    })
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone?.addEventListener(eventName, event => {
      event.preventDefault()
      dropzone.classList.remove('is-dragging')
    })
  })

  dropzone?.addEventListener('drop', event => addEvidenceFiles(event.dataTransfer?.files || []))
  fileInput?.addEventListener('change', event => {
    addEvidenceFiles(event.target.files || [])
    event.target.value = ''
  })

  $('#btnAddEvidence')?.addEventListener('click', () => fileInput?.click())
  $('#evidencePreviewList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-evidence]')
    if (button) {
      removeEvidenceFile(button.dataset.removeEvidence)
    }
  })
}

export function goNext() {
  if (!validateCurrentStep()) {
    return
  }

  if (currentStepIndex < STEPS.length - 1) {
    currentStepIndex += 1
    renderStep()
  }
}

export function goPrevious() {
  if (currentStepIndex > 0) {
    currentStepIndex -= 1
    renderStep()
  }
}

export function goToStep(stepName) {
  const targetIndex = STEPS.indexOf(stepName)
  if (targetIndex < 0 || targetIndex === currentStepIndex) {
    return
  }

  if (targetIndex < currentStepIndex || validateUntil(targetIndex)) {
    currentStepIndex = targetIndex
    renderStep()
  }
}

export function renderStep() {
  const activeStep = STEPS[currentStepIndex]

  $$('[data-step-panel]').forEach(panel => {
    panel.classList.toggle('d-none', panel.dataset.stepPanel !== activeStep)
  })

  $$('.wizard-step-button').forEach((button, index) => {
    button.classList.toggle('is-active', index === currentStepIndex)
    button.classList.toggle('is-complete', index < currentStepIndex)
  })

  const prevButton = $('#btnPrevStep')
  const nextButton = $('#btnNextStep')
  const submitButton = $('#btnRegistrar')

  if (prevButton) {
    prevButton.disabled = currentStepIndex === 0
  }

  nextButton?.classList.toggle('d-none', activeStep === 'review')
  submitButton?.classList.toggle('d-none', activeStep !== 'review')

  if (activeStep === 'review') {
    renderSummary()
  }

  coordinatePicker?.invalidateSize()

  saveDraft()
}

export function populateCatalogs() {
  const categories = [...(catalogs.categories || [])]
    .sort((left, right) => Number(Boolean(left.is_fallback)) - Number(Boolean(right.is_fallback)))
    .map(category => ({
      ...category,
      name: category.is_fallback ? 'No encuentro el tipo de incidencia' : category.name
    }))

  fillSelect($('#fTipo'), categories, 'Seleccione tipo')
  fillSelect($('#fSubtipo'), [], 'Primero seleccione tipo')
  setDisabled('#fSubtipo', true)
  syncClassificationFallbackUi()
}

export function populateSubcategories() {
  const categoryId = $('#fTipo')?.value
  const category = (catalogs.categories || []).find(item => String(item.id) === String(categoryId))
  const isFallback = Boolean(category?.is_fallback)
  const options = isFallback ?
    [] :
    [
      ...(category?.subcategories || []),
      ...(category ? [{ id: OTHER_SUBCATEGORY_VALUE, name: 'Otro problema de esta categoría' }] : [])
    ]

  fillSelect($('#fSubtipo'), options, isFallback ? 'No aplica' : 'Seleccione subtipo')
  setDisabled('#fSubtipo', isFallback || options.length === 0)
  clearFieldError('fSubtipo')
  syncClassificationFallbackUi()
}

export function requiresClassificationReview() {
  const categoryId = String($('#fTipo')?.value || '')
  const category = (catalogs.categories || [])
    .find(item => String(item.id) === categoryId)

  return Boolean(category?.is_fallback) ||
    $('#fSubtipo')?.value === OTHER_SUBCATEGORY_VALUE
}

export function syncClassificationFallbackUi() {
  const pending = requiresClassificationReview()
  $('#classificationPendingNotice')?.classList.toggle('d-none', !pending)
  $('#classificationDetailGroup')?.classList.toggle('d-none', !pending)

  const detail = $('#fClassificationDetail')
  if (detail) {
    detail.required = pending
    if (!pending) {
      detail.value = ''
      clearFieldError('fClassificationDetail')
    }
  }
}

export async function populateTerritorialProvinces() {
  try {
    territorialProvinces = await listTerritorialProvinces()
    fillSelect($('#fTerritorialProvince'), territorialProvinces, 'Seleccione provincia')
    setDisabled('#fTerritorialProvince', territorialProvinces.length === 0)
    setManualTerritoryMode('province', territorialProvinces.length === 0)
  } catch (error) {
    territorialProvinces = []
    setDisabled('#fTerritorialProvince', true)
    setManualTerritoryMode('province', true)
    showErrorAlert(error.message || 'No se pudieron cargar las provincias.')
  }
}

export async function populateTerritorialLevel(level) {
  const config = {
    province: {
      source: 'fTerritorialProvince',
      target: 'fTerritorialCanton',
      reset: ['fTerritorialParish'],
      placeholder: 'Seleccione canton'
    },
    canton: {
      source: 'fTerritorialCanton',
      target: 'fTerritorialParish',
      reset: [],
      placeholder: 'Seleccione parroquia'
    }
  }[level]

  if (!config) {
    return
  }

  config.reset.forEach(id => {
    fillSelect($(`#${id}`), [], 'Seleccione')
    setDisabled(`#${id}`, true)
  })
  resetManualTerritoryFields(config.reset)

  const parentId = $(`#${config.source}`)?.value
  fillSelect($(`#${config.target}`), [], config.placeholder)
  setDisabled(`#${config.target}`, true)
  setManualTerritoryMode(levelToManualKey(config.target), false)

  if (!parentId) {
    updateLocationSummary()
    return
  }

  try {
    const children = await getTerritorialChildrenCached(parentId, level)
    fillSelect($(`#${config.target}`), children, children.length ? config.placeholder : 'Sin registros disponibles')
    setDisabled(`#${config.target}`, children.length === 0)
    setManualTerritoryMode(levelToManualKey(config.target), children.length === 0)
  } catch (error) {
    setManualTerritoryMode(levelToManualKey(config.target), true)
    showErrorAlert(error.message || 'No se pudo cargar la division territorial.')
  } finally {
    updateLocationSummary()
  }
}

async function getTerritorialChildrenCached(parentId, level = '') {
  const key = `${level}:${parentId}`
  if (!territorialChildrenCache.has(key)) {
    territorialChildrenCache.set(
      key,
      level === 'province' ?
        await listTerritorialCantons(parentId) :
        (level === 'canton' ?
          await listTerritorialParishes(parentId) :
          await getTerritorialChildren(parentId))
    )
  }

  return territorialChildrenCache.get(key) || []
}

export async function applyReverseGeocode(result) {
  const address = result?.address || {}
  const approximateAddress = buildApproximateAddress(result)
  const addressInput = $('#fDireccion')

  if (addressInput) {
    if (result === null) {
      addressInput.value = ''
    } else if (approximateAddress) {
      addressInput.value = approximateAddress
    }
  }

  // Actualizar el resumen visual de la dirección antes de buscar el territorio
  updateLocationSummary()

  try {
    await selectTerritorialFromAddress(address)
  } catch (error) {
    console.warn('Error al mapear territorio desde dirección:', error)
  } finally {
    // Actualizar nuevamente por si el territorio cambió
    updateLocationSummary()
  }
}

export function buildApproximateAddress(result) {
  const address = result?.address || {}
  return [
    address.road || address.pedestrian || address.footway,
    address.neighbourhood || address.suburb || address.city_district,
    address.city || address.town || address.village || address.county,
    address.state
  ].filter(Boolean).join(', ') || result?.display_name || ''
}

export async function selectTerritorialFromAddress(address) {
  const provinceName = address.state || address.region || address.plot
  const cantonName = address.county || address.city || address.town || address.municipality
  const parishName = address.city_district || address.suburb || address.village || address.neighbourhood

  const province = findUnitByName(territorialProvinces, provinceName)
  if (!province) {
    setSelectValue('fTerritorialProvince', '')
    await populateTerritorialLevel('province')
    setManualTerritoryValue('province', provinceName)
    setManualTerritoryValue('canton', cantonName)
    setManualTerritoryValue('parish', parishName)
    return
  }

  setSelectValue('fTerritorialProvince', province.id)
  await populateTerritorialLevel('province')

  const cantons = await getTerritorialChildrenCached(province.id, 'province')
  const canton = findUnitByName(cantons, cantonName)
  if (!canton) {
    setSelectValue('fTerritorialCanton', '')
    await populateTerritorialLevel('canton')
    setManualTerritoryValue('canton', cantonName)
    setManualTerritoryValue('parish', parishName)
    return
  }

  setSelectValue('fTerritorialCanton', canton.id)
  await populateTerritorialLevel('canton')

  const parishes = await getTerritorialChildrenCached(canton.id, 'canton')
  const parish = findUnitByName(parishes, parishName)
  if (!parish) {
    setSelectValue('fTerritorialParish', '')
    await populateTerritorialLevel('parish')
    setManualTerritoryValue('parish', parishName)
    return
  }

  setSelectValue('fTerritorialParish', parish.id)
  await populateTerritorialLevel('parish')
}

export function setSelectValue(id, value) {
  const select = $(`#${id}`)
  if (!select) {
    return
  }

  select.value = String(value)
  clearFieldError(id)
}

export function findUnitByName(units, value) {
  const target = normalizeLocationName(value)
  if (!target) {
    return null
  }

  return (units || []).find(unit => normalizeLocationName(unit.name) === target) ||
    (units || []).find(unit => {
      const name = normalizeLocationName(unit.name)
      return name.includes(target) || target.includes(name)
    }) ||
    null
}

export function normalizeLocationName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^\d\sA-Za-z]/g, ' ')
    .replace(/\b(provincia|canton|parroquia|sector|barrio|de|del|la|el|los|las)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function addEvidenceFiles(fileList) {
  clearEvidenceError();
  [...fileList].forEach(file => {
    if (!ALLOWED_EVIDENCE_TYPES.includes(file.type)) {
      setEvidenceError('Solo se permiten imagenes JPG, PNG, WebP o videos MP4, WebM.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setEvidenceError('Cada archivo debe pesar máximo 50 MB.')
      return
    }

    evidenceFiles.push({
      id: createClientId(),
      file,
      previewUrl: URL.createObjectURL(file)
    })
  })

  renderEvidencePreviews()
}

export function removeEvidenceFile(id) {
  const item = evidenceFiles.find(entry => entry.id === id)
  if (item?.previewUrl) {
    URL.revokeObjectURL(item.previewUrl)
  }

  evidenceFiles = evidenceFiles.filter(entry => entry.id !== id)
  renderEvidencePreviews()
}

export function renderEvidencePreviews() {
  const container = $('#evidencePreviewList')
  const count = $('#evidenceCount')
  if (count) {
    count.textContent = String(evidenceFiles.length)
  }

  if (!container) {
    return
  }

  container.replaceChildren()

  if (evidenceFiles.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'evidence-empty'
    empty.textContent = 'Aún no has cargado fotos ni videos.'
    container.appendChild(empty)
    return
  }

  evidenceFiles.forEach(item => {
    const card = document.createElement('article')
    card.className = 'evidence-card'

    const meta = document.createElement('div')
    meta.className = 'evidence-card-meta'

    const name = document.createElement('strong')
    name.textContent = item.file.name

    const size = document.createElement('span')
    size.textContent = formatFileSize(item.file.size)

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'btn btn-sm btn-outline-danger'
    removeButton.dataset.removeEvidence = item.id
    removeButton.innerHTML = '<i class="fas fa-trash-alt"></i>'
    removeButton.setAttribute('aria-label', `Eliminar ${item.file.name}`)

    meta.append(name, size, removeButton)

    const isVideo = item.file.type.startsWith('video/')

    if (isVideo) {
      const video = document.createElement('video')
      video.src = item.previewUrl
      video.controls = true
      video.muted = true
      video.preload = 'metadata'
      video.style.width = '100%'
      video.style.maxHeight = '180px'
      video.style.borderRadius = '0.5rem'
      video.style.objectFit = 'cover'
      card.append(video, meta)
    } else {
      const image = document.createElement('img')
      image.src = item.previewUrl
      image.alt = item.file.name
      card.append(image, meta)
    }

    container.appendChild(card)
  })
}

export async function handleSubmit(event) {
  event.preventDefault()

  if (!validateUntil(STEPS.length - 1)) {
    renderStep()
    showFormAlert('Revisa los campos marcados antes de registrar la incidencia.', 'warning')
    return
  }

  if (!validateReview()) {
    currentStepIndex = STEPS.indexOf('review')
    renderStep()
    showFormAlert('Confirma la información antes de registrar la incidencia.', 'warning')
    return
  }

  const payload = {
    title: $('#fTitulo').value.trim(),
    description: $('#fDescripcion').value.trim(),
    category_id: Number($('#fTipo').value),
    subcategory_id: $('#fSubtipo').value && $('#fSubtipo').value !== OTHER_SUBCATEGORY_VALUE ?
      Number($('#fSubtipo').value) :
      null,
    address_reference: buildAddressText(),
    latitude: Number($('#fLatitud').value),
    longitude: Number($('#fLongitud').value),
    territorial_unit_id: getSelectedTerritorialUnitId(),
    classification_detail: requiresClassificationReview() ?
      $('#fClassificationDetail')?.value.trim() :
      null
  }

  isSubmitting = true
  showSpinner('spinnerRegistrar', 'btnRegistrar')

  try {
    const response = await createIncident(payload)
    const incident = response?.data || response

    if (!incident?.id) {
      showErrorAlert('No se pudo registrar la incidencia.')
      return
    }

    // Limpiamos el borrador apenas se registra la incidencia base para evitar restauraciones fantasma
    clearDraft()

    try {
      await Promise.all(
        evidenceFiles.map(item => uploadIncidentAttachment(incident.id, item.file))
      )
    } catch (photoError) {
      console.warn('Algunas evidencias no pudieron subirse por límite de tasa u error de red:', photoError)
      // No abortamos la redirección, la incidencia principal ya se registró.
    }

    const successMessage = requiresClassificationReview() ?
      'Incidencia registrada. Un supervisor revisará su clasificación antes de asignarla.' :
      (response?.message || 'Incidencia registrada con éxito.')
    showSuccessAlert(successMessage)
    globalThis.setTimeout(() => {
      globalThis.location.href = `incident-detail.html?id=${encodeURIComponent(incident.id)}`
    }, 1000)
  } catch (error) {
    handleBackendErrors(error, document.getElementById('formNuevaIncidencia'))
    showErrorAlert(error.message || 'No se pudo registrar la incidencia.')
  } finally {
    isSubmitting = false
    hideSpinner('spinnerRegistrar', 'btnRegistrar')
  }
}

export function validateUntil(targetIndex) {
  for (let index = 0; index < targetIndex; index += 1) {
    if (!validateStep(STEPS[index])) {
      currentStepIndex = index
      return false
    }
  }

  return true
}

export function validateCurrentStep() {
  return validateStep(STEPS[currentStepIndex])
}

export function validateStep(step) {
  if (step === 'location') {
    return validateLocation()
  }

  if (step === 'evidence') {
    return validateEvidence()
  }

  if (step === 'details') {
    return validateDetails()
  }

  if (step === 'review') {
    return validateReview()
  }

  return true
}

export function validateLocation() {
  let valid = true
  valid = validateRequiredCoordinatePair() && valid

  // Si hay coordenadas pero no hay provincia seleccionada, advertencia cruzada
  const lat = String($('#fLatitud')?.value || '').trim()
  const lng = String($('#fLongitud')?.value || '').trim()
  const province = String($('#fTerritorialProvince')?.value || '').trim()

  const locationPanel = $('[data-step-panel="location"]')
  let hint = document.getElementById('locationStepHint')
  if (lat && lng && !province) {
    if (!hint && locationPanel) {
      hint = document.createElement('div')
      hint.id = 'locationStepHint'
      hint.className = 'alert alert-info mt-2 mb-0 py-2 small'
      locationPanel.appendChild(hint)
    }

    if (hint) {
      hint.textContent = 'Tienes coordenadas pero no seleccionaste provincia. Se detectará automáticamente al registrar.'
      hint.style.display = 'block'
    }
  } else if (hint) {
    hint.style.display = 'none'
  }

  updateLocationSummary()
  return valid
}

export function validateEvidence() {
  clearEvidenceError()
  if (evidenceFiles.length === 0) {
    setEvidenceError('Debe subir al menos una foto o video como evidencia.')
    return false
  }

  return true
}

function showCategoryHint(categoryId) {
  const category = (catalogs.categories || []).find(item => String(item.id) === String(categoryId))
  const detailsPanel = $('[data-step-panel="details"]')
  let detailsHint = document.getElementById('detailsStepHint')
  if (category?.name && /accidente|desastre|siniestro|vehicular|incendio/i.test(category.name)) {
    if (!detailsHint && detailsPanel) {
      detailsHint = document.createElement('div')
      detailsHint.id = 'detailsStepHint'
      detailsHint.className = 'alert alert-info mt-2 mb-0 py-2 small'
      detailsPanel.appendChild(detailsHint)
    }

    if (detailsHint) {
      detailsHint.textContent = 'Recomendación: para este tipo de incidencia, adjunta una foto o video como evidencia en el siguiente paso.'
      detailsHint.style.display = 'block'
    }
  } else if (detailsHint) {
    detailsHint.style.display = 'none'
  }
}

export function validateDetails() {
  let valid = true
  valid = validateText('fTitulo', 5, 'Ingresa un título de al menos 5 caracteres.') && valid
  valid = validateTextMax('fTitulo', 120, 'El título no debe superar 120 caracteres.') && valid
  valid = validateSelect('fTipo', 'Selecciona el tipo de incidencia.') && valid

  // Validación cruzada: si hay categoría, subtipo debe ser coherente
  const categoryId = String($('#fTipo')?.value || '').trim()
  const subcategorySelect = $('#fSubtipo')
  if (categoryId && subcategorySelect && subcategorySelect.options.length > 0) {
    const category = (catalogs.categories || [])
      .find(item => String(item.id) === categoryId)
    if (!category?.is_fallback) {
      valid = validateSelect('fSubtipo', 'Selecciona el subtipo de incidencia.') && valid
    }
  }

  if (requiresClassificationReview()) {
    valid = validateText(
      'fClassificationDetail',
      10,
      'Describe el tipo de problema con al menos 10 caracteres.'
    ) && valid
    valid = validateTextMax(
      'fClassificationDetail',
      1000,
      'La descripción de clasificación no debe superar 1000 caracteres.'
    ) && valid
  }

  valid = validateText('fDescripcion', 20, 'Describe la incidencia con al menos 20 caracteres.') && valid
  valid = validateTextMax('fDescripcion', 1000, 'La descripción no debe superar 1000 caracteres.') && valid
  valid = validateEmail('fCorreo') && valid

  showCategoryHint(categoryId)

  return valid
}

export function validateReview() {
  if (!$('#fConfirmacion')?.checked) {
    setFieldError('fConfirmacion', 'Confirma la información antes de registrar.')
    return false
  }

  clearFieldError('fConfirmacion')
  return true
}

export function validateText(id, minLength, message) {
  const value = String($(`#${id}`)?.value || '').trim()
  if (value.length < minLength) {
    setFieldError(id, message)
    return false
  }

  clearFieldError(id)
  return true
}

export function validateTextMax(id, maxLength, message) {
  const value = String($(`#${id}`)?.value || '').trim()
  if (value.length > maxLength) {
    setFieldError(id, message)
    return false
  }

  return true
}

export function validateSelect(id, message) {
  if (!String($(`#${id}`)?.value || '').trim()) {
    setFieldError(id, message)
    return false
  }

  clearFieldError(id)
  return true
}

export function validateEmail(id) {
  const value = String($(`#${id}`)?.value || '').trim()
  if (!value) {
    setFieldError(id, 'Ingresa un correo de contacto.')
    return false
  }

  if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(value)) {
    setFieldError(id, 'Ingresa un correo valido.')
    return false
  }

  clearFieldError(id)
  return true
}

export function validateRequiredCoordinatePair() {
  const latitudeValue = String($('#fLatitud')?.value || '').trim()
  const longitudeValue = String($('#fLongitud')?.value || '').trim()
  let valid = true

  if (!latitudeValue) {
    setFieldError('fLatitud', 'Selecciona un punto en el mapa o ingresa la latitud.')
    valid = false
  } else {
    valid = validateCoordinate('fLatitud', -5.5, 2, 'La latitud debe estar dentro del territorio ecuatoriano (-5.5 a 2.0).') && valid
  }

  if (!longitudeValue) {
    setFieldError('fLongitud', 'Selecciona un punto en el mapa o ingresa la longitud.')
    valid = false
  } else {
    valid = validateCoordinate('fLongitud', -92.5, -75, 'La longitud debe estar dentro del territorio ecuatoriano (-92.5 a -75.0).') && valid
  }

  return valid
}

function validateCoordinate(id, min, max, message) {
  const number = Number($(`#${id}`)?.value)
  if (!Number.isFinite(number) || number < min || number > max) {
    setFieldError(id, message)
    return false
  }

  clearFieldError(id)
  return true
}

function validateTerritorialSelection() {
  if (!$('#fTerritorialProvince')?.value) {
    setFieldError('fTerritorialProvince', 'Selecciona la provincia.')
    return false
  }

  if (!$('#fTerritorialCanton')?.value) {
    setFieldError('fTerritorialCanton', 'Selecciona el canton.')
    return false
  }

  if (!$('#fTerritorialParish')?.value) {
    setFieldError('fTerritorialParish', 'Selecciona la parroquia.')
    return false
  }

  clearFieldError('fTerritorialProvince')
  clearFieldError('fTerritorialCanton')
  clearFieldError('fTerritorialParish')
  return true
}

export function renderSummary() {
  const container = $('#resumenIncidencia')
  if (!container) {
    return
  }

  container.replaceChildren(
    createReviewSection('Ubicación', [
      ['Dirección', $('#fDireccion')?.value || 'No especificada'],
      ['Referencia', $('#fReferencia')?.value || 'No especificada'],
      ['Territorio', selectedTerritorialPath()],
      ['Coordenadas', formatCoordinates()]
    ]),
    createReviewSection('Evidencia adjunta', [
      ['Archivos cargados', `${evidenceFiles.length} archivo(s)`]
    ]),
    createReviewSection('Información general', [
      ['Título', $('#fTitulo')?.value],
      ['Tipo', selectedText('fTipo')],
      ['Subtipo', selectedText('fSubtipo')],
      ...(requiresClassificationReview() ?
        [
          ['Clasificación', 'Pendiente de revisión'],
          ['Detalle para clasificación', $('#fClassificationDetail')?.value]
        ] :
        []),
      ['Correo de contacto', $('#fCorreo')?.value],
      ['Descripción', $('#fDescripcion')?.value]
    ])
  )
}

function createReviewSection(title, rows) {
  const section = document.createElement('section')
  section.className = 'review-section'

  const heading = document.createElement('h4')
  heading.textContent = title
  section.appendChild(heading)

  rows.forEach(([label, value]) => {
    const row = document.createElement('div')
    row.className = 'review-row'

    const key = document.createElement('span')
    key.textContent = label

    const content = document.createElement('strong')
    content.textContent = value || 'No especificado'

    row.append(key, content)
    section.appendChild(row)
  })

  return section
}

export function updateLocationSummary() {
  const address = $('#fDireccion')?.value?.trim()
  const lat = $('#fLatitud')?.value?.trim()
  const lng = $('#fLongitud')?.value?.trim()
  const territory = selectedTerritorialPath()
  const hasCoordinates = lat && lng
  const hasTerritory = territory !== 'No especificada'

  setText('#selectedLocationText', address || (hasCoordinates ? 'Punto seleccionado en el mapa' : 'Sin ubicación seleccionada'))
  setText('#selectedTerritoryText', hasTerritory ? territory : (hasCoordinates ? 'Se detectará automáticamente al registrar' : 'Selecciona una provincia o pick en el mapa.'))
  setText('#selectedLatitude', lat || '-')
  setText('#selectedLongitude', lng || '-')

  const badge = $('#locationStatusBadge')
  if (badge) {
    if (hasCoordinates && hasTerritory) {
      badge.textContent = 'Ubicación completa'
      badge.className = 'badge badge-success px-3 py-2'
    } else if (hasCoordinates) {
      badge.textContent = 'Zona se detectara automaticamente'
      badge.className = 'badge badge-info px-3 py-2'
    } else {
      badge.textContent = 'Pendiente'
      badge.className = 'badge badge-light border px-3 py-2'
    }
  }
}

export function fillSelect(select, items = [], placeholder = 'Seleccione') {
  if (!select) {
    return
  }

  select.replaceChildren()
  const placeholderOption = document.createElement('option')
  placeholderOption.value = ''
  placeholderOption.textContent = placeholder
  select.appendChild(placeholderOption);

  (items || []).forEach(item => {
    const option = document.createElement('option')
    option.value = item.id
    option.textContent = item.name
    select.appendChild(option)
  })
}

export function setDisabled(selector, disabled) {
  const element = $(selector)
  if (element) {
    element.disabled = disabled
  }
}

export function hydrateContactEmail() {
  const emailInput = $('#fCorreo')
  if (!emailInput || emailInput.value) {
    return
  }

  try {
    const user = JSON.parse(localStorage.getItem('user_data') || 'null')
    if (user?.email) {
      emailInput.value = user.email
    }
  } catch {
    // El correo solo se usa para contacto visible en la pantalla.
  }
}

function bindCounters() {
  updateCounter('fTitulo', 'cntTitulo', 120)
  updateCounter('fDescripcion', 'cntDescripcion', 1000)
}

export function updateCounter(inputId, counterId, max) {
  const input = $(`#${inputId}`)
  const counter = $(`#${counterId}`)
  if (!input || !counter) {
    return
  }

  const { length } = input.value
  counter.textContent = `${length}/${max}`
  counter.classList.toggle('ok', length > 0 && length < max * 0.85)
  counter.classList.toggle('warn', length >= max * 0.85)
}

function selectedText(id) {
  const select = $(`#${id}`)
  return select?.selectedOptions?.[0]?.textContent?.trim() || ''
}

function selectedTerritorialPath() {
  const sector = getManualTerritoryValue('sector')
  const labels = [
    selectedTerritorialLabel('fTerritorialProvince', 'province'),
    selectedTerritorialLabel('fTerritorialCanton', 'canton'),
    selectedTerritorialLabel('fTerritorialParish', 'parish'),
    sector
  ].filter(value => value && !/^seleccione|^sin registros/i.test(value))

  return labels.length ? labels.join(' / ') : 'No especificada'
}

function selectedTerritorialLabel(selectId, manualLevel) {
  const label = selectedText(selectId)
  if (label && !/^seleccione|^sin registros/i.test(label)) {
    return label
  }

  return getManualTerritoryValue(manualLevel)
}

function getSelectedTerritorialUnitId() {
  const value = $('#fTerritorialParish')?.value ||
    $('#fTerritorialCanton')?.value ||
    $('#fTerritorialProvince')?.value ||
    null

  return value ? Number(value) : null
}

export function buildAddressText() {
  const address = $('#fDireccion')?.value.trim() || ''
  const reference = $('#fReferencia')?.value.trim() || ''
  const territory = selectedTerritorialPath()
  const territoryText = territory !== 'No especificada' ? `Territorio: ${territory}` : ''
  return [address, reference, territoryText].filter(Boolean).join(' - ') || null
}

export function setManualTerritoryMode(level, enabled) {
  if (!level || !manualTerritoryFields[level]) {
    return
  }

  const wrapper = document.querySelector(`[data-manual-territory="${level}"]`)
  const input = document.getElementById(manualTerritoryFields[level])
  const select = document.getElementById(selectTerritoryFields[level])
  const selectWrapper = select?.closest('.form-group')

  if (!wrapper) {
    return
  }

  wrapper?.classList.toggle('d-none', !enabled)
  selectWrapper?.classList.toggle('d-none', enabled)

  if (input) {
    input.disabled = !enabled
    if (!enabled) {
      input.value = ''
      clearFieldError(input)
    }
  }
}

function resetManualTerritoryFields(selectIds) {
  const idToLevel = {
    fTerritorialProvince: 'province',
    fTerritorialCanton: 'canton',
    fTerritorialParish: 'parish'
  }

  selectIds.forEach(id => setManualTerritoryMode(idToLevel[id], false))
}

function levelToManualKey(selectId) {
  return {
    fTerritorialProvince: 'province',
    fTerritorialCanton: 'canton',
    fTerritorialParish: 'parish'
  }[selectId] || null
}

function isManualTerritoryVisible(level) {
  return !document.querySelector(`[data-manual-territory="${level}"]`)?.classList.contains('d-none')
}

export function getManualTerritoryValue(level) {
  return document.getElementById(manualTerritoryFields[level])?.value?.trim() || ''
}

export function setManualTerritoryValue(level, value) {
  if (!value || !manualTerritoryFields[level]) {
    return
  }

  setManualTerritoryMode(level, true)
  const input = document.getElementById(manualTerritoryFields[level])
  if (input && !input.value.trim()) {
    input.value = value
  }
}

function formatCoordinates() {
  const lat = $('#fLatitud')?.value
  const lng = $('#fLongitud')?.value
  return lat && lng ? `${lat}, ${lng}` : 'No especificadas'
}

function setEvidenceError(message) {
  const dropzone = $('#evidenceDropzone')
  const feedback = $('#evidenceFeedback')
  dropzone?.classList.add('is-invalid')
  if (feedback) {
    feedback.textContent = message
  }
}

function clearEvidenceError() {
  $('#evidenceDropzone')?.classList.remove('is-invalid')
  const feedback = $('#evidenceFeedback')
  if (feedback) {
    feedback.textContent = ''
  }
}

function showFormAlert(message, type = 'danger') {
  const alert = $('#alertaFormulario')
  if (!alert) {
    showErrorAlert(message)
    return
  }

  alert.className = `alert alert-${type}`
  alert.textContent = message
  alert.classList.remove('d-none')
  globalThis.setTimeout(() => {
    alert.classList.add('d-none')
  }, 5000)
}

function setText(selector, value) {
  const element = $(selector)
  if (element) {
    element.textContent = value
  }
}

export function formatFileSize(bytes) {
  if (bytes === 0) {
    return '0 B'
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function createClientId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  if (globalThis.crypto?.getRandomValues) {
    const array = new Uint32Array(1)
    globalThis.crypto.getRandomValues(array)
    return `${Date.now()}-${array[0].toString(16)}`
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}` // NOSONAR
}
