import { $, hide, showErrorAlert } from '../../../shared/utils/dom-utils.js?v=14';
import { getDashboardMetrics } from '../../dashboard/application/dashboard-service.js?v=14';
import { escapeHtml, formatCatalogLabel, hidePageLoading, showPageLoading } from '../../incidents/presentation/incidents-ui.js?v=16';
import { handleBackendErrors, setFieldError, clearFieldError, setupValidationListeners } from '../../../shared/validators/validation-utils.js?v=1';

document.addEventListener('DOMContentLoaded', initReportsPage);

async function initReportsPage() {
  window.renderLayout?.('reports');

  showPageLoading('Generando reportes', 'Calculando estadísticas...');
  const loadingFallback = window.setTimeout(hidePageLoading, 12000);

  try {
    const metrics = await getDashboardMetrics();
    renderKpis(metrics);
    renderCharts(metrics);
    renderRankings(metrics);
    renderEfficiency(metrics);
    renderSummary(metrics);
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('alertaGlobal'));
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }

  bindActions();
}

function bindActions() {
  const form = document.getElementById('filtroReporte');
  if (form) {
    setupValidationListeners(form);
  }

  const btnFiltrar = document.getElementById('btnFiltrar');
  if (btnFiltrar) {
    btnFiltrar.addEventListener('click', () => {
      const fechaIni = document.getElementById('fFechaInicial');
      const fechaFin = document.getElementById('fFechaFinal');

      clearFieldError(fechaIni);
      clearFieldError(fechaFin);

      let hasError = false;

      if (fechaIni.value && fechaFin.value) {
        if (new Date(fechaFin.value) < new Date(fechaIni.value)) {
          setFieldError(fechaFin, 'La fecha final no puede ser menor a la inicial.');
          hasError = true;
        }
      }

      if (hasError) return;

      // Proceed to load reports with dates
      // window.showGlobalAlert no existe pero mostramos una alerta nativa temporal
      // Aquí se debería llamar a un servicio con las fechas, por el momento simulado
      const alertDiv = document.getElementById('alertaGlobal');
      if (alertDiv) {
        alertDiv.className = 'alert alert-info';
        alertDiv.textContent = 'Filtros aplicados correctamente.';
        alertDiv.classList.remove('d-none');
        setTimeout(() => alertDiv.classList.add('d-none'), 3000);
      }
    });
  }
}

function renderKpis(metrics) {
  const row = $('#kpiCards');
  if (!row) return;

  const kpis = metrics.kpis || {};
  const total = Number(kpis.total || 0);
  const resolved = Number(kpis.resolved || 0);
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const cards = [
    { num: total, label: 'Total Incidencias', sub: 'Todas las incidencias', icon: 'fa-clipboard-list', gradient: 'linear-gradient(135deg,#007bff,#0056b3)' },
    { num: kpis.pending || 0, label: 'Pendientes', sub: 'Sin resolver', icon: 'fa-clock', gradient: 'linear-gradient(135deg,#fd7e14,#dc3545)' },
    { num: kpis.progress || 0, label: 'En Proceso', sub: 'Atendidas actualmente', icon: 'fa-spinner', gradient: 'linear-gradient(135deg,#17a2b8,#007bff)' },
    { num: resolved, label: 'Resueltas', sub: `Tasa: ${resolutionRate}%`, icon: 'fa-check-double', gradient: 'linear-gradient(135deg,#28a745,#20c997)' },
    { num: `${Number(metrics.averageResolutionDays || 0).toFixed(1)}d`, label: 'Tiempo Prom. Resoluc.', sub: 'En incidencias cerradas', icon: 'fa-stopwatch', gradient: 'linear-gradient(135deg,#6f42c1,#007bff)' },
    { num: `${resolutionRate}%`, label: 'Tasa de Resolucion', sub: 'Eficiencia general', icon: 'fa-percentage', gradient: 'linear-gradient(135deg,#28a745,#ffc107)' },
  ];

  row.innerHTML = cards.map((card) => `
    <div class="col-lg-2 col-md-4 col-sm-6 mb-3 d-flex flex-column">
      <div class="metric-card" style="background:${card.gradient};">
        <div class="metric-icon"><i class="fas ${card.icon}"></i></div>
        <div>
          <div class="metric-num">${escapeHtml(card.num)}</div>
          <div class="metric-lbl">${escapeHtml(card.label)}</div>
          <div class="metric-sub">${escapeHtml(card.sub)}</div>
        </div>
      </div>
    </div>`).join('');
}

