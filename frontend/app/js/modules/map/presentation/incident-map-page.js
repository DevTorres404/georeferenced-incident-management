import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_STYLE_URL } from '../../../core/config.js?v=20'
import { readUser } from '../../../core/auth-session.js?v=14'
import { hideMainLoader, showMainLoader } from '../../../layout/loader.js?v=20'
import { escapeHtml } from '../../../shared/sanitizer.js?v=20'
import { getMapCatalogs, listIncidentMapPoints } from '../application/map-service.js?v=1'
import { formatCatalogLabel, getPriorityHexColor, getStateHexColor } from '../../incidents/presentation/incidents-ui.js?v=2'

const state = {
  map: null,
  markers: [],
  points: [],
  currentUser: null
}

document.addEventListener('DOMContentLoaded', initIncidentMapPage)

async function initIncidentMapPage() {
  if (typeof globalThis.renderLayout === 'function') {
    globalThis.renderLayout('incident-map')
  }

  state.currentUser = readUser()
  configureScopeControls()
  bindEvents()
  showMainLoader()

  try {
    await loadCatalogFilters()
    await loadMapPoints()
    initializeMap()
  } catch (error) {
    showMessage(error.message || 'No se pudo cargar el mapa de incidencias.', 'danger')
  } finally {
    hideMainLoader()
  }

  // Refrescar mapa cuando llega una notificación de cambio
  globalThis.addEventListener('sgi:notification-created', () => {
    if (document.visibilityState !== 'hidden') {
      refreshMap()
    }
  })
}

function bindEvents() {
  document.getElementById('btnMapFilters')?.addEventListener('click', async () => {
    await refreshMap()
  })

  document.getElementById('btnClearMapFilters')?.addEventListener('click', async () => {
    ['mapSearch', 'mapState', 'mapPriority', 'mapCategory', 'mapAssignmentStatus'].forEach(id => {
      const element = document.getElementById(id)
      if (element) {
        element.value = ''
      }
    })
    resetScopeControls()
    await refreshMap()
  })

  document.getElementById('mapIncidentList')?.addEventListener('click', event => {
    const button = event.target.closest('.js-focus-incident')
    if (!button) {
      return
    }

    const point = state.points.find(item => String(item.id) === String(button.dataset.incidentId))
    if (point) {
      focusPoint(point)
    }
  })
}

function configureScopeControls() {
  const mineWrapper = document.getElementById('mapMineScope')
  const assignedWrapper = document.getElementById('mapAssignedScope')
  const context = document.getElementById('mapScopeContext')
  const mine = document.getElementById('mapMine')
  const assigned = document.getElementById('mapAssignedToMe')
  const isAdmin = userHasRole(state.currentUser, 'ADMIN')
  const isSupervisor = userHasRole(state.currentUser, 'SUPERVISOR') && !isAdmin
  const isOperator = userHasRole(state.currentUser, 'OPERADOR') && !isAdmin && !isSupervisor

  if (mineWrapper) {
    mineWrapper.style.display = (isOperator || isSupervisor) ? 'none' : ''
  }

  if (assignedWrapper) {
    assignedWrapper.style.display = isOperator ? '' : 'none'
  }

  if (mine) {
    mine.disabled = isOperator || isSupervisor
    mine.checked = !isAdmin && !isSupervisor && !isOperator
  }

  if (assigned) {
    assigned.disabled = isOperator
    assigned.checked = isOperator
  }

  if (!context) {
    return
  }

  if (isSupervisor) {
    context.textContent = 'Mostrando incidencias de tu zona operativa.'
  } else if (isOperator) {
    context.textContent = 'El mapa muestra únicamente las incidencias que tienes asignadas.'
  } else if (isAdmin) {
    context.textContent = 'Cobertura nacional. Puedes reducir la vista a tus reportes.'
  } else {
    context.textContent = 'El mapa muestra únicamente tus reportes.'
  }
}

