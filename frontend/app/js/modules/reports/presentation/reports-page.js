import { listIncidents, listStates, getReportAnalytics } from '../../incidents/application/incidents-service.js?v=20'
import { getCategories } from '../../catalogs/application/catalog-service.js?v=2'
import {
  escapeHtml,
  formatCatalogLabel,
  hidePageLoading,
  normalizeCatalogCode,
  showPageLoading
} from '../../incidents/presentation/incidents-ui.js?v=17'
import {
  handleBackendErrors,
  setFieldError,
  clearFieldError,
  setupValidationListeners
} from '../../../shared/validators/validation-utils.js?v=1'

export const CHART_COLORS = {
  primary: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  indigo: '#6366f1',
  teal: '#14b8a6',
  slate: '#64748b',
  palette: ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#14b8a6', '#ec4899']
}

export const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: true,
  legend: { position: 'bottom', labels: { boxWidth: 12, fontSize: 11, padding: 16, usePointStyle: true } },
  tooltips: {
    backgroundColor: '#0f172a',
    titleFont: { size: 12, weight: '600' },
    bodyFont: { size: 11 },
    padding: 10,
    cornerRadius: 8,
    displayColors: true,
    boxPadding: 4
  }
}

const state = {
  charts: {},
  states: [],
  categories: []
}

document.addEventListener('DOMContentLoaded', initReportsPage)

export async function initReportsPage() {
  globalThis.renderLayout?.('reports')

  adjustLayoutForRoles()

  bindActions()
  showPageLoading('Generando reportes', 'Consolidando tendencias e indicadores...')
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 12000)

  try {
    const [statesResponse, categoriesResponse] = await Promise.all([
      listStates(),
      getCategories()
    ])
    state.states = Array.isArray(statesResponse?.data) ? statesResponse.data : []
    state.categories = Array.isArray(categoriesResponse) ? categoriesResponse : []

    hydrateFilterOptions()
    await applyCurrentFilters()
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('alertaGlobal'))
  } finally {
    globalThis.clearTimeout(loadingFallback)
    hidePageLoading()
  }
}

export function adjustLayoutForRoles() {
  try {
    const raw = localStorage.getItem('user_data')
    const user = raw ? JSON.parse(raw) : null
    if (!user || !Array.isArray(user.roles)) {
      return
    }

    const isSupervisor = user.roles.some(r => r.code === 'SUPERVISOR')
    const isAdmin = user.roles.some(r => r.code === 'ADMIN')

    if (isSupervisor && !isAdmin) {
      // We leave 'Top Ciudades' visible now because some zones have multiple provinces/cities.

      // Ensure other columns look good (we keep them as col-lg-4, so no need to adjust)
    }
  } catch (error) {
    console.warn('Error al ajustar layout por roles:', error)
  }
}

function bindActions() {
  const form = document.getElementById('filtroReporte')
  if (form) {
    setupValidationListeners(form)
    form.addEventListener('submit', event => {
      event.preventDefault()
      applyCurrentFilters()
    })
  }

  document.getElementById('btnFiltrar')?.addEventListener('click', applyCurrentFilters)
  document.getElementById('btnLimpiarFiltros')?.addEventListener('click', resetFilters)
  document.getElementById('btnExportExcel')?.addEventListener('click', exportFilteredIncidentsCsv)
  document.getElementById('btnExportPDF')?.addEventListener('click', exportAnalyticsPdf)
}

function hydrateFilterOptions() {
  populateSelect('selectTipoFiltro', uniqueSortedValues(state.categories.map(c => c.name)))
  populateSelect('selectEstadoFiltro', uniqueSortedValues(state.states.map(s => s.code || s.name)))
}

function populateSelect(id, values) {
  const select = document.getElementById(id)
  if (!select) {
    return
  }

  const currentValue = select.value
  const firstOption = select.querySelector('option')
  const placeholder = firstOption ? firstOption.outerHTML : '<option value="">Todos</option>'

  select.innerHTML = placeholder + values.map(value => (
    `<option value="${escapeHtml(value)}">${escapeHtml(formatCatalogLabel(value))}</option>`
  )).join('')
  select.value = currentValue
}

export function uniqueSortedValues(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()))]
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

export function resetFilters() {
  const form = document.getElementById('filtroReporte')
  form?.reset()
  clearFieldError(document.getElementById('fFechaInicial'))
  clearFieldError(document.getElementById('fFechaFinal'))
  applyCurrentFilters()
}

