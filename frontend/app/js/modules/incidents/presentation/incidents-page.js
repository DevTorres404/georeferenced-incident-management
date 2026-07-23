import { deleteIncident, listStates, listPriorities } from '../application/incidents-service.js?v=14'
import { request } from '../../../infrastructure/backend-client.js?v=21'
import { readUser, userHasPermission } from '../../../core/auth-session.js?v=16'
import {
  escapeHtml,
  formatCatalogLabel,
  formatShortDate,
  getPriorityHexColor,
  getStateHexColor,
  showGlobalAlert,
  hidePageLoading,
  showPageLoading
} from './incidents-ui.js?v=2'
import { html, delegateEvent } from '../../../presentation/dom-utils.js?v=2'

export { userHasPermission }

const INCIDENT_SEARCH_STORAGE_KEY = 'SGI_incidents_search'

document.addEventListener('DOMContentLoaded', initIncidentsPage)

export async function initIncidentsPage() {
  const canRefreshAuthorization = typeof globalThis.renderLayout === 'function'
  if (typeof globalThis.renderLayout === 'function') {
    await globalThis.renderLayout('incidents')
  }

  const state = {
    currentUser: canRefreshAuthorization ? readUser() : null,
    pendingDeleteId: null,
    dataTable: null,
    states: [],
    priorities: [],
    priorityNameToId: {},
    activeStateFilter: 'todos',
    activePriorityFilter: 'todas',
    activePendingStateRequest: false,
    activeSearchQuery: readStoredSearch(),
    activeScopeFilter: 'role',
    canCreateIncident: false,
    canDeleteIncident: false
  }

  state.canCreateIncident = userHasPermission(state.currentUser, 'incidents.create')
  state.canDeleteIncident = userHasPermission(state.currentUser, 'incidents.delete')
  bindDeleteConfirmation(state)

  showPageLoading('Cargando incidencias', 'Consultando base de datos...')
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 12000)

  try {
    const [statesData, prioritiesData] = await Promise.all([
      listStates(),
      listPriorities()
    ])
    state.states = Array.isArray(statesData?.data) ? statesData.data : []
    const rawPriorities = Array.isArray(prioritiesData?.data) ? prioritiesData.data : []
    state.priorities = rawPriorities
    state.priorityNameToId = buildPriorityLookup(rawPriorities)

    renderStateFilters(state)
    configureScopeFilters(state)
    configureRoleActions(state)
    bindPriorityFilters(state)

    const isCitizenOnly = !userHasRole(state.currentUser, 'ADMIN') &&
                          !userHasRole(state.currentUser, 'SUPERVISOR') &&
                          !userHasRole(state.currentUser, 'OPERADOR')

    state.isCitizenOnly = isCitizenOnly

    if (isCitizenOnly) {
      document.getElementById('incidentScopeSection')?.classList.add('d-none')
      document.getElementById('stateFilterSection')?.classList.add('d-none')
      document.getElementById('priorityFilterSection')?.classList.add('d-none')
    }

    initDataTable(state)
    restoreSearchInput(state)
  } catch (error) {
    renderErrorRow(error.message || 'No se pudieron cargar las incidencias.')
  } finally {
    globalThis.clearTimeout(loadingFallback)
    hidePageLoading()
  }

  // Refrescar el DataTable cuando llega una notificación de cambio de estado/asignación
  globalThis.addEventListener('sgi:notification-created', () => {
    if (state.dataTable && document.visibilityState !== 'hidden') {
      state.dataTable.ajax.reload(null, false)
    }
  })
}

export function buildPriorityLookup(priorities) {
  const map = {};
  (priorities || []).forEach(p => {
    const key = normalizePriorityFilter(String(p.name || ''))
    map[key] = p.id
  })
  return map
}

export function normalizePriorityFilter(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z]/g, '')
}

