import {
  assignIncidentOperators,
  getIncident,
  listAssignmentOperators,
  listIncidents,
} from '../application/incidents-service.js?v=15';
import {
  escapeHtml,
  formatCatalogLabel,
  formatShortDate,
  getPriorityBadgeClass,
  getStateBadgeClass,
  hidePageLoading,
  showGlobalAlert,
  showPageLoading,
} from './incidents-ui.js?v=16';

document.addEventListener('DOMContentLoaded', initAssignmentManagementPage);

async function initAssignmentManagementPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('assignment-management');
  }

  const state = {
    currentUser: readSessionUser(),
    incidents: [],
    filteredIncidents: [],
    operators: [],
    selectedIncident: null,
  };

  bindStaticEvents(state);

  showPageLoading('Cargando asignaciones', 'Preparando incidencias y operadores...');

  try {
    const [incidentsResponse, operatorsResponse] = await Promise.all([
      listIncidents({ per_page: 100 }),
      listAssignmentOperators(),
    ]);

    state.incidents = Array.isArray(incidentsResponse?.data) ? incidentsResponse.data : [];
    state.filteredIncidents = [...state.incidents];
    state.operators = Array.isArray(operatorsResponse?.data) ? operatorsResponse.data : [];

    populateFilters(state);
    renderKpis(state.filteredIncidents, state.operators);
    renderTable(state);
  } catch (error) {
    renderError(error?.message || 'No se pudo cargar la gestion de asignaciones.');
  } finally {
    hidePageLoading();
  }
}

function bindStaticEvents(state) {
  ['filterSearch', 'filterPriority', 'filterState', 'filterCategory', 'filterTerritory', 'filterOperator'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => applyFilters(state));
    document.getElementById(id)?.addEventListener('change', () => applyFilters(state));
  });

  document.getElementById('btnResetFilters')?.addEventListener('click', () => {
    ['filterSearch', 'filterPriority', 'filterState', 'filterCategory', 'filterTerritory', 'filterOperator'].forEach((id) => {
      const field = document.getElementById(id);
      if (field) {
        field.value = '';
      }
    });
    applyFilters(state);
  });

  document.getElementById('assignmentTableBody')?.addEventListener('click', async (event) => {
    const assignmentButton = event.target.closest('[data-open-assignment]');
    if (assignmentButton) {
      await openAssignmentModal(state, Number(assignmentButton.dataset.openAssignment));
      return;
    }
  });

  document.getElementById('btnSaveAssignment')?.addEventListener('click', async () => {
    await submitAssignment(state);
  });
}

function populateFilters(state) {
  fillSelect('filterPriority', uniqueValues(state.incidents.map((incident) => incident.priority?.name)));
  fillSelect('filterState', uniqueValues(state.incidents.map((incident) => incident.state?.name)));
  fillSelect('filterCategory', uniqueValues(state.incidents.map((incident) => incident.category?.name)));
  fillTerritorySelect(state);
  fillOperatorSelect(state.operators);
}

function fillTerritorySelect(state) {
  const zoneNames = uniqueValues(state.incidents.map((incident) => incident.zone_name || ''));
  const select = document.getElementById('filterTerritory');
  const isSupervisorView = userHasRole(state.currentUser, 'SUPERVISOR') && !userHasRole(state.currentUser, 'ADMIN');

  if (!select) return;

  if (isSupervisorView) {
    const onlyZone = zoneNames[0] || '';
    select.innerHTML = onlyZone
      ? `<option value="${escapeHtml(onlyZone)}">${escapeHtml(onlyZone)}</option>`
      : '<option value="">Sin zona</option>';
    select.value = onlyZone;
    select.disabled = true;

    const filterGroup = document.getElementById('territoryFilterGroup');
    if (filterGroup) filterGroup.style.display = 'none';

    showZoneBanner(onlyZone);
    updateSubtitleForSupervisor(onlyZone);
    return;
  }

  select.disabled = false;
  fillSelect('filterTerritory', zoneNames);
}

