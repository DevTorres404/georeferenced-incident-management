import { deleteIncident, listIncidents } from '../application/incidents-service.js?v=14';
import {
  countByState,
  escapeHtml,
  formatCatalogLabel,
  formatShortDate,
  getPriorityBadgeClass,
  getStateBadgeClass,
  showGlobalAlert,
  hidePageLoading,
  showPageLoading,
} from './incidents-ui.js?v=16';

document.addEventListener('DOMContentLoaded', initIncidentsPage);

async function initIncidentsPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('incidents');
  }

  const state = {
    incidents: [],
    filteredIncidents: [],
    pendingDeleteId: null,
    dataTable: null,
    activeStateFilter: 'todos',
    activePriorityFilter: 'todas'
  };

  bindDeleteConfirmation(state);

  showPageLoading('Cargando incidencias', 'Consultando base de datos...');
  const loadingFallback = window.setTimeout(hidePageLoading, 12000);

  try {
    const response = await listIncidents({ per_page: 100 });
    state.incidents = Array.isArray(response?.data) ? response.data : [];
    state.filteredIncidents = [...state.incidents];
    renderCounters(state.incidents);
    renderTable(state);
    bindFilters(state);
  } catch (error) {
    renderErrorRow(error.message || 'No se pudieron cargar las incidencias.');
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

function bindFilters(state) {
  document.querySelectorAll('.filtro-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filtro-btn').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.activeStateFilter = String(button.dataset.filtro || '').toLowerCase();
      applyFilters(state);
    });
  });

  document.querySelectorAll('.priority-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.priority-btn').forEach((item) => {
        item.classList.remove('active', 'btn-dark');
        item.classList.add('bg-white');
      });
      button.classList.add('active', 'btn-dark');
      button.classList.remove('bg-white');
      state.activePriorityFilter = String(button.dataset.prioridad || '').toLowerCase();
      applyFilters(state);
    });
  });
}

function applyFilters(state) {
  state.filteredIncidents = state.incidents.filter((incident) => {
    const matchState = state.activeStateFilter === 'todos' || matchesStateFilter(incident, state.activeStateFilter);
    const matchPriority = state.activePriorityFilter === 'todas' || matchesPriorityFilter(incident, state.activePriorityFilter);
    return matchState && matchPriority;
  });
  renderTable(state);
}

function matchesPriorityFilter(incident, filter) {
  const priorityName = String(incident.priority?.name || '').toLowerCase();
  if (filter === 'critica') return priorityName.includes('crític') || priorityName.includes('critic');
  if (filter === 'alta') return priorityName.includes('alta');
  if (filter === 'media') return priorityName.includes('media');
  if (filter === 'baja') return priorityName.includes('baja');
  return false;
}

function matchesStateFilter(incident, filter) {
  const stateName = String(incident.state?.name || '').toUpperCase();

  if (filter === 'pendiente') {
    return ['NUEVA', 'PENDIENTE'].includes(stateName);
  }

  if (filter === 'en proceso') {
    return ['EN_REVISION', 'EN PROCESO', 'EN_ATENCION'].includes(stateName);
  }

  if (filter === 'resuelta') {
    return ['RESUELTA', 'CERRADA'].includes(stateName);
  }

  return false;
}

function renderCounters(incidents) {
  setText('cnt-todos', incidents.length);
  setText('cnt-pendiente', countByState(incidents, ['NUEVA', 'PENDIENTE']));
  setText('cnt-proceso', countByState(incidents, ['EN_REVISION', 'EN PROCESO', 'EN_ATENCION']));
  setText('cnt-resuelta', countByState(incidents, ['RESUELTA', 'CERRADA']));
}