function initDataTable(state) {
  if (state.dataTable) {
    state.dataTable.destroy()
    state.dataTable = null
  }

  const tableEl = document.getElementById('tablaIncidencias')
  if (!tableEl) {
    return
  }

  // Start hidden so initComplete transition is visible
  tableEl.style.opacity = '0'

  state.dataTable = globalThis.jQuery('#tablaIncidencias').DataTable({
    responsive: true,
    serverSide: true,
    ajax(data, callback, settings) {
      const params = new URLSearchParams()
      params.set('draw', data.draw)
      params.set('start', data.start)
      params.set('length', data.length)
      params.set('search[value]', data.search?.value || '')
      params.set('search[regex]', data.search?.regex ? 'true' : 'false')

      if (data.order?.[0]) {
        params.set('order[0][column]', data.order[0].column)
        params.set('order[0][dir]', data.order[0].dir)
      }

      if (state.activeScopeFilter === 'mine') {
        params.set('mine', '1')
      } else if (state.activeScopeFilter === 'assigned') {
        params.set('assigned_to_me', '1')
      }

      if (state.activeStateFilter !== 'todos') {
        params.set('state_id', state.activeStateFilter)
      }

      if (state.activePriorityFilter !== 'todas') {
        params.set('priority_filter', String(state.activePriorityFilter))
      }

      if (state.activePendingStateRequest) {
        params.set('pending_state_request', '1')
      }

      request(`/incidents/datatable?${params.toString()}`)
        .then(response => {
          callback({
            draw: response.draw,
            recordsTotal: response.recordsTotal,
            recordsFiltered: response.recordsFiltered,
            data: response.data
          })
        })
        .catch(error => {
          console.error('DataTables AJAX error:', error)
          callback({
            draw: data.draw,
            recordsTotal: 0,
            recordsFiltered: 0,
            data: []
          })
        })
    },
    columns: [
      {
        data: 'code',
        render: (data, type, row) => {
          if (type === 'sort' || type === 'type') {
            return data
          }

          const code = escapeHtml(data || `#${row.id}`)
          const title = escapeHtml(row.title || 'Sin título')
          const category = escapeHtml(formatCatalogLabel(row.category))
          const priorityLabel = formatCatalogLabel(row.priority)
          const priorityColor = row.priority_color || getPriorityHexColor(row.priority)
          const stateLabel = formatCatalogLabel(row.state)
          const stateColor = row.state_color || getStateHexColor(row.state)
          const territory = escapeHtml(row.territory || '-')
          const date = escapeHtml(formatShortDate(row.created_at))
          const pendingIcon = row?.has_pending_state_request ?
            '<span class="badge badge-warning shadow-sm ml-1"><i class="fas fa-clock mr-1"></i>En revisión</span>' :
            ''

          return `
            <div class="${state.isCitizenOnly ? 'd-none' : 'd-none d-md-block'} table-ticket-code">${code}</div>
            
            <div class="${state.isCitizenOnly ? 'd-block' : 'd-block d-md-none'}">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <span class="table-ticket-code font-weight-bold">${code}</span>
                <div>
                  <span class="badge shadow-sm" style="background-color: ${stateColor}; color: #fff">${escapeHtml(stateLabel)}</span>
                  ${pendingIcon}
                </div>
              </div>
              <h6 class="font-weight-bold mb-1 text-truncate" style="max-width: 100%;">${title}</h6>
              <div class="d-flex align-items-center flex-wrap gap-2 mb-2">
                ${state.isCitizenOnly ? '' : `<span class="badge shadow-sm" style="background-color: ${priorityColor}; color: #fff">${escapeHtml(priorityLabel)}</span>`}
                <small class="text-muted"><i class="fas fa-folder mr-1"></i>${category}</small>
              </div>
              <div class="d-flex flex-column mb-2">
                ${state.isCitizenOnly ? '' : `<small class="text-muted text-truncate"><i class="fas fa-map-marker-alt mr-1 text-primary" style="opacity:0.6;"></i>${territory}</small>`}
                <small class="text-muted"><i class="far fa-calendar-alt mr-1"></i>${date}</small>
              </div>
              <div class="d-flex justify-content-end gap-2 border-top pt-2 mt-2">
                <a href="incident-detail.html?id=${row.id}" class="btn btn-sm btn-outline-primary shadow-sm" style="border-radius:0.4rem;">
                  <i class="fas fa-external-link-alt mr-1"></i>Ver detalle
                </a>
                ${state.canDeleteIncident ? `
                <button class="btn btn-sm btn-outline-danger shadow-sm js-delete-incident" data-id="${row.id}" data-code="${code}" style="border-radius:0.4rem;">
                  <i class="fas fa-trash"></i>
                </button>` : ''}
              </div>
            </div>
          `
        }
      },
      {
        data: 'title',
        render: data => {
          const title = escapeHtml(data || 'Sin título')
          return `<span class="text-truncate font-weight-bold text-dark d-inline-block" style="max-width:240px;" title="${title}">${title}</span>`
        }
      },
      {
        data: 'category',
        render: data => {
          const label = escapeHtml(formatCatalogLabel(data))
          return `<span class="text-muted"><i class="fas fa-folder mr-1" style="opacity:0.5;"></i>${label}</span>`
        }
      },
      {
        data: 'priority',
        render: (data, type, row) => {
          const label = formatCatalogLabel(data)
          const color = row?.priority_color || getPriorityHexColor(data)
          return `<span class="badge shadow-sm" style="background-color: ${color}; color: #fff">${escapeHtml(label)}</span>`
        }
      },
      {
        data: 'state',
        render: (data, type, row) => {
          if (type === 'sort' || type === 'type') {
            return data
          }

          const label = formatCatalogLabel(data)
          const color = row?.state_color || getStateHexColor(data)
          const pendingIcon = row?.has_pending_state_request ?
            '<span class="badge badge-warning shadow-sm ml-1" title="Solicitud de cambio de estado pendiente"><i class="fas fa-clock mr-1"></i>En revisión</span>' :
            ''
          return `<span class="badge shadow-sm" style="background-color: ${color}; color: #fff">${escapeHtml(label)}</span>${pendingIcon}`
        }
      },
      {
        data: 'territory',
        render: data => {
          const label = escapeHtml(data || '-')
          return `<span class="text-truncate text-muted d-inline-block" style="max-width:260px;" title="${label}"><i class="fas fa-map-marker-alt mr-1 text-primary" style="opacity:0.6;"></i>${label}</span>`
        }
      },
      {
        data: 'created_at',
        render: data => {
          return `<span class="text-muted">${escapeHtml(formatShortDate(data))}</span>`
        }
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        render: (data, type, row) => {
          const { id } = row
          const code = escapeHtml(row.code || `#${id}`)
          return `<div class="text-center" style="white-space:nowrap;">
            <a href="incident-detail.html?id=${id}" class="btn btn-sm btn-outline-primary shadow-sm mr-1" title="Ver detalle completo" style="border-radius:0.4rem;">
              <i class="fas fa-external-link-alt"></i>
            </a>
            ${state.canDeleteIncident ? `
            <button class="btn btn-sm btn-outline-danger shadow-sm js-delete-incident" title="Eliminar" data-id="${id}" data-code="${code}" style="border-radius:0.4rem;">
              <i class="fas fa-trash"></i>
            </button>` : ''}
          </div>`
        }
      }
    ],
    columnDefs: [
      { targets: 0, className: 'text-left' },
      { targets: 1, className: 'd-none d-md-table-cell', visible: !state.isCitizenOnly },
      { targets: 2, className: 'd-none d-md-table-cell', visible: !state.isCitizenOnly },
      { targets: 3, className: 'd-none d-md-table-cell', visible: !state.isCitizenOnly },
      { targets: 4, className: 'd-none d-md-table-cell', visible: !state.isCitizenOnly },
      { targets: 5, className: 'd-none d-md-table-cell', visible: !state.isCitizenOnly },
      { targets: 6, className: 'd-none d-md-table-cell', visible: !state.isCitizenOnly },
      { targets: 7, className: 'text-center d-none d-md-table-cell', visible: !state.isCitizenOnly, orderable: false, searchable: false }
    ],
    order: [[6, 'desc']],
    pageLength: 10,
    lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
    language: {
      sProcessing: 'Procesando...',
      sLengthMenu: 'Mostrar _MENU_ registros',
      sZeroRecords: 'No se encontraron resultados',
      sEmptyTable: `
        <div class="text-center py-5">
          <i class="fas fa-folder-open text-muted mb-3" style="font-size: 3.5rem; opacity: 0.5;"></i>
          <h4 class="text-main font-weight-bold">No hay incidencias disponibles</h4>
          <p class="text-muted">Cuando se creen incidencias, aparecerán aquí con su estado, prioridad y fecha.</p>
          ${state.canCreateIncident ? `<a href="incident-create.html" class="btn btn-primary mt-2">
            <i class="fas fa-plus mr-1"></i>Crear nueva incidencia
          </a>` : ''}
        </div>
      `,
      sInfo: 'Mostrando _START_ a _END_ de _TOTAL_ registros',
      sInfoEmpty: 'Mostrando 0 a 0 de 0 registros',
      sInfoFiltered: '(filtrado de _MAX_ registros totales)',
      sSearch: 'Buscar:',
      oPaginate: {
        sFirst: 'Primero',
        sLast: 'Último',
        sNext: 'Siguiente',
        sPrevious: 'Anterior'
      },
      oAria: {
        sSortAscending: ': Activar para ordenar la columna de manera ascendente',
        sSortDescending: ': Activar para ordenar la columna de manera descendente'
      }
    },
    drawCallback() {
      delegateEvent('#tablaIncidencias tbody', '.js-delete-incident', 'click', (e, btn) => {
        openDeleteModal(state, btn.dataset.id, btn.dataset.code)
      })
    },
    initComplete() {
      if (tableEl) {
        tableEl.style.transition = 'opacity 0.25s ease'
        tableEl.style.opacity = '1'
      }

      if (state.isCitizenOnly) {
        document.querySelector('#tablaIncidencias thead')?.classList.add('d-none')
        document.querySelector('#tablaIncidencias')?.classList.remove('table-hover')
      }
    }
  })

  bindSearchInput(state)
}

