import { $, $$, hide, hideSpinner, showErrorAlert, showSpinner, showSuccessAlert } from '../../../shared/utils/dom-utils.js?v=14';
import { hidePageLoading, showPageLoading } from './incidents-ui.js?v=16';
import { getCities, getProvinces } from '../../catalogs/application/catalog-service.js?v=14';
import { getCatalogOverview } from '../../catalogs/application/catalogs-service.js?v=14';
import { createIncident } from '../application/incidents-service.js?v=14';
import { handleBackendErrors, setFieldError, clearFieldError } from '../../../shared/validators/validation-utils.js?v=1';

let currentStep = 1;
let catalogs = {};

document.addEventListener('DOMContentLoaded', async () => {
  window.renderLayout?.('incident-create');

  hydrateContactEmail();
  bindCounters();

  $('#btnSiguiente1')?.addEventListener('click', () => {
    if (validateStepOne()) goStep(2);
  });
  $('#btnAnterior2')?.addEventListener('click', () => goStep(1));
  $('#btnSiguiente2')?.addEventListener('click', () => {
    if (validateStepTwo()) {
      renderSummary();
      goStep(3);
    }
  });
  $('#btnAnterior3')?.addEventListener('click', () => goStep(2));
  $('#formNuevaIncidencia')?.addEventListener('submit', handleSubmit);

  showPageLoading('Cargando formulario', 'Obteniendo catálogos...');
  const loadingFallback = window.setTimeout(hidePageLoading, 12000);

  try {
    catalogs = await getCatalogOverview();
    populateSelects();
  } catch (error) {
    showErrorAlert(error.message || 'No se pudieron cargar los catalogos.');
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }

  $('#fTipo')?.addEventListener('change', populateSubcategories);
  $('#fPais')?.addEventListener('change', populateProvinces);
  $('#fProvincia')?.addEventListener('change', populateCities);
  $('#fTitulo')?.addEventListener('input', () => updateCounter('fTitulo', 'cntTitulo', 120));
  $('#fDescripcion')?.addEventListener('input', () => updateCounter('fDescripcion', 'cntDescripcion', 1000));
});