export async function applyCurrentFilters() {
  if (!validateFilters()) {
    return
  }

  const filters = getFilters()
  showPageLoading('Actualizando reportes', 'Calculando estadísticas en tiempo real...')

  try {
    const response = await getReportAnalytics({
      start_date: filters.startDate,
      end_date: filters.endDate,
      category: filters.category,
      state: filters.state
    })

    const analytics = response.data

    renderKpis(analytics)
    renderInsights(analytics, filters)
    renderCharts(analytics)
    renderRankings(analytics)
    renderEfficiency(analytics)
    renderSummary(analytics)
    renderAppliedFilterFeedback(filters, analytics.total)
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('alertaGlobal'))
  } finally {
    hidePageLoading()
  }
}

function validateFilters() {
  const fechaIni = document.getElementById('fFechaInicial')
  const fechaFin = document.getElementById('fFechaFinal')

  clearFieldError(fechaIni)
  clearFieldError(fechaFin)

  if (fechaIni?.value && fechaFin?.value && new Date(fechaFin.value) < new Date(fechaIni.value)) {
    setFieldError(fechaFin, 'La fecha final no puede ser menor a la inicial.')
    return false
  }

  return true
}

function getFilters() {
  return {
    startDate: document.getElementById('fFechaInicial')?.value || '',
    endDate: document.getElementById('fFechaFinal')?.value || '',
    category: document.getElementById('selectTipoFiltro')?.value || '',
    state: document.getElementById('selectEstadoFiltro')?.value || ''
  }
}

function renderKpis(analytics) {
  const container = document.getElementById('kpiCards')
  if (!container) {
    return
  }

  const cards = [
    { num: analytics.total, label: 'Incidencias', sub: 'Bajo el filtro actual', icon: 'fa-clipboard-list', variant: 'kpi-total' },
    { num: analytics.active, label: 'Activas', sub: 'Carga operativa actual', icon: 'fa-bolt', variant: 'kpi-pending' },
    { num: analytics.critical, label: 'Críticas', sub: 'Requieren seguimiento', icon: 'fa-radiation-alt', variant: 'kpi-progress' },
    { num: `${analytics.resolutionRate}%`, label: 'Resolución', sub: 'Cierre efectivo', icon: 'fa-check-double', variant: 'kpi-resolved' },
    { num: `${Number(analytics.averageResolutionDays || 0).toFixed(1)}d`, label: 'Tiempo prom.', sub: 'Resolución media', icon: 'fa-stopwatch', variant: 'kpi-time' },
    { num: analytics.overdue, label: 'Vencidas', sub: 'Fuera de plazo', icon: 'fa-hourglass-end', variant: 'kpi-rate' }
  ]

  container.innerHTML = cards.map(card => `
    <div class="reports-kpi-card ${card.variant}">
      <div class="reports-kpi-icon"><i class="fas ${card.icon}"></i></div>
      <div class="reports-kpi-body">
        <div class="reports-kpi-number">${escapeHtml(String(card.num))}</div>
        <div class="reports-kpi-label">${escapeHtml(card.label)}</div>
        <div class="reports-kpi-sub">${escapeHtml(card.sub)}</div>
      </div>
    </div>`).join('')
}

