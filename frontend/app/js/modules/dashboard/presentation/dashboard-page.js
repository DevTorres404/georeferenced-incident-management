import { $, hide, showErrorAlert } from '../../../presentation/dom-utils.js?v=14'
import { readUser, userHasPermission } from '../../../core/auth-session.js?v=16'
import {
  INCIDENT_STATE_ALIASES,
  INCIDENT_STATES
} from '../../incidents/domain/incident-states.js?v=1'

import { getDashboardMetrics } from '../application/dashboard-service.js?v=14'
import {
  escapeHtml,
  formatCatalogLabel,
  formatShortDate,
  getPriorityHexColor,
  getStateHexColor,
  hidePageLoading,
  showPageLoading
} from '../../incidents/presentation/incidents-ui.js?v=16'

export const CHART_COLORS = {
  info: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  indigo: '#6366f1',
  teal: '#14b8a6'
}

export const CATEGORY_PALETTE = [
  CHART_COLORS.info,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.purple,
  CHART_COLORS.indigo
]

export const STATE_COLORS = {
  [INCIDENT_STATES.PENDING]: '#94a3b8',
  [INCIDENT_STATE_ALIASES.IN_PROCESS]: CHART_COLORS.info,
  [INCIDENT_STATES.RESOLVED]: CHART_COLORS.success
}
const dashboardCharts = {}

document.addEventListener('DOMContentLoaded', initDashboardPage)
globalThis.addEventListener('pagehide', event => {
  if (event.persisted) {
    return
  }

  destroyDashboardCharts()
})

export async function initDashboardPage() {
  await globalThis.renderLayout?.('dashboard')
  const user = readUser()
  const incidentNavigation = configureRecentIncidentsNavigation(user)

  showPageLoading('Cargando panel', 'Consultando métricas...')
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 12000)

  try {
    const metrics = await getDashboardMetrics()
    renderDashboardKpis(metrics.kpis || {}, incidentNavigation)
    renderPriorityBars(metrics.countsByPriority || {}, metrics.kpis?.total || 0)
    renderInfoCards(metrics)
    renderRecentIncidents(metrics.recentIncidents || [], incidentNavigation)
    renderCharts(metrics)
  } catch (error) {
    showErrorAlert(error.message || 'No se pudieron cargar las métricas del panel.')
  } finally {
    globalThis.clearTimeout(loadingFallback)
    hidePageLoading()
  }
}

export function renderDashboardKpis(kpis, navigation = getDashboardIncidentNavigation(readUser())) {
  const container = document.getElementById('kpiRow')
  if (!container) {
    return
  }

  const cards = [
    { label: 'Incidencias totales', value: kpis.total || 0, caption: 'Registros visibles', icon: 'fa-clipboard-list', accent: 'info' },
    { label: 'Pendientes', value: kpis.pending || 0, caption: 'Requieren clasificación', icon: 'fa-inbox', accent: 'warning' },
    { label: 'En progreso', value: kpis.progress || 0, caption: 'Atención operativa', icon: 'fa-tools', accent: 'primary' },
    { label: 'Resueltas', value: kpis.resolved || 0, caption: 'Casos completados', icon: 'fa-check-circle', accent: 'success' }
  ]

  container.innerHTML = cards.map(card => `
    <a class="dash-kpi-card" data-accent="${card.accent}" href="${navigation.listHref}">
      <div class="dash-kpi-content">
        <span class="dash-kpi-label">${escapeHtml(card.label)}</span>
        <strong class="dash-kpi-number">${Number(card.value)}</strong>
        <span class="dash-kpi-caption">${escapeHtml(card.caption)}</span>
      </div>
      <span class="dash-kpi-icon"><i class="fas ${card.icon}"></i></span>
    </a>`).join('')
}

/* ── Priority Bars ───────────────────────────────────────────────────────── */

