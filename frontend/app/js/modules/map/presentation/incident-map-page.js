import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_STYLE_URL } from '../../../core/config.js?v=20';
import { hideMainLoader, showMainLoader } from '../../../layout/loader.js?v=20';
import { escapeHtml } from '../../../shared/sanitizer.js?v=20';
import { getMapCatalogs, listIncidentMapPoints } from '../application/map-service.js?v=1';

const state = {
  map: null,
  markers: [],
  points: [],
};

document.addEventListener('DOMContentLoaded', initIncidentMapPage);

async function initIncidentMapPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('incident-map');
  }

  bindEvents();
  showMainLoader();

  try {
    await loadCatalogFilters();
    await loadMapPoints();
    initializeMap();
    renderMarkers();
    renderList();
  } catch (error) {
    showMessage(error.message || 'No se pudo cargar el mapa de incidencias.', 'danger');
  } finally {
    hideMainLoader();
  }
}

function bindEvents() {
  document.getElementById('btnMapFilters')?.addEventListener('click', async () => {
    await refreshMap();
  });

  document.getElementById('btnClearMapFilters')?.addEventListener('click', async () => {
    ['mapSearch', 'mapState', 'mapPriority', 'mapCategory'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.value = '';
    });
    const mine = document.getElementById('mapMine');
    const assigned = document.getElementById('mapAssignedToMe');
    if (mine) mine.checked = false;
    if (assigned) assigned.checked = false;
    await refreshMap();
  });

  document.getElementById('mapIncidentList')?.addEventListener('click', (event) => {
    const button = event.target.closest('.js-focus-incident');
    if (!button) return;
    const point = state.points.find((item) => String(item.id) === String(button.dataset.incidentId));
    if (point) focusPoint(point);
  });
}

async function refreshMap() {
  showMainLoader();
  try {
    await loadMapPoints();
    renderMarkers();
    renderList();
  } catch (error) {
    showMessage(error.message || 'No se pudieron actualizar las incidencias del mapa.', 'danger');
  } finally {
    hideMainLoader();
  }
}

async function loadCatalogFilters() {
  const catalogs = await getMapCatalogs();
  fillSelect('mapState', catalogs.states, 'Todos los estados');
  fillSelect('mapPriority', catalogs.priorities, 'Todas las prioridades');
  fillSelect('mapCategory', catalogs.categories, 'Todas las categorías');
}

function fillSelect(id, items, placeholder) {
  const select = document.getElementById(id);
  if (!select) return;

  select.textContent = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = placeholder;
  select.appendChild(defaultOption);

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name || item.nombre || `#${item.id}`;
    select.appendChild(option);
  });
}

async function loadMapPoints() {
  state.points = await listIncidentMapPoints(buildFilters());
  updateCounter();
}

function buildFilters() {
  return {
    search: document.getElementById('mapSearch')?.value.trim(),
    state_id: document.getElementById('mapState')?.value,
    priority_id: document.getElementById('mapPriority')?.value,
    category_id: document.getElementById('mapCategory')?.value,
    mine: document.getElementById('mapMine')?.checked ? 1 : '',
    assigned_to_me: document.getElementById('mapAssignedToMe')?.checked ? 1 : '',
    limit: 500,
  };
}

function initializeMap() {
  if (!window.maplibregl) {
    showMapLibreMessage();
    return;
  }

  state.map = new window.maplibregl.Map({
    container: 'incidentsMap',
    style: MAP_STYLE_URL,
    center: MAP_DEFAULT_CENTER,
    zoom: MAP_DEFAULT_ZOOM,
  });

  state.map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  state.map.addControl(new window.maplibregl.FullscreenControl(), 'top-right');
}