function renderInsights(analytics, filters) {
  const cardsContainer = document.getElementById('reportInsightCards')
  const narrativeContainer = document.getElementById('reportInsightNarrative')
  if (!cardsContainer || !narrativeContainer) {
    return
  }

  if (!analytics.total) {
    cardsContainer.innerHTML = `
      <article class="reports-brief-item reports-brief-item-empty">
        <div class="reports-brief-icon"><i class="fas fa-inbox"></i></div>
        <div class="reports-brief-content">
          <span class="reports-brief-label">Sin resultados</span>
          <strong class="reports-brief-value">0 incidencias</strong>
          <small class="reports-brief-meta">Ajusta el rango, categoría o estado para ampliar el análisis.</small>
        </div>
      </article>
    `
    narrativeContainer.innerHTML = '<p class="mb-0"><strong>Lectura operativa:</strong> No hay incidencias que coincidan con el filtro actual.</p>'
    return
  }

  const coverage = analytics.totalUniverse > 0 ?
    Math.round((analytics.total / analytics.totalUniverse) * 100) :
    0

  let dominantCategory = null
  if (analytics.countsByCategory && Object.keys(analytics.countsByCategory).length > 0) {
    const entries = Object.entries(analytics.countsByCategory).sort((a, b) => b[1] - a[1])
    if (entries.length > 0) {
      dominantCategory = { label: entries[0][0], count: entries[0][1] }
    }
  }

  let dominantPriority = null
  if (analytics.countsByPriority && Object.keys(analytics.countsByPriority).length > 0) {
    const entries = Object.entries(analytics.countsByPriority).sort((a, b) => b[1] - a[1])
    if (entries.length > 0) {
      dominantPriority = { label: entries[0][0], count: entries[0][1] }
    }
  }

  const pressure = analytics.active > analytics.resolved ? 'La carga activa supera a los cierres del periodo.' : 'El volumen resuelto mantiene el ritmo operativo.'

  const insightCards = [
    {
      title: 'Cobertura del análisis',
      value: `${coverage}%`,
      meta: analytics.totalUniverse > 0 ? `${analytics.total} de ${analytics.totalUniverse} incidencias visibles` : `${analytics.total} incidencias visibles`,
      icon: 'fa-layer-group'
    },
    {
      title: 'Mayor concentración',
      value: dominantCategory?.label || 'Sin categoría',
      meta: dominantCategory ? `${dominantCategory.count} registros` : 'Sin datos suficientes',
      icon: 'fa-folder-open'
    },
    {
      title: 'Prioridad dominante',
      value: dominantPriority?.label || 'Sin prioridad',
      meta: dominantPriority ? `${dominantPriority.count} incidencias` : 'Sin datos suficientes',
      icon: 'fa-flag'
    }
  ]

  cardsContainer.innerHTML = insightCards.map(card => `
    <article class="reports-brief-item">
      <div class="reports-brief-icon"><i class="fas ${card.icon}"></i></div>
      <div class="reports-brief-content">
        <span class="reports-brief-label">${escapeHtml(card.title)}</span>
        <strong class="reports-brief-value">${escapeHtml(card.value)}</strong>
        <small class="reports-brief-meta">${escapeHtml(card.meta)}</small>
      </div>
    </article>
  `).join('')

  const rangeLabel = buildRangeLabel(filters)
  narrativeContainer.innerHTML = `
    <p class="mb-0">
      <strong>Lectura operativa:</strong> ${escapeHtml(pressure)}
      ${analytics.overdue > 0 ? ` Hay ${analytics.overdue} incidencias vencidas que merecen priorización.` : ' No hay incidencias vencidas dentro del filtro seleccionado.'}
      ${rangeLabel ? ` Periodo analizado: ${escapeHtml(rangeLabel)}.` : ''}
    </p>
  `
}

function buildRangeLabel(filters) {
  if (filters.startDate && filters.endDate) {
    return `Del ${filters.startDate} al ${filters.endDate}`
  }

  if (filters.startDate) {
    return `Desde el ${filters.startDate}`
  }

  if (filters.endDate) {
    return `Hasta el ${filters.endDate}`
  }

  return ''
}

function renderCharts(analytics) {
  if (!globalThis.Chart) {
    return
  }

  configureChartDefaults()
  destroyCharts()
  safeRenderChart(() => renderMonthlyChart(analytics.monthlyTrend))
  safeRenderChart(() => renderPriorityChart(analytics.countsByPriority || {}))
  safeRenderChart(() => renderResolutionRateChart(analytics.monthlyTrend))
  safeRenderChart(() => renderAverageTimeChart(analytics.categoryAverageResolution || {}))
}

function configureChartDefaults() {
  if (globalThis.Chart?.defaults?.font) {
    Chart.defaults.font.family = '\'Source Sans Pro\', sans-serif'
    Chart.defaults.color = '#64748b'
    return
  }

  if (globalThis.Chart?.defaults?.global) {
    Chart.defaults.global.defaultFontFamily = '\'Source Sans Pro\', sans-serif'
    Chart.defaults.global.defaultFontColor = '#64748b'
  }
}

function safeRenderChart(callback) {
  try {
    callback()
  } catch (error) {
    console.warn('[SGI] No se pudo renderizar un gráfico de reportes.', error)
  }
}

function destroyCharts() {
  Object.values(state.charts).forEach(chart => chart?.destroy?.())
  state.charts = {}
}

