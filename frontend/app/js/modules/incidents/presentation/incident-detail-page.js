import {
  addIncidentComment,
  approveStateChangeRequest,
  changeIncidentState,
  getIncident,
  getPendingStateChangeRequests,
  getStateChangeRequests,
  listPriorities,
  listStateTransitions,
  listStates,
  rejectStateChangeRequest,
  requestStateChange,
  updateIncident,
  uploadIncidentAttachment,
} from '../application/incidents-service.js?v=17';
import { subscribeToIncidentComments } from '../application/subscribe-incident-comments.usecase.js?v=2';
import { subscribeToIncidentRealtime } from '../application/subscribe-incident-realtime.usecase.js?v=1';
import {
  API_URL,
  MAP_BASE_STYLES,
  MAP_ECUADOR_BOUNDS,
} from '../../../core/config.js?v=21';
import { hasPermission } from '../../../core/auth-session.js?v=16';
import {
  escapeHtml,
  formatCatalogLabel,
  formatDateTime,
  formatShortDate,
  getPriorityBadgeClass,
  getPriorityHexColor,
  getStateBadgeClass,
  getStateHexColor,
  hidePageLoading,
  showGlobalAlert,
} from './incidents-ui.js?v=14';

document.addEventListener('DOMContentLoaded', initIncidentDetailPage);

let commentSubscription = null;
let commentFallbackDelay = null;
let commentFallbackTimer = null;
let commentRefreshInFlight = false;
let detailRealtimeSubscription = null;
let cachedTransitions = [];
let pendingStateRequests = [];
let availableStates = [];
let pendingStateRequest = null;
let pendingReviewRequest = null;
let canCreateIncident = false;

globalThis.addEventListener('pagehide', () => {
  commentSubscription?.cleanup?.();
  commentSubscription = null;
  detailRealtimeSubscription?.cleanup?.();
  detailRealtimeSubscription = null;
  stopCommentFallback();
});

export async function initIncidentDetailPage() {
  canCreateIncident = false;
  if (typeof globalThis.renderLayout === 'function') {
    await globalThis.renderLayout('incident-detail');
    canCreateIncident = hasPermission('incidents.create');
  }

  const incidentId = new URLSearchParams(globalThis.location.search).get('id');
  const container = document.getElementById('contenidoDetalle');

  if (!incidentId) {
    renderError(container, 'No se especifico el identificador de incidencia.');
    return;
  }

  try {
    const isOperatorRole = isOperator();
    const canChangeState = hasPermission('incidents.edit') && !isOperatorRole;
    const canAssignPriority = canManagePriority();
    const isOperatorUser = isOperatorRole;
    const shouldLoadRequests = canChangeState || isOperatorUser;

    const [incidentResponse, transitionsResponse, prioritiesResponse, statesResponse, requestsResponse] = await Promise.all([
      getIncident(incidentId),
      canChangeState ? listStateTransitions() : Promise.resolve({ data: [] }),
      canAssignPriority ? listPriorities() : Promise.resolve({ data: [] }),
      isOperatorUser ? listStates() : Promise.resolve({ data: [] }),
      shouldLoadRequests ? getStateChangeRequests(incidentId) : Promise.resolve({ data: [] }),
    ]);
    const incident = incidentResponse?.data;

    if (!incident) {
      renderError(container, 'No se encontro la incidencia solicitada.');
      return;
    }

    setText('breadcrumbId', incident.code || `#${incident.id}`);
    setHtml(
      'pageTitle',
      `<i class="fas fa-file-alt text-primary mr-2"></i>Detalle - ${escapeHtml(incident.code || `#${incident.id}`)}`
    );

    if (isOperatorUser) {
      availableStates = Array.isArray(statesResponse?.data) ? statesResponse.data : [];
    }

    pendingStateRequests = Array.isArray(requestsResponse?.data)
      ? requestsResponse.data.filter((r) => r.status === 'pending')
      : [];

    renderIncidentDetail(
      container,
      incident,
      Array.isArray(transitionsResponse?.data) ? transitionsResponse.data : [],
      Array.isArray(prioritiesResponse?.data) ? prioritiesResponse.data : []
    );
    startRealtimeComments(incident);
    startRealtimeDetail(incident);
  } catch (error) {
    renderError(container, error.message || 'No se pudo cargar el detalle de la incidencia.');
  }
}