function goStep(step) {
  $$('.form-section').forEach((el) => el.classList.remove('active'));
  $$('.step').forEach((el, index) => {
    el.classList.toggle('done', index + 1 < step);
    el.classList.toggle('active', index + 1 === step);
  });

  $(`#seccion${step}`)?.classList.add('active');
  currentStep = step;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function populateSelects() {
  fillSelect($('#fTipo'), catalogs.categories, 'Seleccione categoria...');
  fillSelect($('#fPais'), catalogs.countries, 'Seleccione pais...');
  fillSelect($('#fPrioridad'), catalogs.priorities, 'Seleccione prioridad...');
}

function populateSubcategories() {
  const categoryId = $('#fTipo')?.value;
  const category = (catalogs.categories || []).find((item) => String(item.id) === String(categoryId));
  const options = category?.subcategories || [];

  fillSelect($('#fSubtipo'), options, 'Seleccione subcategoria...');
  setDisabled('#fSubtipo', options.length === 0);
  clearFieldError('fSubtipo');
}

async function populateProvinces() {
  const countryId = $('#fPais')?.value;
  fillSelect($('#fProvincia'), [], 'Seleccione provincia...');
  fillSelect($('#fCiudad'), [], 'Seleccione ciudad...');
  setDisabled('#fProvincia', true);
  setDisabled('#fCiudad', true);

  if (!countryId) return;

  try {
    const provinces = await getProvinces(countryId);
    fillSelect($('#fProvincia'), provinces, 'Seleccione provincia...');
    setDisabled('#fProvincia', provinces.length === 0);
    clearFieldError('fProvincia');
  } catch (error) {
    showErrorAlert(error.message || 'No se pudieron cargar las provincias.');
  }
}

async function populateCities() {
  const provinceId = $('#fProvincia')?.value;
  fillSelect($('#fCiudad'), [], 'Seleccione ciudad...');
  setDisabled('#fCiudad', true);

  if (!provinceId) return;

  try {
    const cities = await getCities(provinceId);
    fillSelect($('#fCiudad'), cities, 'Seleccione ciudad...');
    setDisabled('#fCiudad', cities.length === 0);
    clearFieldError('fCiudad');
  } catch (error) {
    showErrorAlert(error.message || 'No se pudieron cargar las ciudades.');
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!validateStepOne()) {
    goStep(1);
    showFormAlert('Revisa la informacion general antes de continuar.', 'warning');
    return;
  }

  if (!validateStepTwo()) {
    goStep(2);
    showFormAlert('Revisa la ubicacion antes de registrar la incidencia.', 'warning');
    return;
  }

  if (!$('#fConfirmacion')?.checked) {
    setFieldError('fConfirmacion', 'Confirma que la informacion registrada es veridica.');
    showFormAlert('Debes confirmar la informacion antes de registrar.', 'warning');
    return;
  }

  const payload = {
    title: $('#fTitulo').value.trim(),
    description: $('#fDescripcion').value.trim(),
    category_id: Number($('#fTipo').value),
    subcategory_id: $('#fSubtipo').value ? Number($('#fSubtipo').value) : null,
    priority_id: Number($('#fPrioridad').value),
    city_id: Number($('#fCiudad').value),
    address: $('#fDireccion').value.trim() || null,
    latitude: $('#fLatitud').value ? Number($('#fLatitud').value) : null,
    longitude: $('#fLongitud').value ? Number($('#fLongitud').value) : null,
  };

  showSpinner('spinnerRegistrar', 'btnRegistrar');

  try {
    const response = await createIncident(payload);
    const incident = response?.data || response;

    if (!incident?.id) {
      showErrorAlert('No se pudo registrar la incidencia.');
      return;
    }

    showSuccessAlert(response?.message || 'Incidencia registrada con exito.');
    window.setTimeout(() => {
      window.location.href = incident.id ? `incident-detail.html?id=${encodeURIComponent(incident.id)}` : 'incidents.html';
    }, 1200);
  } catch (error) {
    // Si la alerta global no existe, podemos crear un contenedor temporal o dejar que handleBackendErrors lo ponga bajo los inputs
    handleBackendErrors(error, document.getElementById('formIncident'));
    showErrorAlert(error.message || 'Ocurrio un error inesperado al enviar el formulario.');
  } finally {
    hideSpinner('spinnerRegistrar', 'btnRegistrar');
  }
}

function fillSelect(select, items = [], placeholder = 'Seleccione...') {
  if (!select) return;

  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
  (items || []).forEach((item) => {
    select.innerHTML += `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`;
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
    // El correo es solo informativo para esta pantalla.
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

function validateStepOne() {
  let valid = true;
  valid = validateText('fTitulo', 5, 'Ingresa un titulo de al menos 5 caracteres.') && valid;
  valid = validateSelect('fPrioridad', 'Selecciona la prioridad.') && valid;
  valid = validateSelect('fTipo', 'Selecciona el tipo de incidencia.') && valid;
  valid = validateText('fDescripcion', 20, 'Describe la incidencia con al menos 20 caracteres.') && valid;
  valid = validateEmail('fCorreo') && valid;
  return valid;
}

function validateStepTwo() {
  let valid = true;
  valid = validateSelect('fPais', 'Selecciona el pais.') && valid;
  valid = validateSelect('fProvincia', 'Selecciona la provincia.') && valid;
  valid = validateSelect('fCiudad', 'Selecciona la ciudad.') && valid;
  valid = validateCoordinate('fLatitud', -90, 90, 'La latitud debe estar entre -90 y 90.') && valid;
  valid = validateCoordinate('fLongitud', -180, 180, 'La longitud debe estar entre -180 y 180.') && valid;
  return valid;
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

function validateCoordinate(id, min, max, message) {
  const value = String($(`#${id}`)?.value || '').trim();
  if (!value) {
    clearFieldError(id);
    return true;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    setFieldError(id, message);
    return false;
  }
  clearFieldError(id);
  return true;
}

// Se utilizan setFieldError y clearFieldError importados desde validation-utils.js

function renderSummary() {
  const container = $('#resumenIncidencia');
  if (!container) return;
  const rows = [
    ['Titulo', $('#fTitulo')?.value],
    ['Tipo', selectedText('fTipo')],
    ['Subtipo', selectedText('fSubtipo') || 'No especificado'],
    ['Prioridad', selectedText('fPrioridad')],
    ['Ubicacion', [selectedText('fCiudad'), selectedText('fProvincia'), selectedText('fPais')].filter(Boolean).join(', ')],
    ['Direccion', $('#fDireccion')?.value || 'No especificada'],
    ['Coordenadas', formatCoordinates()],
    ['Contacto', $('#fCorreo')?.value],
  ];

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <tbody>
          ${rows.map(([label, value]) => `
            <tr>
              <th style="width: 160px;">${escapeHtml(label)}</th>
              <td>${escapeHtml(value || 'No especificado')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="mt-3">
      <strong>Descripcion</strong>
      <p class="mb-0 text-muted">${escapeHtml($('#fDescripcion')?.value || '')}</p>
    </div>`;
}

function selectedText(id) {
  const select = $(`#${id}`);
  return select?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function formatCoordinates() {
  const lat = $('#fLatitud')?.value;
  const lng = $('#fLongitud')?.value;
  return lat && lng ? `${lat}, ${lng}` : 'No especificadas';
}

function showFormAlert(message, type = 'danger') {
  const alert = $('#alertaFormulario');
  if (!alert) {
    showErrorAlert(message);
    return;
  }
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alert.style.display = 'block';
  window.setTimeout(() => {
    alert.style.display = 'none';
  }, 5000);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