function renderMonthlyChart(trend) {
  const canvas = document.getElementById('graficoMesTipo')
  if (!canvas) {
    return
  }

  if (!trend.months || !trend.months.length) {
    renderEmptyCanvas(canvas, 'Sin incidencias para graficar en el periodo')
    return
  }

  state.charts.monthly = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: trend.months,
      datasets: [
        { label: 'Registradas', backgroundColor: CHART_COLORS.primary, borderRadius: 4, borderSkipped: false, data: trend.registered },
        { label: 'Resueltas', backgroundColor: CHART_COLORS.success, borderRadius: 4, borderSkipped: false, data: trend.resolved },
        { label: 'Activas', backgroundColor: CHART_COLORS.warning, borderRadius: 4, borderSkipped: false, data: trend.pending }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        xAxes: [{ stacked: true, gridLines: { display: false } }],
        yAxes: [{ stacked: true, ticks: { beginAtZero: true, precision: 0 }, gridLines: { color: 'rgba(0,0,0,0.04)' } }]
      }
    }
  })
}

function renderPriorityChart(counts) {
  const canvas = document.getElementById('graficoPrioridad')
  const entries = Object.entries(counts)
  if (!canvas) {
    return
  }

  if (!entries.length) {
    renderEmptyCanvas(canvas, 'Sin prioridades para el filtro actual')
    return
  }

  state.charts.priority = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: entries.map(([label]) => formatCatalogLabel(label)),
      datasets: [{
        data: entries.map(([, count]) => Number(count)),
        backgroundColor: CHART_COLORS.palette.slice(0, entries.length),
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 8
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '55%',
      cutoutPercentage: 55,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, usePointStyle: true } }
      }
    }
  })
}

function renderResolutionRateChart(trend) {
  const canvas = document.getElementById('graficoTasa')
  if (!canvas) {
    return
  }

  if (!trend.months || !trend.months.length) {
    renderEmptyCanvas(canvas, 'Sin tasa de resolución para el filtro actual')
    return
  }

  const rates = trend.registered.map((value, index) =>
    value > 0 ? Math.round((Number(trend.resolved[index] || 0) / Number(value)) * 100) : 0
  )
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 240)
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)')
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.01)')

  state.charts.rate = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.months,
      datasets: [{
        label: 'Tasa de resolución (%)',
        data: rates,
        borderColor: CHART_COLORS.success,
        backgroundColor: gradient,
        fill: true,
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: CHART_COLORS.success,
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        lineTension: 0.3
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        yAxes: [{
          ticks: { min: 0, callback: value => `${value}%` }, // Eliminado el max: 100 para evitar recortes cuando la tasa supera el 100%
          gridLines: { color: 'rgba(0,0,0,0.04)' }
        }],
        xAxes: [{ gridLines: { display: false } }]
      },
      legend: { display: false },
      tooltips: { callbacks: { label: tooltipCtx => `${tooltipCtx.yLabel}%` } }
    }
  })
}

function renderAverageTimeChart(categoryAverageResolution) {
  const canvas = document.getElementById('graficoTiempo')
  if (!canvas) {
    return
  }

  const entries = Object.entries(categoryAverageResolution)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)

  if (!entries.length) {
    renderEmptyCanvas(canvas, 'Sin tiempos de resolución disponibles')
    return
  }

  state.charts.time = new Chart(canvas.getContext('2d'), {
    type: 'horizontalBar',
    data: {
      labels: entries.map(([label]) => formatCatalogLabel(label)),
      datasets: [{
        label: 'Dias promedio',
        data: entries.map(([, value]) => Number(Number(value).toFixed(1))),
        backgroundColor: CHART_COLORS.palette.slice(0, entries.length),
        borderRadius: 4,
        borderSkipped: false,
        barThickness: 24
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      legend: { display: false },
      scales: {
        xAxes: [{ ticks: { beginAtZero: true }, gridLines: { color: 'rgba(0,0,0,0.04)' } }],
        yAxes: [{ gridLines: { display: false } }]
      }
    }
  })
}

function renderEmptyCanvas(canvas, message) {
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.fillStyle = '#94a3b8'
  context.font = '14px Source Sans Pro'
  context.textAlign = 'center'
  context.fillText(message, canvas.width / 2, canvas.height / 2)
  context.restore()
}

function renderRankings(analytics) {
  renderCityRanking(analytics.topCities || [])
  renderCategoryRanking(analytics.countsByCategory || {}, analytics.total)
}

function renderCityRanking(cities) {
  const container = document.getElementById('rankingCiudades')
  if (!container) {
    return
  }

  if (!cities.length) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">Sin ciudades registradas.</p>'
    return
  }

  const colors = ['#f59e0b', '#94a3b8', '#cd7f32', '#0ea5e9', '#10b981']
  container.innerHTML = cities.map((city, index) => reportsRankingItem({
    position: index + 1,
    label: city.city,
    count: city.count,
    percent: city.pct,
    color: colors[index] || CHART_COLORS.slate
  })).join('')
}