function renderIncidentDetail(container, incident, transitions, priorities) {
  const stateName = formatCatalogLabel(incident.state?.name || '-');
  const priorityName = formatCatalogLabel(incident.priority?.name || 'Sin definir');
  const categoryName = formatCatalogLabel(incident.category?.name || '-');
  const subcategoryName = formatCatalogLabel(incident.subcategory?.name || '-');
  const territoryName = territoryLabel(incident);
  const addressText = incident.address || incident.address_reference || 'Ubicación registrada sin dirección textual.';
  const comments = Array.isArray(incident.comments) ? incident.comments : [];
  const history = Array.isArray(incident.history) ? incident.history : [];
  const attachments = Array.isArray(incident.attachments) ? incident.attachments : [];
  const isOperatorRole = isOperator();
  const canChangeState = hasPermission('incidents.edit') && !isOperatorRole;
  const canAssignPriority = canManagePriority();
  const hasValidCoordinates = hasCoordinates(incident);
  const historyTooltip = renderRecentStateChangesTooltip(history);

  container.innerHTML = `
    <div class="row mb-3">
      <div class="col-12 d-flex flex-column flex-md-row justify-content-md-between align-items-start align-items-md-center" style="gap:12px;">
        <div class="d-flex flex-wrap align-items-center" style="gap:8px;">
          <a href="incidents.html" class="btn btn-sm btn-outline-secondary">
            <i class="fas fa-arrow-left mr-1"></i><span class="d-none d-sm-inline">Volver</span>
          </a>
          <span class="badge badge-dark" style="font-size:0.95rem;padding:6px 10px;">${escapeHtml(incident.code || `#${incident.id}`)}</span>
          <span class="badge estado-badge-grande" style="background-color: ${incident.state?.color || getStateHexColor(incident.state?.name)}; color: #fff" id="badgeEstadoDetalle">${escapeHtml(stateName)}</span>
        </div>
        <div class="d-flex flex-wrap align-items-center" style="gap:8px; width: 100%;">
          ${canAssignPriority ? `
            <button class="btn btn-sm btn-outline-primary flex-grow-1 flex-md-grow-0" id="btnAsignarPrioridad">
              <i class="fas fa-layer-group mr-1"></i>Asignar Prioridad
            </button>
          ` : ''}
          ${canChangeState ? `
            <div class="d-flex flex-column flex-sm-row align-items-sm-center flex-grow-1 flex-md-grow-0" style="gap:8px;">
              <div class="input-group input-group-sm" style="width:auto;min-width:210px;flex-grow:1;">
                <div class="input-group-prepend" id="stateHistoryTooltip" data-toggle="tooltip" data-html="true"
                     data-placement="bottom" title="${historyTooltip}">
                  <span class="input-group-text bg-warning border-warning text-dark" aria-hidden="true">
                    <i class="fas fa-sync-alt"></i>
                  </span>
                </div>
                <label for="estadoDirecto" class="sr-only">Cambiar estado</label>
                <select class="custom-select custom-select-sm border-warning" id="estadoDirecto"
                        aria-label="Cambiar estado de la incidencia"></select>
              </div>
              <small class="text-muted d-none" id="statePriorityHint" style="line-height:1.2;">
                <i class="fas fa-info-circle mr-1"></i>Asigna prioridad
              </small>
            </div>
          ` : ''}
          ${!canChangeState && isOperatorRole && normalizeCode(incident.state?.name) === 'EN_PROGRESO' ? `<div id="operatorStateButtonContainer" class="flex-grow-1 flex-md-grow-0">${renderOperatorStateButton(incident)}</div>` : ''}
          ${canCreateIncident ? `<a href="incident-create.html" class="btn btn-sm btn-primary flex-grow-1 flex-md-grow-0">
            <i class="fas fa-plus mr-1"></i><span class="d-none d-sm-inline">Nueva</span><span class="d-inline d-sm-none">Nueva Incidencia</span>
          </a>` : ''}
        </div>
      </div>
    </div>

    ${canChangeState && pendingStateRequests.length > 0 ? renderPendingStateRequests(pendingStateRequests) : ''}

    <div class="row">
      <div class="col-lg-8">
        <div class="card card-outline card-primary">
          <div class="card-header">
            <h3 class="card-title"><i class="fas fa-info-circle mr-2"></i>Información General</h3>
          </div>
          <div class="card-body">
            <h4 class="font-weight-bold mb-3">${escapeHtml(incident.title || 'Sin título')}</h4>
            <div class="row">
              <div class="col-sm-6">
                <p class="detalle-label">Categoría</p>
                <p>${escapeHtml(categoryName)}</p>

                <p class="detalle-label">Subcategoría</p>
                <p>${escapeHtml(subcategoryName)}</p>

                <p class="detalle-label">Prioridad</p>
                <p><span class="badge px-2 py-1" style="background-color: ${incident.priority?.color || getPriorityHexColor(incident.priority?.name)}; color: #fff" id="badgePrioridadDetalle">${escapeHtml(priorityName)}</span></p>

                <p class="detalle-label">Estado</p>
                <p><span class="badge px-2 py-1" style="background-color: ${incident.state?.color || getStateHexColor(incident.state?.name)}; color: #fff" id="badgeEstadoResumen">${escapeHtml(stateName)}</span></p>
              </div>
              <div class="col-sm-6">
                <p class="detalle-label">Código</p>
                <p>${escapeHtml(incident.code || `#${incident.id}`)}</p>

                <p class="detalle-label">Fecha de registro</p>
                <p><i class="fas fa-calendar mr-1 text-muted"></i>${escapeHtml(formatShortDate(incident.created_at))}</p>

                <div id="containerResolutionDate" class="${incident.rejected_at ? 'd-none' : ''}">
                  <p class="detalle-label">Fecha de resolución</p>
                  <p><i class="fas fa-calendar-check mr-1 text-muted"></i><span id="labelResolutionDate">${escapeHtml(formatShortDate(incident.resolution_date))}</span></p>
                </div>

                <div id="containerRejectionDate" class="${!incident.rejected_at ? 'd-none' : ''}">
                  <p class="detalle-label text-danger">Fecha de rechazo</p>
                  <p><i class="fas fa-times-circle mr-1 text-danger"></i><span id="labelRejectionDate">${escapeHtml(formatShortDate(incident.rejected_at))}</span></p>
                </div>

                <div id="reopenDatesContainer">
                  ${incident.reopened_at ? `
                  <p class="detalle-label text-warning mt-2">Fecha de reapertura</p>
                  <p><i class="fas fa-redo mr-1 text-warning"></i>${escapeHtml(formatShortDate(incident.reopened_at))}</p>
                  ` : ''}

                  ${incident.previous_resolution_date ? `
                  <p class="detalle-label text-secondary mt-2">Resolución anterior</p>
                  <p><i class="fas fa-history mr-1 text-secondary"></i>${escapeHtml(formatShortDate(incident.previous_resolution_date))}</p>
                  ` : ''}
                </div>
              </div>
            </div>
            <hr>
            <p class="detalle-label">Descripción completa</p>
            <p class="text-justify">${escapeHtml(incident.description || '-')}</p>
          </div>
        </div>

        <div class="card card-outline card-info">
          <div class="card-header">
            <h3 class="card-title"><i class="fas fa-map-marker-alt mr-2"></i>Ubicacion Geografica</h3>
          </div>
          <div class="card-body">
            <div class="row mb-3">
              <div class="col-sm-4 text-center">
                <p class="detalle-label">Pais</p>
                <p class="font-weight-bold">${escapeHtml('Ecuador')}</p>
              </div>
              <div class="col-sm-4 text-center">
                <p class="detalle-label">Territorio</p>
                <p class="font-weight-bold">${escapeHtml(territoryName)}</p>
              </div>
              <div class="col-sm-4 text-center">
                <p class="detalle-label">Referencia</p>
                <p class="font-weight-bold">${escapeHtml(addressText)}</p>
              </div>
            </div>
            <div class="row mb-3">
              <div class="col-sm-6 text-center">
                <p class="detalle-label">Latitud</p>
                <p><code>${escapeHtml(incident.latitude || '-')}</code></p>
              </div>
              <div class="col-sm-6 text-center">
                <p class="detalle-label">Longitud</p>
                <p><code>${escapeHtml(incident.longitude || '-')}</code></p>
              </div>
            </div>
            <div id="incidentDetailMap" class="incident-detail-map">
              <i class="fas fa-map-pin"></i>
              <strong>${hasValidCoordinates ? 'Cargando mapa...' : 'No hay coordenadas para mostrar'}</strong>
              <code class="mt-1">${escapeHtml(incident.latitude || '-')}, ${escapeHtml(incident.longitude || '-')}</code>
              <small class="text-center mt-2">${escapeHtml(incident.address || 'Ubicación registrada sin dirección textual.')}</small>
            </div>
          </div>
        </div>

        <div class="card card-outline card-secondary">
          <div class="card-header">
            <h3 class="card-title"><i class="fas fa-comments mr-2"></i>Comentarios</h3>
            <span class="badge badge-secondary ml-2" id="commentsCount">${comments.length}</span>
          </div>
          <div class="card-body" id="listadoComentarios" style="max-height: 400px; overflow-y: auto;">
            ${renderComments(comments)}
          </div>
          <div class="card-footer">
            <div class="input-group">
              <input type="text" id="nuevoComentario" class="form-control" placeholder="Escriba un comentario...">
              <div class="input-group-append">
                <button class="btn btn-primary" id="btnAgregarComentario" type="button">
                  <i class="fas fa-paper-plane mr-1"></i>Enviar
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="card card-outline card-success">
          <div class="card-header">
            <div class="d-flex justify-content-between align-items-center flex-wrap" style="gap:8px;">
              <h3 class="card-title mb-0"><i class="fas fa-paperclip mr-2"></i>Evidencias y Documentos</h3>
              <span class="badge badge-success" id="attachmentsCount">${attachments.length}</span>
            </div>
          </div>
          <div class="card-body">
            <div class="alert alert-light border d-flex align-items-start mb-3 attachment-guidance" role="note">
              <i class="fas fa-info-circle text-success mr-2 mt-1"></i>
              <div>
                <strong>Adjuntos permitidos:</strong> imagenes JPG o PNG.
                <div class="text-muted small">Tamano maximo por archivo: 10 MB.</div>
              </div>
            </div>

            <form id="attachmentUploadForm" class="mb-4" novalidate>
              <div class="form-row align-items-end">
                <div class="col-md-8">
                  <label for="attachmentFile" class="detalle-label d-block mb-2">Nuevo archivo adjunto</label>
                  <div class="custom-file">
                    <input
                      type="file"
                      class="custom-file-input"
                      id="attachmentFile"
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    >
                    <label class="custom-file-label" for="attachmentFile" id="attachmentFileLabel">Seleccione una imagen...</label>
                  </div>
                  <small class="text-muted d-block mt-1">Formatos permitidos: JPG, JPEG, PNG (Máx 10MB).</small>
                  <small class="text-danger d-none mt-1" id="attachmentFileError"></small>
                </div>
                <div class="col-md-4 mt-3 mt-md-0">
                  <button type="submit" class="btn btn-success btn-block" id="btnUploadAttachment">
                    <i class="fas fa-upload mr-1"></i>Adjuntar archivo
                  </button>
                </div>
              </div>
            </form>

            <div id="attachmentsList">
              ${renderAttachments(attachments)}
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="card card-outline card-warning">
          <div class="card-header">
            <h3 class="card-title"><i class="fas fa-history mr-2"></i>Historial de Cambios</h3>
          </div>
          <div class="card-body p-0" style="max-height: 400px; overflow-y: auto;">
            <div class="p-3" id="timelineHistorial">
              ${renderHistory(history)}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title"><i class="fas fa-chart-bar mr-2"></i>Estadísticas</h3>
          </div>
          <div class="card-body">
            <div class="info-box bg-light mb-2">
              <span class="info-box-icon text-primary"><i class="fas fa-comments"></i></span>
              <div class="info-box-content">
                <span class="info-box-text text-muted">Comentarios</span>
                <span class="info-box-number text-dark" id="commentsMetric">${comments.length}</span>
              </div>
            </div>
            <div class="info-box bg-light mb-2">
              <span class="info-box-icon text-warning"><i class="fas fa-exchange-alt"></i></span>
              <div class="info-box-content">
                <span class="info-box-text text-muted">Cambios de estado</span>
                <span class="info-box-number text-dark" id="historyMetric">${history.length}</span>
              </div>
            </div>
            <div class="info-box bg-light mb-2">
              <span class="info-box-icon text-success"><i class="fas fa-paperclip"></i></span>
              <div class="info-box-content">
                <span class="info-box-text text-muted">Adjuntos</span>
                <span class="info-box-number text-dark" id="attachmentsMetric">${attachments.length}</span>
              </div>
            </div>
            <div class="info-box bg-light mb-0">
              <span class="info-box-icon text-info"><i class="fas fa-calendar-check"></i></span>
              <div class="info-box-content">
                <span class="info-box-text text-muted">Dias desde registro</span>
                <span class="info-box-number text-dark">${String(calculateDays(incident.created_at))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  if (canAssignPriority) {
    hydratePriorityModal(incident, priorities);
  }
  renderIncidentMap(incident);
  bindCommentForm(incident);
  bindAttachmentForm(incident);
  bindAttachmentPreview();
  if (canAssignPriority) {
    bindPriorityForm(incident);
  }
  if (canChangeState) {
    cachedTransitions = transitions;
    bindStateChangeControl(incident, transitions);
  }

  // Bind para operador: solicitar cambio de estado
  bindOperatorStateButton(incident);

  // Seccion de solicitudes pendientes para supervisor
  if (canChangeState && pendingStateRequests.length > 0) {
    bindReviewRequestButtons(incident);
  }
}

function renderIncidentMap(incident) {
  const mapContainer = document.getElementById('incidentDetailMap');
  if (!mapContainer || !hasCoordinates(incident)) return;

  if (!globalThis.maplibregl) {
    mapContainer.innerHTML = `
      <div class="map-empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <strong>No se pudo cargar el visor del mapa</strong>
        <small>La ubicación queda registrada en sus coordenadas.</small>
      </div>`;
    return;
  }

  const latitude = Number(incident.latitude);
  const longitude = Number(incident.longitude);
  const center = [longitude, latitude];

  mapContainer.innerHTML = '';

  const map = new globalThis.maplibregl.Map({
    container: mapContainer,
    style: MAP_BASE_STYLES.streets.style,
    center,
    zoom: 15,
    minZoom: 5,
    maxZoom: 18,
    maxBounds: MAP_ECUADOR_BOUNDS,
  });

  map.addControl(new globalThis.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new globalThis.maplibregl.FullscreenControl(), 'top-right');

  const popupHtml = `
    <strong>${escapeHtml(incident.code || `#${incident.id}`)}</strong><br>
    <span>${escapeHtml(incident.title || 'Incidencia')}</span><br>
    <small>${escapeHtml(territoryLabel(incident))}</small>`;

  new globalThis.maplibregl.Marker({ color: '#0d6efd' })
    .setLngLat(center)
    .setPopup(new globalThis.maplibregl.Popup({ offset: 24 }).setHTML(popupHtml))
    .addTo(map);

  map.on('load', () => map.resize());
}

export function hasCoordinates(incident) {
  const latitude = Number(incident?.latitude);
  const longitude = Number(incident?.longitude);

  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -5.25
    && latitude <= 1.85
    && longitude >= -92.2
    && longitude <= -75;
}

export function territoryLabel(incident) {
  const territorialUnit = incident?.territorial_unit || incident?.territorialUnit;

  return formatCatalogLabel(
    territorialUnit?.full_path
      || territorialUnit?.name
      || incident?.address_reference
      || incident?.address
      || '-'
  );
}

export function renderStateSelector(incident, transitions) {
  const select = document.getElementById('estadoDirecto');
  if (!select) return;

  const hasPriority = !!(incident.priority_id || incident.priority?.id);
  const currentStateName = formatCatalogLabel(incident.state?.name || '-');

  if (!hasPriority) {
    select.innerHTML = `<option value="${Number(incident.state_id)}">${escapeHtml(currentStateName)} (actual)</option>`;
    select.disabled = true;
    select.title = 'Debes asignar una prioridad antes de cambiar el estado';

    const hint = document.getElementById('statePriorityHint');
    if (hint) {
      hint.classList.remove('d-none');
    }
    return;
  }

  const hint = document.getElementById('statePriorityHint');
  if (hint) {
    hint.classList.add('d-none');
  }

  const availableTransitions = getAvailableStateTransitions(incident, transitions);
  select.innerHTML = [
    `<option value="${Number(incident.state_id)}">${escapeHtml(currentStateName)} (actual)</option>`,
    ...availableTransitions.map((transition) => {
      const commentNotice = transition.requires_comment ? ' — requiere comentario' : '';
      return `<option value="${Number(transition.target_state_id)}">${escapeHtml(formatCatalogLabel(transition.target_state_name || '-'))}${commentNotice}</option>`;
    }),
  ].join('');
  select.value = String(incident.state_id);
  select.disabled = availableTransitions.length === 0;
  select.title = availableTransitions.length
    ? 'Seleccione el nuevo estado'
    : 'No hay transiciones disponibles para su rol';
}

export function getAvailableStateTransitions(incident, transitions) {
  const seenTargets = new Set();

  return transitions.filter((transition) => {
    const targetStateId = Number(transition.target_state_id);
    const isActive = transition.is_active !== false && Number(transition.is_active) !== 0;
    const isCurrentSource = Number(transition.source_state_id) === Number(incident.state_id);
    const isNewTarget = targetStateId !== Number(incident.state_id) && !seenTargets.has(targetStateId);
    const isAllowed = isTransitionAllowedForCurrentUser(transition);

    if (!isActive || !isCurrentSource || !isNewTarget || !isAllowed) return false;
    seenTargets.add(targetStateId);
    return true;
  });
}

export function isTransitionAllowedForCurrentUser(transition) {
  const allowedRoles = Array.isArray(transition.allowed_roles)
    ? transition.allowed_roles.map(normalizeCode).filter(Boolean)
    : [];
  if (!allowedRoles.length) return true;

  const user = readCurrentUser();
  const userRoles = Array.isArray(user?.roles)
    ? user.roles.map(normalizeCode).filter(Boolean)
    : [];

  return userRoles.some((role) => allowedRoles.includes(role));
}

function prepareStateCommentModal(transition) {
  const select = document.getElementById('nuevoEstado');
  const commentInput = document.getElementById('comentarioEstado');
  if (!select || !commentInput) return;

  select.innerHTML = `
    <option value="${Number(transition.target_state_id)}">
      ${escapeHtml(formatCatalogLabel(transition.target_state_name || '-'))}
    </option>`;
  commentInput.value = '';
  globalThis.jQuery?.('#modalEstado').modal('show');
  globalThis.setTimeout(() => commentInput.focus(), 250);
}

function hydratePriorityModal(incident, priorities) {
  const select = document.getElementById('nuevaPrioridad');
  if (!select) return;

  const options = [
    '<option value="">Seleccione una prioridad...</option>',
    ...priorities.map((priority) => `
      <option value="${priority.id}" ${Number(priority.id) === Number(incident.priority_id) ? 'selected' : ''}>
        ${escapeHtml(formatCatalogLabel(priority.name))}
      </option>`),
  ];

  select.innerHTML = options.join('');
}

function bindCommentForm(incident) {
  const button = document.getElementById('btnAgregarComentario');
  const input = document.getElementById('nuevoComentario');
  if (!button || !input) return;

  const submit = async () => {
    const comment = input.value.trim();
    if (!comment) {
      showGlobalAlert('Escriba un comentario antes de enviar.', 'warning');
      return;
    }

    try {
      const response = await addIncidentComment(incident.id, {
        comment,
        is_internal: false,
      });

      appendCommentIfMissing(incident, response?.data);
      input.value = '';
      showGlobalAlert('Comentario agregado correctamente.', 'success');
    } catch (error) {
      showGlobalAlert(error.message || 'No se pudo registrar el comentario.', 'danger');
    }
  };

  button.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      submit();
    }
  });
}

function startRealtimeComments(incident) {
  scheduleCommentFallback(incident);
  subscribeToIncidentComments(
    incident.id,
    hasPermission('comments.internal'),
    (comment) => appendCommentIfMissing(incident, comment),
    (state) => {
      if (state === 'subscribed') {
        stopCommentFallback();
      } else {
        scheduleCommentFallback(incident);
      }
    }
  ).then((subscription) => {
    commentSubscription?.cleanup?.();
    commentSubscription = subscription;
  }).catch((error) => {
    scheduleCommentFallback(incident);
    console.warn('[SGI] Comentarios en tiempo real no disponibles; se activo la sincronizacion de respaldo.', error);
  });
}

function startRealtimeDetail(incident) {
  subscribeToIncidentRealtime(
    incident.id,
    {
      onStateChanged: async (payload) => {
        if (payload?.new_state_id) {
          try {
            const response = await getIncident(incident.id, { noCache: true });
            const fresh = response?.data;
            if (fresh) {
              Object.assign(incident, fresh);
              updateStatePresentation(incident, cachedTransitions);
              showGlobalAlert(
                `Estado actualizado a ${formatCatalogLabel(fresh.state?.name || '-')}`,
                'info',
              );
            }
          } catch (e) {
            console.warn('[SGI] No se pudo refrescar detalle tras cambio de estado.', e);
          }
        }
      },
      onAssigned: async (payload) => {
        if (payload?.incident_id) {
          try {
            const response = await getIncident(incident.id, { noCache: true });
            const fresh = response?.data;
            if (fresh) {
              Object.assign(incident, fresh);
              showGlobalAlert(
                'La asignación de esta incidencia fue actualizada.',
                'info',
              );
            }
          } catch (e) {
            console.warn('[SGI] No se pudo refrescar detalle tras asignación.', e);
          }
        }
      },
    },
  ).then((subscription) => {
    detailRealtimeSubscription?.cleanup?.();
    detailRealtimeSubscription = subscription;
  }).catch((error) => {
    console.warn('[SGI] Tiempo real de incidencia no disponible.', error);
  });
}

function scheduleCommentFallback(incident) {
  if (commentFallbackDelay || commentFallbackTimer) return;

  commentFallbackDelay = globalThis.setTimeout(() => {
    commentFallbackDelay = null;
    refreshIncidentComments(incident);
    commentFallbackTimer = globalThis.setInterval(() => refreshIncidentComments(incident), 10000);
  }, 5000);
}

function stopCommentFallback() {
  if (commentFallbackDelay) globalThis.clearTimeout(commentFallbackDelay);
  if (commentFallbackTimer) globalThis.clearInterval(commentFallbackTimer);
  commentFallbackDelay = null;
  commentFallbackTimer = null;
}

async function refreshIncidentComments(incident) {
  if (commentRefreshInFlight || document.visibilityState === 'hidden') return;
  commentRefreshInFlight = true;

  try {
    const response = await getIncident(incident.id, { noCache: true });
    const comments = Array.isArray(response?.data?.comments) ? response.data.comments : [];
    comments.forEach((comment) => appendCommentIfMissing(incident, comment));
  } catch (error) {
    console.warn('[SGI] No se pudieron sincronizar los comentarios.', error);
  } finally {
    commentRefreshInFlight = false;
  }
}

function appendCommentIfMissing(incident, comment) {
  if (!comment?.id) return false;

  const comments = Array.isArray(incident.comments) ? incident.comments : [];
  if (comments.some((item) => Number(item.id) === Number(comment.id))) return false;

  incident.comments = [...comments, comment];
  const list = document.getElementById('listadoComentarios');
  if (list) list.innerHTML = renderComments(incident.comments);
  setText('commentsCount', incident.comments.length);
  setText('commentsMetric', incident.comments.length);

  return true;
}

function bindAttachmentForm(incident) {
  const form = document.getElementById('attachmentUploadForm');
  const input = document.getElementById('attachmentFile');
  const label = document.getElementById('attachmentFileLabel');
  const button = document.getElementById('btnUploadAttachment');
  const errorElement = document.getElementById('attachmentFileError');

  if (!form || !input || !label || !button || !errorElement) return;

  const resetFieldError = () => {
    input.classList.remove('is-invalid');
    errorElement.textContent = '';
    errorElement.classList.add('d-none');
  };

  input.addEventListener('change', () => {
    const fileName = input.files?.[0]?.name || 'Seleccione un archivo...';
    label.textContent = fileName;
    resetFieldError();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    resetFieldError();

    const file = input.files?.[0];
    if (!file) {
      input.classList.add('is-invalid');
      errorElement.textContent = 'Seleccione un archivo antes de enviarlo.';
      errorElement.classList.remove('d-none');
      return;
    }

    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm mr-2" role="status" aria-hidden="true"></span>Subiendo...';

    try {
      const response = await uploadIncidentAttachment(incident.id, file);
      const attachmentData = response?.data;

      incident.attachments = [attachmentData, ...(incident.attachments || [])];
      document.getElementById('attachmentsList').innerHTML = renderAttachments(incident.attachments);
      setText('attachmentsCount', incident.attachments.length);
      setText('attachmentsMetric', incident.attachments.length);
      bindAttachmentPreview();

      form.reset();
      label.textContent = 'Seleccione un archivo...';
      showGlobalAlert('Archivo adjuntado correctamente.', 'success');
    } catch (error) {
      const validationMessage = error?.errors?.file?.[0];

      if (validationMessage) {
        input.classList.add('is-invalid');
        errorElement.textContent = validationMessage;
        errorElement.classList.remove('d-none');
      }

      showGlobalAlert(error.message || 'No se pudo cargar el archivo adjunto.', 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-upload mr-1"></i>Adjuntar archivo';
    }
  });
}

function bindAttachmentPreview() {
  const modalImage = document.getElementById('attachmentPreviewModalImage');
  const modalFallback = document.getElementById('attachmentPreviewModalFallback');
  const modalOpenLink = document.getElementById('attachmentPreviewModalOpen');

  if (!modalImage || !modalFallback || !modalOpenLink) return;

  document.querySelectorAll('.attachment-preview-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      const imageUrl = link.getAttribute('href') || '';
      const imageAlt = link.querySelector('img')?.getAttribute('alt') || 'Vista previa de evidencia';

      modalImage.src = imageUrl;
      modalImage.alt = imageAlt;
      modalOpenLink.href = imageUrl;
      modalFallback.classList.add('d-none');
      modalImage.classList.remove('d-none');

      modalImage.onload = () => {
        modalFallback.classList.add('d-none');
        modalImage.classList.remove('d-none');
      };

      modalImage.onerror = () => {
        modalImage.classList.add('d-none');
        modalFallback.classList.remove('d-none');
      };

      globalThis.jQuery?.('#modalAttachmentPreview').modal('show');
    });
  });
}

function bindPriorityForm(incident) {
  const openButton = document.getElementById('btnAsignarPrioridad');
  const saveButton = document.getElementById('btnGuardarPrioridad');
  const select = document.getElementById('nuevaPrioridad');

  if (!openButton || !saveButton || !select) return;

  openButton.addEventListener('click', () => {
    globalThis.jQuery?.('#modalPrioridad').modal('show');
  });

  saveButton.addEventListener('click', async () => {
    const nextPriorityId = Number(select.value);

    if (!Number.isFinite(nextPriorityId) || nextPriorityId <= 0) {
      showGlobalAlert('Seleccione una prioridad valida.', 'warning');
      return;
    }

    saveButton.disabled = true;

    try {
      const response = await updateIncident(incident.id, {
        priority_id: nextPriorityId,
      });

      const updated = response?.data || {};
      const selectedLabel = select.options[select.selectedIndex]?.textContent?.trim() || 'Sin definir';

      incident.priority_id = updated.priority_id ?? nextPriorityId;
      incident.priority = updated.priority || {
        ...incident.priority,
        id: nextPriorityId,
        name: selectedLabel,
      };

      const badge = document.getElementById('badgePrioridadDetalle');
      if (badge) {
        badge.textContent = formatCatalogLabel(incident.priority?.name || 'Sin definir');
        badge.className = `badge ${getPriorityBadgeClass(incident.priority?.name || '')} px-2 py-1`;
      }

      renderStateSelector(incident, cachedTransitions);
      updateOperatorStateButton(incident);

      globalThis.jQuery?.('#modalPrioridad').modal('hide');
      showGlobalAlert('Prioridad actualizada correctamente.', 'success');
    } catch (error) {
      showGlobalAlert(error.message || 'No se pudo actualizar la prioridad.', 'danger');
    } finally {
      saveButton.disabled = false;
    }
  });
}

function bindStateChangeControl(incident, transitions) {
  const directSelect = document.getElementById('estadoDirecto');
  const saveButton = document.getElementById('btnGuardarEstado');
  const commentInput = document.getElementById('comentarioEstado');

  if (!directSelect || !saveButton || !commentInput) return;

  let pendingTransition = null;
  renderStateSelector(incident, transitions);
  initializeStateHistoryTooltip(incident.history || []);

  directSelect.addEventListener('change', async () => {
    const nextStateId = Number(directSelect.value);
    if (nextStateId === Number(incident.state_id)) return;

    const transition = getAvailableStateTransitions(incident, transitions)
      .find((item) => Number(item.target_state_id) === nextStateId);

    if (!transition) {
      renderStateSelector(incident, transitions);
      showGlobalAlert('La transición seleccionada no está disponible.', 'warning');
      return;
    }

    if (transition.requires_comment) {
      pendingTransition = transition;
      directSelect.value = String(incident.state_id);
      prepareStateCommentModal(transition);
      return;
    }

    directSelect.disabled = true;
    try {
      await executeStateTransition(incident, transition, '', transitions);
      renderStateSelector(incident, transitions);
    } catch (error) {
      renderStateSelector(incident, transitions);
      showGlobalAlert(error.message || 'No se pudo cambiar el estado.', 'danger');
    }
  });

  saveButton.addEventListener('click', async () => {
    const comment = commentInput.value.trim();

    if (!pendingTransition) {
      globalThis.jQuery?.('#modalEstado').modal('hide');
      return;
    }

    if (!comment) {
      showGlobalAlert('Ingrese el comentario obligatorio para continuar.', 'warning');
      commentInput.focus();
      return;
    }

    saveButton.disabled = true;
    try {
      await executeStateTransition(incident, pendingTransition, comment, transitions);
      pendingTransition = null;
      globalThis.jQuery?.('#modalEstado').modal('hide');
      commentInput.value = '';
    } catch (error) {
      showGlobalAlert(error.message || 'No se pudo cambiar el estado.', 'danger');
    } finally {
      saveButton.disabled = false;
    }
  });

  globalThis.jQuery?.('#modalEstado').on('hidden.bs.modal', () => {
    pendingTransition = null;
    commentInput.value = '';
    renderStateSelector(incident, transitions);
  });
}

async function executeStateTransition(incident, transition, comment, transitions) {
  const previousStateId = Number(incident.state_id);
  const previousStateName = incident.state?.name || null;
  const nextStateId = Number(transition.target_state_id);
  const response = await changeIncidentState(incident.id, {
    state_id: nextStateId,
    comment: comment || undefined,
  });

  const updated = response?.data || {};
  incident.state_id = updated.state_id ?? nextStateId;
  incident.state = updated.state || {
    id: nextStateId,
    name: transition.target_state_name || '-',
  };

  const currentUser = readCurrentUser();
  const newStateColor = incident.state?.color || getStateHexColor(incident.state?.name);
  incident.history = [
    {
      id: Date.now(),
      previous_state_id: previousStateId,
      previous_state_name: previousStateName,
      new_state_id: nextStateId,
      new_state_name: incident.state?.name,
      new_state_color: newStateColor,
      user_id: Number(currentUser?.id || currentUser?.user_id || 0),
      comment: comment || null,
      created_at: new Date().toISOString(),
      user: currentUser ? {
        first_name: currentUser.first_name || currentUser.firstName || '',
        last_name: currentUser.last_name || currentUser.lastName || '',
      } : null,
    },
    ...(incident.history || []),
  ];

  updateStatePresentation(incident, transitions);
  showStateChangeConfirmation(incident.state?.name);
}

function updateStatePresentation(incident, transitions) {
  const stateName = formatCatalogLabel(incident.state?.name || '-');
  const headerBadge = document.getElementById('badgeEstadoDetalle');
  const summaryBadge = document.getElementById('badgeEstadoResumen');
  const timeline = document.getElementById('timelineHistorial');

  if (headerBadge) {
    headerBadge.textContent = stateName;
    headerBadge.className = 'badge estado-badge-grande';
    headerBadge.style.backgroundColor = incident.state?.color || getStateHexColor(incident.state?.name);
    headerBadge.style.color = '#fff';
  }
  if (summaryBadge) {
    summaryBadge.textContent = stateName;
    summaryBadge.className = 'badge px-2 py-1';
    summaryBadge.style.backgroundColor = incident.state?.color || getStateHexColor(incident.state?.name);
    summaryBadge.style.color = '#fff';
  }
  if (timeline) {
    timeline.innerHTML = renderHistory(incident.history);
  }

  const containerResolutionDate = document.getElementById('containerResolutionDate');
  const labelResolutionDate = document.getElementById('labelResolutionDate');
  const containerRejectionDate = document.getElementById('containerRejectionDate');
  const labelRejectionDate = document.getElementById('labelRejectionDate');
  const reopenDatesContainer = document.getElementById('reopenDatesContainer');

  if (containerResolutionDate) {
    containerResolutionDate.className = incident.rejected_at ? 'd-none' : '';
  }
  if (labelResolutionDate) {
    labelResolutionDate.textContent = formatShortDate(incident.resolution_date);
  }

  if (containerRejectionDate) {
    containerRejectionDate.className = incident.rejected_at ? '' : 'd-none';
  }
  if (labelRejectionDate) {
    labelRejectionDate.textContent = formatShortDate(incident.rejected_at);
  }

  if (reopenDatesContainer) {
    let reopenHtml = '';
    if (incident.reopened_at) {
      reopenHtml += `
        <p class="detalle-label text-warning mt-2">Fecha de reapertura</p>
        <p><i class="fas fa-redo mr-1 text-warning"></i>${escapeHtml(formatShortDate(incident.reopened_at))}</p>
      `;
    }
    if (incident.previous_resolution_date) {
      reopenHtml += `
        <p class="detalle-label text-secondary mt-2">Resolución anterior</p>
        <p><i class="fas fa-history mr-1 text-secondary"></i>${escapeHtml(formatShortDate(incident.previous_resolution_date))}</p>
      `;
    }
    reopenDatesContainer.innerHTML = reopenHtml;
  }

  setText('historyMetric', incident.history.length);
  renderStateSelector(incident, transitions);
  initializeStateHistoryTooltip(incident.history);
}

function showStateChangeConfirmation(stateName) {
  const message = `Estado actualizado a ${formatCatalogLabel(stateName || '-')}.`;
  if (typeof globalThis.showGlobalAlert === 'function') {
    globalThis.showGlobalAlert(message, 'success', 'Estado actualizado', 2000);
    return;
  }

  showGlobalAlert(message, 'success');
}

export function renderComments(comments) {
  if (!comments.length) {
    return '<p class="text-muted text-center py-3"><i class="fas fa-comment-slash mr-2"></i>Sin comentarios aún.</p>';
  }

  return comments.map((comment) => {
    const author = comment.user
      ? [comment.user.first_name, comment.user.last_name].filter(Boolean).join(' ')
      : 'Usuario';

    return `
      <div class="d-flex mb-3" style="gap:12px;">
        <div class="comentario-avatar" style="background:${comment.is_internal ? '#6c757d' : '#007bff'};">
          ${escapeHtml(author.charAt(0).toUpperCase())}
        </div>
        <div class="comentario-card flex-grow-1">
          <strong>${escapeHtml(author)}</strong>
          <small class="text-muted ml-2">${escapeHtml(formatDateTime(comment.created_at))}</small>
          <p class="mb-0 mt-1">${escapeHtml(comment.comment || '')}</p>
        </div>
      </div>`;
  }).join('');
}

export function renderAttachments(attachments) {
  if (!attachments.length) {
    return `
      <div class="text-center text-muted py-4 border rounded bg-light">
        <i class="fas fa-folder-open fa-2x mb-3 d-block text-success"></i>
        <strong class="d-block mb-1">No hay evidencias adjuntas todavia.</strong>
        <span>Cuando un ciudadano u operador cargue archivos, apareceran aqui.</span>
      </div>`;
  }

  return `
    <div class="attachment-grid">
      ${attachments.map(renderAttachmentCard).join('')}
    </div>`;
}

function renderAttachmentCard(attachment) {
  const fileName = attachment?.original_name || 'Archivo adjunto';
  const mimeType = String(attachment?.mime_type || '').toLowerCase();
  const author = attachment?.user
    ? [attachment.user.first_name, attachment.user.last_name].filter(Boolean).join(' ')
    : 'Usuario del sistema';
  const resolvedUrl = resolveAttachmentUrl(attachment);
  const isImage = mimeType.startsWith('image/');
  const fileIconClass = attachmentIconClass(mimeType, fileName);
  const preview = isImage && resolvedUrl
    ? `
      <a href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener noreferrer" class="attachment-preview-link" title="Ver evidencia">
        <img src="${escapeHtml(resolvedUrl)}" alt="${escapeHtml(fileName)}" class="attachment-preview-image">
      </a>`
    : `
      <div class="attachment-preview-placeholder">
        <i class="${escapeHtml(fileIconClass)}"></i>
      </div>`;

  return `
    <article class="attachment-card">
      <div class="attachment-preview">${preview}</div>
      <div class="attachment-body">
        <div class="d-flex justify-content-between align-items-start mb-2" style="gap:10px;">
          <div class="attachment-meta">
            <h4 class="attachment-title" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</h4>
            <div class="attachment-details">
              <span><i class="fas fa-user mr-1"></i>${escapeHtml(author)}</span>
              <span><i class="fas fa-clock mr-1"></i>${escapeHtml(formatDateTime(attachment?.created_at))}</span>
            </div>
          </div>
          <span class="badge badge-light attachment-type-badge">${escapeHtml(formatAttachmentTypeLabel(mimeType, fileName))}</span>
        </div>
        <div class="attachment-footer">
          <span class="text-muted small">${escapeHtml(formatFileSize(attachment?.file_size_bytes))}</span>
          ${resolvedUrl
            ? `<a href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-success">
                <i class="fas fa-external-link-alt mr-1"></i>Abrir
              </a>`
            : `<span class="text-warning small">
                <i class="fas fa-exclamation-triangle mr-1"></i>URL no disponible
              </span>`}
        </div>
      </div>
    </article>`;
}

export function renderHistory(history) {
  if (!history.length) {
    return '<p class="text-muted text-center py-4 mb-0"><i class="fas fa-stream mr-2"></i>Sin historial disponible.</p>';
  }

  return history.map((entry) => {
    const stateName = formatCatalogLabel(entry.new_state_name || '-');
    const author = entry.user
      ? [entry.user.first_name, entry.user.last_name].filter(Boolean).join(' ')
      : 'Sistema';

    const action = entry.comment
      ? `Cambio de estado: ${stateName}. ${entry.comment}`
      : `Cambio de estado: ${stateName}`;

    return `
      <div class="timeline-item-custom" style="border-left-color:#6c757d">
        <small class="text-muted d-block mb-1">${escapeHtml(formatDateTime(entry.created_at))}</small>
        <strong>${escapeHtml(action)}</strong>
        <br>
        <small><i class="fas fa-user mr-1 text-muted"></i>${escapeHtml(author)}</small>
        <span class="badge float-right" style="background-color: ${entry.new_state_color || getStateHexColor(stateName)}; color: #fff;">${escapeHtml(stateName)}</span>
      </div>`;
  }).join('');
}

function renderRecentStateChangesTooltip(history) {
  const changes = recentStateChangeLines(history);
  if (!changes.length) {
    return '<strong>Últimos 3 cambios</strong><br>Sin cambios registrados';
  }

  return `<strong>Últimos 3 cambios</strong><br>${changes.map((change) => escapeHtml(change)).join('<br>')}`;
}

function recentStateChangeLines(history) {
  if (!Array.isArray(history)) return [];

  return history.slice(0, 3).map((entry) => {
    const previousState = formatCatalogLabel(entry.previous_state_name || 'Inicio');
    const newState = formatCatalogLabel(entry.new_state_name || '-');
    return `${previousState} → ${newState} · ${formatDateTime(entry.created_at)}`;
  });
}

function initializeStateHistoryTooltip(history) {
  const target = document.getElementById('stateHistoryTooltip');
  if (!target) return;

  const changes = recentStateChangeLines(history);
  const htmlContent = renderRecentStateChangesTooltip(history);
  const tooltip = globalThis.jQuery?.(target);

  if (tooltip?.tooltip) {
    if (tooltip.data('bs.tooltip')) {
      tooltip.tooltip('dispose');
    }
    target.setAttribute('title', htmlContent);
    tooltip.tooltip({ html: true, container: 'body', placement: 'bottom' });
    return;
  }

  target.setAttribute('title', [
    'Últimos 3 cambios',
    ...(changes.length ? changes : ['Sin cambios registrados']),
  ].join('\n'));
}

function renderError(container, message) {
  container.innerHTML = `
    <div class="alert alert-danger">
      <i class="fas fa-exclamation-circle mr-2"></i>${escapeHtml(message)}
      <a href="incidents.html" class="btn btn-sm btn-outline-danger ml-3">Volver</a>
    </div>`;
}

export function calculateDays(value) {
  const start = new Date(value || '');
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = String(value);
  }
}

function setHtml(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = value;
  }
}

function resolveAttachmentUrl(attachment) {
  const directUrl = String(attachment?.file_url || '').trim();
  if (directUrl) {
    return directUrl;
  }

  const rawPath = String(attachment?.file_path || '').trim();
  if (!rawPath) return '';

  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  let normalizedPath = rawPath;
  while (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  let configuredBaseUrl = String(
    globalThis.SGI_ATTACHMENTS_BASE_URL
      || globalThis.SGI_STORAGE_BASE_URL
      || deriveStorageBaseUrl()
  ).trim();

  if (!configuredBaseUrl) {
    return '';
  }

  while (configuredBaseUrl.endsWith('/')) {
    configuredBaseUrl = configuredBaseUrl.slice(0, -1);
  }
  return `${configuredBaseUrl}/${normalizedPath}`;
}

function deriveStorageBaseUrl() {
  if (typeof API_URL !== 'string' || !API_URL) return '';

  let normalizedApiUrl = API_URL;
  while (normalizedApiUrl.endsWith('/')) {
    normalizedApiUrl = normalizedApiUrl.slice(0, -1);
  }
  
  if (normalizedApiUrl.endsWith('/api')) {
    return `${normalizedApiUrl.slice(0, -4)}/storage`;
  }

  return `${globalThis.location.origin}/storage`;
}

function attachmentIconClass(mimeType, fileName) {
  if (mimeType.startsWith('image/')) return 'far fa-file-image';
  if (mimeType === 'application/pdf') return 'far fa-file-pdf';
  if (mimeType.includes('word') || /\.docx?$/i.test(fileName)) return 'far fa-file-word';
  if (mimeType.startsWith('video/')) return 'far fa-file-video';
  if (mimeType.includes('zip') || /\.zip$/i.test(fileName)) return 'far fa-file-archive';
  return 'far fa-file-alt';
}

function formatAttachmentTypeLabel(mimeType, fileName) {
  if (mimeType.startsWith('image/')) return 'Imagen';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word') || /\.docx?$/i.test(fileName)) return 'Word';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.includes('zip') || /\.zip$/i.test(fileName)) return 'ZIP';
  return 'Archivo';
}

export function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return 'Tamano no disponible';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canManagePriority() {
  const user = readCurrentUser();

  if (!user || !Array.isArray(user.roles)) return false;

  return user.roles.some((role) => {
    const code = normalizeCode(role);
    return code === 'ADMIN' || code === 'SUPERVISOR';
  });
}

function isOperator() {
  const user = readCurrentUser();
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((role) => {
    const code = normalizeCode(role);
    return code === 'OPERADOR';
  });
}

function openRequestStateModal(incident, states) {
  const motivo = document.getElementById('solicitudMotivo');
  if (!motivo) return;

  const currentStateId = Number(incident.state_id);
  
  let targetState = null;
  (Array.isArray(states) ? states : []).forEach((s) => {
    if (Number(s.id) === currentStateId) return;
    if (normalizeCode(s.name) === 'RESUELTA') {
      targetState = s;
    }
  });

  if (!targetState) {
    showGlobalAlert('No se pudo encontrar el estado de resolución habilitado.', 'warning');
    return;
  }

  motivo.value = '';
  pendingStateRequest = { incident, targetStateId: targetState.id };

  globalThis.jQuery?.('#modalSolicitarEstado').modal('show');
}

function renderOperatorStateButton(incident) {
  const hasPriority = !!(incident.priority_id || incident.priority?.id);
  const pendingRequest = pendingStateRequests.find(r => r.status === 'pending');

  if (pendingRequest) {
    return `
      <button class="btn btn-sm btn-outline-warning disabled" style="cursor: not-allowed;" title="Ya hay una solicitud pendiente">
        <i class="fas fa-hourglass-half mr-1"></i>Solicitud de estado pendiente
      </button>
    `;
  }

  if (!hasPriority) {
    return `
      <div class="d-inline-block" tabindex="0" data-toggle="tooltip" title="Debes asignar una prioridad antes de solicitar un cambio de estado">
        <button class="btn btn-sm btn-outline-warning" disabled style="pointer-events: none;">
          <i class="fas fa-paper-plane mr-1"></i>Solicitar resolución
        </button>
      </div>
    `;
  }

  return `
    <button class="btn btn-sm btn-outline-warning" id="btnSolicitarCambioEstado">
      <i class="fas fa-paper-plane mr-1"></i>Solicitar resolución
    </button>
  `;
}

function bindOperatorStateButton(incident) {
  const requestBtn = document.getElementById('btnSolicitarCambioEstado');
  if (requestBtn) {
    requestBtn.addEventListener('click', () => openRequestStateModal(incident, availableStates));
  }
}

function updateOperatorStateButton(incident) {
  const container = document.getElementById('operatorStateButtonContainer');
  if (!container) return;

  if (normalizeCode(incident.state?.name) === 'EN_PROGRESO') {
    container.innerHTML = renderOperatorStateButton(incident);
    bindOperatorStateButton(incident);
  } else {
    container.remove();
  }
}

function removePendingRequestRow(requestId) {
  const row = document.getElementById(`row-solicitud-${requestId}`);
  if (row) {
    row.remove();
  }
  
  // If no more requests, remove the whole panel
  if (pendingStateRequests.length === 0) {
    const tableContainer = document.querySelector('.table-responsive');
    if (tableContainer) {
      const card = tableContainer.closest('.card');
      if (card) {
        card.remove();
      }
    }
  }
}

function renderPendingStateRequests(requests) {
  return `
    <div class="card card-outline card-warning mt-3">
      <div class="card-header">
        <h3 class="card-title">
          <i class="fas fa-clock mr-2"></i>Solicitudes de cambio pendientes
          <span class="badge badge-warning ml-2">${requests.length}</span>
        </h3>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead>
              <tr>
                <th>Solicitante</th>
                <th>Estado solicitado</th>
                <th>Razon</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${requests.map((r) => {
                const requesterName = r.requestedByUserName || r.requested_by_user_name || 'Usuario';
                const stateName = r.requestedStateName || r.requested_state_name || '-';
                return `
                  <tr>
                    <td>${escapeHtml(requesterName)}</td>
                    <td><span class="badge badge-info">${escapeHtml(formatCatalogLabel(stateName))}</span></td>
                    <td>${escapeHtml(r.reason || '-')}</td>
                    <td><small>${escapeHtml(formatDateTime(r.created_at || r.createdAt))}</small></td>
                    <td>
                      <button class="btn btn-sm btn-success mr-1" data-action="approve-request" data-request-id="${r.id}">
                        <i class="fas fa-check mr-1"></i>Aprobar
                      </button>
                      <button class="btn btn-sm btn-danger" data-action="reject-request" data-request-id="${r.id}">
                        <i class="fas fa-times mr-1"></i>Rechazar
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function bindReviewRequestButtons(incident) {
  document.querySelectorAll('[data-action="approve-request"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const requestId = Number(btn.dataset.requestId);
      const request = pendingStateRequests.find((r) => Number(r.id) === requestId);
      if (request) openApproveModal(incident, request);
    });
  });

  document.querySelectorAll('[data-action="reject-request"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const requestId = Number(btn.dataset.requestId);
      const request = pendingStateRequests.find((r) => Number(r.id) === requestId);
      if (request) openRejectModal(incident, request);
    });
  });
}

function openApproveModal(incident, request) {
  const header = document.getElementById('modalRevisarHeader');
  const title = document.getElementById('modalRevisarTitulo');
  const summary = document.getElementById('modalRevisarResumen');
  const approveBtn = document.getElementById('btnConfirmarAprobar');
  const rejectBtn = document.getElementById('btnConfirmarRechazar');
  const commentInput = document.getElementById('modalRevisarComentario');
  if (!title || !summary || !approveBtn || !rejectBtn || !commentInput) return;

  header.className = 'modal-header bg-success text-white';
  title.innerHTML = '<i class="fas fa-check mr-2"></i>Aprobar solicitud de cambio';
  summary.innerHTML = renderReviewSummary(request);
  commentInput.value = '';
  commentInput.classList.remove('is-invalid');
  approveBtn.classList.remove('d-none');
  rejectBtn.classList.add('d-none');

  pendingReviewRequest = { incident, request, action: 'approve' };
  globalThis.jQuery?.('#modalRevisarSolicitud').modal('show');
}

function openRejectModal(incident, request) {
  const header = document.getElementById('modalRevisarHeader');
  const title = document.getElementById('modalRevisarTitulo');
  const summary = document.getElementById('modalRevisarResumen');
  const approveBtn = document.getElementById('btnConfirmarAprobar');
  const rejectBtn = document.getElementById('btnConfirmarRechazar');
  const commentInput = document.getElementById('modalRevisarComentario');
  if (!title || !summary || !approveBtn || !rejectBtn || !commentInput) return;

  header.className = 'modal-header bg-danger text-white';
  title.innerHTML = '<i class="fas fa-times mr-2"></i>Rechazar solicitud de cambio';
  summary.innerHTML = renderReviewSummary(request);
  commentInput.value = '';
  approveBtn.classList.add('d-none');
  rejectBtn.classList.remove('d-none');

  pendingReviewRequest = { incident, request, action: 'reject' };
  globalThis.jQuery?.('#modalRevisarSolicitud').modal('show');
}

function renderReviewSummary(request) {
  const requesterName = request.requestedByUserName || request.requested_by_user_name || 'Usuario';
  const stateName = request.requestedStateName || request.requested_state_name || '-';

  return `
    <div class="small">
      <p><strong>Solicitante:</strong> ${escapeHtml(requesterName)}</p>
      <p><strong>Estado solicitado:</strong> <span class="badge badge-info">${escapeHtml(formatCatalogLabel(stateName))}</span></p>
      <p><strong>Razon:</strong><br>${escapeHtml(request.reason || 'Sin especificar')}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(formatDateTime(request.created_at || request.createdAt))}</p>
    </div>`;
}

function readCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('user_data') || 'null');
  } catch {
    return null;
  }
}

function normalizeCode(value) {
  if (typeof value === 'string') return value.trim().toUpperCase();
  return String(value?.code || value?.codigo || value?.name || value?.nombre || '').trim().toUpperCase();
}

// ── Module-level event bindings (run once) ──

// Bind enviar solicitud button
document.getElementById('btnEnviarSolicitudEstado')?.addEventListener('click', async () => {
  if (!pendingStateRequest || !pendingStateRequest.targetStateId) return;
  const { incident, targetStateId } = pendingStateRequest;
  const stateId = targetStateId;
  const reason = document.getElementById('solicitudMotivo')?.value.trim();
  if (!reason) {
    showGlobalAlert('Ingrese el motivo de la solicitud.', 'warning');
    return;
  }

  const btn = document.getElementById('btnEnviarSolicitudEstado');
  if (btn) btn.disabled = true;

  try {
    const result = await requestStateChange(incident.id, { state_id: stateId, reason });
    globalThis.jQuery?.('#modalSolicitarEstado').modal('hide');
    showGlobalAlert('Solicitud enviada correctamente. El supervisor será notificado.', 'success');
    pendingStateRequest = null;

    // Update operator button to show pending state
    if (result?.data) {
      pendingStateRequests = [result.data, ...pendingStateRequests];
    } else {
      pendingStateRequests = [{ status: 'pending', requested_state_id: stateId }];
    }
    updateOperatorStateButton(incident);
  } catch (error) {
    showGlobalAlert(error.message || 'No se pudo enviar la solicitud.', 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Bind aprobar button in review modal
document.getElementById('btnConfirmarAprobar')?.addEventListener('click', async () => {
  if (!pendingReviewRequest || pendingReviewRequest.action !== 'approve') return;
  const { incident, request } = pendingReviewRequest;
  const commentEl = document.getElementById('modalRevisarComentario');
  const comment = commentEl?.value.trim() || '';

  if (!comment) {
    commentEl?.classList.add('is-invalid');
    commentEl?.focus();
    return;
  }
  commentEl?.classList.remove('is-invalid');

  const btn = document.getElementById('btnConfirmarAprobar');
  if (btn) btn.disabled = true;

  try {
    await approveStateChangeRequest(incident.id, request.id, { comment: comment || undefined });
    globalThis.jQuery?.('#modalRevisarSolicitud').modal('hide');
    showGlobalAlert('Solicitud aprobada correctamente. El estado se ha actualizado.', 'success');
    pendingReviewRequest = null;

    // Dynamically update the state after approval
    pendingStateRequests = pendingStateRequests.filter((r) => Number(r.id) !== Number(request.id));
    removePendingRequestRow(request.id);

    // Re-fetch the full incident to get correct state color, history, and dates
    try {
      const response = await getIncident(incident.id, { noCache: true });
      const fresh = response?.data;
      if (fresh) {
        Object.assign(incident, fresh);
        updateStatePresentation(incident, cachedTransitions);
      }
    } catch (e) {
      console.warn('[SGI] No se pudo refrescar detalle tras aprobar, usando datos locales.', e);
      // Fallback: at least update state name so the badge isn't stale
      if (request.requested_state_id || request.requestedStateId) {
        const newStateId = request.requested_state_id ?? request.requestedStateId;
        const newStateName = request.requested_state_name ?? request.requestedStateName ?? request.requested_state?.name ?? '-';
        incident.state_id = newStateId;
        incident.state = { id: newStateId, name: newStateName };
        updateStatePresentation(incident, cachedTransitions);
      }
    }
  } catch (error) {
    showGlobalAlert(error.message || 'No se pudo aprobar la solicitud.', 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Bind rechazar button in review modal
document.getElementById('btnConfirmarRechazar')?.addEventListener('click', async () => {
  if (!pendingReviewRequest || pendingReviewRequest.action !== 'reject') return;
  const { incident, request } = pendingReviewRequest;
  const comment = document.getElementById('modalRevisarComentario')?.value.trim() || '';

  const btn = document.getElementById('btnConfirmarRechazar');
  if (btn) btn.disabled = true;

  try {
    await rejectStateChangeRequest(incident.id, request.id, { comment: comment || undefined });
    globalThis.jQuery?.('#modalRevisarSolicitud').modal('hide');
    showGlobalAlert('Solicitud rechazada correctamente.', 'success');
    pendingReviewRequest = null;

    // Remove the rejected request from the list
    pendingStateRequests = pendingStateRequests.filter((r) => Number(r.id) !== Number(request.id));
    removePendingRequestRow(request.id);
  } catch (error) {
    showGlobalAlert(error.message || 'No se pudo rechazar la solicitud.', 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
});