function resetScopeControls() {
  const mine = document.getElementById('mapMine')
  const assigned = document.getElementById('mapAssignedToMe')
  const isAdmin = userHasRole(state.currentUser, 'ADMIN')
  const isSupervisor = userHasRole(state.currentUser, 'SUPERVISOR') && !isAdmin
  const isOperator = userHasRole(state.currentUser, 'OPERADOR') && !isAdmin && !isSupervisor

  if (mine) {
    mine.checked = !isAdmin && !isSupervisor && !isOperator
  }

  if (assigned) {
    assigned.checked = isOperator
  }
}

export function userHasRole(user, roleCode) {
  if (!user || !Array.isArray(user.roles)) {
    return false
  }

  return user.roles.some(role => {
    const code = typeof role === 'string' ? role : (role?.code || role?.codigo || '')
    return String(code).trim().toUpperCase() === roleCode
  })
}

async function refreshMap() {
  showMainLoader()
  try {
    await loadMapPoints()
    renderMarkers()
    renderList()
  } catch (error) {
    showMessage(error.message || 'No se pudieron actualizar las incidencias del mapa.', 'danger')
  } finally {
    hideMainLoader()
  }
}

async function loadCatalogFilters() {
  const catalogs = await getMapCatalogs()
  fillSelect('mapState', catalogs.states, 'Todos los estados')
  fillSelect('mapPriority', catalogs.priorities, 'Todas las prioridades')
  fillSelect('mapCategory', catalogs.categories, 'Todas las categorías')
}

function fillSelect(id, items, placeholder) {
  const select = document.getElementById(id)
  if (!select) {
    return
  }

  select.textContent = ''
  const defaultOption = document.createElement('option')
  defaultOption.value = ''
  defaultOption.textContent = placeholder
  select.appendChild(defaultOption)

  items.forEach(item => {
    const option = document.createElement('option')
    option.value = item.id
    option.textContent = item.name || item.nombre || `#${item.id}`
    select.appendChild(option)
  })
}

async function loadMapPoints() {
  state.points = await listIncidentMapPoints(buildFilters())
  updateCounter()
}

function buildFilters() {
  const assignmentStatus = document.getElementById('mapAssignmentStatus')?.value
  let is_assigned = ''
  if (assignmentStatus === 'assigned') is_assigned = 1
  if (assignmentStatus === 'unassigned') is_assigned = 0

  return {
    search: document.getElementById('mapSearch')?.value.trim(),
    state_id: document.getElementById('mapState')?.value,
    priority_id: document.getElementById('mapPriority')?.value,
    category_id: document.getElementById('mapCategory')?.value,
    mine: document.getElementById('mapMine')?.checked ? 1 : '',
    assigned_to_me: document.getElementById('mapAssignedToMe')?.checked ? 1 : '',
    is_assigned: is_assigned,
    limit: 500
  }
}

