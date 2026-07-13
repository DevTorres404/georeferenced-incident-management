import { deleteIncident, listIncidents } from '../application/incidents-service.js?v=14';
import { readUser } from '../../../core/auth-session.js?v=14';
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

const INCIDENT_SEARCH_STORAGE_KEY = 'SGI_incidents_search';

document.addEventListener('DOMContentLoaded', initIncidentsPage);

async function initIncidentsPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('incidents');
  }

  const state = {
    currentUser: readUser(),
    incidents: [],
    filteredIncidents: [],
    pendingDeleteId: null,
    dataTable: null,
    activeStateFilter: 'todos',
    activePriorityFilter: 'todas',
    activeSearchQuery: readStoredSearch(),
    activeScopeFilter: 'role',
    canDeleteIncident: false,
  };

  state.canDeleteIncident = userHasPermission(state.currentUser, 'incidents.delete');
  bindDeleteConfirmation(state);
  configureScopeFilters(state);
  configureRoleActions(state);
  bindFilters(state);

  showPageLoading('Cargando incidencias', 'Consultando base de datos...');
  const loadingFallback = window.setTimeout(hidePageLoading, 12000);

  try {
    const response = await listIncidents({ per_page: 100 });
    state.incidents = Array.isArray(response?.data) ? response.data : [];
    applyFilters(state);
  } catch (error) {
    renderErrorRow(error.message || 'No se pudieron cargar las incidencias.');
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

function bindFilters(state) {
  const searchInput = document.getElementById('incidentSearch');
  if (searchInput) {
    searchInput.value = state.activeSearchQuery;
    searchInput.addEventListener('input', () => {
      state.activeSearchQuery = searchInput.value;
      storeSearch(state.activeSearchQuery);
      applyFilters(state);
    });
  }

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
  const scopeIncidents = state.incidents.filter((incident) => matchesScopeFilter(incident, state));
  state.filteredIncidents = scopeIncidents.filter((incident) => {
    const matchState = state.activeStateFilter === 'todos' || matchesStateFilter(incident, state.activeStateFilter);
    const matchPriority = state.activePriorityFilter === 'todas' || matchesPriorityFilter(incident, state.activePriorityFilter);
    const matchSearch = matchesSearch(incident, state.activeSearchQuery);
    return matchState && matchPriority && matchSearch;
  });
  renderCounters(scopeIncidents);
  renderTable(state);
}

function matchesSearch(incident, query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return true;

  const searchableText = normalizeSearchText([
    incident.code,
    incident.title,
    incident.description,
  ].filter(Boolean).join(' '));

  return searchableText.includes(normalizedQuery);
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function readStoredSearch() {
  try {
    return sessionStorage.getItem(INCIDENT_SEARCH_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function storeSearch(query) {
  try {
    sessionStorage.setItem(INCIDENT_SEARCH_STORAGE_KEY, query);
  } catch {
    // La búsqueda sigue operativa aunque el navegador bloquee sessionStorage.
  }
}

function configureScopeFilters(state) {
  const container = document.getElementById('incidentScopeFilters');
  const context = document.getElementById('incidentScopeContext');
  if (!container) return;

  const isAdmin = userHasRole(state.currentUser, 'ADMIN');
  const isSupervisor = userHasRole(state.currentUser, 'SUPERVISOR') && !isAdmin;
  const isOperator = userHasRole(state.currentUser, 'OPERADOR') && !isAdmin;
  const options = isSupervisor
    ? [
        { value: 'role', label: 'Mi zona', icon: 'fa-map-marker-alt' },
        { value: 'mine', label: 'Mis reportes', icon: 'fa-user-edit' },
      ]
    : isOperator
      ? [{ value: 'assigned', label: 'Asignadas a mí', icon: 'fa-user-check' }]
      : isAdmin
        ? [
            { value: 'role', label: 'Todas', icon: 'fa-globe-americas' },
            { value: 'mine', label: 'Mis reportes', icon: 'fa-user-edit' },
          ]
        : [{ value: 'mine', label: 'Mis reportes', icon: 'fa-user-edit' }];

  state.activeScopeFilter = options[0].value;
  container.innerHTML = options.map((option, index) => `
    <button type="button" class="btn btn-sm ${index === 0 ? 'btn-primary active' : 'btn-outline-primary'} incident-scope-btn"
            data-scope="${option.value}">
      <i class="fas ${option.icon} mr-1"></i>${option.label}
    </button>`).join('');

  container.querySelectorAll('.incident-scope-btn').forEach((button) => {
    button.addEventListener('click', () => {
      container.querySelectorAll('.incident-scope-btn').forEach((item) => {
        item.classList.remove('active', 'btn-primary');
        item.classList.add('btn-outline-primary');
      });
      button.classList.add('active', 'btn-primary');
      button.classList.remove('btn-outline-primary');
      state.activeScopeFilter = button.dataset.scope || 'role';
      applyFilters(state);
    });
  });

  if (!context) return;
  if (isSupervisor) {
    context.textContent = 'La vista operativa está limitada a tu zona asignada.';
  } else if (isOperator) {
    context.textContent = 'Solo puedes gestionar incidencias asignadas a ti.';
  } else if (isAdmin) {
    context.textContent = 'Vista administrativa nacional.';
  } else {
    context.textContent = 'Solo puedes consultar tus reportes.';
  }
}

function matchesScopeFilter(incident, state) {
  const userId = Number(state.currentUser?.id || state.currentUser?.user_id || 0);

  if (state.activeScopeFilter === 'mine') {
    return Number(incident.reporter_user_id) === userId;
  }

  if (state.activeScopeFilter === 'assigned') {
    return Number(incident.assignee_user_id) === userId
      || (Array.isArray(incident.assignments)
        && incident.assignments.some((assignment) => Number(assignment.user_id) === userId));
  }

  return true;
}

function userHasRole(user, roleCode) {
  if (!user || !Array.isArray(user.roles)) return false;

  return user.roles.some((role) => {
    const code = typeof role === 'string' ? role : (role?.code || role?.codigo || '');
    return String(code).trim().toUpperCase() === roleCode;
  });
}

function userHasPermission(user, permissionCode) {
  if (!user) return false;
  if (userHasRole(user, 'ADMIN')) return true;

  const expected = String(permissionCode).trim().toUpperCase();
  if (Array.isArray(user.permissions)) {
    const hasDirectPermission = user.permissions.some((permission) => {
      const code = typeof permission === 'string' ? permission : (permission?.code || permission?.codigo || '');
      return String(code).trim().toUpperCase() === expected;
    });
    if (hasDirectPermission) return true;
  }

  return Array.isArray(user.roles) && user.roles.some((role) => (
    Array.isArray(role?.permissions)
      && role.permissions.some((permission) => {
        const code = typeof permission === 'string' ? permission : (permission?.code || permission?.codigo || '');
        return String(code).trim().toUpperCase() === expected;
      })
  ));
}

function configureRoleActions(state) {
  const createButton = document.getElementById('btnCreateIncident');
  if (createButton) {
    createButton.style.display = userHasPermission(state.currentUser, 'incidents.create') ? '' : 'none';
  }

  const mapButton = document.getElementById('btnViewMap');
  if (mapButton) {
    const isAdmin = userHasRole(state.currentUser, 'ADMIN');
    const isSupervisor = userHasRole(state.currentUser, 'SUPERVISOR');
    const isOperator = userHasRole(state.currentUser, 'OPERADOR');
    const isInternalUser = isAdmin || isSupervisor || isOperator;

    mapButton.style.display = isInternalUser ? '' : 'none';
  }
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
    const emptyMessage = state.activeSearchQuery.trim()
      ? 'No se encontraron incidencias que coincidan con la búsqueda.'
      : 'No hay incidencias disponibles.';
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-4">
          <i class="fas fa-inbox fa-2x mb-2 d-block"></i>${emptyMessage}
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
          <a href="incident-detail.html?id=${incident.id}" class="btn btn-sm btn-outline-primary shadow-sm mr-1" title="Ver detalle completo" style="border-radius:0.4rem;">
            <i class="fas fa-external-link-alt"></i>
          </a>
          ${state.canDeleteIncident ? `
            <button class="btn btn-sm btn-outline-danger shadow-sm js-delete-incident" title="Eliminar" data-id="${incident.id}" data-code="${code}" style="border-radius:0.4rem;">
              <i class="fas fa-trash"></i>
            </button>` : ''}
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
            <a href="incident-create.html" class="btn btn-primary mt-2">
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
      searching: false,
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
      applyFilters(state);
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
