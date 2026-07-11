import {
  addIncidentComment,
  changeIncidentState,
  getIncident,
  listPriorities,
  listStates,
  updateIncident,
  uploadIncidentAttachment,
} from '../application/incidents-service.js?v=15';
import { subscribeToIncidentComments } from '../application/subscribe-incident-comments.usecase.js?v=1';
import {
  API_URL,
  MAP_BASE_STYLES,
  MAP_ECUADOR_BOUNDS,
} from '../../../core/config.js?v=21';
import {
  escapeHtml,
  formatCatalogLabel,
  formatDateTime,
  formatShortDate,
  getPriorityBadgeClass,
  getStateBadgeClass,
  showGlobalAlert,
} from './incidents-ui.js?v=14';

document.addEventListener('DOMContentLoaded', initIncidentDetailPage);

let commentSubscription = null;

window.addEventListener('pagehide', () => {
  commentSubscription?.cleanup?.();
  commentSubscription = null;
});

async function initIncidentDetailPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('incident-detail');
  }

  const incidentId = new URLSearchParams(window.location.search).get('id');
  const container = document.getElementById('contenidoDetalle');

  if (!incidentId) {
    renderError(container, 'No se especifico el identificador de incidencia.');
    return;
  }

  try {
    const canChangeState = hasPermission('incidents.edit');
    const canAssignPriority = canManagePriority();
    const [{ data: incident }, statesResponse] = await Promise.all([
      getIncident(incidentId),
      canChangeState ? listStates() : Promise.resolve({ data: [] }),
    ]);
    const prioritiesResponse = canAssignPriority
      ? await listPriorities()
      : { data: [] };

    if (!incident) {
      renderError(container, 'No se encontro la incidencia solicitada.');
      return;
    }

    setText('breadcrumbId', incident.code || `#${incident.id}`);
    setHtml(
      'pageTitle',
      `<i class="fas fa-file-alt text-primary mr-2"></i>Detalle - ${escapeHtml(incident.code || `#${incident.id}`)}`
    );

    renderIncidentDetail(
      container,
      incident,
      Array.isArray(statesResponse?.data) ? statesResponse.data : [],
      Array.isArray(prioritiesResponse?.data) ? prioritiesResponse.data : []
    );
    startRealtimeComments(incident);
  } catch (error) {
    renderError(container, error.message || 'No se pudo cargar el detalle de la incidencia.');
  }
}

