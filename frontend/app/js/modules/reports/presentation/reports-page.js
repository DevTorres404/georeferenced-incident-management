import { listIncidents, listStates } from '../../incidents/application/incidents-service.js?v=14';
import {
  escapeHtml,
  formatCatalogLabel,
  hidePageLoading,
  showPageLoading,
} from '../../incidents/presentation/incidents-ui.js?v=16';
import {
  handleBackendErrors,
  setFieldError,
  clearFieldError,
  setupValidationListeners,
} from '../../../shared/validators/validation-utils.js?v=1';

const CHART_COLORS = {
  primary: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  indigo: '#6366f1',
  teal: '#14b8a6',
  slate: '#64748b',
  palette: ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#14b8a6', '#ec4899'],
};

const CHART_DEFAULTS = {
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
    boxPadding: 4,
  },
};

const state = {
  incidents: [],
  filteredIncidents: [],
  charts: {},
  states: [],
};

document.addEventListener('DOMContentLoaded', initReportsPage);

async function initReportsPage() {
  window.renderLayout?.('reports');

  bindActions();
  showPageLoading('Generando reportes', 'Consolidando tendencias e indicadores...');
  const loadingFallback = window.setTimeout(hidePageLoading, 12000);

  try {
    const [incidents, statesResponse] = await Promise.all([
      fetchIncidents(),
      listStates(),
    ]);
    state.incidents = incidents;
    state.states = Array.isArray(statesResponse?.data) ? statesResponse.data : [];
    hydrateFilterOptions(state.incidents);
    applyCurrentFilters();
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('alertaGlobal'));
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

async function fetchIncidents() {
  const incidents = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await listIncidents({ per_page: 100, page: currentPage });
    const pageData = Array.isArray(response?.data) ? response.data : [];
    incidents.push(...pageData);

    lastPage = Number(response?.meta?.last_page || response?.last_page || currentPage);
    currentPage += 1;
  } while (currentPage <= lastPage);

  return incidents;
}

function bindActions() {
  const form = document.getElementById('filtroReporte');
  if (form) {
    setupValidationListeners(form);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      applyCurrentFilters();
    });
  }

  document.getElementById('btnFiltrar')?.addEventListener('click', applyCurrentFilters);
  document.getElementById('btnLimpiarFiltros')?.addEventListener('click', resetFilters);
  document.getElementById('btnExportExcel')?.addEventListener('click', exportFilteredIncidentsCsv);
  document.getElementById('btnExportPDF')?.addEventListener('click', exportPrintableReport);
}

function hydrateFilterOptions(incidents) {
  populateSelect('selectTipoFiltro', uniqueSortedValues(incidents.map((incident) => incident.category?.name)));
  populateSelect('selectEstadoFiltro', uniqueSortedValues(incidents.map((incident) => incident.state?.name)));
}

function populateSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) return;

  const currentValue = select.value;
  const firstOption = select.querySelector('option');
  const placeholder = firstOption ? firstOption.outerHTML : '<option value="">Todos</option>';

  select.innerHTML = placeholder + values.map((value) => (
    `<option value="${escapeHtml(value)}">${escapeHtml(formatCatalogLabel(value))}</option>`
  )).join('');
  select.value = currentValue;
}

function uniqueSortedValues(values) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim())))
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
}

function resetFilters() {
  const form = document.getElementById('filtroReporte');
  form?.reset();
  clearFieldError(document.getElementById('fFechaInicial'));
  clearFieldError(document.getElementById('fFechaFinal'));
  applyCurrentFilters();
}

function applyCurrentFilters() {
  if (!validateFilters()) {
    return;
  }

  const filters = getFilters();
  state.filteredIncidents = state.incidents.filter((incident) => matchesFilters(incident, filters));
  const analytics = buildAnalytics(state.filteredIncidents, state.incidents.length);

  renderKpis(analytics);
  renderInsights(analytics, filters);
  renderCharts(analytics);
  renderRankings(analytics);
  renderEfficiency(analytics);
  renderSummary(analytics);
  renderAppliedFilterFeedback(filters, analytics.total);
}