function renderStateFilters(state) {
  const select = document.getElementById('filterState')
  const label = document.querySelector('label[for="filterState"]')
  if (!select) {
    return
  }

  const isAdmin = userHasRole(state.currentUser, 'ADMIN')
  const isOperator = userHasRole(state.currentUser, 'OPERADOR') && !isAdmin

  if (isOperator) {
    select.classList.add('d-none')
    if (label) {
      label.classList.add('d-none')
    }

    return
  }

  select.classList.remove('d-none')
  if (label) {
    label.classList.remove('d-none')
  }

  // Limpiar opciones previas excepto la primera (Todos los estados)
  select.innerHTML = '<option value="todos">Todos los estados</option>'

  state.states.forEach(s => {
    const option = document.createElement('option')
    option.value = escapeHtml(s.id)
    option.textContent = escapeHtml(formatCatalogLabel(s.name))
    select.appendChild(option)
  })

  // Filtro "En revisión" (solicitudes pendientes)
  const pendingOption = document.createElement('option')
  pendingOption.value = 'pending_review'
  pendingOption.textContent = 'Cambios pendientes'
  select.appendChild(pendingOption)

  if (!select.dataset.eventsBound) {
    select.addEventListener('change', e => {
      const filtro = e.target.value
      if (filtro === 'pending_review') {
        state.activePendingStateRequest = true
        state.activeStateFilter = 'todos'
      } else {
        state.activePendingStateRequest = false
        state.activeStateFilter = filtro
      }

      if (state.dataTable) {
        state.dataTable.ajax.reload()
      }
    })
    select.dataset.eventsBound = 'true'
  }
}

