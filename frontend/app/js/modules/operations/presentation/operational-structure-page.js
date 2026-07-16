import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_ECUADOR_BOUNDS,
  MAP_STYLE_URL,
} from '../../../core/config.js?v=20';
import { escapeHtml, hidePageLoading, showPageLoading } from '../../incidents/presentation/incidents-ui.js?v=16';
import {
  listOperationalZones,
  listOperationalSupervisors,
  listOperationalOperators,
  getOperationalZonesGeoJson,
  updateOperationalOperatorProfile,
  assignOperationalZoneSupervisor,
  replaceOperationalZoneOperator,
} from '../application/operational-structure-service.js?v=4';

const ZONE_COLOR_BY_CODE = {
  Z1: '#0f766e',
  Z2: '#2563eb',
  Z3: '#f97316',
  Z4: '#7c3aed',
  Z5: '#dc2626',
  Z6: '#059669',
  Z7: '#ca8a04',
  Z8: '#14b8a6',
};

const MAIN_SOURCE_ID = 'operational-zones-source';
const state = {
  zones: [],
  supervisors: [],
  operators: [],
  currentUser: null,
  map: null,
  zoneGeoJson: null,
  selectedZoneId: null,
  selectedZoneAnchorPoint: null,
  hoveredFeatureId: null,
  popup: null,
  operatorModalInstance: null,
  zoneManagersModalInstance: null,
};

document.addEventListener('DOMContentLoaded', initOperationalStructurePage);

export async function initOperationalStructurePage() {
  if (typeof globalThis.renderLayout === 'function') {
    globalThis.renderLayout('operational-structure');
  }

  state.currentUser = readSessionUser();
  bindEvents();
  applyAccessMode();
  await refreshPageData();
}