function renderIncidentDetail(container, incident, states, priorities) {
  const stateName = formatCatalogLabel(incident.state?.name || '-');
  const priorityName = formatCatalogLabel(incident.priority?.name || 'Sin definir');
  const categoryName = formatCatalogLabel(incident.category?.name || '-');
  const subcategoryName = formatCatalogLabel(incident.subcategory?.name || '-');
  const territoryName = territoryLabel(incident);
  const addressText = incident.address || incident.address_reference || 'Ubicación registrada sin dirección textual.';
  const comments = Array.isArray(incident.comments) ? incident.comments : [];
  const history = Array.isArray(incident.history) ? incident.history : [];
  const attachments = Array.isArray(incident.attachments) ? incident.attachments : [];
  const canChangeState = hasPermission('incidents.edit');
  const canAssignPriority = canManagePriority();
  const hasValidCoordinates = hasCoordinates(incident);

  container.innerHTML = `
    <div class="row mb-3">
      <div class="col-12 d-flex justify-content-between align-items-center flex-wrap" style="gap:8px;">
        <div>
          <a href="incidents.html" class="btn btn-sm btn-outline-secondary mr-2">
            <i class="fas fa-arrow-left mr-1"></i>Volver
          </a>
          <span class="badge badge-dark mr-1" style="font-size:0.95rem;padding:6px 10px;">${escapeHtml(incident.code || `#${incident.id}`)}</span>
          <span class="badge estado-badge-grande ${getStateBadgeClass(stateName)}" id="badgeEstadoDetalle">${escapeHtml(stateName)}</span>
        </div>
        <div>
          ${canAssignPriority ? `
            <button class="btn btn-sm btn-outline-primary mr-1" id="btnAsignarPrioridad">
              <i class="fas fa-layer-group mr-1"></i>Asignar Prioridad
            </button>
          ` : ''}
          ${canChangeState ? `
            <button class="btn btn-sm btn-warning mr-1" id="btnCambiarEstado">
              <i class="fas fa-exchange-alt mr-1"></i>Cambiar Estado
            </button>
          ` : ''}
          <a href="incident-create.html" class="btn btn-sm btn-primary">
            <i class="fas fa-plus mr-1"></i>Nueva Incidencia
          </a>
        </div>
      </div>
    </div>

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
                <p><span class="badge ${getPriorityBadgeClass(priorityName)} px-2 py-1" id="badgePrioridadDetalle">${escapeHtml(priorityName)}</span></p>

                <p class="detalle-label">Estado</p>
                <p><span class="badge ${getStateBadgeClass(stateName)} px-2 py-1">${escapeHtml(stateName)}</span></p>
              </div>
              <div class="col-sm-6">
                <p class="detalle-label">Código</p>
                <p>${escapeHtml(incident.code || `#${incident.id}`)}</p>

                <p class="detalle-label">Fecha de registro</p>
                <p><i class="fas fa-calendar mr-1 text-muted"></i>${escapeHtml(formatShortDate(incident.created_at))}</p>

                <p class="detalle-label">Fecha de resolución</p>
                <p><i class="fas fa-calendar-check mr-1 text-muted"></i>${escapeHtml(formatShortDate(incident.resolution_date))}</p>
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
          <div class="card-body" id="listadoComentarios">
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
                <strong>Adjuntos permitidos:</strong> imagenes, PDF, Word, video y ZIP.
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
                      accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.mp4,.mov,.zip,application/pdf,image/*,video/quicktime,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/zip"
                    >
                    <label class="custom-file-label" for="attachmentFile" id="attachmentFileLabel">Seleccione un archivo...</label>
                  </div>
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
          <div class="card-body p-0">
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

  if (canChangeState) {
    hydrateStateModal(incident, states);
  }
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
    bindStateChangeForm(incident, states);
  }
}

function renderIncidentMap(incident) {
  const mapContainer = document.getElementById('incidentDetailMap');
  if (!mapContainer || !hasCoordinates(incident)) return;

  if (!window.maplibregl) {
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

  const map = new window.maplibregl.Map({
    container: mapContainer,
    style: MAP_BASE_STYLES.streets.style,
    center,
    zoom: 15,
    minZoom: 5,
    maxZoom: 18,
    maxBounds: MAP_ECUADOR_BOUNDS,
  });

  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new window.maplibregl.FullscreenControl(), 'top-right');

  const popupHtml = `
    <strong>${escapeHtml(incident.code || `#${incident.id}`)}</strong><br>
    <span>${escapeHtml(incident.title || 'Incidencia')}</span><br>
    <small>${escapeHtml(territoryLabel(incident))}</small>`;

  new window.maplibregl.Marker({ color: '#0d6efd' })
    .setLngLat(center)
    .setPopup(new window.maplibregl.Popup({ offset: 24 }).setHTML(popupHtml))
    .addTo(map);

  map.on('load', () => map.resize());
}

function hasCoordinates(incident) {
  const latitude = Number(incident?.latitude);
  const longitude = Number(incident?.longitude);

  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -5.25
    && latitude <= 1.85
    && longitude >= -92.2
    && longitude <= -75;
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

function hydrateStateModal(incident, states) {
  const select = document.getElementById('nuevoEstado');
  if (!select) return;

  const seen = new Set();
  const filtered = [];
  for (const state of states) {
    const label = formatCatalogLabel(state.name);
    if (seen.has(label)) continue;
    seen.add(label);
    filtered.push(state);
  }

  select.innerHTML = filtered.map((state) => `
    <option value="${state.id}" ${Number(state.id) === Number(incident.state_id) ? 'selected' : ''}>
      ${escapeHtml(formatCatalogLabel(state.name))}
    </option>`).join('');
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
  subscribeToIncidentComments(
    incident.id,
    hasPermission('comments.internal'),
    (comment) => appendCommentIfMissing(incident, comment)
  ).then((subscription) => {
    commentSubscription?.cleanup?.();
    commentSubscription = subscription;
  }).catch((error) => {
    console.warn('[SGI] Comentarios en tiempo real no disponibles; se mantiene la API REST.', error);
  });
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

      window.jQuery?.('#modalAttachmentPreview').modal('show');
    });
  });
}

function bindPriorityForm(incident) {
  const openButton = document.getElementById('btnAsignarPrioridad');
  const saveButton = document.getElementById('btnGuardarPrioridad');
  const select = document.getElementById('nuevaPrioridad');

  if (!openButton || !saveButton || !select) return;

  openButton.addEventListener('click', () => {
    window.jQuery?.('#modalPrioridad').modal('show');
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
        ...(incident.priority || {}),
        id: nextPriorityId,
        name: selectedLabel,
      };

      const badge = document.getElementById('badgePrioridadDetalle');
      if (badge) {
        badge.textContent = formatCatalogLabel(incident.priority?.name || 'Sin definir');
        badge.className = `badge ${getPriorityBadgeClass(incident.priority?.name || '')} px-2 py-1`;
      }

      window.jQuery?.('#modalPrioridad').modal('hide');
      showGlobalAlert('Prioridad actualizada correctamente.', 'success');
    } catch (error) {
      showGlobalAlert(error.message || 'No se pudo actualizar la prioridad.', 'danger');
    } finally {
      saveButton.disabled = false;
    }
  });
}

function bindStateChangeForm(incident) {
  const openButton = document.getElementById('btnCambiarEstado');
  const saveButton = document.getElementById('btnGuardarEstado');
  const select = document.getElementById('nuevoEstado');
  const commentInput = document.getElementById('comentarioEstado');

  if (!openButton || !saveButton || !select || !commentInput) return;

  openButton.addEventListener('click', () => {
    window.jQuery?.('#modalEstado').modal('show');
  });

  saveButton.addEventListener('click', async () => {
    const nextStateId = Number(select.value);
    const comment = commentInput.value.trim();

    if (!Number.isFinite(nextStateId) || nextStateId <= 0) {
      showGlobalAlert('Seleccione un estado valido.', 'warning');
      return;
    }

    try {
      const previousStateId = incident.state_id;
      const response = await changeIncidentState(incident.id, {
        state_id: nextStateId,
        comment: comment || undefined,
      });

      const updated = response?.data || {};
      incident.state_id = updated.state_id ?? incident.state_id;
      if (updated.state) {
        incident.state = updated.state;
      } else {
        const stateLabel = select.options[select.selectedIndex]?.textContent?.trim() || incident.state?.name || '';
        incident.state = {
          ...(incident.state || {}),
          id: nextStateId,
          name: stateLabel,
        };
      }

      incident.history = [
        {
          id: Date.now(),
          previous_state_id: previousStateId,
          previous_state_name: null,
          new_state_id: nextStateId,
          new_state_name: incident.state?.name,
          user_id: incident.assignee_user_id || incident.reporter_user_id || 0,
          comment: comment || null,
          created_at: new Date().toISOString(),
          user: null,
        },
        ...(incident.history || []),
      ];

      document.getElementById('badgeEstadoDetalle').textContent = formatCatalogLabel(incident.state?.name || '-');
      document.getElementById('badgeEstadoDetalle').className = `badge estado-badge-grande ${getStateBadgeClass(incident.state?.name || '')}`;
      document.getElementById('timelineHistorial').innerHTML = renderHistory(incident.history);
      setText('historyMetric', incident.history.length);
      window.jQuery?.('#modalEstado').modal('hide');
      commentInput.value = '';
      showGlobalAlert('Estado actualizado correctamente.', 'success');
    } catch (error) {
      showGlobalAlert(error.message || 'No se pudo cambiar el estado.', 'danger');
    }
  });
}

function renderComments(comments) {
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

function renderAttachments(attachments) {
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

function renderHistory(history) {
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
        <span class="badge ${getStateBadgeClass(stateName)} float-right">${escapeHtml(stateName)}</span>
      </div>`;
  }).join('');
}

function renderError(container, message) {
  container.innerHTML = `
    <div class="alert alert-danger">
      <i class="fas fa-exclamation-circle mr-2"></i>${escapeHtml(message)}
      <a href="incidents.html" class="btn btn-sm btn-outline-danger ml-3">Volver</a>
    </div>`;
}

function calculateDays(value) {
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

  const normalizedPath = rawPath.replace(/^\/+/, '');
  const configuredBaseUrl = String(
    window.SGI_ATTACHMENTS_BASE_URL
      || window.SGI_STORAGE_BASE_URL
      || deriveStorageBaseUrl()
  ).trim();

  if (!configuredBaseUrl) {
    return '';
  }

  return `${configuredBaseUrl.replace(/\/+$/, '')}/${normalizedPath}`;
}

function deriveStorageBaseUrl() {
  if (typeof API_URL !== 'string' || !API_URL) return '';

  const normalizedApiUrl = API_URL.replace(/\/+$/, '');
  if (normalizedApiUrl.endsWith('/api')) {
    return `${normalizedApiUrl.slice(0, -4)}/storage`;
  }

  return `${window.location.origin}/storage`;
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

function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return 'Tamano no disponible';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasPermission(permissionCode) {
  const user = readCurrentUser();
  const expected = normalizeCode(permissionCode);

  if (!user) return false;

  if (Array.isArray(user.permissions) && user.permissions.some((permission) => normalizeCode(permission) === expected)) {
    return true;
  }

  return Array.isArray(user.roles) && user.roles.some((role) => {
    if (normalizeCode(role) === 'ADMIN') return true;
    return Array.isArray(role?.permissions)
      && role.permissions.some((permission) => normalizeCode(permission) === expected);
  });
}

function canManagePriority() {
  const user = readCurrentUser();

  if (!user || !Array.isArray(user.roles)) return false;

  return user.roles.some((role) => {
    const code = normalizeCode(role);
    return code === 'ADMIN' || code === 'SUPERVISOR';
  });
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