function bindSearchInput(state) {
  const searchInput = document.getElementById('incidentSearch')
  if (!searchInput) {
    return
  }

  searchInput.value = state.activeSearchQuery

  let debounceTimer
  searchInput.addEventListener('input', () => {
    globalThis.clearTimeout(debounceTimer)
    debounceTimer = globalThis.setTimeout(() => {
      state.activeSearchQuery = searchInput.value
      storeSearch(state.activeSearchQuery)
      if (state.dataTable) {
        state.dataTable.search(state.activeSearchQuery).draw()
      }
    }, 300)
  })
}

function restoreSearchInput(state) {
  const searchInput = document.getElementById('incidentSearch')
  if (searchInput) {
    searchInput.value = state.activeSearchQuery
  }
}

export function readStoredSearch() {
  try {
    return sessionStorage.getItem(INCIDENT_SEARCH_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function storeSearch(query) {
  try {
    sessionStorage.setItem(INCIDENT_SEARCH_STORAGE_KEY, query)
  } catch {
  }
}

function configureScopeFilters(state) {
  const container = document.getElementById('incidentScopeSection')
  const context = document.getElementById('incidentScopeContext')
  if (!container) {
    return
  }

  const isAdmin = userHasRole(state.currentUser, 'ADMIN')
  const isSupervisor = userHasRole(state.currentUser, 'SUPERVISOR') && !isAdmin
  const isOperator = userHasRole(state.currentUser, 'OPERADOR') && !isAdmin

  const territoryName = state.currentUser?.operational_zone?.name || state.currentUser?.zone?.name || state.currentUser?.territorial_unit?.name || state.currentUser?.territory?.name || state.currentUser?.territory || ''
  const supervisorLabel = territoryName ? territoryName : 'Zona Operativa'

  const options = isSupervisor ?
    [
      { value: 'role', label: supervisorLabel }
    ] :
    isOperator ?
      [{ value: 'assigned', label: 'Asignadas a mí' }] :
      (isAdmin ?
        [
          { value: 'role', label: 'Todas las incidencias' },
          { value: 'mine', label: 'Mis reportes' }
        ] :
        [{ value: 'mine', label: 'Mis reportes' }])

  if (options.length === 1) {
    state.activeScopeFilter = options[0].value
    container.innerHTML = `
      <label class="mb-0">Alcance:</label>
      <span class="badge badge-light border px-2 py-1 text-muted" style="font-size: 0.85rem;">
        <i class="fas fa-map-marker-alt mr-1 text-primary"></i>${options[0].label}
      </span>
    `
  } else {
    container.innerHTML = `
      <label for="filterScope" class="mb-0">Alcance:</label>
      <select class="form-control form-control-sm" id="filterScope" style="width:160px;"></select>
    `
    const select = document.getElementById('filterScope')
    options.forEach(opt => {
      const option = document.createElement('option')
      option.value = opt.value
      option.textContent = opt.label
      select.appendChild(option)
    })

    state.activeScopeFilter = options[0].value
    select.value = state.activeScopeFilter

    select.addEventListener('change', e => {
      state.activeScopeFilter = e.target.value
      if (state.dataTable) {
        state.dataTable.ajax.reload()
      }
    })
  }

  if (context) {
    if (isSupervisor) {
      context.textContent = 'La vista operativa está limitada a tu zona asignada.'
    } else if (isOperator) {
      context.textContent = 'Solo puedes gestionar incidencias asignadas a ti.'
    } else if (isAdmin) {
      context.textContent = 'Vista administrativa nacional.'
    } else {
      context.textContent = 'Solo puedes consultar tus reportes.'
    }
  }
}

function userHasRole(user, roleCode) {
  if (!user || !Array.isArray(user.roles)) {
    return false
  }

  return user.roles.some(role => {
    const code = typeof role === 'string' ? role : (role?.code || role?.codigo || '')
    return String(code).trim().toUpperCase() === roleCode
  })
}

function bindPriorityFilters(state) {
  const prioritySelect = document.getElementById('filterPriority')
  if (prioritySelect && !prioritySelect.dataset.eventsBound) {
    prioritySelect.addEventListener('change', e => {
      const filterValue = String(e.target.value || '').toLowerCase()
      if (filterValue === 'todas') {
        state.activePriorityFilter = 'todas'
      } else {
        state.activePriorityFilter = state.priorityNameToId[normalizePriorityFilter(filterValue)] || 'todas'
      }

      if (state.dataTable) {
        state.dataTable.ajax.reload()
      }
    })
    prioritySelect.dataset.eventsBound = 'true'
  }

  const btnLimpiar = document.getElementById('btnLimpiarFiltros')
  if (btnLimpiar && !btnLimpiar.dataset.eventsBound) {
    btnLimpiar.addEventListener('click', () => {
      const scopeSelect = document.getElementById('filterScope')
      if (scopeSelect) {
        scopeSelect.selectedIndex = 0
        state.activeScopeFilter = scopeSelect.value
      }

      const stateSelect = document.getElementById('filterState')
      if (stateSelect) {
        stateSelect.value = 'todos'
        state.activeStateFilter = 'todos'
        state.activePendingStateRequest = false
      }

      if (prioritySelect) {
        prioritySelect.value = 'todas'
        state.activePriorityFilter = 'todas'
      }

      if (state.dataTable) {
        state.dataTable.ajax.reload()
      }
    })
    btnLimpiar.dataset.eventsBound = 'true'
  }
}

function configureRoleActions(state) {
  const createButton = document.getElementById('btnCreateIncident')
  if (createButton) {
    createButton.hidden = !state.canCreateIncident
  }

  const mapButton = document.getElementById('btnViewMap')
  if (mapButton) {
    const isAdmin = userHasRole(state.currentUser, 'ADMIN')
    const isSupervisor = userHasRole(state.currentUser, 'SUPERVISOR')
    const isOperator = userHasRole(state.currentUser, 'OPERADOR')
    const isInternalUser = isAdmin || isSupervisor || isOperator

    mapButton.style.display = isInternalUser ? '' : 'none'

    // Operators only see "En progreso" incidents — state/priority filters are irrelevant
    if (isOperator && !isAdmin && !isSupervisor) {
      const stateSection = document.getElementById('stateFilterSection')
      const prioritySection = document.getElementById('priorityFilterSection')
      if (stateSection) {
        stateSection.style.display = 'none'
      }

      if (prioritySection) {
        prioritySection.style.display = 'none'
      }
    }
  }
}

function bindDeleteConfirmation(state) {
  const confirmButton = document.getElementById('btnConfirmarEliminar')
  if (!confirmButton) {
    return
  }

  confirmButton.addEventListener('click', async () => {
    if (!state.pendingDeleteId) {
      return
    }

    try {
      await deleteIncident(state.pendingDeleteId)
      if (state.dataTable) {
        state.dataTable.ajax.reload()
      }

      globalThis.jQuery?.('#modalEliminar').modal('hide')
      showGlobalAlert('Incidencia eliminada correctamente.', 'success')
    } catch (error) {
      showGlobalAlert(error.message || 'No se pudo eliminar la incidencia.', 'danger')
    } finally {
      state.pendingDeleteId = null
    }
  })
}

function openDeleteModal(state, incidentId, code) {
  state.pendingDeleteId = incidentId
  setText('codigoEliminar', code || `#${incidentId}`)
  globalThis.jQuery?.('#modalEliminar').modal('show')
}

function renderErrorRow(message) {
  const tbody = document.getElementById('tablaBody')
  if (!tbody) {
    return
  }

  tbody.innerHTML = html`
    <tr>
      <td colspan="8" class="text-center text-danger py-4">
        <i class="fas fa-exclamation-circle mr-2"></i>${message}
      </td>
    </tr>`
}

function setText(id, value) {
  const element = document.getElementById(id)
  if (element) {
    element.textContent = String(value)
  }
}
