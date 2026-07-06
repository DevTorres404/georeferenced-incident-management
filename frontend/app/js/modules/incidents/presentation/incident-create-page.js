import { $, $$, hideSpinner, showErrorAlert, showSpinner, showSuccessAlert } from '../../../shared/utils/dom-utils.js?v=14';
import { hidePageLoading, showPageLoading } from './incidents-ui.js?v=16';
import { getCatalogOverview } from '../../catalogs/application/catalogs-service.js?v=14';
import { createIncident, uploadIncidentAttachment } from '../application/incidents-service.js?v=15';
import { handleBackendErrors, setFieldError, clearFieldError } from '../../../shared/validators/validation-utils.js?v=1';
import { createCoordinatePicker } from '../../../shared/components/coordinate-picker.js?v=3';
import {
  getTerritorialChildren,
  listTerritorialCantons,
  listTerritorialParishes,
  listTerritorialProvinces,
} from '../../territorial-units/application/territorial-unit-service.js?v=2';

const STEPS = ['location', 'evidence', 'details', 'review'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const INCIDENT_CREATE_INITIAL_CENTER = [-78.55, -1.7];
const INCIDENT_CREATE_INITIAL_ZOOM = 6.15;

let currentStepIndex = 0;
let catalogs = {};
let coordinatePicker = null;
let territorialProvinces = [];
let lastAutofilledAddress = '';
let evidenceFiles = [];
const territorialChildrenCache = new Map();
const manualTerritoryFields = {
  sector: 'fManualSector',
};
const selectTerritoryFields = {
  province: 'fTerritorialProvince',
  canton: 'fTerritorialCanton',
  parish: 'fTerritorialParish',
  sector: 'fTerritorialSector',
};

document.addEventListener('DOMContentLoaded', async () => {
  window.renderLayout?.('incident-create');

  hydrateContactEmail();
  bindEvents();
  bindCounters();
  renderEvidencePreviews();
  renderStep();
  updateLocationSummary();

  showPageLoading('Cargando formulario', 'Preparando mapa y catalogos...');
  const loadingFallback = window.setTimeout(hidePageLoading, 12000);

  try {
    catalogs = await getCatalogOverview();
    populateCatalogs();
    await populateTerritorialProvinces();
  } catch (error) {
    showErrorAlert(error.message || 'No se pudieron cargar los datos iniciales.');
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }

  coordinatePicker = createCoordinatePicker({
    mapId: 'incidentLocationMap',
    latitudeInputId: 'fLatitud',
    longitudeInputId: 'fLongitud',
    center: INCIDENT_CREATE_INITIAL_CENTER,
    zoom: INCIDENT_CREATE_INITIAL_ZOOM,
    selectedZoom: 16,
    onReverseGeocode: applyReverseGeocode,
  });

  coordinatePicker?.map?.once('load', () => {
    coordinatePicker.map.jumpTo({
      center: INCIDENT_CREATE_INITIAL_CENTER,
      zoom: INCIDENT_CREATE_INITIAL_ZOOM,
    });
  });
});

function bindEvents() {
  $('#btnNextStep')?.addEventListener('click', goNext);
  $('#btnPrevStep')?.addEventListener('click', goPrevious);
  $('#formNuevaIncidencia')?.addEventListener('submit', handleSubmit);

  $$('.wizard-step-button').forEach((button) => {
    button.addEventListener('click', () => goToStep(button.dataset.stepTarget));
  });

  $('#fTipo')?.addEventListener('change', populateSubcategories);
  $('#fTerritorialProvince')?.addEventListener('change', () => populateTerritorialLevel('province'));
  $('#fTerritorialCanton')?.addEventListener('change', () => populateTerritorialLevel('canton'));
  $('#fTerritorialParish')?.addEventListener('change', () => populateTerritorialLevel('parish'));
  $('#fTerritorialSector')?.addEventListener('change', updateLocationSummary);

  ['fDireccion', 'fReferencia', 'fLatitud', 'fLongitud'].forEach((id) => {
    $(`#${id}`)?.addEventListener('input', () => {
      if (id === 'fDireccion') $('#fDireccion').dataset.autofilled = 'false';
      updateLocationSummary();
    });
  });

  ['fTerritorialProvince', 'fTerritorialCanton', 'fTerritorialParish', 'fTerritorialSector'].forEach((id) => {
    $(`#${id}`)?.addEventListener('change', updateLocationSummary);
  });

  Object.values(manualTerritoryFields).forEach((id) => {
    $(`#${id}`)?.addEventListener('input', () => {
      clearFieldError(id);
      updateLocationSummary();
    });
  });

  $('#fTitulo')?.addEventListener('input', () => updateCounter('fTitulo', 'cntTitulo', 120));
  $('#fDescripcion')?.addEventListener('input', () => updateCounter('fDescripcion', 'cntDescripcion', 1000));

  bindEvidenceEvents();
}

function bindEvidenceEvents() {
  const dropzone = $('#evidenceDropzone');
  const fileInput = $('#fEvidence');

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragging');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
    });
  });

  dropzone?.addEventListener('drop', (event) => addEvidenceFiles(event.dataTransfer?.files || []));
  fileInput?.addEventListener('change', (event) => {
    addEvidenceFiles(event.target.files || []);
    event.target.value = '';
  });

  $('#btnAddEvidence')?.addEventListener('click', () => fileInput?.click());
  $('#evidencePreviewList')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-evidence]');
    if (button) removeEvidenceFile(button.dataset.removeEvidence);
  });
}