function initializeMap() {
  if (!globalThis.maplibregl) {
    showMapLibreMessage()
    return
  }

  state.map = new globalThis.maplibregl.Map({
    container: 'incidentsMap',
    style: MAP_STYLE_URL,
    center: MAP_DEFAULT_CENTER,
    zoom: MAP_DEFAULT_ZOOM
  })

  state.map.addControl(new globalThis.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
  state.map.addControl(new globalThis.maplibregl.FullscreenControl(), 'top-right')

  // Esperar a que el style cargue antes de agregar sources/layers
  state.map.on('load', () => {
    renderMarkers()
    renderList()
  })
}

function renderMarkers() {
  if (!state.map) {
    return
  }

  const geojson = {
    type: 'FeatureCollection',
    features: state.points
      .map(point => {
        const lng = Number(point.longitude)
        const lat = Number(point.latitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null
        }

        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            ...point,
            _priority_name: normalizePriorityName(point.priority),
            state_name: point.state?.name || '',
            priority_name: point.priority?.name || ''
          }
        }
      })
      .filter(Boolean)
  }

  const source = state.map.getSource('incidents-source')

  if (source) {
    source.setData(geojson)
  } else {
    // Configurar la fuente y capas por primera vez
    state.map.addSource('incidents-source', {
      type: 'geojson',
      data: geojson,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    })

    state.map.addLayer({
      id: 'incidents-clusters',
      type: 'circle',
      source: 'incidents-source',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#3498db',
        'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40],
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    })

    state.map.addLayer({
      id: 'incidents-cluster-count',
      type: 'symbol',
      source: 'incidents-source',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 12
      },
      paint: { 'text-color': '#fff' }
    })

    state.map.addLayer({
      id: 'incidents-points',
      type: 'circle',
      source: 'incidents-source',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 10, 7],
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'active'], false],
          '#e74c3c',
          [
            'match',
            ['get', '_priority_name'],
            'CRITICA',
            '#e74c3c',
            'ALTA',
            '#f39c12',
            'MEDIA',
            '#3498db',
            '#27ae60'
          ]
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    })

    // Enlazar eventos SOLAMENTE UNA VEZ
    state.map.on('click', 'incidents-clusters', e => {
      const clusterId = e.features[0].properties.cluster_id
      state.map.getSource('incidents-source').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) {
          return
        }

        state.map.easeTo({ center: e.lngLat, zoom, duration: 300 })
      })
    })

    state.map.on('click', 'incidents-points', e => {
      if (!e.features.length) {
        return
      }

      const point = e.features[0].properties
      if (typeof console?.warn === 'function' && !point.state_name && !point.state?.name) {
        console.warn('[SGI Mapa] El punto no tiene estado:', point.id, point.code)
      }

      new globalThis.maplibregl.Popup({ offset: 18 })
        .setLngLat(e.lngLat)
        .setHTML(buildPopupHtml(point))
        .addTo(state.map)
    })

    state.map.on('mouseenter', 'incidents-clusters', () => {
      state.map.getCanvas().style.cursor = 'pointer'
    })
    state.map.on('mouseleave', 'incidents-clusters', () => {
      state.map.getCanvas().style.cursor = ''
    })
    state.map.on('mouseenter', 'incidents-points', () => {
      state.map.getCanvas().style.cursor = 'pointer'
    })
    state.map.on('mouseleave', 'incidents-points', () => {
      state.map.getCanvas().style.cursor = ''
    })
  }

  // Ajustar la vista si hay puntos
  if (geojson.features.length > 0) {
    const bounds = new globalThis.maplibregl.LngLatBounds()
    geojson.features.forEach(feature => bounds.extend(feature.geometry.coordinates))
    state.map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 700 })
  }
}