function validateFilters() {
  const fechaIni = document.getElementById('fFechaInicial');
  const fechaFin = document.getElementById('fFechaFinal');

  clearFieldError(fechaIni);
  clearFieldError(fechaFin);

  if (fechaIni?.value && fechaFin?.value && new Date(fechaFin.value) < new Date(fechaIni.value)) {
    setFieldError(fechaFin, 'La fecha final no puede ser menor a la inicial.');
    return false;
  }

  return true;
}

function getFilters() {
  return {
    startDate: document.getElementById('fFechaInicial')?.value || '',
    endDate: document.getElementById('fFechaFinal')?.value || '',
    category: document.getElementById('selectTipoFiltro')?.value || '',
    state: document.getElementById('selectEstadoFiltro')?.value || '',
  };
}

function matchesFilters(incident, filters) {
  const createdAt = parseDate(incident.created_at);
  const category = String(incident.category?.name || '');
  const stateName = String(incident.state?.name || '');

  if (filters.startDate && (!createdAt || createdAt < startOfDay(filters.startDate))) {
    return false;
  }

  if (filters.endDate && (!createdAt || createdAt > endOfDay(filters.endDate))) {
    return false;
  }

  if (filters.category && !equalsNormalized(category, filters.category)) {
    return false;
  }

  if (filters.state && !equalsNormalized(stateName, filters.state)) {
    return false;
  }

  return true;
}