function goNext() {
  if (!validateCurrentStep()) return;
  if (currentStepIndex < STEPS.length - 1) {
    currentStepIndex += 1;
    renderStep();
  }
}

function goPrevious() {
  if (currentStepIndex > 0) {
    currentStepIndex -= 1;
    renderStep();
  }
}

function goToStep(stepName) {
  const targetIndex = STEPS.indexOf(stepName);
  if (targetIndex < 0 || targetIndex === currentStepIndex) return;

  if (targetIndex < currentStepIndex || validateUntil(targetIndex)) {
    currentStepIndex = targetIndex;
    renderStep();
  }
}

function renderStep() {
  const activeStep = STEPS[currentStepIndex];

  $$('[data-step-panel]').forEach((panel) => {
    panel.classList.toggle('d-none', panel.dataset.stepPanel !== activeStep);
  });

  $$('.wizard-step-button').forEach((button, index) => {
    button.classList.toggle('is-active', index === currentStepIndex);
    button.classList.toggle('is-complete', index < currentStepIndex);
  });

  const prevButton = $('#btnPrevStep');
  const nextButton = $('#btnNextStep');
  const submitButton = $('#btnRegistrar');

  if (prevButton) prevButton.disabled = currentStepIndex === 0;
  nextButton?.classList.toggle('d-none', activeStep === 'review');
  submitButton?.classList.toggle('d-none', activeStep !== 'review');

  if (activeStep === 'review') renderSummary();
  coordinatePicker?.invalidateSize();
}

function populateCatalogs() {
  fillSelect($('#fTipo'), catalogs.categories, 'Seleccione tipo');
  fillSelect($('#fSubtipo'), [], 'Primero seleccione tipo');
  setDisabled('#fSubtipo', true);
}

function populateSubcategories() {
  const categoryId = $('#fTipo')?.value;
  const category = (catalogs.categories || []).find((item) => String(item.id) === String(categoryId));
  const options = category?.subcategories || [];

  fillSelect($('#fSubtipo'), options, 'Seleccione subtipo');
  setDisabled('#fSubtipo', options.length === 0);
  clearFieldError('fSubtipo');
}

async function populateTerritorialProvinces() {
  try {
    territorialProvinces = await listTerritorialProvinces();
    fillSelect($('#fTerritorialProvince'), territorialProvinces, 'Seleccione provincia');
    setDisabled('#fTerritorialProvince', territorialProvinces.length === 0);
    setManualTerritoryMode('province', territorialProvinces.length === 0);
  } catch (error) {
    territorialProvinces = [];
    setDisabled('#fTerritorialProvince', true);
    setManualTerritoryMode('province', true);
    showErrorAlert(error.message || 'No se pudieron cargar las provincias.');
  }
}