export async function refreshPageData() {
  showPageLoading('Cargando operación nacional', 'Consultando zonas, supervisores y operadores...');
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 12000);

  try {
    const [zones, supervisors, operators] = await Promise.all([
      listOperationalZones(),
      listOperationalSupervisors(),
      listOperationalOperators(),
    ]);

    state.zones = Array.isArray(zones) ? zones : [];
    state.supervisors = Array.isArray(supervisors) ? supervisors : [];
    state.operators = Array.isArray(operators) ? operators : [];
    state.priorities = [];

    state.zoneGeoJson = await buildZoneGeoJson(state.zones);

    renderSummary();
    renderSupervisors();
    renderOperators();
    renderZoneLegend();
    initializeMapsIfNeeded();
    syncMapsData();
    selectInitialZone();
    clearAlert();
  } catch (error) {
    renderError(error.message || 'No se pudo cargar la estructura operativa.');
  } finally {
    globalThis.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

export function bindEvents() {
  state.operatorModalInstance = $('#operatorProfileModal');
  state.zoneManagersModalInstance = $('#zoneManagersModal');

  document.addEventListener('click', (event) => {
    const operatorButton = event.target.closest('[data-action="edit-operator-profile"]');
    if (operatorButton) {
      openOperatorProfileModal(operatorButton);
      return;
    }

    const closeDetailButton = event.target.closest('[data-action="close-zone-detail"]');
    if (closeDetailButton) {
      clearSelectedZone();
      return;
    }

    const zoneButton = event.target.closest('[data-action="select-zone"]');
    if (zoneButton) {
      const zoneId = Number(zoneButton.dataset.zoneId || 0);
      if (zoneId > 0) {
        selectZone(zoneId, { fit: true });
      }
      return;
    }

    const zoneManagersButton = event.target.closest('[data-action="open-zone-managers"]');
    if (zoneManagersButton) {
      const zoneId = Number(zoneManagersButton.dataset.zoneId || state.selectedZoneId || 0);
      if (zoneId > 0) {
        openZoneManagersModal(zoneId);
      }
    }
  });

  document.getElementById('operatorProfileForm')?.addEventListener('submit', submitOperatorProfileForm);
  document.getElementById('changeSupervisorForm')?.addEventListener('submit', submitChangeSupervisorForm);
  document.getElementById('replaceOperatorForm')?.addEventListener('submit', submitReplaceOperatorForm);
}

export function applyAccessMode() {
  const isAdmin = userHasRole(state.currentUser, 'ADMIN');
  const changeSupervisorForm = document.getElementById('changeSupervisorForm');
  const replaceOperatorForm = document.getElementById('replaceOperatorForm');
  const modalSubtitle = document.getElementById('zoneManagersModalSubtitle');

  if (modalSubtitle) {
    modalSubtitle.textContent = isAdmin
      ? 'Consulta y ajusta el supervisor y sus operadores.'
      : 'Consulta el supervisor y los operadores asignados a tu zona.';
  }

  if (!isAdmin) {
    if (changeSupervisorForm) {
      changeSupervisorForm.classList.add('d-none');
    }
    if (replaceOperatorForm) {
      replaceOperatorForm.classList.add('d-none');
    }
  }
}

function initializeMapsIfNeeded() {
  if (!globalThis.maplibregl) {
    showMapUnavailableMessage('operationalCoverageMap');
    return;
  }

  if (!state.map) {
    state.map = new globalThis.maplibregl.Map({
      container: 'operationalCoverageMap',
      style: MAP_STYLE_URL,
      center: MAP_DEFAULT_CENTER,
      zoom: MAP_DEFAULT_ZOOM,
      maxBounds: MAP_ECUADOR_BOUNDS,
    });

    state.map.addControl(new globalThis.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    state.map.on('load', () => {
      ensureMainMapLayers();
      syncMapsData();
      selectInitialZone();
    });
  }
}

function ensureMainMapLayers() {
  if (!state.map || !state.map.isStyleLoaded()) return;

  if (!state.map.getSource(MAIN_SOURCE_ID)) {
    state.map.addSource(MAIN_SOURCE_ID, {
      type: 'geojson',
      data: state.zoneGeoJson || emptyGeoJson(),
      generateId: true,
    });
  }

  if (!state.map.getLayer('operational-zones-fill')) {
    state.map.addLayer({
      id: 'operational-zones-fill',
      type: 'fill',
      source: MAIN_SOURCE_ID,
      paint: {
        'fill-color': ['coalesce', ['get', 'zone_color'], '#94a3b8'],
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 0.72,
          0.56,
        ],
      },
    });
  }

  if (!state.map.getLayer('operational-zones-border')) {
    state.map.addLayer({
      id: 'operational-zones-border',
      type: 'line',
      source: MAIN_SOURCE_ID,
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.4,
        'line-opacity': 0.95,
      },
    });
  }

  if (!state.map.getLayer('selected-zone-fill')) {
    state.map.addLayer({
      id: 'selected-zone-fill',
      type: 'fill',
      source: MAIN_SOURCE_ID,
      filter: ['==', ['get', 'zone_id'], -1],
      paint: {
        'fill-color': ['coalesce', ['get', 'zone_color'], '#0f172a'],
        'fill-opacity': 0.92,
      },
    });
  }

  if (!state.map.getLayer('selected-zone-border')) {
    state.map.addLayer({
      id: 'selected-zone-border',
      type: 'line',
      source: MAIN_SOURCE_ID,
      filter: ['==', ['get', 'zone_id'], -1],
      paint: {
        'line-color': '#0f172a',
        'line-width': 3.4,
        'line-opacity': 0.98,
      },
    });
  }

  if (!state.map.getLayer('zone-labels')) {
    state.map.addLayer({
      id: 'zone-labels',
      type: 'symbol',
      source: MAIN_SOURCE_ID,
      layout: {
        'text-field': ['get', 'province_name'],
        'text-size': 10.5,
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
    });
  }

  bindMainMapInteractions();
}
function bindMainMapInteractions() {
  if (!state.map || state.map.__opsBoundInteractions) return;

  state.map.__opsBoundInteractions = true;

  state.map.on('mousemove', 'operational-zones-fill', (event) => {
    state.map.getCanvas().style.cursor = 'pointer';
    const feature = event.features?.[0];
    if (!feature) return;

    setHoveredFeature(feature.id);
    showZonePopup(event.lngLat, feature.properties);
  });

  state.map.on('mouseleave', 'operational-zones-fill', () => {
    state.map.getCanvas().style.cursor = '';
    clearHoveredFeature();
    state.popup?.remove();
  });

  state.map.on('click', 'operational-zones-fill', (event) => {
    const feature = event.features?.[0];
    const zoneId = Number(feature?.properties?.zone_id || 0);
    if (zoneId > 0) {
      selectZone(zoneId, { fit: false, anchorPoint: event.point });
    }
  });

  // Click en espacio vacío del mapa → cerrar detalle
  state.map.on('click', (event) => {
    if (!state.selectedZoneId) return;
    const features = state.map.queryRenderedFeatures(event.point, {
      layers: ['operational-zones-fill'],
    });
    if (!features.length) {
      clearSelectedZone();
    }
  });

  // Escape → cerrar detalle
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.selectedZoneId) {
      clearSelectedZone();
    }
  });
}

function syncMapsData() {
  if (state.map?.getSource(MAIN_SOURCE_ID)) {
    state.map.getSource(MAIN_SOURCE_ID).setData(state.zoneGeoJson || emptyGeoJson());
  }

  syncSelectedZoneLayers();
}

export function selectZone(zoneId, options = {}) {
  const zone = findZoneById(zoneId);
  if (!zone) return;

  state.selectedZoneId = zoneId;
  state.selectedZoneAnchorPoint = options.anchorPoint || null;
  syncSelectedZoneLayers();
  renderSelectedZoneDetail(zone);

  if (options.fit !== false) {
    fitZone(zone);
  }

  updateTeamManagementTab(zone);
}