function buildAnalytics(incidents, totalUniverse) {
  const countsByPriority = {};
  const countsByCategory = {};
  const cities = new Map();
  const monthlyBuckets = new Map();
  const resolvedDurations = [];
  const categoryResolutionStats = new Map();
  const today = new Date();

  let resolved = 0;
  let closed = 0;
  let active = 0;
  let overdue = 0;
  let critical = 0;
  let high = 0;
  let recentSevenDays = 0;

  incidents.forEach((incident) => {
    const createdAt = parseDate(incident.created_at);
    const resolvedAt = parseDate(incident.resolution_date || incident.resolutionDate);
    const dueDate = parseDate(incident.due_date || incident.dueDate);
    const stateCode = normalizeState(incident.state?.name);
    const priorityName = formatCatalogLabel(incident.priority?.name || 'Sin prioridad');
    const categoryName = formatCatalogLabel(incident.category?.name || incident.subcategory?.name || 'Sin categoría');
    const cityName = territoryTail(incident.territorial_unit?.full_path || incident.territorialUnit?.full_path || incident.territorial_unit?.name || incident.territorialUnit?.name || incident.address_reference || incident.address || 'Sin territorio');

    countsByPriority[priorityName] = Number(countsByPriority[priorityName] || 0) + 1;
    countsByCategory[categoryName] = Number(countsByCategory[categoryName] || 0) + 1;
    cities.set(cityName, Number(cities.get(cityName) || 0) + 1);

    if (createdAt) {
      const key = monthKey(createdAt);
      if (!monthlyBuckets.has(key)) {
        monthlyBuckets.set(key, { registered: 0, resolved: 0, pending: 0 });
      }
      monthlyBuckets.get(key).registered += 1;

      if (daysBetween(createdAt, today) <= 7) {
        recentSevenDays += 1;
      }
    }

    if (matchesStateCategory(stateCode, isResolvedState())) {
      resolved += 1;
      if (createdAt && resolvedAt) {
        const resolutionDays = daysBetween(createdAt, resolvedAt);
        resolvedDurations.push(resolutionDays);
        const categoryStats = categoryResolutionStats.get(categoryName) || [];
        categoryStats.push(resolutionDays);
        categoryResolutionStats.set(categoryName, categoryStats);
      }

      if (resolvedAt) {
        const resolvedKey = monthKey(resolvedAt);
        if (!monthlyBuckets.has(resolvedKey)) {
          monthlyBuckets.set(resolvedKey, { registered: 0, resolved: 0, pending: 0 });
        }
        monthlyBuckets.get(resolvedKey).resolved += 1;
      }
    } else if (matchesStateCategory(stateCode, isClosedState())) {
      closed += 1;
    } else if (matchesStateCategory(stateCode, isActiveState())) {
      active += 1;
      if (createdAt) {
        const activeKey = monthKey(createdAt);
        if (!monthlyBuckets.has(activeKey)) {
          monthlyBuckets.set(activeKey, { registered: 0, resolved: 0, pending: 0 });
        }
        monthlyBuckets.get(activeKey).pending += 1;
      }
    }

    if (dueDate && !matchesStateCategory(stateCode, [...isResolvedState(), ...isClosedState()]) && dueDate < today) {
      overdue += 1;
    }

    if (includesNormalized(priorityName, 'critica')) critical += 1;
    if (includesNormalized(priorityName, 'alta')) high += 1;
  });

  const total = incidents.length;
  const finished = resolved + closed;
  const resolutionRate = total > 0 ? Math.round((finished / total) * 100) : 0;
  const averageResolutionDays = resolvedDurations.length
    ? resolvedDurations.reduce((sum, value) => sum + value, 0) / resolvedDurations.length
    : 0;

  const monthlyTrend = normalizeMonthlyTrend(monthlyBuckets);
  const topCities = Array.from(cities.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([city, count]) => ({
      city,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

  const categoryAverageResolution = Object.fromEntries(
    Array.from(categoryResolutionStats.entries()).map(([category, values]) => [
      category,
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    ])
  );

  return {
    total,
    totalUniverse,
    resolutionRate,
    averageResolutionDays,
    recentSevenDays,
    active,
    resolved,
    closed,
    overdue,
    critical,
    high,
    countsByPriority,
    countsByCategory,
    topCities,
    categoryAverageResolution,
    monthlyTrend,
    summaryRows: buildSummaryRows(incidents, countsByCategory),
  };
}

function normalizeMonthlyTrend(monthlyBuckets) {
  const sortedKeys = Array.from(monthlyBuckets.keys()).sort();
  return {
    months: sortedKeys.map((key) => formatMonthLabel(key)),
    registered: sortedKeys.map((key) => monthlyBuckets.get(key)?.registered || 0),
    resolved: sortedKeys.map((key) => monthlyBuckets.get(key)?.resolved || 0),
    pending: sortedKeys.map((key) => monthlyBuckets.get(key)?.pending || 0),
  };
}

function buildSummaryRows(incidents, countsByCategory) {
  return Object.keys(countsByCategory).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
    .map((categoryName) => {
      const categoryIncidents = incidents.filter((incident) => {
        const current = formatCatalogLabel(incident.category?.name || incident.subcategory?.name || 'Sin categoria');
        return equalsNormalized(current, categoryName);
      });

      const pending = categoryIncidents.filter((incident) => matchesStateCategory(normalizeState(incident.state?.name), isActiveState())).length;
      const resolved = categoryIncidents.filter((incident) => matchesStateCategory(normalizeState(incident.state?.name), isResolvedState())).length;
      const closed = categoryIncidents.filter((incident) => matchesStateCategory(normalizeState(incident.state?.name), isClosedState())).length;
      const total = categoryIncidents.length;
      const rate = total > 0 ? Math.round(((resolved + closed) / total) * 100) : 0;

      return {
        label: categoryName,
        pending,
        progress: Math.max(total - pending - resolved - closed, 0),
        resolved: resolved + closed,
        total,
        rate,
      };
    });
}

function renderKpis(analytics) {
  const container = document.getElementById('kpiCards');
  if (!container) return;

  const cards = [
    { num: analytics.total, label: 'Incidencias', sub: 'Bajo el filtro actual', icon: 'fa-clipboard-list', variant: 'kpi-total' },
    { num: analytics.active, label: 'Activas', sub: 'Carga operativa actual', icon: 'fa-bolt', variant: 'kpi-pending' },
    { num: analytics.critical, label: 'Criticas', sub: 'Requieren seguimiento', icon: 'fa-radiation-alt', variant: 'kpi-progress' },
    { num: `${analytics.resolutionRate}%`, label: 'Resolución', sub: 'Cierre efectivo', icon: 'fa-check-double', variant: 'kpi-resolved' },
    { num: `${analytics.averageResolutionDays.toFixed(1)}d`, label: 'Tiempo prom.', sub: 'Resolución media', icon: 'fa-stopwatch', variant: 'kpi-time' },
    { num: analytics.overdue, label: 'Vencidas', sub: 'Fuera de plazo', icon: 'fa-hourglass-end', variant: 'kpi-rate' },
  ];

  container.innerHTML = cards.map((card) => `
    <div class="reports-kpi-card ${card.variant}">
      <div class="reports-kpi-icon"><i class="fas ${card.icon}"></i></div>
      <div class="reports-kpi-body">
        <div class="reports-kpi-number">${escapeHtml(String(card.num))}</div>
        <div class="reports-kpi-label">${escapeHtml(card.label)}</div>
        <div class="reports-kpi-sub">${escapeHtml(card.sub)}</div>
      </div>
    </div>`).join('');
}

function renderInsights(analytics, filters) {
  const cardsContainer = document.getElementById('reportInsightCards');
  const narrativeContainer = document.getElementById('reportInsightNarrative');
  if (!cardsContainer || !narrativeContainer) return;

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
    `;
    narrativeContainer.innerHTML = '<p class="mb-0"><strong>Lectura operativa:</strong> No hay incidencias que coincidan con el filtro actual.</p>';
    return;
  }

  const coverage = analytics.totalUniverse > 0
    ? Math.round((analytics.total / analytics.totalUniverse) * 100)
    : 0;
  const dominantCategory = getTopEntry(analytics.countsByCategory);
  const dominantPriority = getTopEntry(analytics.countsByPriority);
  const pressure = analytics.active > analytics.resolved ? 'La carga activa supera a los cierres del periodo.' : 'El volumen resuelto mantiene el ritmo operativo.';

  const insightCards = [
    {
      title: 'Cobertura del análisis',
      value: `${coverage}%`,
      meta: analytics.totalUniverse > 0 ? `${analytics.total} de ${analytics.totalUniverse} incidencias visibles` : `${analytics.total} incidencias visibles`,
      icon: 'fa-layer-group',
    },
    {
      title: 'Mayor concentracion',
      value: dominantCategory?.label || 'Sin categoría',
      meta: dominantCategory ? `${dominantCategory.count} registros` : 'Sin datos suficientes',
      icon: 'fa-folder-open',
    },
    {
      title: 'Prioridad dominante',
      value: dominantPriority?.label || 'Sin prioridad',
      meta: dominantPriority ? `${dominantPriority.count} incidencias` : 'Sin datos suficientes',
      icon: 'fa-flag',
    },
  ];

  cardsContainer.innerHTML = insightCards.map((card) => `
    <article class="reports-brief-item">
      <div class="reports-brief-icon"><i class="fas ${card.icon}"></i></div>
      <div class="reports-brief-content">
        <span class="reports-brief-label">${escapeHtml(card.title)}</span>
        <strong class="reports-brief-value">${escapeHtml(card.value)}</strong>
        <small class="reports-brief-meta">${escapeHtml(card.meta)}</small>
      </div>
    </article>
  `).join('');

  const rangeLabel = buildRangeLabel(filters);
  narrativeContainer.innerHTML = `
    <p class="mb-0">
      <strong>Lectura operativa:</strong> ${escapeHtml(pressure)}
      ${analytics.overdue > 0 ? ` Hay ${analytics.overdue} incidencias vencidas que merecen priorizacion.` : ' No hay incidencias vencidas dentro del filtro seleccionado.'}
      ${rangeLabel ? ` Periodo analizado: ${escapeHtml(rangeLabel)}.` : ''}
    </p>
  `;
}

function renderCharts(analytics) {
  if (!window.Chart) return;

  configureChartDefaults();
  destroyCharts();
  safeRenderChart(() => renderMonthlyChart(analytics.monthlyTrend));
  safeRenderChart(() => renderPriorityChart(analytics.countsByPriority));
  safeRenderChart(() => renderResolutionRateChart(analytics.monthlyTrend));
  safeRenderChart(() => renderAverageTimeChart(analytics.categoryAverageResolution));
}

function configureChartDefaults() {
  if (window.Chart?.defaults?.font) {
    Chart.defaults.font.family = "'Source Sans Pro', sans-serif";
    Chart.defaults.color = '#64748b';
    return;
  }

  if (window.Chart?.defaults?.global) {
    Chart.defaults.global.defaultFontFamily = "'Source Sans Pro', sans-serif";
    Chart.defaults.global.defaultFontColor = '#64748b';
  }
}

function safeRenderChart(callback) {
  try {
    callback();
  } catch (error) {
    console.warn('[SGI] No se pudo renderizar un gráfico de reportes.', error);
  }
}

function destroyCharts() {
  Object.values(state.charts).forEach((chart) => chart?.destroy?.());
  state.charts = {};
}

function renderMonthlyChart(trend) {
  const canvas = document.getElementById('graficoMesTipo');
  if (!canvas) return;

  if (!trend.months.length) {
    renderEmptyCanvas(canvas, 'Sin incidencias para graficar en el periodo');
    return;
  }

  state.charts.monthly = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: trend.months,
      datasets: [
        { label: 'Registradas', backgroundColor: CHART_COLORS.primary, borderRadius: 4, borderSkipped: false, data: trend.registered },
        { label: 'Resueltas', backgroundColor: CHART_COLORS.success, borderRadius: 4, borderSkipped: false, data: trend.resolved },
        { label: 'Activas', backgroundColor: CHART_COLORS.warning, borderRadius: 4, borderSkipped: false, data: trend.pending },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        xAxes: [{ stacked: true, gridLines: { display: false } }],
        yAxes: [{ stacked: true, ticks: { beginAtZero: true, precision: 0 }, gridLines: { color: 'rgba(0,0,0,0.04)' } }],
      },
    },
  });
}

function renderPriorityChart(counts) {
  const canvas = document.getElementById('graficoPrioridad');
  const entries = Object.entries(counts);
  if (!canvas) return;

  if (!entries.length) {
    renderEmptyCanvas(canvas, 'Sin prioridades para el filtro actual');
    return;
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
        hoverOffset: 8,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '55%',
      cutoutPercentage: 55,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, usePointStyle: true } },
      },
    },
  });
}

function renderResolutionRateChart(trend) {
  const canvas = document.getElementById('graficoTasa');
  if (!canvas) return;

  if (!trend.months.length) {
    renderEmptyCanvas(canvas, 'Sin tasa de resolución para el filtro actual');
    return;
  }

  const rates = trend.registered.map((value, index) =>
    value > 0 ? Math.round((Number(trend.resolved[index] || 0) / Number(value)) * 100) : 0
  );
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.01)');

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
        tension: 0.3,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        yAxes: [{
          ticks: { min: 0, max: 100, callback: (value) => `${value}%` },
          gridLines: { color: 'rgba(0,0,0,0.04)' },
        }],
        xAxes: [{ gridLines: { display: false } }],
      },
      legend: { display: false },
      tooltips: { callbacks: { label: (ctx) => `${ctx.yLabel}%` } },
    },
  });
}

function renderAverageTimeChart(categoryAverageResolution) {
  const canvas = document.getElementById('graficoTiempo');
  if (!canvas) return;

  const entries = Object.entries(categoryAverageResolution)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);

  if (!entries.length) {
    renderEmptyCanvas(canvas, 'Sin tiempos de resolución disponibles');
    return;
  }

  state.charts.time = new Chart(canvas.getContext('2d'), {
    type: 'horizontalBar',
    data: {
      labels: entries.map(([label]) => formatCatalogLabel(label)),
      datasets: [{
        label: 'Dias promedio',
        data: entries.map(([, value]) => Number(value.toFixed(1))),
        backgroundColor: CHART_COLORS.palette.slice(0, entries.length),
        borderRadius: 4,
        borderSkipped: false,
        barThickness: 24,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      legend: { display: false },
      scales: {
        xAxes: [{ ticks: { beginAtZero: true }, gridLines: { color: 'rgba(0,0,0,0.04)' } }],
        yAxes: [{ gridLines: { display: false } }],
      },
    },
  });
}

function renderEmptyCanvas(canvas, message) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.fillStyle = '#94a3b8';
  context.font = '14px Source Sans Pro';
  context.textAlign = 'center';
  context.fillText(message, canvas.width / 2, canvas.height / 2);
  context.restore();
}

function renderRankings(analytics) {
  renderCityRanking(analytics.topCities);
  renderCategoryRanking(analytics.countsByCategory, analytics.total);
}

function renderCityRanking(cities) {
  const container = document.getElementById('rankingCiudades');
  if (!container) return;

  if (!cities.length) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">Sin ciudades registradas.</p>';
    return;
  }

  const colors = ['#f59e0b', '#94a3b8', '#cd7f32', '#0ea5e9', '#10b981'];
  container.innerHTML = cities.map((city, index) => reportsRankingItem({
    position: index + 1,
    label: city.city,
    count: city.count,
    percent: city.pct,
    color: colors[index] || CHART_COLORS.slate,
  })).join('');
}

function renderCategoryRanking(counts, total) {
  const container = document.getElementById('rankingTipos');
  if (!container) return;

  const entries = Object.entries(counts).sort((left, right) => Number(right[1]) - Number(left[1]));
  if (!entries.length) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">Sin categorías registradas.</p>';
    return;
  }

  container.innerHTML = entries.slice(0, 5).map(([label, count], index) => reportsRankingItem({
    position: index + 1,
    label: formatCatalogLabel(label),
    count,
    percent: total > 0 ? Math.round((Number(count) / total) * 100) : 0,
    color: CHART_COLORS.palette[index] || CHART_COLORS.slate,
  })).join('');
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
    </div>`;
}

function renderEfficiency(analytics) {
  const container = document.getElementById('indicadoresEficiencia');
  if (!container) return;

  const indicators = [
    { label: 'Tasa de resolución', value: `${analytics.resolutionRate}%`, icon: 'fa-percentage', iconClass: 'icon-success' },
    { label: 'Tiempo promedio', value: `${analytics.averageResolutionDays.toFixed(1)}d`, icon: 'fa-stopwatch', iconClass: 'icon-warning' },
    { label: 'Activas', value: analytics.active, icon: 'fa-exclamation-triangle', iconClass: 'icon-danger' },
    { label: 'Ingreso 7 dias', value: analytics.recentSevenDays, icon: 'fa-wave-square', iconClass: 'icon-info' },
  ];

  container.innerHTML = indicators.map((item) => `
    <div class="reports-efficiency-item">
      <div class="reports-efficiency-icon ${item.iconClass}">
        <i class="fas ${item.icon}"></i>
      </div>
      <div class="reports-efficiency-label">${escapeHtml(item.label)}</div>
      <div class="reports-efficiency-value">${escapeHtml(String(item.value))}</div>
    </div>`).join('');
}

function renderSummary(analytics) {
  const tbody = document.getElementById('tablaResumen');
  const tfoot = document.getElementById('tablaResumenTotal');
  if (!tbody || !tfoot) return;

  if (!analytics.summaryRows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Sin datos para mostrar.</td></tr>';
  } else {
    tbody.innerHTML = analytics.summaryRows.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.label)}</strong></td>
        <td class="text-center"><span class="badge badge-pending px-2 py-1">${row.pending}</span></td>
        <td class="text-center"><span class="badge badge-progress px-2 py-1">${row.progress}</span></td>
        <td class="text-center"><span class="badge badge-resolved px-2 py-1">${row.resolved}</span></td>
        <td class="text-center font-weight-bold">${row.total}</td>
        <td>
          <div class="reports-rate-bar">
            <div class="progress">
              <div class="progress-fill" style="width:${row.rate}%;"></div>
            </div>
            <span>${row.rate}%</span>
          </div>
        </td>
      </tr>`).join('');
  }

  tfoot.innerHTML = `
    <tr>
      <td><strong>TOTAL</strong></td>
      <td class="text-center font-weight-bold">${analytics.active}</td>
      <td class="text-center font-weight-bold">${Math.max(analytics.total - analytics.active - analytics.resolved - analytics.closed, 0)}</td>
      <td class="text-center font-weight-bold">${analytics.resolved + analytics.closed}</td>
      <td class="text-center font-weight-bold">${analytics.total}</td>
      <td class="font-weight-bold">${analytics.resolutionRate}%</td>
    </tr>`;
}

function renderAppliedFilterFeedback(filters, total) {
  const alertDiv = document.getElementById('alertaGlobal');
  if (!alertDiv) return;

  const activeFilters = [
    filters.startDate ? `desde ${filters.startDate}` : '',
    filters.endDate ? `hasta ${filters.endDate}` : '',
    filters.category ? `categoría ${formatCatalogLabel(filters.category)}` : '',
    filters.state ? `estado ${formatCatalogLabel(filters.state)}` : '',
  ].filter(Boolean);

  alertDiv.className = 'alert alert-info alert-dismissible';
  alertDiv.innerHTML = '<button type="button" class="close" data-dismiss="alert">&times;</button>'
    + `<i class="fas fa-filter mr-2"></i>Análisis actualizado con ${total} incidencias${activeFilters.length ? ` (${escapeHtml(activeFilters.join(', '))})` : ''}.`;
  alertDiv.classList.remove('d-none');
  window.setTimeout(() => alertDiv.classList.add('d-none'), 2500);
}

function exportFilteredIncidentsCsv() {
  const rows = [
    ['Código', 'Título', 'Categoría', 'Prioridad', 'Estado', 'Zona', 'Territorio', 'Fecha', 'Fecha resolución'],
    ...state.filteredIncidents.map((incident) => [
      incident.code || `#${incident.id}`,
      incident.title || '',
      formatCatalogLabel(incident.category?.name || incident.subcategory?.name || ''),
      formatCatalogLabel(incident.priority?.name || ''),
      formatCatalogLabel(incident.state?.name || ''),
      incident.zone_name || incident.zoneName || '',
      incident.territorial_unit?.full_path || incident.territorialUnit?.full_path || incident.territorial_unit?.name || '',
      incident.created_at || '',
      incident.resolution_date || incident.resolutionDate || '',
    ]),
  ];

  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reporte-incidencias-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportPrintableReport() {
  window.print();
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '').replace(/"/g, '""');
  return `"${normalized}"`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizeState(value) {
  return normalizeText(value).replace(/\s+/g, '_');
}

function equalsNormalized(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function includesNormalized(value, expected) {
  return normalizeText(value).includes(normalizeText(expected));
}

function isActiveState() {
  return state.states.filter((s) => s.is_initial_state).map((s) => normalizeState(s.name));
}

function isResolvedState() {
  return state.states.filter((s) => s.is_final_state).map((s) => normalizeState(s.name));
}

function isClosedState() {
  return [];
}

function isFinishedState() {
  return isResolvedState();
}

function matchesStateCategory(stateCode, validCodes) {
  return validCodes.includes(stateCode) || validCodes.includes(stateCode.replace(/_/g, ' '));
}

function monthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthLabel(value) {
  const [year, month] = String(value).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('es-EC', { month: 'short', year: 'numeric' });
}

function daysBetween(start, end) {
  const diff = end.getTime() - start.getTime();
  return Math.max(diff / (1000 * 60 * 60 * 24), 0);
}

function territoryTail(path) {
  const parts = String(path || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Sin territorio';
}

function getTopEntry(collection) {
  const entries = Object.entries(collection || {}).sort((left, right) => Number(right[1]) - Number(left[1]));
  if (!entries.length) return null;

  return {
    label: formatCatalogLabel(entries[0][0]),
    count: Number(entries[0][1]),
  };
}

function buildRangeLabel(filters) {
  const values = [];
  if (filters.startDate) values.push(`desde ${filters.startDate}`);
  if (filters.endDate) values.push(`hasta ${filters.endDate}`);
  return values.join(' ');
}