async function populateTerritorialLevel(level) {
  const config = {
    province: {
      source: 'fTerritorialProvince',
      target: 'fTerritorialCanton',
      reset: ['fTerritorialParish', 'fTerritorialSector'],
      placeholder: 'Seleccione canton',
    },
    canton: {
      source: 'fTerritorialCanton',
      target: 'fTerritorialParish',
      reset: ['fTerritorialSector'],
      placeholder: 'Seleccione parroquia',
    },
    parish: {
      source: 'fTerritorialParish',
      target: 'fTerritorialSector',
      reset: [],
      placeholder: 'Seleccione sector o barrio',
    },
  }[level];

  if (!config) return;

  config.reset.forEach((id) => {
    fillSelect($(`#${id}`), [], 'Seleccione');
    setDisabled(`#${id}`, true);
  });
  resetManualTerritoryFields(config.reset);

  const parentId = $(`#${config.source}`)?.value;
  fillSelect($(`#${config.target}`), [], config.placeholder);
  setDisabled(`#${config.target}`, true);
  setManualTerritoryMode(levelToManualKey(config.target), false);

  if (!parentId) {
    updateLocationSummary();
    return;
  }

  try {
    const children = await getTerritorialChildrenCached(parentId, level);
    fillSelect($(`#${config.target}`), children, children.length ? config.placeholder : 'Sin registros disponibles');
    setDisabled(`#${config.target}`, children.length === 0);
    setManualTerritoryMode(levelToManualKey(config.target), children.length === 0);
  } catch (error) {
    setManualTerritoryMode(levelToManualKey(config.target), true);
    showErrorAlert(error.message || 'No se pudo cargar la division territorial.');
  } finally {
    updateLocationSummary();
  }
}

async function getTerritorialChildrenCached(parentId, level = '') {
  const key = `${level}:${parentId}`;
  if (!territorialChildrenCache.has(key)) {
    territorialChildrenCache.set(
      key,
      level === 'province'
        ? await listTerritorialCantons(parentId)
        : level === 'canton'
          ? await listTerritorialParishes(parentId)
          : await getTerritorialChildren(parentId)
    );
  }
  return territorialChildrenCache.get(key) || [];
}

async function applyReverseGeocode(result) {
  const address = result?.address || {};
  const approximateAddress = buildApproximateAddress(result);
  const addressInput = $('#fDireccion');

  if (addressInput && approximateAddress && shouldAutofillAddress(addressInput)) {
    addressInput.value = approximateAddress;
    addressInput.dataset.autofilled = 'true';
    lastAutofilledAddress = approximateAddress;
  }

  await selectTerritorialFromAddress(address);
  updateLocationSummary();
}

function shouldAutofillAddress(input) {
  const current = input.value.trim();
  return !current || input.dataset.autofilled === 'true' || current === lastAutofilledAddress;
}

function buildApproximateAddress(result) {
  const address = result?.address || {};
  return [
    address.road || address.pedestrian || address.footway,
    address.neighbourhood || address.suburb || address.city_district,
    address.city || address.town || address.village || address.county,
    address.state,
  ].filter(Boolean).join(', ') || result?.display_name || '';
}

async function selectTerritorialFromAddress(address) {
  const provinceName = address.state || address.region;
  const cantonName = address.county || address.city || address.town || address.municipality;
  const parishName = address.city_district || address.suburb || address.village || address.neighbourhood;

  const province = findUnitByName(territorialProvinces, provinceName);
  if (!province) {
    setManualTerritoryValue('province', provinceName);
    setManualTerritoryValue('canton', cantonName);
    setManualTerritoryValue('parish', parishName);
    return;
  }

  setSelectValue('fTerritorialProvince', province.id);
  await populateTerritorialLevel('province');

  const cantons = await getTerritorialChildrenCached(province.id, 'province');
  const canton = findUnitByName(cantons, cantonName);
  if (!canton) {
    setManualTerritoryValue('canton', cantonName);
    setManualTerritoryValue('parish', parishName);
    return;
  }

  setSelectValue('fTerritorialCanton', canton.id);
  await populateTerritorialLevel('canton');

  const parishes = await getTerritorialChildrenCached(canton.id, 'canton');
  const parish = findUnitByName(parishes, parishName);
  if (!parish) {
    setManualTerritoryValue('parish', parishName);
    return;
  }

  setSelectValue('fTerritorialParish', parish.id);
  await populateTerritorialLevel('parish');
}