function selectInitialZone() {
  if (state.selectedZoneId) {
    const currentZone = findZoneById(state.selectedZoneId);
    if (currentZone) {
      renderSelectedZoneDetail(currentZone);
      return;
    }
  }

  clearSelectedZone();
}

export function clearSelectedZone() {
  state.selectedZoneId = null;
  state.selectedZoneAnchorPoint = null;
  syncSelectedZoneLayers();
  renderSelectedZoneDetail(null);
}

function syncSelectedZoneLayers() {
  const zoneId = Number(state.selectedZoneId || -1);

  if (state.map?.getLayer('selected-zone-fill')) {
    state.map.setFilter('selected-zone-fill', ['==', ['get', 'zone_id'], zoneId]);
    state.map.setFilter('selected-zone-border', ['==', ['get', 'zone_id'], zoneId]);
  }
}

function fitZone(zone) {
  const features = zoneFeatures(zone.zone?.id);
  if (!features.length || !globalThis.maplibregl || !state.map) return;

  const bounds = new globalThis.maplibregl.LngLatBounds();
  features.forEach((feature) => extendBounds(bounds, feature.geometry?.coordinates, feature.geometry?.type));

  if (!bounds.isEmpty()) {
    state.map.fitBounds(bounds, {
      padding: { top: 70, right: 70, bottom: 70, left: 70 },
      maxZoom: zone.zone?.code === 'Z7' ? 6.2 : 7.8,
      duration: 850,
    });
  }
}

function setHoveredFeature(featureId) {
  if (!state.map || state.hoveredFeatureId === featureId) return;

  clearHoveredFeature();
  state.hoveredFeatureId = featureId;
  state.map.setFeatureState({ source: MAIN_SOURCE_ID, id: featureId }, { hover: true });
}

function clearHoveredFeature() {
  if (!state.map || state.hoveredFeatureId === null) return;

  state.map.setFeatureState({ source: MAIN_SOURCE_ID, id: state.hoveredFeatureId }, { hover: false });
  state.hoveredFeatureId = null;
}

function showZonePopup(lngLat, properties = {}) {
  if (!globalThis.maplibregl) return;

  const zone = findZoneById(Number(properties.zone_id || 0));
  if (!zone) return;

  if (!state.popup) {
    state.popup = new globalThis.maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 18,
      className: 'ops-zone-popup',
    });
  }

  state.popup
    .setLngLat(lngLat)
    .setHTML(buildZonePopupHtml(zone, properties.province_name))
    .addTo(state.map);
}

export function renderSummary() {
  setText('opsTotalZones', state.zones.length);

  const coveredProvinces = state.zones.reduce((total, zone) => total + (zone.provinces_covered || []).length, 0);
  setText('opsCoveredProvinces', coveredProvinces);

  const activeIncidents = state.zones.reduce((total, zone) => total + Number(zone.active_incidents || 0), 0);
  setText('opsActiveIncidents', activeIncidents);

  const averageWorkload = state.operators.length
    ? state.operators.reduce((total, item) => total + Number(item.current_workload_points || 0), 0) / state.operators.length
    : 0;
  setText('opsNationalWorkload', `${formatDecimal(averageWorkload)} pts`);
}

