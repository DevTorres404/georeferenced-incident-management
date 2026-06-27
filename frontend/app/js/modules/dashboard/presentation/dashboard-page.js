import { $, hide, showErrorAlert } from '../../../shared/utils/dom-utils.js?v=14';
import { getDashboardMetrics } from '../application/dashboard-service.js?v=14';
import {
  escapeHtml,
  formatCatalogLabel,
  formatShortDate,
  getPriorityBadgeClass,
  getStateBadgeClass,
  hidePageLoading,
  showPageLoading,
} from '../../incidents/presentation/incidents-ui.js?v=16';

document.addEventListener('DOMContentLoaded', initDashboardPage);

async function initDashboardPage() {
  window.renderLayout?.('dashboard');

  showPageLoading('Cargando panel', 'Consultando métricas...');
  const loadingFallback = window.setTimeout(hidePageLoading, 12000);

  try {
    const metrics = await getDashboardMetrics();
    renderKPIs(metrics.kpis || {});
    renderPriorityBars(metrics.countsByPriority || {}, metrics.kpis?.total || 0);
    renderQuickInfo(metrics);
    renderRecentIncidents(metrics.recentIncidents || []);
    renderCharts(metrics);
  } catch (error) {
    showErrorAlert(error.message || 'No se pudieron cargar las metricas del panel.');
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}


function renderKPIs(kpis) {
  const row = $('#kpiRow');
  if (!row) return;

  const items = [
    { value: kpis.total || 0, label: 'Total Incidencias', icon: 'fa-clipboard-list', color: 'bg-info', href: 'incidents.html' },
    { value: kpis.pending || 0, label: 'Pendientes', icon: 'fa-clock', color: 'bg-warning', href: 'incidents.html' },
    { value: kpis.progress || 0, label: 'En Proceso', icon: 'fa-spinner', color: 'bg-primary', href: 'incidents.html' },
    { value: kpis.resolved || 0, label: 'Resueltas', icon: 'fa-check-circle', color: 'bg-success', href: 'incidents.html' },
  ];

  row.innerHTML = items.map((item) => `
    <div class="col-lg-3 col-6">
      <div class="small-box ${item.color}">
        <div class="inner">
          <h3>${Number(item.value || 0)}</h3>
          <p>${escapeHtml(item.label)}</p>
        </div>
        <div class="icon"><i class="fas ${item.icon}"></i></div>
        <a href="${item.href}" class="small-box-footer">
          Ver detalle <i class="fas fa-arrow-circle-right"></i>
        </a>
      </div>
    </div>`).join('');
}

function renderPriorityBars(countsByPriority, total) {
  const container = $('#barrasPrioridad');
  if (!container) return;

  const entries = Object.entries(countsByPriority);
  if (!entries.length) {
    container.innerHTML = '<p class="text-muted text-center mb-0">Sin incidencias por prioridad.</p>';
    return;
  }

  container.innerHTML = entries.map(([label, count]) => {
    const percent = total > 0 ? Math.round((Number(count) / total) * 100) : 0;
    return `
      <div class="mb-3">
        <span class="text-bold">${escapeHtml(formatCatalogLabel(label))}</span>
        <span class="float-right text-muted">${Number(count)} (${percent}%)</span>
        <div class="progress mt-1">
          <div class="progress-bar ${progressClass(label)}" style="width:${percent}%" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
      </div>`;
  }).join('');
}

function renderQuickInfo(metrics) {
  const infoBoxes = document.querySelectorAll('.content .info-box');
  const topCity = metrics.topCities?.[0] || null;
  const topCategory = topEntry(metrics.countsByCategory || {});

  updateInfoBox(infoBoxes[0], {
    number: topCity?.city || 'Sin datos',
    description: topCity ? `${topCity.count} incidencias registradas` : 'No hay incidencias registradas',
    percent: topCity?.pct || 0,
  });

  updateInfoBox(infoBoxes[1], {
    number: topCategory ? formatCatalogLabel(topCategory[0]) : 'Sin datos',
    description: topCategory ? `${topCategory[1]} incidencias` : 'No hay categorias registradas',
    percent: metrics.kpis?.total ? Math.round((topCategory?.[1] || 0) / metrics.kpis.total * 100) : 0,
  });

  updateInfoBox(infoBoxes[2], {
    number: `${Number(metrics.averageResolutionDays || 0).toFixed(1)} dias`,
    description: 'En incidencias resueltas',
    percent: Math.min(Math.round(Number(metrics.averageResolutionDays || 0) * 10), 100),
  });
}

function updateInfoBox(box, data) {
  if (!box) return;
  const number = box.querySelector('.info-box-number');
  const description = box.querySelector('.progress-description');
  const bar = box.querySelector('.progress-bar');

  if (number) number.textContent = data.number;
  if (description) description.textContent = data.description;
  if (bar) bar.style.width = `${data.percent || 0}%`;
}

function renderRecentIncidents(incidents) {
  const tbody = $('#tablaUltimasBody');
  if (!tbody) return;

  if (!incidents.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-3">
          <i class="fas fa-inbox mr-1"></i>Sin incidencias recientes.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = incidents.map((incident) => {
    const category = formatCatalogLabel(incident.category?.name || incident.subcategory?.name || '-');
    const priority = formatCatalogLabel(incident.priority?.name || '-');
    const state = formatCatalogLabel(incident.state?.name || '-');

    return `
      <tr>
        <td><span class="badge badge-dark">${escapeHtml(incident.code || `#${incident.id}`)}</span></td>
        <td class="text-truncate" style="max-width:160px;" title="${escapeHtml(incident.title || '')}">${escapeHtml(incident.title || 'Sin titulo')}</td>
        <td>${escapeHtml(category)}</td>
        <td><span class="badge ${getPriorityBadgeClass(priority)}">${escapeHtml(priority)}</span></td>
        <td><span class="badge ${getStateBadgeClass(state)}">${escapeHtml(state)}</span></td>
        <td>${escapeHtml(formatShortDate(incident.created_at))}</td>
        <td>
          <a href="incident-detail.html?id=${incident.id}" class="btn btn-xs btn-outline-primary" title="Ver detalle">
            <i class="fas fa-eye"></i>
          </a>
        </td>
      </tr>`;
  }).join('');
}

function renderCharts(metrics) {
  if (!window.Chart) return;

  renderDoughnut('graficoPorTipo', metrics.countsByCategory || {});
  renderStateChart(metrics.countsByState || {});
  renderTrendChart(metrics.monthlyTrend || {});
}

function renderDoughnut(canvasId, dataMap) {
  const canvas = document.getElementById(canvasId);
  const entries = Object.entries(dataMap);
  if (!canvas || !entries.length) return;

  new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: entries.map(([label]) => formatCatalogLabel(label)),
      datasets: [{
        data: entries.map(([, value]) => Number(value)),
        backgroundColor: ['#007bff', '#28a745', '#ffc107', '#17a2b8', '#dc3545', '#6f42c1'],
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      legend: { position: 'bottom', labels: { boxWidth: 12, fontSize: 11 } },
      cutoutPercentage: 55,
    },
  });
}

function renderStateChart(countsByState) {
  const canvas = document.getElementById('graficoPorEstado');
  if (!canvas) return;
  const labels = ['Pendiente', 'En proceso', 'Resuelta'];

  new Chart(canvas.getContext('2d'), {
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [{
        label: 'Incidencias',
        data: labels.map((label) => Number(countsByState[label] || 0)),
        backgroundColor: ['#6c757d', '#007bff', '#28a745'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      legend: { display: false },
      scales: {
        xAxes: [{ ticks: { beginAtZero: true, precision: 0 } }],
        yAxes: [{ ticks: { fontSize: 11 } }],
      },
    },
  });
}

function renderTrendChart(trend) {
  const canvas = document.getElementById('graficoTendencia');
  if (!canvas) return;

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: trend.months || [],
      datasets: [
        dataset('Registradas', trend.registered || [], '#007bff'),
        dataset('Resueltas', trend.resolved || [], '#28a745'),
        dataset('Pendientes', trend.pending || [], '#ffc107'),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      legend: { position: 'top', labels: { boxWidth: 12, fontSize: 11 } },
      scales: {
        xAxes: [{ gridLines: { color: 'rgba(0,0,0,0.05)' } }],
        yAxes: [{ ticks: { beginAtZero: true, precision: 0 }, gridLines: { color: 'rgba(0,0,0,0.05)' } }],
      },
    },
  });
}

function dataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: `${color}14`,
    borderWidth: 2,
    pointRadius: 4,
    fill: true,
  };
}

function topEntry(values) {
  const entries = Object.entries(values);
  if (!entries.length) return null;
  return entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
}

function progressClass(label) {
  const value = String(label || '').toUpperCase();
  if (value.includes('CRIT')) return 'bg-danger';
  if (value.includes('ALTA')) return 'bg-warning';
  if (value.includes('MEDIA')) return 'bg-info';
  if (value.includes('BAJA')) return 'bg-success';
  return 'bg-secondary';
}