function setSelectValue(id, value) {
  const select = $(`#${id}`);
  if (!select) return;
  select.value = String(value);
  clearFieldError(id);
}

function findUnitByName(units, value) {
  const target = normalizeLocationName(value);
  if (!target) return null;

  return (units || []).find((unit) => normalizeLocationName(unit.name) === target)
    || (units || []).find((unit) => {
      const name = normalizeLocationName(unit.name);
      return name.includes(target) || target.includes(name);
    })
    || null;
}

function normalizeLocationName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\b(provincia|canton|parroquia|sector|barrio|de|del|la|el|los|las)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function addEvidenceFiles(fileList) {
  clearEvidenceError();

  Array.from(fileList).forEach((file) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setEvidenceError('Solo se permiten imagenes JPG o PNG.');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setEvidenceError('Cada foto debe pesar maximo 10 MB.');
      return;
    }

    evidenceFiles.push({
      id: createClientId(),
      file,
      previewUrl: URL.createObjectURL(file),
    });
  });

  renderEvidencePreviews();
}

function removeEvidenceFile(id) {
  const item = evidenceFiles.find((entry) => entry.id === id);
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  evidenceFiles = evidenceFiles.filter((entry) => entry.id !== id);
  renderEvidencePreviews();
}

function renderEvidencePreviews() {
  const container = $('#evidencePreviewList');
  const count = $('#evidenceCount');
  if (count) count.textContent = String(evidenceFiles.length);
  if (!container) return;

  container.replaceChildren();

  if (evidenceFiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'evidence-empty';
    empty.textContent = 'Aun no has cargado fotografias.';
    container.appendChild(empty);
    return;
  }

  evidenceFiles.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'evidence-card';

    const image = document.createElement('img');
    image.src = item.previewUrl;
    image.alt = item.file.name;

    const meta = document.createElement('div');
    meta.className = 'evidence-card-meta';

    const name = document.createElement('strong');
    name.textContent = item.file.name;

    const size = document.createElement('span');
    size.textContent = formatFileSize(item.file.size);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn btn-sm btn-outline-danger';
    removeButton.dataset.removeEvidence = item.id;
    removeButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
    removeButton.setAttribute('aria-label', `Eliminar ${item.file.name}`);

    meta.append(name, size, removeButton);
    card.append(image, meta);
    container.appendChild(card);
  });
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!validateUntil(STEPS.length - 1)) {
    renderStep();
    showFormAlert('Revisa los campos marcados antes de registrar la incidencia.', 'warning');
    return;
  }

  if (!validateReview()) {
    currentStepIndex = STEPS.indexOf('review');
    renderStep();
    showFormAlert('Confirma la informacion antes de registrar la incidencia.', 'warning');
    return;
  }

  const payload = {
    title: $('#fTitulo').value.trim(),
    description: $('#fDescripcion').value.trim(),
    category_id: Number($('#fTipo').value),
    subcategory_id: Number($('#fSubtipo').value),
    address_reference: buildAddressText(),
    latitude: Number($('#fLatitud').value),
    longitude: Number($('#fLongitud').value),
    territorial_unit_id: getSelectedTerritorialUnitId(),
  };

  showSpinner('spinnerRegistrar', 'btnRegistrar');

  try {
    const response = await createIncident(payload);
    const incident = response?.data || response;

    if (!incident?.id) {
      showErrorAlert('No se pudo registrar la incidencia.');
      return;
    }

    await Promise.all(
      evidenceFiles.map((item) => uploadIncidentAttachment(incident.id, item.file))
    );

    showSuccessAlert(response?.message || 'Incidencia registrada con exito.');
    window.setTimeout(() => {
      window.location.href = `/incidencias/detalle?id=${encodeURIComponent(incident.id)}`;
    }, 1000);
  } catch (error) {
    handleBackendErrors(error, document.getElementById('formNuevaIncidencia'));
    showErrorAlert(error.message || 'No se pudo registrar la incidencia.');
  } finally {
    hideSpinner('spinnerRegistrar', 'btnRegistrar');
  }
}