function renderList() {
  const list = document.getElementById('mapIncidentList')
  if (!list) {
    return
  }

  if (!state.points.length) {
    list.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="fas fa-map-marker-alt fa-2x mb-2 d-block"></i>
        No hay incidencias georreferenciadas para los filtros seleccionados.
      </div>`
    return
  }

  list.innerHTML = state.points.map(point => {
    const stateName = point.state_name || point.state?.name || point.state?.nombre || ''
    const priorityName = point.priority_name || point.priority?.name || point.priority?.nombre || ''

    const stateLabel = formatCatalogLabel(stateName)
    const stateColor = point.state_color || getStateHexColor(stateName)

    const priorityLabel = formatCatalogLabel(priorityName)
    const priorityColor = point.priority_color || getPriorityHexColor(priorityName)

    return `
    <button type="button" class="list-group-item list-group-item-action js-focus-incident" data-incident-id="${escapeHtml(point.id)}">
      <div class="d-flex align-items-start justify-content-between">
        <div>
          <strong>${escapeHtml(point.code || `#${point.id}`)}</strong>
          <div class="text-main">${escapeHtml(point.title || 'Sin título')}</div>
          <small class="text-muted">${escapeHtml(point.address || point.city?.name || 'Sin dirección registrada')}</small>
        </div>
        <span class="badge shadow-sm" style="background-color: ${priorityColor}; color: #fff;">${escapeHtml(priorityLabel || '-')}</span>
      </div>
      <div class="mt-2">
        <span class="badge shadow-sm" style="background-color: ${stateColor}; color: #fff;">${escapeHtml(stateLabel || 'Sin estado')}</span>
        <span class="badge badge-light">${escapeHtml(formatCatalogLabel(point.category?.name || point.category_name || 'Sin categoría'))}</span>
      </div>
    </button>
  `
  }).join('')
}

function focusPoint(point) {
  if (!state.map) {
    return
  }

  const lng = Number(point.longitude)
  const lat = Number(point.latitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return
  }

  // Close any open popups
  const popups = document.querySelectorAll('.maplibregl-popup')
  popups.forEach(p => p.remove())

  // Create and show popup at the point location
  const popup = new globalThis.maplibregl.Popup({ offset: 18 })
    .setLngLat([lng, lat])
    .setHTML(buildPopupHtml(point))
    .addTo(state.map)

  // Navigate to the point
  state.map.easeTo({
    center: [lng, lat],
    zoom: 16,
    duration: 650
  })
}

function buildPopupHtml(point) {
  // Extraer nombre de estado y prioridad desde múltiples formatos posibles
  const stateName = point.state_name || point.state?.name || point.state?.nombre || ''
  const priorityName = point.priority_name || point.priority?.name || point.priority?.nombre || ''

  const stateLabel = formatCatalogLabel(stateName)
  const stateColor = point.state_color || getStateHexColor(stateName)

  const priorityLabel = formatCatalogLabel(priorityName)
  const priorityColor = point.priority_color || getPriorityHexColor(priorityName)

  return `
    <div class="incident-map-popup">
      <strong>${escapeHtml(point.code || `#${point.id}`)}</strong>
      <p>${escapeHtml(point.title || 'Sin título')}</p>
      <dl>
        <dt>Estado</dt><dd><span class="badge shadow-sm" style="background-color: ${stateColor}; color: #fff;">${escapeHtml(stateLabel || '-')}</span></dd>
        <dt>Prioridad</dt><dd><span class="badge shadow-sm" style="background-color: ${priorityColor}; color: #fff;">${escapeHtml(priorityLabel || '-')}</span></dd>
        <dt>Ubicación</dt><dd>${escapeHtml(point.address || point.city?.name || '-')}</dd>
      </dl>
      <a class="btn btn-sm btn-primary btn-block" href="incident-detail.html?id=${encodeURIComponent(point.id)}">
        Ver detalle
      </a>
    </div>`
}

function showMapLibreMessage() {
  const map = document.getElementById('incidentsMap')
  if (!map) {
    return
  }

  map.innerHTML = `
    <div class="map-empty-state">
      <i class="fas fa-map-marked-alt"></i>
      <strong>No se pudo cargar el mapa</strong>
      <span>Verifica la conexion para cargar MapLibre GL JS y el estilo de OpenFreeMap.</span>
    </div>`
}

function updateCounter() {
  const counter = document.getElementById('mapCounter')
  if (counter) {
    counter.textContent = `${state.points.length} incidencias`
  }
}

function showMessage(message, type = 'info') {
  const target = document.getElementById('alertaGlobal')
  if (!target) {
    return
  }

  target.className = `alert alert-${type} alert-dismissible fade show`
  target.innerHTML = `
    <i class="fas fa-info-circle mr-2"></i>${escapeHtml(message)}
    <button type="button" class="close" data-dismiss="alert" aria-label="Cerrar">
      <span aria-hidden="true">&times;</span>
    </button>`
  target.style.display = 'block'
}

export function normalizePriorityName(priority) {
  return normalizeText(priority?.name || '')
}

export function getPriorityBadgeClass(value) {
  const normalized = normalizeText(value)
  if (normalized.includes('CRIT')) {
    return 'badge-danger'
  }

  if (normalized.includes('ALTA')) {
    return 'badge-warning'
  }

  if (normalized.includes('MEDIA')) {
    return 'badge-info'
  }

  return 'badge-success'
}

export function formatLabel(value) {
  const text = String(value || '-').replaceAll('_', ' ').trim()
  if (!text || text === '-') {
    return '-'
  }

  return text
    .toLocaleLowerCase('es-EC')
    .replace(/(^|\s)(\p{L})/gu, match => match.toLocaleUpperCase('es-EC'))
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toUpperCase()
}

export {
  initIncidentMapPage,
  initializeMap,
  renderMarkers,
  renderList,
  focusPoint,
  buildPopupHtml,
  refreshMap,
  configureScopeControls,
  resetScopeControls,
  showMessage,
  loadCatalogFilters,
  fillSelect,
  buildFilters,
  loadMapPoints,
  updateCounter,
  bindEvents,
  showMapLibreMessage
}