export function renderSupervisors() {
  const target = document.getElementById('supervisorsTableBody');
  if (!target) return;

  if (!state.supervisors.length) {
    target.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No hay supervisores registrados.</td></tr>`;
    return;
  }

  target.innerHTML = state.supervisors.map((item) => {
    const sName = fullName(item.supervisor) || 'Supervisor';
    return `
      <tr>
        <td>
          <div class="ops-user-block">
            ${renderAvatar(sName)}
            <div class="ops-user-info">
              <span class="font-weight-bold text-dark">${escapeHtml(sName)}</span>
              <small class="text-muted">${escapeHtml(item.supervisor?.email || '-')}</small>
            </div>
          </div>
        </td>
        <td><span class="badge badge-light shadow-sm text-dark px-3 py-1 border">${escapeHtml(item.supervisor?.operational_zone?.name || 'Sin zona')}</span></td>
        <td><strong>${escapeHtml(item.active_operators_count || 0)}</strong> <span class="text-muted">/ ${escapeHtml(item.max_operators || 0)}</span></td>
        <td><small class="text-muted"><i class="fas fa-map-marker-alt mr-1 text-primary"></i>${escapeHtml(item.supervisor?.territory?.full_path || '-')}</small></td>
        <td>${renderOperatorStack(item.operators || [])}</td>
      </tr>
    `;
  }).join('');
}

export function renderOperators() {
  const target = document.getElementById('operatorsTableBody');
  if (!target) return;
  const canManageOperations = userHasRole(state.currentUser, 'ADMIN');

  if (!state.operators.length) {
    target.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No hay operadores registrados.</td></tr>`;
    return;
  }

  target.innerHTML = state.operators.map((item) => {
    const oName = fullName(item.operator) || 'Operador';
    return `
      <tr>
        <td>
          <div class="ops-user-block">
            ${renderAvatar(oName)}
            <div class="ops-user-info">
              <span class="font-weight-bold text-dark">${escapeHtml(oName)}</span>
              <small class="text-muted">${escapeHtml(item.operator?.email || '-')}</small>
            </div>
          </div>
        </td>
        <td><span class="badge badge-light shadow-sm text-dark px-3 py-1 border">${escapeHtml(item.operator?.operational_zone?.name || 'Sin zona')}</span></td>
        <td>${escapeHtml(item.supervisor ? fullName(item.supervisor) : 'Sin supervisor')}</td>
        <td><small class="text-muted"><i class="fas fa-map-marker-alt mr-1 text-primary"></i>${escapeHtml(item.operator?.territory?.full_path || '-')}</small></td>
        <td>
          <div class="ops-metric-pile">
            <span class="badge badge-info">${escapeHtml(item.current_active_incidents || 0)} / ${escapeHtml(item.max_active_incidents || 0)} activas</span>
            <span class="badge badge-secondary">${escapeHtml(item.current_workload_points || 0)} / ${escapeHtml(item.max_workload_points || 0)} pts</span>
            <span class="badge ${item.active ? 'badge-success' : 'badge-danger'}">${item.active ? 'Activo' : 'Inactivo'}</span>
          </div>
        </td>
        <td class="text-right">
          ${canManageOperations ? `
            <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-operator-profile" data-operator-id="${escapeHtml(item.operator?.id || 0)}">
              Ajustar
            </button>
          ` : '<span class="text-muted small">Solo lectura</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function renderZoneLegend() {
  const target = document.getElementById('operationalZoneLegend');
  if (!target) return;

  target.innerHTML = state.zones.map((zone) => `
    <div class="ops-map-legend__item">
      <span class="ops-map-legend__swatch" style="background:${escapeHtml(zoneColor(zone.zone?.code))}"></span>
      <span>${escapeHtml(zone.zone?.name || 'Zona')}</span>
    </div>
  `).join('');
}

export function renderSelectedZoneDetail(zone) {
  const target = document.getElementById('selectedZoneDetailPanel');
  const wrapper = document.getElementById('selectedZoneDetailWrapper');
  if (!target || !wrapper) return;

  if (!zone) {
    wrapper.classList.add('d-none');
    target.innerHTML = '';
    wrapper.style.removeProperty('--detail-left');
    wrapper.style.removeProperty('--detail-top');
    return;
  }

  wrapper.classList.remove('d-none');
  applyZoneDetailPosition(wrapper, state.selectedZoneAnchorPoint);

  const provinces = Array.isArray(zone.provinces_covered) ? zone.provinces_covered : [];
  const color = zoneColor(zone.zone?.code);
  const provinceNames = provinces.map((item) => item.name).filter(Boolean);
  const provinceSummary = buildProvinceSummary(provinceNames);

  target.innerHTML = `
    <div class="ops-zone-detail-grid" style="--zone-color:${escapeHtml(color)};">
      <div class="ops-zone-detail-hero">
        <div class="ops-zone-detail-head">
          <div>
            <span class="ops-eyebrow">Zona seleccionada</span>
            <h4>${escapeHtml(zone.zone?.name || 'Zona')}</h4>
            <p>${escapeHtml(provinceSummary)}</p>
          </div>
          <div class="ops-zone-detail-actions">
            <span class="ops-zone-detail-code">${escapeHtml(zone.zone?.code || '---')}</span>
            <button type="button" class="ops-zone-detail-close" data-action="close-zone-detail" aria-label="Cerrar ficha de zona">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="ops-zone-detail-metrics">
        <article>
          <span>Activas</span>
          <strong>${escapeHtml(zone.active_incidents || 0)}</strong>
        </article>
        <article>
          <span>Carga</span>
          <strong>${escapeHtml(zone.average_workload_points || 0)} pts</strong>
        </article>
      </div>

      <div class="ops-zone-contact">
        <span>${escapeHtml(`Supervisor: ${fullName(zone.supervisor) || 'Pendiente'}`)}</span>
        <button type="button" class="btn btn-sm btn-outline-primary ops-zone-detail-button" data-action="open-zone-managers" data-zone-id="${escapeHtml(zone.zone?.id || 0)}">
          Ver equipo
        </button>
      </div>
    </div>
  `;
}


export function buildZonePopupHtml(zone, provinceName) {
  return `
    <div class="ops-popup">
      <h6>${escapeHtml(zone.zone?.name || 'Zona')}</h6>
      <p>${escapeHtml(provinceName || 'Provincia sin identificar')}</p>
      <dl>
        <dt>Codigo</dt><dd>${escapeHtml(zone.zone?.code || '---')}</dd>
        <dt>Provincias</dt><dd>${escapeHtml((zone.provinces_covered || []).length || 0)}</dd>
        <dt>Activas</dt><dd>${escapeHtml(zone.active_incidents || 0)}</dd>
        <dt>Carga</dt><dd>${escapeHtml(zone.average_workload_points || 0)} pts</dd>
      </dl>
    </div>
  `;
}

function applyZoneDetailPosition(wrapper, anchorPoint) {
  if (!wrapper || !anchorPoint || globalThis.innerWidth <= 991) {
    wrapper.style.removeProperty('--detail-left');
    wrapper.style.removeProperty('--detail-top');
    return;
  }

  const mapCanvas = document.getElementById('operationalCoverageMap');
  const bounds = mapCanvas?.getBoundingClientRect();
  if (!bounds) return;

  const safeLeft = clamp(anchorPoint.x, 170, Math.max(170, bounds.width - 170));
  const safeTop = clamp(anchorPoint.y, 150, Math.max(150, bounds.height - 24));

  wrapper.style.setProperty('--detail-left', `${safeLeft}px`);
  wrapper.style.setProperty('--detail-top', `${safeTop}px`);
}

export function openZoneManagersModal(zoneId) {
  const zone = findZoneById(zoneId);
  const target = document.getElementById('zoneManagersModalBody');
  const subtitle = document.getElementById('zoneManagersModalSubtitle');
  if (!zone || !target || !subtitle) return;

  const zoneOperators = operatorsForZone(zoneId);
  const supervisorName = fullName(zone.supervisor) || 'Sin supervisor asignado';
    const supervisorEmail = zone.supervisor?.email || 'Pendiente de asignación';
  const provinceNames = (zone.provinces_covered || []).map((province) => province.name).filter(Boolean);
  const provinceSummary = buildProvinceSummary(provinceNames);

  subtitle.textContent = `${zone.zone?.name || 'Zona'} · ${provinceNames.join(', ') || 'Sin provincias asociadas'}`;
  target.innerHTML = `
    <div class="ops-managers-modal">
      <section class="ops-managers-panel">
        <span class="ops-eyebrow">Supervisor</span>
        <div class="ops-user-block">
          ${renderAvatar(supervisorName)}
          <div class="ops-user-info">
            <span class="font-weight-bold text-dark">${escapeHtml(supervisorName)}</span>
            <small class="text-muted">${escapeHtml(supervisorEmail)}</small>
          </div>
        </div>
      </section>
      <section class="ops-managers-panel">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="ops-eyebrow mb-0">Operadores</span>
          <span class="badge badge-light border">${escapeHtml(zoneOperators.length)} registrados</span>
        </div>
        ${renderZoneManagersList(zoneOperators)}
      </section>

    </div>
  `;

  state.zoneManagersModalInstance?.modal('show');
}

export function openOperatorProfileModal(button) {
  const operatorId = Number(button.dataset.operatorId || 0);
  const operator = state.operators.find((item) => Number(item.operator?.id) === operatorId);
  if (!operator) return;

  setFieldValue('operatorProfileUserId', operatorId);
  setFieldValue('operatorProfileName', fullName(operator.operator) || 'Operador');
  setFieldValue('operatorMaxActiveIncidents', operator.max_active_incidents || operator.incident_capacity || 10);
  setFieldValue('operatorMaxWorkloadPoints', operator.max_workload_points || 20);
  setCheckboxValue('operatorProfileActive', Boolean(operator.active));

  state.operatorModalInstance?.modal('show');
}

export async function submitOperatorProfileForm(event) {
  event.preventDefault();

  const operatorId = Number(getFieldValue('operatorProfileUserId') || 0);
  const maxActiveIncidents = Number(getFieldValue('operatorMaxActiveIncidents') || 0);
  const maxWorkloadPoints = Number(getFieldValue('operatorMaxWorkloadPoints') || 0);
  const active = isChecked('operatorProfileActive');

  if (!operatorId || maxActiveIncidents < 1 || maxWorkloadPoints < 1) {
    renderError('Completa correctamente los limites del operador.');
    return;
  }

  try {
    showPageLoading('Guardando operador', 'Actualizando limites del operador...');
    await updateOperationalOperatorProfile(operatorId, {
      max_active_incidents: maxActiveIncidents,
      max_workload_points: maxWorkloadPoints,
      active,
    });

    state.operatorModalInstance?.modal('hide');
    await refreshPageData();
    renderSuccess('Perfil operativo del operador actualizado correctamente.');
  } catch (error) {
    renderError(error.message || 'No se pudo actualizar el perfil del operador.');
  } finally {
    hidePageLoading();
  }
}

async function buildZoneGeoJson(zones) {
  const baseGeoJson = await getOperationalZonesGeoJson();
  const lookup = buildProvinceZoneLookup(zones);

  const features = (baseGeoJson.features || []).map((feature, index) => {
    const provinceName = sanitizeProvinceName(feature?.properties?.province_name);
    const zone = lookup[normalizeText(provinceName)] || null;

    return {
      ...feature,
      id: index + 1,
      properties: {
        ...feature.properties,
        province_name: provinceName,
        zone_id: zone?.zone?.id ?? null,
        zone_name: zone?.zone?.name ?? 'Sin zona',
        zone_code: zone?.zone?.code ?? '',
        zone_color: zoneColor(zone?.zone?.code),
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}


export function buildProvinceZoneLookup(zones) {
  return zones.reduce((lookup, zone) => {
    (zone.provinces_covered || []).forEach((province) => {
      lookup[normalizeText(province.name)] = zone;
    });
    return lookup;
  }, {});
}


export function extractCatalogItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function operatorsForZone(zoneId) {
  return state.operators.filter((item) => Number(item.operator?.operational_zone?.id) === Number(zoneId));
}

function zoneFeatures(zoneId) {
  return (state.zoneGeoJson?.features || []).filter((feature) => Number(feature?.properties?.zone_id) === Number(zoneId));
}

function findZoneById(zoneId) {
  return state.zones.find((item) => Number(item.zone?.id) === Number(zoneId)) || null;
}

function findZoneByCode(zoneCode) {
  return state.zones.find((item) => String(item.zone?.code || '') === String(zoneCode || '')) || null;
}


export function zoneColor(zoneCode) {
  return ZONE_COLOR_BY_CODE[String(zoneCode || '').toUpperCase()] || '#64748b';
}

function extendBounds(bounds, coordinates, geometryType) {
  if (!coordinates) return;

  if (geometryType === 'Polygon') {
    coordinates.flat().forEach((coord) => bounds.extend(coord));
    return;
  }

  if (geometryType === 'MultiPolygon') {
    coordinates.flat(2).forEach((coord) => bounds.extend(coord));
  }
}


export function emptyGeoJson() {
  return { type: 'FeatureCollection', features: [] };
}

function showMapUnavailableMessage(id) {
  const target = document.getElementById(id);
  if (!target) return;

  target.innerHTML = `
    <div class="map-empty-state">
      <i class="fas fa-map-marked-alt"></i>
      <strong>No se pudo cargar el mapa</strong>
      <span>Verifica la conexion para cargar MapLibre GL JS y el estilo base.</span>
    </div>
  `;
}

function renderOperatorStack(operators) {
  if (!operators.length) {
    return '<span class="text-muted">Sin operadores asignados</span>';
  }

  return `
    <div class="ops-inline-stack">
      ${operators.map((operator) => `<span class="ops-inline-pill">${escapeHtml(fullName(operator) || 'Operador')}</span>`).join('')}
    </div>
  `;
}

function renderZoneManagersList(operators) {
  if (!operators.length) {
    return '<div class="text-muted small">No hay operadores asignados a esta zona.</div>';
  }

  return `
    <div class="ops-zone-manager-list">
      ${operators.map((item) => {
    const name = fullName(item.operator) || 'Operador';
    const activeIncidents = item.current_active_incidents || 0;
    const maxIncidents = item.max_active_incidents || 0;
    const currentPts = item.current_workload_points || 0;
    const maxPts = item.max_workload_points || 0;

    // Determinar estado de saturación y cobertura (si la API no la da, inferimos Principal para demo)
    const isSaturated = (activeIncidents >= maxIncidents) || (currentPts >= maxPts);
    const statusBadge = !item.active ? '<span class="badge badge-danger">Inactivo</span>' : (isSaturated ? '<span class="badge badge-warning">Saturado</span>' : '<span class="badge badge-success">Activo</span>');
    const coverageType = item.coverage_type || 'Principal'; // Fallback if API doesn't provide it

    return `
          <article class="ops-zone-manager-card">
            <div class="ops-user-block">
              ${renderAvatar(name)}
              <div class="ops-user-info">
                <div class="d-flex align-items-center mb-1" style="gap:6px;">
                  <span class="font-weight-bold text-dark">${escapeHtml(name)}</span>
                  ${statusBadge}
                </div>
                <small class="text-muted d-block">${escapeHtml(item.operator?.email || '-')}</small>
                <small class="text-primary mt-1 d-block"><i class="fas fa-shield-alt mr-1"></i>Cobertura: ${escapeHtml(coverageType)}</small>
              </div>
            </div>
            <div class="ops-metric-pile mt-2 pt-2 border-top">
              <span class="badge badge-info">${escapeHtml(activeIncidents)} / ${escapeHtml(maxIncidents)} activas</span>
              <span class="badge badge-secondary">${escapeHtml(currentPts)} / ${escapeHtml(maxPts)} pts</span>
            </div>
          </article>
        `;
  }).join('')}
    </div>
  `;
}




function renderError(message) {
  const alert = document.getElementById('operationalStructureAlert');
  if (!alert) return;

  alert.className = 'alert alert-danger';
  alert.textContent = message;
  alert.classList.remove('d-none');
}

function readSessionUser() {
  try {
    const raw = localStorage.getItem('user_data');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}


export function userHasRole(user, roleCode) {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((role) => normalizeCode(role) === roleCode);
}

function normalizeCode(value) {
  if (typeof value === 'string') return value;
  return value?.code || value?.codigo || '';
}

function renderSuccess(message) {
  const alert = document.getElementById('operationalStructureAlert');
  if (!alert) return;

  alert.className = 'alert alert-success';
  alert.textContent = message;
  alert.classList.remove('d-none');
}

function clearAlert() {
  const alert = document.getElementById('operationalStructureAlert');
  if (!alert) return;

  alert.className = 'alert d-none';
  alert.textContent = '';
}


export function emptyState(message) {
  return `
    <div class="text-center text-muted py-5 border rounded bg-white">
      <i class="fas fa-sitemap fa-2x mb-3 d-block"></i>
      <strong class="d-block mb-1">${escapeHtml(message)}</strong>
    </div>`;
}


export function fullName(user) {
  if (!user) return '';

  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
}


export function normalizeText(value) {
  return sanitizeProvinceName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}


export function sanitizeProvinceName(value) {
  const replacements = {
    'BolÃ­var': 'Bolivar',
    'CaÃ±ar': 'Canar',
    'GalÃ¡pagos': 'Galapagos',
    'Los RÃ­os': 'Los Rios',
    'Santo Domingo de los TsÃ¡chilas': 'Santo Domingo de los Tsachilas',
    'MuÃ±oz': 'Munoz',
  };
  const normalized = String(value || '').trim();

  return replacements[normalized] || normalized;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = String(value);
  }
}


export function formatDecimal(value) {
  return Number(value || 0).toFixed(1);
}


export function clamp(value, min, max) {
  return Math.min(Math.max(Number(value || 0), min), max);
}


export function buildProvinceSummary(provinceNames) {
  if (!provinceNames.length) {
    return 'Sin provincias asociadas';
  }

  if (provinceNames.length === 1) {
    return provinceNames[0];
  }

  return `${provinceNames[0]} +${provinceNames.length - 1}`;
}

function setFieldValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = String(value ?? '');
  }
}

function getFieldValue(id) {
  return document.getElementById(id)?.value ?? '';
}

function setCheckboxValue(id, checked) {
  const element = document.getElementById(id);
  if (element) {
    element.checked = Boolean(checked);
  }
}

function isChecked(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function renderAvatar(name) {
  const initials = String(name || 'U').substring(0, 2).toUpperCase();
  const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899'];
  const colorIndex = initials.charCodeAt(0) % colors.length;
  const bgColor = colors[colorIndex] || colors[0];

  return `<div class="ops-avatar" style="background-color: ${bgColor};">${escapeHtml(initials)}</div>`;
}

// ============================================================================
// GESTION DE EQUIPO (TABS)
// ============================================================================

function updateTeamManagementTab(zone) {
  const zoneTitle = document.getElementById('zoneTitle');
  if (zoneTitle) {
    zoneTitle.innerHTML = `<i class="fas fa-map-marker-alt mr-2 text-danger"></i>${escapeHtml(zone.zone?.name || 'Zona')}`;
  }

  const supContainer = document.getElementById('supervisorInfoContainer');
  const supSelect = document.getElementById('supervisorSelect');
  const btnSup = document.getElementById('btnSaveSupervisor');

  if (supContainer && supSelect && btnSup) {
    const supervisorName = fullName(zone.supervisor) || 'Sin supervisor asignado';
  const supervisorEmail = zone.supervisor?.email || 'Pendiente de asignación';

    supContainer.innerHTML = `
      <div class="ops-user-block bg-white p-3 border rounded shadow-sm">
        ${renderAvatar(supervisorName)}
        <div class="ops-user-info">
          <span class="font-weight-bold text-dark d-block" style="font-size: 1.1rem;">${escapeHtml(supervisorName)}</span>
          <small class="text-muted">${escapeHtml(supervisorEmail)}</small>
        </div>
      </div>
    `;

    const currentSupervisorId = Number(zone.supervisor?.id || 0);
    supSelect.innerHTML = state.supervisors.map(item => {
      const supervisorId = Number(item.supervisor?.id || 0);
      const label = `${fullName(item.supervisor) || 'Supervisor'}${supervisorId === currentSupervisorId ? ' (Actual)' : ''}`;
      return `<option value="${escapeHtml(supervisorId)}" ${supervisorId === currentSupervisorId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    
    supSelect.disabled = false;
    btnSup.disabled = false;
  }

  const opContainer = document.getElementById('operatorsListContainer');
  const opSelectCurrent = document.getElementById('currentOperatorSelect');
  const opSelectReplacement = document.getElementById('replacementOperatorSelect');
  const btnOp = document.getElementById('btnReplaceOperator');

  if (opContainer && opSelectCurrent && opSelectReplacement && btnOp) {
    const zoneOperators = state.operators.filter((item) => Number(item.operator?.operational_zone?.id) === Number(zone.zone?.id));

    if (!zoneOperators.length) {
      opContainer.innerHTML = '<div class="alert alert-light border text-muted"><i class="fas fa-info-circle mr-2"></i>No hay operadores asignados a esta zona.</div>';
      opSelectCurrent.innerHTML = '<option value="">Sin operadores</option>';
    } else {
      opContainer.innerHTML = zoneOperators.map(item => {
        const name = fullName(item.operator) || 'Operador';
        const activeIncidents = item.current_active_incidents || 0;
        const maxIncidents = item.max_active_incidents || 0;
        const currentPts = item.current_workload_points || 0;
        const maxPts = item.max_workload_points || 0;
        const coverageType = item.coverage_type || 'Principal';
        
        const isSaturated = (activeIncidents >= maxIncidents) || (currentPts >= maxPts);
        const statusBadge = !item.active ? '<span class="badge badge-danger">Inactivo</span>' : (isSaturated ? '<span class="badge badge-warning">Saturado</span>' : '<span class="badge badge-success">Activo</span>');

        return `
          <div class="bg-white p-3 border rounded shadow-sm mb-2 d-flex justify-content-between align-items-center">
            <div class="ops-user-block mb-0">
              ${renderAvatar(name)}
              <div class="ops-user-info">
                <span class="font-weight-bold text-dark">${escapeHtml(name)}</span>
                ${statusBadge}
                <small class="text-muted d-block">${escapeHtml(item.operator?.email || '-')}</small>
                <small class="text-primary mt-1 d-block"><i class="fas fa-shield-alt mr-1"></i>Cobertura: ${escapeHtml(coverageType)}</small>
              </div>
            </div>
            <div class="text-right">
               <div class="badge badge-info mb-1">${escapeHtml(activeIncidents)} / ${escapeHtml(maxIncidents)} act</div><br>
               <div class="badge badge-secondary">${escapeHtml(currentPts)} / ${escapeHtml(maxPts)} pts</div>
            </div>
          </div>
        `;
      }).join('');

      opSelectCurrent.innerHTML = zoneOperators.map(item => 
        `<option value="${escapeHtml(item.operator?.id || 0)}">${escapeHtml(fullName(item.operator) || 'Operador')}</option>`
      ).join('');
    }

    const currentZoneOperatorIds = new Set(zoneOperators.map((item) => Number(item.operator?.id || 0)));
    const availableOperators = state.operators.filter((item) => !currentZoneOperatorIds.has(Number(item.operator?.id || 0)));

    if (!availableOperators.length) {
      opSelectReplacement.innerHTML = '<option value="">No hay operadores disponibles</option>';
    } else {
      opSelectReplacement.innerHTML = availableOperators.map(item => {
        const zoneName = item.operator?.operational_zone?.name || 'Sin zona';
        return `<option value="${escapeHtml(item.operator?.id || 0)}">${escapeHtml(fullName(item.operator) || 'Operador')} (${escapeHtml(zoneName)})</option>`;
      }).join('');
    }
    
    opSelectCurrent.disabled = false;
    opSelectReplacement.disabled = false;
    btnOp.disabled = false;
  }
}

export async function submitChangeSupervisorForm(event) {
  event.preventDefault();
  if (!state.selectedZoneId) return;

  const select = document.getElementById('supervisorSelect');
  const supervisorId = Number(select?.value || 0);

  if (!supervisorId) {
    renderError('Selecciona un supervisor válido.');
    return;
  }

  try {
    showPageLoading('Guardando cambios', 'Asignando nuevo supervisor...');
    const formData = { supervisor_user_id: supervisorId };
    await assignOperationalZoneSupervisor(state.selectedZoneId, formData);
    await refreshPageData();
    selectZone(state.selectedZoneId, { fit: false });
    renderSuccess('Supervisor asignado correctamente.');
  } catch (error) {
    renderError(error.message || 'No se pudo cambiar el supervisor.');
  } finally {
    hidePageLoading();
  }
}

export async function submitReplaceOperatorForm(event) {
  event.preventDefault();
  if (!state.selectedZoneId) return;

  const selectCurrent = document.getElementById('currentOperatorSelect');
  const selectReplacement = document.getElementById('replacementOperatorSelect');
  
  const currentId = Number(selectCurrent?.value || 0);
  const replacementId = Number(selectReplacement?.value || 0);

  if (!currentId || !replacementId) {
    renderError('Selecciona el operador actual y el de reemplazo.');
    return;
  }

  try {
    showPageLoading('Transferencia en curso', 'Reemplazando operador y migrando incidencias...');
    const formData = { replacement_operator_user_id: replacementId };
    await replaceOperationalZoneOperator(currentId, formData);
    await refreshPageData();
    selectZone(state.selectedZoneId, { fit: false });
    renderSuccess('Operador reemplazado y cargas transferidas exitosamente.');
  } catch (error) {
    renderError(error.message || 'No se pudo reemplazar al operador.');
  } finally {
    hidePageLoading();
  }
}