function validateUntil(targetIndex) {
  for (let index = 0; index < targetIndex; index += 1) {
    if (!validateStep(STEPS[index])) {
      currentStepIndex = index;
      return false;
    }
  }
  return true;
}

function validateCurrentStep() {
  return validateStep(STEPS[currentStepIndex]);
}

function validateStep(step) {
  if (step === 'location') return validateLocation();
  if (step === 'evidence') return validateEvidence();
  if (step === 'details') return validateDetails();
  if (step === 'review') return validateReview();
  return true;
}

function validateLocation() {
  let valid = true;
  valid = validateRequiredCoordinatePair() && valid;
  updateLocationSummary();
  return valid;
}

function validateEvidence() {
  if (evidenceFiles.length === 0) {
    setEvidenceError('Carga al menos una foto de la incidencia.');
    return false;
  }
  clearEvidenceError();
  return true;
}

function validateDetails() {
  let valid = true;
  valid = validateText('fTitulo', 5, 'Ingresa un titulo de al menos 5 caracteres.') && valid;
  valid = validateTextMax('fTitulo', 120, 'El titulo no debe superar 120 caracteres.') && valid;
  valid = validateSelect('fTipo', 'Selecciona el tipo de incidencia.') && valid;
  valid = validateSelect('fSubtipo', 'Selecciona el subtipo de incidencia.') && valid;
  valid = validateText('fDescripcion', 20, 'Describe la incidencia con al menos 20 caracteres.') && valid;
  valid = validateTextMax('fDescripcion', 1000, 'La descripcion no debe superar 1000 caracteres.') && valid;
  valid = validateEmail('fCorreo') && valid;
  return valid;
}

function validateReview() {
  if (!$('#fConfirmacion')?.checked) {
    setFieldError('fConfirmacion', 'Confirma la informacion antes de registrar.');
    return false;
  }
  clearFieldError('fConfirmacion');
  return true;
}

function validateText(id, minLength, message) {
  const value = String($(`#${id}`)?.value || '').trim();
  if (value.length < minLength) {
    setFieldError(id, message);
    return false;
  }
  clearFieldError(id);
  return true;
}

function validateTextMax(id, maxLength, message) {
  const value = String($(`#${id}`)?.value || '').trim();
  if (value.length > maxLength) {
    setFieldError(id, message);
    return false;
  }
  return true;
}

function validateSelect(id, message) {
  if (!String($(`#${id}`)?.value || '').trim()) {
    setFieldError(id, message);
    return false;
  }
  clearFieldError(id);
  return true;
}

function validateEmail(id) {
  const value = String($(`#${id}`)?.value || '').trim();
  if (!value) {
    setFieldError(id, 'Ingresa un correo de contacto.');
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    setFieldError(id, 'Ingresa un correo valido.');
    return false;
  }
  clearFieldError(id);
  return true;
}

function validateRequiredCoordinatePair() {
  const latitudeValue = String($('#fLatitud')?.value || '').trim();
  const longitudeValue = String($('#fLongitud')?.value || '').trim();
  let valid = true;

  if (!latitudeValue) {
    setFieldError('fLatitud', 'Selecciona un punto en el mapa o ingresa la latitud.');
    valid = false;
  } else {
    valid = validateCoordinate('fLatitud', -90, 90, 'La latitud debe estar entre -90 y 90.') && valid;
  }

  if (!longitudeValue) {
    setFieldError('fLongitud', 'Selecciona un punto en el mapa o ingresa la longitud.');
    valid = false;
  } else {
    valid = validateCoordinate('fLongitud', -180, 180, 'La longitud debe estar entre -180 y 180.') && valid;
  }

  return valid;
}

function validateCoordinate(id, min, max, message) {
  const number = Number($(`#${id}`)?.value);
  if (!Number.isFinite(number) || number < min || number > max) {
    setFieldError(id, message);
    return false;
  }
  clearFieldError(id);
  return true;
}