function renderCategoryRanking(counts, total) {
  const container = document.getElementById('rankingTipos')
  if (!container) {
    return
  }

  const entries = Object.entries(counts).sort((left, right) => Number(right[1]) - Number(left[1]))
  if (!entries.length) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">Sin categorías registradas.</p>'
    return
  }

  container.innerHTML = entries.slice(0, 5).map(([label, count], index) => reportsRankingItem({
    position: index + 1,
    label: formatCatalogLabel(label),
    count,
    percent: total > 0 ? Math.round((Number(count) / total) * 100) : 0,
    color: CHART_COLORS.palette[index] || CHART_COLORS.slate
  })).join('')
}

function reportsRankingItem({ position, label, count, percent, color }) {
  return `
    <div class="reports-ranking-item">
      <div class="reports-ranking-pos" style="background:${color};">${position}</div>
      <div class="reports-ranking-info">
        <div class="d-flex justify-content-between">
          <strong>${escapeHtml(label)}</strong>
          <small>${Number(count)} (${Number(percent || 0)}%)</small>
        </div>
        <div class="reports-ranking-bar">
          <div class="reports-ranking-bar-fill" style="width:${Number(percent || 0)}%;background:${color};"></div>
        </div>
      </div>
    </div>`
}

function renderEfficiency(analytics) {
  const container = document.getElementById('indicadoresEficiencia')
  if (!container) {
    return
  }

  const indicators = [
    { label: 'Tasa de resolución', value: `${analytics.resolutionRate}%`, icon: 'fa-percentage', iconClass: 'icon-success' },
    { label: 'Tiempo promedio', value: `${Number(analytics.averageResolutionDays || 0).toFixed(1)}d`, icon: 'fa-stopwatch', iconClass: 'icon-warning' },
    { label: 'Activas', value: analytics.active, icon: 'fa-exclamation-triangle', iconClass: 'icon-danger' },
    { label: 'Ingreso 7 días', value: analytics.recentSevenDays, icon: 'fa-wave-square', iconClass: 'icon-info' }
  ]

  container.innerHTML = indicators.map(item => `
    <div class="reports-efficiency-item">
      <div class="reports-efficiency-icon ${item.iconClass}">
        <i class="fas ${item.icon}"></i>
      </div>
      <div class="reports-efficiency-label">${escapeHtml(item.label)}</div>
      <div class="reports-efficiency-value">${escapeHtml(String(item.value))}</div>
    </div>`).join('')
}