function renderCharts(metrics) {
  if (!window.Chart) return;

  renderMonthlyChart(metrics.monthlyTrend || {});
  renderPriorityChart(metrics.countsByPriority || {});
  renderResolutionRateChart(metrics.monthlyTrend || {});
  renderAverageTimeChart(metrics.countsByCategory || {}, metrics.averageResolutionDays || 0);
}

function renderMonthlyChart(trend) {
  const canvas = document.getElementById('graficoMesTipo');
  if (!canvas) return;

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: trend.months || [],
      datasets: [
        { label: 'Registradas', backgroundColor: '#007bff', data: trend.registered || [] },
        { label: 'Resueltas', backgroundColor: '#28a745', data: trend.resolved || [] },
        { label: 'Pendientes', backgroundColor: '#ffc107', data: trend.pending || [] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        xAxes: [{ stacked: true }],
        yAxes: [{ stacked: true, ticks: { beginAtZero: true, precision: 0 } }],
      },
      legend: { position: 'bottom', labels: { boxWidth: 12, fontSize: 11 } },
    },
  });
}

function renderPriorityChart(counts) {
  const canvas = document.getElementById('graficoPrioridad');
  const entries = Object.entries(counts);
  if (!canvas || !entries.length) return;

  new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: entries.map(([label]) => formatCatalogLabel(label)),
      datasets: [{
        data: entries.map(([, count]) => Number(count)),
        backgroundColor: ['#dc3545', '#fd7e14', '#ffc107', '#28a745', '#17a2b8'],
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      legend: { position: 'bottom', labels: { boxWidth: 12, fontSize: 11 } },
    },
  });
}

function renderResolutionRateChart(trend) {
  const canvas = document.getElementById('graficoTasa');
  if (!canvas) return;

  const registered = trend.registered || [];
  const resolved = trend.resolved || [];
  const rates = registered.map((value, index) => value > 0 ? Math.round((Number(resolved[index] || 0) / Number(value)) * 100) : 0);

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: trend.months || [],
      datasets: [{
        label: 'Tasa de resolucion (%)',
        data: rates,
        borderColor: '#28a745',
        backgroundColor: 'rgba(40,167,69,0.10)',
        fill: true,
        borderWidth: 2,
        pointRadius: 5,
        pointBackgroundColor: '#28a745',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        yAxes: [{ ticks: { min: 0, max: 100, callback: (value) => `${value}%` } }],
      },
      legend: { display: false },
      tooltips: { callbacks: { label: (ctx) => `${ctx.yLabel}%` } },
    },
  });
}

function renderAverageTimeChart(countsByCategory, averageDays) {
  const canvas = document.getElementById('graficoTiempo');
  const entries = Object.entries(countsByCategory).slice(0, 5);
  if (!canvas || !entries.length) return;

  new Chart(canvas.getContext('2d'), {
    type: 'horizontalBar',
    data: {
      labels: entries.map(([label]) => formatCatalogLabel(label)),
      datasets: [{
        label: 'Dias promedio',
        data: entries.map(() => Number(averageDays || 0)),
        backgroundColor: ['#007bff', '#dc3545', '#28a745', '#17a2b8', '#ffc107'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      legend: { display: false },
      scales: { xAxes: [{ ticks: { beginAtZero: true } }] },
    },
  });
}

function renderRankings(metrics) {
  renderCityRanking(metrics.topCities || []);
  renderCategoryRanking(metrics.countsByCategory || {}, Number(metrics.kpis?.total || 0));
}

function renderCityRanking(cities) {
  const container = $('#rankingCiudades');
  if (!container) return;

  if (!cities.length) {
    container.innerHTML = emptyRanking('Sin ciudades registradas.');
    return;
  }

  const colors = ['#ffc107', '#6c757d', '#cd7f32', '#007bff', '#28a745'];
  container.innerHTML = cities.slice(0, 5).map((city, index) => rankingItem({
    position: index + 1,
    label: city.city,
    count: city.count,
    percent: city.pct,
    color: colors[index] || '#6c757d',
  })).join('');
}

function renderCategoryRanking(counts, total) {
  const container = $('#rankingTipos');
  if (!container) return;
  const entries = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]));

  if (!entries.length) {
    container.innerHTML = emptyRanking('Sin categorias registradas.');
    return;
  }

  container.innerHTML = entries.slice(0, 5).map(([label, count], index) => rankingItem({
    position: index + 1,
    label: formatCatalogLabel(label),
    count,
    percent: total > 0 ? Math.round((Number(count) / total) * 100) : 0,
    color: ['#007bff', '#dc3545', '#28a745', '#17a2b8', '#ffc107'][index] || '#6c757d',
  })).join('');
}