function validateTerritorialSelection() {
  if (!$('#fTerritorialProvince')?.value) {
    setFieldError('fTerritorialProvince', 'Selecciona la provincia.');
    return false;
  }

  if (!$('#fTerritorialCanton')?.value) {
    setFieldError('fTerritorialCanton', 'Selecciona el canton.');
    return false;
  }

  if (!$('#fTerritorialParish')?.value) {
    setFieldError('fTerritorialParish', 'Selecciona la parroquia.');
    return false;
  }

  clearFieldError('fTerritorialProvince');
  clearFieldError('fTerritorialCanton');
  clearFieldError('fTerritorialParish');
  return true;
}

function renderSummary() {
  const container = $('#resumenIncidencia');
  if (!container) return;

  container.replaceChildren(
    createReviewSection('Ubicacion', [
      ['Direccion', $('#fDireccion')?.value || 'No especificada'],
      ['Referencia', $('#fReferencia')?.value || 'No especificada'],
      ['Territorio', selectedTerritorialPath()],
      ['Coordenadas', formatCoordinates()],
    ]),
    createReviewSection('Evidencia fotografica', [
      ['Fotos cargadas', `${evidenceFiles.length} foto(s)`],
    ]),
    createReviewSection('Informacion general', [
      ['Titulo', $('#fTitulo')?.value],
      ['Tipo', selectedText('fTipo')],
      ['Subtipo', selectedText('fSubtipo')],
      ['Correo de contacto', $('#fCorreo')?.value],
      ['Descripcion', $('#fDescripcion')?.value],
    ]),
  );
}

function createReviewSection(title, rows) {
  const section = document.createElement('section');
  section.className = 'review-section';

  const heading = document.createElement('h4');
  heading.textContent = title;
  section.appendChild(heading);

  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'review-row';

    const key = document.createElement('span');
    key.textContent = label;

    const content = document.createElement('strong');
    content.textContent = value || 'No especificado';

    row.append(key, content);
    section.appendChild(row);
  });

  return section;
}

function updateLocationSummary() {
  const address = $('#fDireccion')?.value?.trim();
  const lat = $('#fLatitud')?.value?.trim();
  const lng = $('#fLongitud')?.value?.trim();
  const territory = selectedTerritorialPath();
  const hasCoordinates = lat && lng;
  const hasTerritory = territory !== 'No especificada';

  setText('#selectedLocationText', address || (hasCoordinates ? 'Punto seleccionado en el mapa' : 'Sin ubicacion seleccionada'));
  setText('#selectedTerritoryText', hasTerritory ? territory : (hasCoordinates ? 'Se detectara automaticamente al registrar' : 'Selecciona una provincia o pick en el mapa.'));
  setText('#selectedLatitude', lat || '-');
  setText('#selectedLongitude', lng || '-');

  const badge = $('#locationStatusBadge');
  if (badge) {
    if (hasCoordinates && hasTerritory) {
      badge.textContent = 'Ubicacion completa';
      badge.className = 'badge badge-success px-3 py-2';
    } else if (hasCoordinates) {
      badge.textContent = 'Zona se detectara automaticamente';
      badge.className = 'badge badge-info px-3 py-2';
    } else {
      badge.textContent = 'Pendiente';
      badge.className = 'badge badge-light border px-3 py-2';
    }
  }
}

function fillSelect(select, items = [], placeholder = 'Seleccione') {
  if (!select) return;

  select.replaceChildren();
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  (items || []).forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });
}

function setDisabled(selector, disabled) {
  const element = $(selector);
  if (element) element.disabled = disabled;
}

function hydrateContactEmail() {
  const emailInput = $('#fCorreo');
  if (!emailInput || emailInput.value) return;

  try {
    const user = JSON.parse(localStorage.getItem('user_data') || 'null');
    if (user?.email) emailInput.value = user.email;
  } catch {
    // El correo solo se usa para contacto visible en la pantalla.
  }
}

function bindCounters() {
  updateCounter('fTitulo', 'cntTitulo', 120);
  updateCounter('fDescripcion', 'cntDescripcion', 1000);
}

function updateCounter(inputId, counterId, max) {
  const input = $(`#${inputId}`);
  const counter = $(`#${counterId}`);
  if (!input || !counter) return;

  const length = input.value.length;
  counter.textContent = `${length}/${max}`;
  counter.classList.toggle('ok', length > 0 && length < max * 0.85);
  counter.classList.toggle('warn', length >= max * 0.85);
}