function showZoneBanner(zoneName) {
  const wrapper = document.getElementById('zoneBannerWrapper');
  const nameEl = document.getElementById('zoneBannerName');
  if (!wrapper || !nameEl) return;

  if (zoneName) {
    nameEl.textContent = zoneName;
    wrapper.style.display = '';
  }
}

function updateSubtitleForSupervisor(zoneName) {
  const subtitle = document.getElementById('assignmentSubtitle');
  if (!subtitle) return;

  subtitle.textContent = zoneName
    ? `Gestionando incidencias de la zona ${zoneName}. Distribuye entre responsables principales y apoyos.`
    : 'Supervisa y distribuye incidencias entre responsables principales y apoyos.';
}

function fillSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) return;

  const firstOption = select.querySelector('option')?.outerHTML || '<option value="">Todos</option>';
  select.innerHTML = `${firstOption}${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
}

function fillOperatorSelect(operators) {
  const select = document.getElementById('filterOperator');
  if (!select) return;

  select.innerHTML = '<option value="">Todos</option>' + operators.map((operator) => (
    `<option value="${operator.user_id}">${escapeHtml(operator.full_name || operator.email || 'Operador')}</option>`
  )).join('');
}

function applyFilters(state) {
  const search = String(document.getElementById('filterSearch')?.value || '').trim().toLowerCase();
  const priority = String(document.getElementById('filterPriority')?.value || '').trim().toLowerCase();
  const incidentState = String(document.getElementById('filterState')?.value || '').trim().toLowerCase();
  const category = String(document.getElementById('filterCategory')?.value || '').trim().toLowerCase();
  const territory = String(document.getElementById('filterTerritory')?.value || '').trim().toLowerCase();
  const operatorId = String(document.getElementById('filterOperator')?.value || '').trim();

  state.filteredIncidents = state.incidents.filter((incident) => {
    const matchesSearch = !search || `${incident.code || ''} ${incident.title || ''}`.toLowerCase().includes(search);
    const matchesPriority = !priority || String(incident.priority?.name || '').toLowerCase() === priority;
    const matchesState = !incidentState || String(incident.state?.name || '').toLowerCase() === incidentState;
    const matchesCategory = !category || String(incident.category?.name || '').toLowerCase() === category;
    const incidentZone = String(incident.zone_name || '').trim().toLowerCase();
    const matchesTerritory = !territory || incidentZone === territory;
    const matchesOperator = !operatorId || (Array.isArray(incident.assignments) && incident.assignments.some((assignment) => String(assignment.user_id) === operatorId));

    return matchesSearch && matchesPriority && matchesState && matchesCategory && matchesTerritory && matchesOperator;
  });

  renderKpis(state.filteredIncidents, state.operators);
  renderTable(state);
}

function renderKpis(incidents, operators) {
  const target = document.getElementById('assignmentKpis');
  if (!target) return;

  const overdueCount = incidents.filter((incident) => {
    if (!incident.due_date) return false;
    return new Date(incident.due_date).getTime() < Date.now() && !isResolvedState(incident.state?.name);
  }).length;

  const kpis = [
    { label: 'Sin asignar', value: incidents.filter((incident) => !incident.assignee_user_id).length },
    { label: 'Criticas', value: incidents.filter((incident) => includesNormalized(incident.priority?.name, 'critica')).length },
    { label: 'Altas', value: incidents.filter((incident) => includesNormalized(incident.priority?.name, 'alta')).length },
    { label: 'Vencidas', value: overdueCount },
    { label: 'Operadores disponibles', value: operators.filter((operator) => operator.available).length },
  ];

  target.innerHTML = kpis.map((item) => `
    <article class="assignment-kpi">
      <span class="assignment-kpi-label">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </article>
  `).join('');
}

function renderTable(state) {
  const tbody = document.getElementById('assignmentTableBody');
  if (!tbody) return;

  if (!state.filteredIncidents.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center text-muted py-4">
          <i class="fas fa-inbox d-block mb-2"></i>No hay incidencias disponibles para esta vista.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = state.filteredIncidents.map((incident) => {
    const activeAssignments = Array.isArray(incident.assignments) ? incident.assignments : [];
    const assignmentChips = activeAssignments.length
      ? activeAssignments.map((assignment) => {
          const roleClass = assignment.assignment_role === 'support' ? 'assignment-chip assignment-chip-support' : 'assignment-chip';
          const roleLabel = assignment.assignment_role === 'support' ? 'Apoyo' : 'Principal';
          return `<span class="${roleClass}">${escapeHtml(assignment.full_name || `#${assignment.user_id}`)} · ${roleLabel}</span>`;
        }).join('')
      : '<span class="text-muted">Sin asignacion</span>';

    return `
      <tr>
        <td class="font-weight-bold">${escapeHtml(incident.code || `#${incident.id}`)}</td>
        <td>
          <div class="font-weight-bold text-dark">${escapeHtml(incident.title || 'Sin titulo')}</div>
          <small class="text-muted">${escapeHtml(formatCatalogLabel(incident.category?.name || '-'))}</small>
        </td>
        <td><span class="badge ${getPriorityBadgeClass(incident.priority?.name || '-')}">${escapeHtml(formatCatalogLabel(incident.priority?.name || '-'))}</span></td>
        <td><span class="badge ${getStateBadgeClass(incident.state?.name || '-')}">${escapeHtml(formatCatalogLabel(incident.state?.name || '-'))}</span></td>
        <td>${escapeHtml(incident.zone_name || 'Sin zona')}</td>
        <td>${escapeHtml(incident.territorial_unit?.full_path || incident.territorial_unit?.name || '-')}</td>
        <td>${escapeHtml(formatShortDate(incident.created_at))}</td>
        <td>${assignmentChips}</td>
        <td class="text-right assignment-row-actions">
          <a href="/incidencias/detalle" class="btn btn-sm btn-outline-secondary mr-1" title="Ver detalle">
            <i class="fas fa-eye"></i>
          </a>
          <button type="button" class="btn btn-sm btn-primary" data-open-assignment="${incident.id}">
            <i class="fas fa-user-check mr-1"></i>${activeAssignments.length ? 'Reasignar' : 'Asignar'}
          </button>
        </td>
      </tr>`;
  }).join('');
}

async function openAssignmentModal(state, incidentId) {
  showPageLoading('Cargando incidencia', 'Preparando operadores para la asignacion...');

  try {
    const response = await getIncident(incidentId);
    state.selectedIncident = response?.data || null;
    renderAssignmentModal(state);
    window.jQuery?.('#assignmentModal').modal('show');
  } catch (error) {
    showGlobalAlert(error?.message || 'No se pudo cargar el detalle de la incidencia.', 'danger');
  } finally {
    hidePageLoading();
  }
}

function renderAssignmentModal(state) {
  const incident = state.selectedIncident;
  if (!incident) return;

  const activeAssignments = (incident.assignments || []).filter((assignment) => assignment.active !== false);
  const currentPrimaryId = activeAssignments.find((assignment) => assignment.assignment_role === 'primary')?.user_id || incident.assignee_user_id || '';
  const currentSupportIds = new Set(activeAssignments.filter((assignment) => assignment.assignment_role === 'support').map((assignment) => String(assignment.user_id)));

  const summary = document.getElementById('assignmentModalSummary');
  if (summary) {
    summary.innerHTML = `
      <div class="font-weight-bold mb-1">${escapeHtml(incident.code || `#${incident.id}`)} · ${escapeHtml(incident.title || 'Incidencia')}</div>
      <div class="text-muted small">${escapeHtml(incident.zone_name || incident.territorial_unit?.full_path || 'Sin territorio')}</div>
    `;
  }

  const primarySelect = document.getElementById('primaryOperatorSelect');
  if (primarySelect) {
    primarySelect.innerHTML = state.operators.map((operator) => {
      const disabled = !operator.available && String(operator.user_id) !== String(currentPrimaryId) ? 'disabled' : '';
      const selected = String(operator.user_id) === String(currentPrimaryId) ? 'selected' : '';
      return `<option value="${operator.user_id}" ${selected} ${disabled}>${escapeHtml(buildOperatorOptionLabel(operator))}</option>`;
    }).join('');
  }

  const supportList = document.getElementById('supportOperatorsList');
  if (supportList) {
    supportList.innerHTML = state.operators.map((operator) => {
      const checked = currentSupportIds.has(String(operator.user_id)) ? 'checked' : '';
      const disabled = !operator.available && !checked ? 'disabled' : '';
      const disabledClass = disabled ? 'disabled' : '';
      return `
        <label class="support-operator-item ${disabledClass}">
          <input type="checkbox" value="${operator.user_id}" ${checked} ${disabled}>
          <span class="support-operator-meta">
            <span class="support-operator-name">${escapeHtml(operator.full_name || operator.email || `Operador #${operator.user_id}`)}</span>
            <span class="support-operator-caption">${escapeHtml(buildOperatorCapacityLabel(operator))}</span>
          </span>
        </label>`;
    }).join('');
  }
}

async function submitAssignment(state) {
  if (!state.selectedIncident) return;

  const primaryUserId = Number(document.getElementById('primaryOperatorSelect')?.value || 0);
  if (!primaryUserId) {
    showGlobalAlert('Debes seleccionar un operador principal.', 'warning');
    return;
  }

  const supportUserIds = Array.from(document.querySelectorAll('#supportOperatorsList input[type="checkbox"]:checked'))
    .map((checkbox) => Number(checkbox.value))
    .filter((userId) => userId && userId !== primaryUserId);

  showPageLoading('Guardando asignacion', 'Aplicando responsables principales y apoyos...');

  try {
    await assignIncidentOperators(state.selectedIncident.id, {
      primary_user_id: primaryUserId,
      support_user_ids: supportUserIds,
    });

    const incidentsResponse = await listIncidents({ per_page: 100 });
    state.incidents = Array.isArray(incidentsResponse?.data) ? incidentsResponse.data : [];
    applyFilters(state);
    window.jQuery?.('#assignmentModal').modal('hide');
    showGlobalAlert('Asignacion actualizada correctamente.', 'success');
  } catch (error) {
    showGlobalAlert(error?.message || 'No se pudo guardar la asignacion.', 'danger');
  } finally {
    hidePageLoading();
  }
}

function renderError(message) {
  const tbody = document.getElementById('assignmentTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="9" class="text-center text-danger py-4">
        <i class="fas fa-exclamation-circle mr-2"></i>${escapeHtml(message)}
      </td>
    </tr>`;
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim()))).sort((a, b) => a.localeCompare(b));
}

function readSessionUser() {
  try {
    const raw = window.localStorage?.getItem('user_data');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function userHasRole(user, roleCode) {
  if (!user || !Array.isArray(user.roles)) return false;

  return user.roles.some((role) => {
    const code = typeof role === 'string' ? role : (role?.code || role?.codigo || '');
    return String(code).toUpperCase() === roleCode;
  });
}

function includesNormalized(value, expected) {
  return String(value || '').toLowerCase().includes(expected);
}

function isResolvedState(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized.includes('resuelta') || normalized.includes('cerrada') || normalized.includes('cancelada') || normalized.includes('rechazada');
}

function buildOperatorOptionLabel(operator) {
  return `${operator.full_name || operator.email || `Operador #${operator.user_id}`} · ${buildOperatorCapacityLabel(operator)}`;
}

function buildOperatorCapacityLabel(operator) {
  return `${operator.active_incidents}/${operator.max_active_incidents} activas · ${operator.workload_points}/${operator.max_workload_points} pts`;
}