export function renderPriorityBars(countsByPriority, total) {
  const container = $('#barrasPrioridad')
  if (!container) {
    return
  }

  const entries = Object.entries(countsByPriority)
  if (!entries.length) {
    container.innerHTML = '<p class="text-muted text-center mb-0" style="font-size:0.85rem;">Sin incidencias por prioridad.</p>'
    return
  }

  container.innerHTML = entries.map(([label, count]) => {
    const pct = total > 0 ? Math.round((Number(count) / total) * 100) : 0
    return `
      <div class="dash-priority-item">
        <div class="dash-priority-meta">
          <span class="dash-priority-label">
            <span class="dash-priority-dot" style="background:${priorityColor(label)};"></span>
            ${escapeHtml(formatCatalogLabel(label))}
          </span>
          <span class="dash-priority-count">${Number(count)} &middot; ${pct}%</span>
        </div>
        <div class="dash-priority-bar">
          <div class="dash-priority-bar-fill" style="width:${pct}%; background:${priorityColor(label)};"></div>
        </div>
      </div>`
  }).join('')
}

export function priorityColor(label) {
  const v = String(label || '').toUpperCase()
  if (v.includes('CRIT')) {
    return CHART_COLORS.danger
  }

  if (v.includes('ALTA')) {
    return CHART_COLORS.warning
  }

  if (v.includes('MEDIA')) {
    return CHART_COLORS.info
  }

  if (v.includes('BAJA')) {
    return CHART_COLORS.success
  }

  return '#94a3b8'
}

/* ── Info Cards ──────────────────────────────────────────────────────────── */

export function renderInfoCards(metrics) {
  const stack = $('#infoStack')
  if (!stack) {
    return
  }

  const topCity = metrics.topCities?.[0] || null
  const topCategory = topEntry(metrics.countsByCategory || {})
  const avgDays = Number(metrics.averageResolutionDays || 0)

  stack.innerHTML = `
    <div class="dash-info-card">
      <div class="dash-info-icon dash-info-icon--primary">
        <i class="fas fa-map-marker-alt"></i>
      </div>
      <div class="dash-info-body">
        <span class="dash-info-label">Ciudad con mas incidencias</span>
        <span class="dash-info-value">${escapeHtml(topCity?.city || 'Sin datos')}</span>
        <span class="dash-info-caption">${topCity ? `${topCity.count} incidencias registradas` : 'No hay datos disponibles'}</span>
      </div>
    </div>

    <div class="dash-info-card">
      <div class="dash-info-icon dash-info-icon--danger">
        <i class="fas fa-fire"></i>
      </div>
      <div class="dash-info-body">
        <span class="dash-info-label">Tipo mas frecuente</span>
        <span class="dash-info-value">${topCategory ? escapeHtml(formatCatalogLabel(topCategory[0])) : 'Sin datos'}</span>
        <span class="dash-info-caption">${topCategory ? `${topCategory[1]} incidencias` : 'No hay categorías registradas'}</span>
      </div>
    </div>

    <div class="dash-info-card">
      <div class="dash-info-icon dash-info-icon--warning">
        <i class="fas fa-clock"></i>
      </div>
      <div class="dash-info-body">
        <span class="dash-info-label">Tiempo promedio de resolución</span>
        <span class="dash-info-value">${avgDays.toFixed(1)} dias</span>
        <span class="dash-info-caption">En incidencias resueltas</span>
      </div>
    </div>`
}

/* ── Recent Incidents Table ──────────────────────────────────────────────── */

export function getDashboardIncidentNavigation(user) {
  const assignmentOnly = userHasPermission(user, 'incidents.assign') &&
    !userHasPermission(user, 'incidents.list')

  return assignmentOnly ?
    {
      title: 'Gestión de asignaciones',
      listHref: 'assignment-management.html',
      listLabel: 'Gestionar asignaciones',
      actionTitle: 'Gestionar asignación',
      incidentHref: incidentId => `assignment-management.html?incident_id=${incidentId}`
    } :
    {
      title: 'Últimas Incidencias',
      listHref: 'incidents.html',
      listLabel: 'Ver todas',
      actionTitle: 'Ver detalle',
      incidentHref: incidentId => `incident-detail.html?id=${incidentId}`
    }
}

export function configureRecentIncidentsNavigation(user) {
  const navigation = getDashboardIncidentNavigation(user)
  const title = document.getElementById('recentIncidentsTitle')
  const link = document.getElementById('recentIncidentsLink')
  const linkLabel = document.getElementById('recentIncidentsLinkLabel')

  if (title) {
    title.innerHTML = `<i class="fas fa-list"></i>${navigation.title}`
  }

  if (link) {
    link.href = navigation.listHref
  }

  if (linkLabel) {
    linkLabel.textContent = navigation.listLabel
  }

  return navigation
}