function selectedText(id) {
  const select = $(`#${id}`);
  return select?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function selectedTerritorialPath() {
  const labels = [
    selectedTerritorialLabel('fTerritorialProvince', 'province'),
    selectedTerritorialLabel('fTerritorialCanton', 'canton'),
    selectedTerritorialLabel('fTerritorialParish', 'parish'),
    selectedTerritorialLabel('fTerritorialSector', 'sector'),
  ].filter((value) => value && !/^Seleccione|^Sin registros/i.test(value));

  return labels.length ? labels.join(' / ') : 'No especificada';
}

function selectedTerritorialLabel(selectId, manualLevel) {
  const label = selectedText(selectId);
  if (label && !/^Seleccione|^Sin registros/i.test(label)) return label;
  return getManualTerritoryValue(manualLevel);
}

function getSelectedTerritorialUnitId() {
  const value = $('#fTerritorialSector')?.value || $('#fTerritorialParish')?.value || null;

  return value ? Number(value) : null;
}

function buildAddressText() {
  const address = $('#fDireccion')?.value.trim() || '';
  const reference = $('#fReferencia')?.value.trim() || '';
  const territory = selectedTerritorialPath();
  const territoryText = territory !== 'No especificada' ? `Territorio: ${territory}` : '';
  return [address, reference, territoryText].filter(Boolean).join(' - ') || null;
}

function setManualTerritoryMode(level, enabled) {
  if (!level || !manualTerritoryFields[level]) return;

  const wrapper = document.querySelector(`[data-manual-territory="${level}"]`);
  const input = document.getElementById(manualTerritoryFields[level]);
  const select = document.getElementById(selectTerritoryFields[level]);
  const selectWrapper = select?.closest('.form-group');

  if (!wrapper) return;

  wrapper?.classList.toggle('d-none', !enabled);
  selectWrapper?.classList.toggle('d-none', enabled);

  if (input) {
    input.disabled = !enabled;
    if (!enabled) {
      input.value = '';
      clearFieldError(input);
    }
  }
}

function resetManualTerritoryFields(selectIds) {
  const idToLevel = {
    fTerritorialProvince: 'province',
    fTerritorialCanton: 'canton',
    fTerritorialParish: 'parish',
    fTerritorialSector: 'sector',
  };

  selectIds.forEach((id) => setManualTerritoryMode(idToLevel[id], false));
}

function levelToManualKey(selectId) {
  return {
    fTerritorialProvince: 'province',
    fTerritorialCanton: 'canton',
    fTerritorialParish: 'parish',
    fTerritorialSector: 'sector',
  }[selectId] || null;
}

function isManualTerritoryVisible(level) {
  return !document.querySelector(`[data-manual-territory="${level}"]`)?.classList.contains('d-none');
}

function getManualTerritoryValue(level) {
  return document.getElementById(manualTerritoryFields[level])?.value?.trim() || '';
}

function setManualTerritoryValue(level, value) {
  if (!value || !manualTerritoryFields[level]) return;
  setManualTerritoryMode(level, true);
  const input = document.getElementById(manualTerritoryFields[level]);
  if (input && !input.value.trim()) input.value = value;
}

function formatCoordinates() {
  const lat = $('#fLatitud')?.value;
  const lng = $('#fLongitud')?.value;
  return lat && lng ? `${lat}, ${lng}` : 'No especificadas';
}

function setEvidenceError(message) {
  const dropzone = $('#evidenceDropzone');
  const feedback = $('#evidenceFeedback');
  dropzone?.classList.add('is-invalid');
  if (feedback) feedback.textContent = message;
}

function clearEvidenceError() {
  $('#evidenceDropzone')?.classList.remove('is-invalid');
  const feedback = $('#evidenceFeedback');
  if (feedback) feedback.textContent = '';
}

function showFormAlert(message, type = 'danger') {
  const alert = $('#alertaFormulario');
  if (!alert) {
    showErrorAlert(message);
    return;
  }

  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alert.classList.remove('d-none');
  window.setTimeout(() => {
    alert.classList.add('d-none');
  }, 5000);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createClientId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