function renderSummary(analytics) {
  const tbody = document.getElementById('tablaResumen')
  const tfoot = document.getElementById('tablaResumenTotal')
  if (!tbody || !tfoot) {
    return
  }

  if (!analytics.summaryRows || !analytics.summaryRows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin datos para mostrar.</td></tr>'
  } else {
    tbody.innerHTML = analytics.summaryRows.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.category)}</strong></td>
        <td class="text-center font-weight-bold">${row.total}</td>
        <td class="text-center"><span class="badge badge-pending px-2 py-1">${row.pending}</span></td>
        <td class="text-center"><span class="badge badge-resolved px-2 py-1">${row.resolved}</span></td>
      </tr>`).join('')
  }

  tfoot.innerHTML = `
    <tr>
      <td><strong>TOTAL</strong></td>
      <td class="text-center font-weight-bold">${analytics.total}</td>
      <td class="text-center font-weight-bold">${analytics.active}</td>
      <td class="text-center font-weight-bold">${analytics.resolved}</td>
    </tr>`
}

function renderAppliedFilterFeedback(filters, total) {
  const alertDiv = document.getElementById('alertaGlobal')
  if (!alertDiv) {
    return
  }

  const activeFilters = [
    filters.startDate ? `desde ${filters.startDate}` : '',
    filters.endDate ? `hasta ${filters.endDate}` : '',
    filters.category ? `categoría ${formatCatalogLabel(filters.category)}` : '',
    filters.state ? `estado ${formatCatalogLabel(filters.state)}` : ''
  ].filter(Boolean)

  alertDiv.className = 'alert alert-info alert-dismissible'
  alertDiv.innerHTML = '<button type="button" class="close" data-dismiss="alert">&times;</button>' +
    `<i class="fas fa-filter mr-2"></i>Análisis actualizado con ${total} incidencias${activeFilters.length ? ` (${escapeHtml(activeFilters.join(', '))})` : ''}.`
  alertDiv.classList.remove('d-none')
  globalThis.setTimeout(() => alertDiv.classList.add('d-none'), 2500)
}

async function exportFilteredIncidentsCsv() {
  const filters = getFilters()
  showPageLoading('Exportando datos', 'Recopilando registros para el CSV...')

  try {
    const incidents = []
    let currentPage = 1
    let lastPage = 1
    const requestParams = { per_page: 100, page: currentPage }
    const selectedCategory = state.categories.find(category => category.name === filters.category)
    const selectedState = state.states.find(item => (item.code || item.name) === filters.state)
    if (selectedCategory?.id != null) {
      requestParams.category_id = selectedCategory.id
    }

    if (selectedState?.id != null) {
      requestParams.state_id = selectedState.id
    }

    do {
      requestParams.page = currentPage
      const response = await listIncidents(requestParams)
      const pageData = Array.isArray(response?.data) ? response.data : []
      incidents.push(...pageData)

      lastPage = Number(response?.meta?.last_page || response?.last_page || currentPage)
      currentPage += 1
    } while (currentPage <= lastPage)

    const filteredIncidents = incidents.filter(incident => {
      const createdDate = String(incident.created_at || '').slice(0, 10)
      return (!filters.category || incident.category?.name === filters.category) &&
        (!filters.state || normalizeCatalogCode(incident.state?.code || incident.state?.name) === normalizeCatalogCode(filters.state)) &&
        (!filters.startDate || createdDate >= filters.startDate) &&
        (!filters.endDate || (createdDate && createdDate <= filters.endDate))
    })

    const rows = [
      ['Código', 'Título', 'Categoría', 'Prioridad', 'Estado', 'Zona', 'Territorio', 'Fecha', 'Fecha resolución'],
      ...filteredIncidents.map(incident => [
        incident.code || `#${incident.id}`,
        incident.title || '',
        formatCatalogLabel(incident.category?.name || incident.subcategory?.name || ''),
        formatCatalogLabel(incident.priority?.name || ''),
        formatCatalogLabel(incident.state?.name || ''),
        incident.zone_name || incident.zoneName || '',
        incident.territorial_unit?.full_path || incident.territorialUnit?.full_path || incident.territorial_unit?.name || '',
        incident.created_at || '',
        incident.resolution_date || incident.resolutionDate || ''
      ])
    ]

    const csv = rows.map(row => row.map(escapeCsvValue).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reporte-incidencias-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('alertaGlobal'))
  } finally {
    hidePageLoading()
  }
}

export async function exportAnalyticsPdf() {
  const filters = getFilters()
  const query = new URLSearchParams()
  if (filters.startDate) {
    query.set('start_date', filters.startDate)
  }

  if (filters.endDate) {
    query.set('end_date', filters.endDate)
  }

  if (filters.category) {
    query.set('category', filters.category)
  }

  if (filters.state) {
    query.set('state', filters.state)
  }

  const button = document.getElementById('btnExportPDF')
  const originalHtml = button?.innerHTML
  showPageLoading('Generando PDF', 'Preparando el informe estadístico institucional...')

  try {
    if (button) {
      button.disabled = true
      button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Generando...'
    }

    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
    const baseUrl = globalThis.SGI_API_URL || '/api'
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const response = await fetch(`${baseUrl}/incidents/reports/analytics/pdf${suffix}`, {
      headers: {
        Accept: 'application/pdf',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })

    if (!response.ok) {
      throw new Error('No se pudo generar el reporte PDF.')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reporte-estadistico-sgi-${new Date().toISOString().slice(0, 10)}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('alertaGlobal'))
  } finally {
    if (button) {
      button.disabled = false
      button.innerHTML = originalHtml
    }

    hidePageLoading()
  }
}

export function escapeCsvValue(value) {
  const normalized = String(value ?? '').replaceAll('"', '""')
  return `"${normalized}"`
}
