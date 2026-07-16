import { $, hide, showErrorAlert } from '../../../presentation/dom-utils.js?v=14';

import { getDashboardMetrics } from '../application/dashboard-service.js?v=14';
import {
  escapeHtml,
  formatCatalogLabel,
  formatShortDate,
  getPriorityHexColor,
  getStateHexColor,
  hidePageLoading,
  showPageLoading,
} from '../../incidents/presentation/incidents-ui.js?v=16';

export const CHART_COLORS = {
  info: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  indigo: '#6366f1',
  teal: '#14b8a6',
};

export const CATEGORY_PALETTE = [
  CHART_COLORS.info,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.purple,
  CHART_COLORS.indigo,
];

export const STATE_COLORS = {
  PENDIENTE: '#94a3b8',
  'EN PROCESO': CHART_COLORS.info,
  RESUELTA: CHART_COLORS.success,
};
const dashboardCharts = {};

document.addEventListener('DOMContentLoaded', initDashboardPage);
globalThis.addEventListener('pagehide', (event) => {
  if (event.persisted) return;

  destroyDashboardCharts();
});

export async function initDashboardPage() {
  globalThis.renderLayout?.('dashboard');

  showPageLoading('Cargando panel', 'Consultando métricas...');
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 12000);

  try {
    const metrics = await getDashboardMetrics();
    renderPriorityBars(metrics.countsByPriority || {}, metrics.kpis?.total || 0);
    renderInfoCards(metrics);
    renderRecentIncidents(metrics.recentIncidents || []);
    renderCharts(metrics);
  } catch (error) {
    showErrorAlert(error.message || 'No se pudieron cargar las métricas del panel.');
  } finally {
    globalThis.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

/* ── Priority Bars ───────────────────────────────────────────────────────── */

export function renderPriorityBars(countsByPriority, total) {
  const container = $('#barrasPrioridad');
  if (!container) return;

  const entries = Object.entries(countsByPriority);
  if (!entries.length) {
    container.innerHTML = '<p class="text-muted text-center mb-0" style="font-size:0.85rem;">Sin incidencias por prioridad.</p>';
    return;
  }

  container.innerHTML = entries.map(([label, count]) => {
    const pct = total > 0 ? Math.round((Number(count) / total) * 100) : 0;
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
      </div>`;
  }).join('');
}

export function priorityColor(label) {
  const v = String(label || '').toUpperCase();
  if (v.includes('CRIT')) return CHART_COLORS.danger;
  if (v.includes('ALTA')) return CHART_COLORS.warning;
  if (v.includes('MEDIA')) return CHART_COLORS.info;
  if (v.includes('BAJA')) return CHART_COLORS.success;
  return '#94a3b8';
}

/* ── Info Cards ──────────────────────────────────────────────────────────── */

export function renderInfoCards(metrics) {
  const stack = $('#infoStack');
  if (!stack) return;

  const topCity = metrics.topCities?.[0] || null;
  const topCategory = topEntry(metrics.countsByCategory || {});
  const avgDays = Number(metrics.averageResolutionDays || 0);

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
    </div>`;
}

/* ── Recent Incidents Table ──────────────────────────────────────────────── */

export function renderRecentIncidents(incidents) {
  const tbody = $('#tablaUltimasBody');
  if (!tbody) return;

  if (!incidents.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
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
        <td><span class="dash-table-code">${escapeHtml(incident.code || `#${incident.id}`)}</span></td>
        <td class="dash-table-title" title="${escapeHtml(incident.title || '')}">${escapeHtml(incident.title || 'Sin título')}</td>
        <td>${escapeHtml(category)}</td>
        <td><span class="badge" style="background-color: ${incident.priority?.color || getPriorityHexColor(priority)}; color: #fff">${escapeHtml(priority)}</span></td>
        <td><span class="badge" style="background-color: ${incident.state?.color || getStateHexColor(state)}; color: #fff">${escapeHtml(state)}</span></td>
        <td style="white-space:nowrap;">${escapeHtml(formatShortDate(incident.created_at))}</td>
        <td>
          <a href="incident-detail.html?id=${incident.id}" class="btn btn-xs btn-outline-primary" title="Ver detalle">
            <i class="fas fa-eye"></i>
          </a>
        </td>
      </tr>`;
  }).join('');
}

/* ── Charts ──────────────────────────────────────────────────────────────── */

export function renderCharts(metrics) {
  destroyDashboardCharts();
  if (!globalThis.Chart) return;

  renderDoughnut('graficoPorTipo', metrics.countsByCategory || {});
  renderStateChart(metrics.countsByState || {});
  renderTrendChart(metrics.monthlyTrend || {});
}

function destroyDashboardCharts() {
  Object.values(dashboardCharts).forEach((chart) => chart?.destroy?.());
  Object.keys(dashboardCharts).forEach((key) => delete dashboardCharts[key]);
}

function renderDoughnut(canvasId, dataMap) {
  const canvas = document.getElementById(canvasId);
  const entries = Object.entries(dataMap);
  if (!canvas || !entries.length) return;

  dashboardCharts.categories = new globalThis.Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: entries.map(([label]) => formatCatalogLabel(label)),
      datasets: [{
        data: entries.map(([, value]) => Number(value)),
        backgroundColor: CATEGORY_PALETTE.slice(0, entries.length),
        borderWidth: 0,
        hoverBorderWidth: 2,
        hoverBorderColor: '#ffffff',
      }],
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
          pointStyle: 'circle',
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 8,
        },
      },
    },
  });
}

function renderStateChart(countsByState) {
  const canvas = document.getElementById('graficoPorEstado');
  if (!canvas) return;

  const labels = Object.keys(countsByState);
  const colors = labels.map(label => getStateHexColor(label));

  dashboardCharts.states = new globalThis.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.map(formatCatalogLabel),
      datasets: [{
        label: 'Incidencias',
        data: labels.map((label) => Number(countsByState[label] || 0)),
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 6,
        barPercentage: 0.6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      legend: { display: false },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 11 }, color: '#64748b' },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
        y: {
          ticks: { font: { size: 11 }, color: '#334155' },
          grid: { display: false },
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 8,
        },
      },
    },
  });
}

function renderTrendChart(trend) {
  const canvas = document.getElementById('graficoTendencia');
  if (!canvas) return;

  const datasets = (trend.series || []).map(serie => {
    return buildDataset(formatCatalogLabel(serie.name), serie.data, getStateHexColor(serie.name));
  });

  dashboardCharts.trend = new globalThis.Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: trend.months || [],
      datasets: datasets,
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
          pointStyle: 'circle',
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { size: 11 }, color: '#64748b' },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 11 }, color: '#64748b' },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 8,
          intersect: false,
          mode: 'index',
        },
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
    },
  });
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
    tension: 0.35,
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function topEntry(values) {
  const entries = Object.entries(values);
  if (!entries.length) return null;
  return entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
}

/* ── Map Previews ────────────────────────────────────────────────────────── */

export function renderMapMarkers(incidents) {
  const map = globalThis.__sgiDashMap;
  if (!map || typeof globalThis.maplibregl === 'undefined') {
    // If map is not initialized yet, try again shortly
    setTimeout(() => renderMapMarkers(incidents), 500);
    return;
  }

  if (globalThis.__sgiDashMarkers) {
    globalThis.__sgiDashMarkers.forEach((m) => m.remove());
  }
  globalThis.__sgiDashMarkers = [];

  const bounds = new globalThis.maplibregl.LngLatBounds();
  let hasValidCoordinates = false;

  incidents.forEach((incident) => {
    if (!incident.latitude || !incident.longitude) return;
    hasValidCoordinates = true;

    const popupHtml = `
      <div style="font-family: 'Source Sans Pro', sans-serif;">
        <strong style="display:block; margin-bottom: 5px;">${escapeHtml(incident.title || 'Sin título')}</strong>
        <p style="margin: 0 0 10px 0; font-size: 0.85em; color: #6c757d;">
          ${escapeHtml(incident.code || '#' + incident.id)} &middot; ${escapeHtml(incident.category?.name || 'Categoría')}
        </p>
        <a href="incident-detail.html?id=${incident.id}" class="btn btn-xs btn-primary d-block text-center" style="text-decoration:none;">
          <i class="fas fa-eye mr-1"></i> Ver Detalle
        </a>
      </div>
    `;

    const el = document.createElement('div');
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.backgroundColor = priorityColor(incident.priority?.name);
    el.style.borderRadius = '50%';
    el.style.border = '2px solid white';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';

    const marker = new globalThis.maplibregl.Marker({ element: el })
      .setLngLat([Number(incident.longitude), Number(incident.latitude)])
      .setPopup(new globalThis.maplibregl.Popup({ offset: 12 }).setHTML(popupHtml))
      .addTo(map);

    globalThis.__sgiDashMarkers.push(marker);
    bounds.extend([Number(incident.longitude), Number(incident.latitude)]);
  });

  if (hasValidCoordinates) {
    try {
      map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
    } catch (e) {
      console.warn('Map fitBounds failed:', e);
    }
  }
}