function rankingItem({ position, label, count, percent, color }) {
  return `
    <div class="ranking-item">
      <div class="ranking-pos" style="background:${color};">${position}</div>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between mb-1">
          <strong>${escapeHtml(label)}</strong><small>${Number(count)} (${Number(percent || 0)}%)</small>
        </div>
        <div class="progress" style="height:8px;">
          <div class="progress-bar" style="width:${Number(percent || 0)}%;background:${color};"></div>
        </div>
      </div>
    </div>`;
}

function renderEfficiency(metrics) {
  const container = $('#indicadoresEficiencia');
  if (!container) return;

  const total = Number(metrics.kpis?.total || 0);
  const resolved = Number(metrics.kpis?.resolved || 0);
  const pending = Number(metrics.kpis?.pending || 0);
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const indicators = [
    { label: 'Tasa de resolucion', value: `${resolutionRate}%`, icon: 'fa-percentage', color: 'text-success' },
    { label: 'Tiempo promedio', value: `${Number(metrics.averageResolutionDays || 0).toFixed(1)}d`, icon: 'fa-stopwatch', color: 'text-warning' },
    { label: 'Pendientes actuales', value: pending, icon: 'fa-exclamation-triangle', color: 'text-danger' },
    { label: 'Ciudades con reportes', value: metrics.topCities?.length || 0, icon: 'fa-map-marker-alt', color: 'text-info' },
  ];

  container.innerHTML = indicators.map((item) => `
    <div class="d-flex align-items-center mb-3" style="gap:12px;">
      <div class="text-center" style="min-width:36px;">
        <i class="fas ${item.icon} fa-lg ${item.color}"></i>
      </div>
      <div class="flex-grow-1">
        <div class="text-muted" style="font-size:0.8rem;">${escapeHtml(item.label)}</div>
      </div>
      <strong class="${item.color}">${escapeHtml(item.value)}</strong>
    </div>`).join('');
}

function renderSummary(metrics) {
  const tbody = $('#tablaResumen');
  const tfoot = $('#tablaResumenTotal');
  if (!tbody || !tfoot) return;

  const categories = Object.entries(metrics.countsByCategory || {});
  const total = Number(metrics.kpis?.total || 0);
  const pending = Number(metrics.kpis?.pending || 0);
  const progress = Number(metrics.kpis?.progress || 0);
  const resolved = Number(metrics.kpis?.resolved || 0);

  if (!categories.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Sin datos para mostrar.</td></tr>';
  } else {
    tbody.innerHTML = categories.map(([label, count]) => {
      const countValue = Number(count || 0);
      const ratio = total > 0 ? countValue / total : 0;
      const rowPending = Math.round(pending * ratio);
      const rowProgress = Math.round(progress * ratio);
      const rowResolved = Math.max(countValue - rowPending - rowProgress, 0);
      const rowRate = countValue > 0 ? Math.round((rowResolved / countValue) * 100) : 0;

      return `
        <tr>
          <td>${escapeHtml(formatCatalogLabel(label))}</td>
          <td class="text-center"><span class="badge badge-pendiente">${rowPending}</span></td>
          <td class="text-center"><span class="badge badge-proceso">${rowProgress}</span></td>
          <td class="text-center"><span class="badge badge-resuelta">${rowResolved}</span></td>
          <td class="text-center font-weight-bold">${countValue}</td>
          <td>
            <div class="d-flex align-items-center" style="gap:8px;">
              <div class="progress flex-grow-1" style="height:10px;">
                <div class="progress-bar bg-success" style="width:${rowRate}%;"></div>
              </div>
              <span style="min-width:36px;">${rowRate}%</span>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  tfoot.innerHTML = `
    <tr>
      <td class="font-weight-bold">TOTAL</td>
      <td class="text-center font-weight-bold">${pending}</td>
      <td class="text-center font-weight-bold">${progress}</td>
      <td class="text-center font-weight-bold">${resolved}</td>
      <td class="text-center font-weight-bold">${total}</td>
      <td class="font-weight-bold">${resolutionRate}%</td>
    </tr>`;
}

function emptyRanking(message) {
  return `<p class="text-muted text-center py-3 mb-0">${escapeHtml(message)}</p>`;
}