export function renderRecentIncidents(incidents, navigation = getDashboardIncidentNavigation(readUser())) {
  const tbody = $('#tablaUltimasBody')
  if (!tbody) {
    return
  }

  if (!incidents.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4 dash-table-empty-state">
          <i class="fas fa-inbox mr-1"></i>Sin incidencias recientes.
        </td>
      </tr>`
    return
  }

  tbody.innerHTML = incidents.map(incident => {
    const category = formatCatalogLabel(incident.category?.name || incident.subcategory?.name || '-')
    const priority = formatCatalogLabel(incident.priority?.name || '-')
    const state = formatCatalogLabel(incident.state?.name || '-')

    return `
      <tr>
        <td data-label="Código"><span class="dash-table-code">${escapeHtml(incident.code || `#${incident.id}`)}</span></td>
        <td class="dash-table-title" data-label="Título" title="${escapeHtml(incident.title || '')}">${escapeHtml(incident.title || 'Sin título')}</td>
        <td data-label="Tipo">${escapeHtml(category)}</td>
        <td data-label="Prioridad"><span class="badge" style="background-color: ${incident.priority?.color || getPriorityHexColor(priority)}; color: #fff">${escapeHtml(priority)}</span></td>
        <td data-label="Estado"><span class="badge" style="background-color: ${incident.state?.color || getStateHexColor(state)}; color: #fff">${escapeHtml(state)}</span></td>
        <td data-label="Fecha" style="white-space:nowrap;">${escapeHtml(formatShortDate(incident.created_at))}</td>
        <td data-label="Acciones">
          <a href="${navigation.incidentHref(incident.id)}" class="btn btn-xs btn-outline-primary" title="${navigation.actionTitle}">
            <i class="fas fa-eye"></i>
          </a>
        </td>
      </tr>`
  }).join('')
}

/* ── Charts ──────────────────────────────────────────────────────────────── */

export function renderCharts(metrics) {
  destroyDashboardCharts()
  if (!globalThis.Chart) {
    return
  }

  renderDoughnut('graficoPorTipo', metrics.countsByCategory || {})
  renderStateChart(metrics.countsByState || {})
  renderTrendChart(metrics.monthlyTrend || {})
}

function destroyDashboardCharts() {
  Object.values(dashboardCharts).forEach(chart => chart?.destroy?.())
  Object.keys(dashboardCharts).forEach(key => delete dashboardCharts[key])
}

function renderDoughnut(canvasId, dataMap) {
  const canvas = document.getElementById(canvasId)
  const entries = Object.entries(dataMap)
  if (!canvas || !entries.length) {
    return
  }

  dashboardCharts.categories = new globalThis.Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: entries.map(([label]) => formatCatalogLabel(label)),
      datasets: [{
        data: entries.map(([, value]) => Number(value)),
        backgroundColor: CATEGORY_PALETTE.slice(0, entries.length),
        borderWidth: 0,
        hoverBorderWidth: 2,
        hoverBorderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutoutPercentage: 60,
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 10,
          fontSize: 11,
          padding: 12,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltips: {
        backgroundColor: '#0f172a',
        titleFontFamily: 'Source Sans Pro',
        titleFontSize: 12,
        titleFontStyle: 'bold',
        bodyFontFamily: 'Source Sans Pro',
        bodyFontSize: 11,
        padding: 10,
        cornerRadius: 8
      }
    }
  })
}

function renderStateChart(countsByState) {
  const canvas = document.getElementById('graficoPorEstado')
  if (!canvas) {
    return
  }

  const labels = Object.keys(countsByState)
  const colors = labels.map(label => getStateHexColor(label))

  dashboardCharts.states = new globalThis.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.map(label => formatCatalogLabel(label)),
      datasets: [{
        label: 'Incidencias',
        data: labels.map(label => Number(countsByState[label] || 0)),
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 6,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      legend: { display: false },
      scales: {
        xAxes: [{
          ticks: { fontColor: '#334155', fontSize: 11 },
          gridLines: { display: false }
        }],
        yAxes: [{
          ticks: { beginAtZero: true, precision: 0, fontColor: '#64748b', fontSize: 11 },
          gridLines: { color: 'rgba(0,0,0,0.04)' }
        }]
      },
      tooltips: {
        backgroundColor: '#0f172a',
        titleFontFamily: 'Source Sans Pro',
        titleFontSize: 12,
        titleFontStyle: 'bold',
        bodyFontFamily: 'Source Sans Pro',
        bodyFontSize: 11,
        padding: 10,
        cornerRadius: 8
      }
    }
  })
}

function renderTrendChart(trend) {
  const canvas = document.getElementById('graficoTendencia')
  if (!canvas) {
    return
  }

  const datasets = (trend.series || []).map(serie => {
    return buildDataset(formatCatalogLabel(serie.name), serie.data, getStateHexColor(serie.name))
  })

  dashboardCharts.trend = new globalThis.Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: trend.months || [],
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      legend: {
        position: 'top',
        labels: {
          boxWidth: 10,
          fontSize: 11,
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      scales: {
        xAxes: [{
          ticks: { fontColor: '#64748b', fontSize: 11 },
          gridLines: { color: 'rgba(0,0,0,0.04)' }
        }],
        yAxes: [{
          ticks: { beginAtZero: true, precision: 0, fontColor: '#64748b', fontSize: 11 },
          gridLines: { color: 'rgba(0,0,0,0.04)' }
        }]
      },
      tooltips: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#0f172a',
        titleFontFamily: 'Source Sans Pro',
        titleFontSize: 12,
        titleFontStyle: 'bold',
        bodyFontFamily: 'Source Sans Pro',
        bodyFontSize: 11,
        padding: 10,
        cornerRadius: 8
      }
    }
  })
}

function buildDataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: `${color}18`,
    borderWidth: 2.5,
    pointRadius: 3,
    pointHoverRadius: 5,
    pointBackgroundColor: color,
    pointBorderColor: '#ffffff',
    pointBorderWidth: 2,
    fill: true,
    tension: 0.35
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function topEntry(values) {
  const entries = Object.entries(values)
  if (!entries.length) {
    return null
  }

  return entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0]
}

/* ── Map Previews ────────────────────────────────────────────────────────── */

export function renderMapMarkers(incidents) {
  const map = globalThis.__sgiDashMap
  if (!map || globalThis.maplibregl === undefined) {
    // If map is not initialized yet, try again shortly
    setTimeout(() => renderMapMarkers(incidents), 500)
    return
  }

  if (globalThis.__sgiDashMarkers) {
    globalThis.__sgiDashMarkers.forEach(m => m.remove())
  }

  globalThis.__sgiDashMarkers = []

  const bounds = new globalThis.maplibregl.LngLatBounds()
  let hasValidCoordinates = false

  incidents.forEach(incident => {
    if (!incident.latitude || !incident.longitude) {
      return
    }

    hasValidCoordinates = true

    const popupHtml = `
      <div style="font-family: 'Source Sans Pro', sans-serif;">
        <strong style="display:block; margin-bottom: 5px;">${escapeHtml(incident.title || 'Sin título')}</strong>
        <p style="margin: 0 0 10px 0; font-size: 0.85em; color: #6c757d;">
          ${escapeHtml(incident.code || `#${incident.id}`)} &middot; ${escapeHtml(incident.category?.name || 'Categoría')}
        </p>
        <a href="incident-detail.html?id=${incident.id}" class="btn btn-xs btn-primary d-block text-center" style="text-decoration:none;">
          <i class="fas fa-eye mr-1"></i> Ver Detalle
        </a>
      </div>
    `

    const el = document.createElement('div')
    el.style.width = '18px'
    el.style.height = '18px'
    el.style.backgroundColor = priorityColor(incident.priority?.name)
    el.style.borderRadius = '50%'
    el.style.border = '2px solid white'
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
    el.style.cursor = 'pointer'

    const marker = new globalThis.maplibregl.Marker({ element: el })
      .setLngLat([Number(incident.longitude), Number(incident.latitude)])
      .setPopup(new globalThis.maplibregl.Popup({ offset: 12 }).setHTML(popupHtml))
      .addTo(map)

    globalThis.__sgiDashMarkers.push(marker)
    bounds.extend([Number(incident.longitude), Number(incident.latitude)])
  })

  if (hasValidCoordinates) {
    try {
      map.fitBounds(bounds, { padding: 40, maxZoom: 15 })
    } catch (error) {
      console.warn('Map fitBounds failed:', error)
    }
  }
}