function renderTable(state) {
  const tableEl = document.getElementById('tablaIncidencias');
  if (tableEl) {
    tableEl.style.opacity = '0';
  }

  destroyTable(state);

  const tbody = document.getElementById('tablaBody');
  if (!tbody) return;

  if (!state.filteredIncidents.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-4">
          <i class="fas fa-inbox fa-2x mb-2 d-block"></i>No hay incidencias disponibles.
        </td>
      </tr>`;
    if (tableEl) tableEl.style.opacity = '1';
    return;
  }

  tbody.innerHTML = state.filteredIncidents.map((incident) => {
    const code = escapeHtml(incident.code || `#${incident.id}`);
    const title = escapeHtml(incident.title || 'Sin título');
    const categoryName = formatCatalogLabel(incident.category?.name || incident.subcategory?.name || '-');
    const priorityName = formatCatalogLabel(incident.priority?.name || '-');
    const stateName = formatCatalogLabel(incident.state?.name || '-');
    const territoryName = territoryLabel(incident);

    return `
      <tr id="fila-${incident.id}">
        <td><div class="table-ticket-code">${code}</div></td>
        <td class="text-truncate font-weight-bold text-dark" style="max-width:240px;" title="${title}">${title}</td>
        <td><span class="text-muted"><i class="fas fa-folder mr-1" style="opacity:0.5;"></i>${escapeHtml(categoryName)}</span></td>
        <td><span class="badge ${getPriorityBadgeClass(priorityName)} shadow-sm">${escapeHtml(priorityName)}</span></td>
        <td><span class="badge ${getStateBadgeClass(stateName)} shadow-sm">${escapeHtml(stateName)}</span></td>
        <td class="text-truncate text-muted" style="max-width:260px;" title="${escapeHtml(territoryName)}"><i class="fas fa-map-marker-alt mr-1 text-primary" style="opacity:0.6;"></i>${escapeHtml(territoryName)}</td>
        <td><span class="text-muted">${escapeHtml(formatShortDate(incident.created_at))}</span></td>
        <td class="text-center" style="white-space:nowrap;">
          <a href="/incidencias/detalle" class="btn btn-sm btn-outline-primary shadow-sm mr-1" title="Ver detalle completo" style="border-radius:0.4rem;">
            <i class="fas fa-external-link-alt"></i>
          </a>
          <button class="btn btn-sm btn-outline-danger shadow-sm js-delete-incident" title="Eliminar" data-id="${incident.id}" data-code="${code}" style="border-radius:0.4rem;">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>`;
  }).join('');

  // Use event delegation for delete buttons to work across all DataTables pages
  tbody.onclick = (e) => {
    const btn = e.target.closest('.js-delete-incident');
    if (btn) {
      openDeleteModal(state, btn.dataset.id, btn.dataset.code);
    }
  };

  if (window.jQuery?.fn?.DataTable) {
    state.dataTable = window.jQuery('#tablaIncidencias').DataTable({
      language: {
        sProcessing: "Procesando...",
        sLengthMenu: "Mostrar _MENU_ registros",
        sZeroRecords: "No se encontraron resultados",
        sEmptyTable: `
          <div class="text-center py-5">
            <i class="fas fa-folder-open text-muted mb-3" style="font-size: 3.5rem; opacity: 0.5;"></i>
            <h4 class="text-main font-weight-bold">No hay incidencias disponibles</h4>
            <p class="text-muted">Cuando se creen incidencias, aparecerán aquí con su estado, prioridad y fecha.</p>
            <a href="/incidencias/crear" class="btn btn-primary mt-2">
              <i class="fas fa-plus mr-1"></i>Crear nueva incidencia
            </a>
          </div>
        `,
        sInfo: "Mostrando _START_ a _END_ de _TOTAL_ registros",
        sInfoEmpty: "Mostrando 0 a 0 de 0 registros",
        sInfoFiltered: "(filtrado de un total de _MAX_ registros)",
        sInfoPostFix: "",
        sSearch: "Buscar:",
        sUrl: "",
        sInfoThousands: ",",
        sLoadingRecords: "Cargando...",
        oPaginate: {
          sFirst: "Primero",
          sLast: "Último",
          sNext: "Siguiente",
          sPrevious: "Anterior"
        },
        oAria: {
          sSortAscending: ": Activar para ordenar la columna de manera ascendente",
          sSortDescending: ": Activar para ordenar la columna de manera descendente"
        }
      },
      pageLength: 5,
      lengthMenu: [[5, 10, 25, 50], [5, 10, 25, 50]],
      ordering: false,
      initComplete: function() {
        if (tableEl) {
          tableEl.style.transition = 'opacity 0.25s ease';
          tableEl.style.opacity = '1';
        }
      }
    });
  } else if (tableEl) {
    tableEl.style.opacity = '1';
  }
}

function bindDeleteConfirmation(state) {
  const confirmButton = document.getElementById('btnConfirmarEliminar');
  if (!confirmButton) return;

  confirmButton.addEventListener('click', async () => {
    if (!state.pendingDeleteId) return;

    try {
      await deleteIncident(state.pendingDeleteId);
      state.incidents = state.incidents.filter((incident) => String(incident.id) !== String(state.pendingDeleteId));
      state.filteredIncidents = state.filteredIncidents.filter((incident) => String(incident.id) !== String(state.pendingDeleteId));
      renderCounters(state.incidents);
      renderTable(state);
      window.jQuery?.('#modalEliminar').modal('hide');
      showGlobalAlert('Incidencia eliminada correctamente.', 'success');
    } catch (error) {
      showGlobalAlert(error.message || 'No se pudo eliminar la incidencia.', 'danger');
    } finally {
      state.pendingDeleteId = null;
    }
  });
}

function openDeleteModal(state, incidentId, code) {
  state.pendingDeleteId = incidentId;
  setText('codigoEliminar', code || `#${incidentId}`);
  window.jQuery?.('#modalEliminar').modal('show');
}

function destroyTable(state) {
  if (state.dataTable) {
    state.dataTable.destroy();
    state.dataTable = null;
  }
}

function renderErrorRow(message) {
  const tbody = document.getElementById('tablaBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center text-danger py-4">
        <i class="fas fa-exclamation-circle mr-2"></i>${escapeHtml(message)}
      </td>
    </tr>`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = String(value);
  }
}

function territoryLabel(incident) {
  const territorialUnit = incident?.territorial_unit || incident?.territorialUnit;
  return formatCatalogLabel(
    territorialUnit?.full_path
      || territorialUnit?.name
      || incident?.address_reference
      || incident?.address
      || '-'
  );
}