function renderMarkers() {
  clearMarkers();

  if (!state.map) {
    return;
  }

  const bounds = new window.maplibregl.LngLatBounds();

  state.points.forEach((point) => {
    const lng = Number(point.longitude);
    const lat = Number(point.latitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const marker = new window.maplibregl.Marker({ element: buildMarkerElement(point) })
      .setLngLat([lng, lat])
      .setPopup(new window.maplibregl.Popup({ offset: 18 }).setHTML(buildPopupHtml(point)))
      .addTo(state.map);

    state.markers.push(marker);
    bounds.extend([lng, lat]);
  });

  if (!bounds.isEmpty()) {
    state.map.fitBounds(bounds, {
      padding: 60,
      maxZoom: 15,
      duration: 700,
    });
  }
}

function clearMarkers() {
  state.markers.forEach((marker) => marker.remove());
  state.markers = [];
}

function renderList() {
  const list = document.getElementById('mapIncidentList');
  if (!list) return;

  if (!state.points.length) {
    list.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="fas fa-map-marker-alt fa-2x mb-2 d-block"></i>
        No hay incidencias georreferenciadas para los filtros seleccionados.
      </div>`;
    return;
  }

  list.innerHTML = state.points.map((point) => `
    <button type="button" class="list-group-item list-group-item-action js-focus-incident" data-incident-id="${escapeHtml(point.id)}">
      <div class="d-flex align-items-start justify-content-between">
        <div>
          <strong>${escapeHtml(point.code || `#${point.id}`)}</strong>
          <div class="text-main">${escapeHtml(point.title || 'Sin título')}</div>
          <small class="text-muted">${escapeHtml(point.address || point.city?.name || 'Sin dirección registrada')}</small>
        </div>
        <span class="badge ${getPriorityBadgeClass(point.priority?.name)}">${escapeHtml(formatLabel(point.priority?.name || '-'))}</span>
      </div>
      <div class="mt-2">
        <span class="badge badge-light">${escapeHtml(formatLabel(point.state?.name || 'Sin estado'))}</span>
        <span class="badge badge-light">${escapeHtml(formatLabel(point.category?.name || 'Sin categoría'))}</span>
      </div>
    </button>
  `).join('');
}

function focusPoint(point) {
  if (!state.map) return;
  state.map.easeTo({
    center: [Number(point.longitude), Number(point.latitude)],
    zoom: 16,
    duration: 650,
  });
}

function buildPopupHtml(point) {
  return `
    <div class="incident-map-popup">
      <strong>${escapeHtml(point.code || `#${point.id}`)}</strong>
      <p>${escapeHtml(point.title || 'Sin título')}</p>
      <dl>
        <dt>Estado</dt><dd>${escapeHtml(formatLabel(point.state?.name || '-'))}</dd>
        <dt>Prioridad</dt><dd>${escapeHtml(formatLabel(point.priority?.name || '-'))}</dd>
        <dt>Ubicación</dt><dd>${escapeHtml(point.address || point.city?.name || '-')}</dd>
      </dl>
      <a class="btn btn-sm btn-primary btn-block" href="incident-detail.html?id=${encodeURIComponent(point.id)}">
        Ver detalle
      </a>
    </div>`;
}

function showMapLibreMessage() {
  const map = document.getElementById('incidentsMap');
  if (!map) return;

  map.innerHTML = `
    <div class="map-empty-state">
      <i class="fas fa-map-marked-alt"></i>
      <strong>No se pudo cargar el mapa</strong>
      <span>Verifica la conexion para cargar MapLibre GL JS y el estilo de OpenFreeMap.</span>
    </div>`;
}

function buildMarkerElement(point) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `incident-map-marker ${getPriorityClass(point.priority?.name)}`;
  element.setAttribute('aria-label', `Ver incidencia ${point.code || point.id}`);
  return element;
}

function updateCounter() {
  const counter = document.getElementById('mapCounter');
  if (counter) {
    counter.textContent = `${state.points.length} incidencias`;
  }
}

function showMessage(message, type = 'info') {
  const target = document.getElementById('alertaGlobal');
  if (!target) return;
  target.className = `alert alert-${type} alert-dismissible fade show`;
  target.innerHTML = `
    <i class="fas fa-info-circle mr-2"></i>${escapeHtml(message)}
    <button type="button" class="close" data-dismiss="alert" aria-label="Cerrar">
      <span aria-hidden="true">&times;</span>
    </button>`;
  target.style.display = 'block';
}

function getPriorityClass(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('CRIT')) return 'is-critical';
  if (normalized.includes('ALTA')) return 'is-high';
  if (normalized.includes('MEDIA')) return 'is-medium';
  return 'is-low';
}

function getPriorityBadgeClass(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('CRIT')) return 'badge-danger';
  if (normalized.includes('ALTA')) return 'badge-warning';
  if (normalized.includes('MEDIA')) return 'badge-info';
  return 'badge-success';
}

function formatLabel(value) {
  const text = String(value || '-').replace(/_/g, ' ').trim();
  if (!text || text === '-') return '-';

  return text
    .toLocaleLowerCase('es-EC')
    .replace(/(^|\s)(\p{L})/gu, (match) => match.toLocaleUpperCase('es-EC'));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}
