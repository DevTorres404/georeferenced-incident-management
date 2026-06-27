import { addIncidentComment, changeIncidentState, getIncident, listStates } from '../application/incidents-service.js?v=14';
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

async function initIncidentDetailPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('incidents');
  }

  const incidentId = new URLSearchParams(window.location.search).get('id');
  const container = document.getElementById('contenidoDetalle');

  if (!incidentId) {
    renderError(container, 'No se especificó el identificador de incidencia.');
    return;
  }

  try {
    const [{ data: incident }, statesResponse] = await Promise.all([
      getIncident(incidentId),
      listStates(),
    ]);

    if (!incident) {
      renderError(container, 'No se encontró la incidencia solicitada.');
      return;
    }

    setText('breadcrumbId', incident.code || `#${incident.id}`);
    setHtml('pageTitle', `<i class="fas fa-file-alt text-primary mr-2"></i>Detalle - ${escapeHtml(incident.code || `#${incident.id}`)}`);

    renderIncidentDetail(container, incident, Array.isArray(statesResponse?.data) ? statesResponse.data : []);
  } catch (error) {
    renderError(container, error.message || 'No se pudo cargar el detalle de la incidencia.');
  }
}

function renderIncidentDetail(container, incident, states) {
  const stateName = formatCatalogLabel(incident.state?.name || '-');
  const priorityName = formatCatalogLabel(incident.priority?.name || '-');
  const categoryName = formatCatalogLabel(incident.category?.name || '-');
  const subcategoryName = formatCatalogLabel(incident.subcategory?.name || '-');
  const cityName = formatCatalogLabel(incident.city?.name || '-');
  const provinceName = formatCatalogLabel(incident.city?.province?.name || '-');
  const countryName = formatCatalogLabel(incident.city?.province?.country?.name || '-');
  const comments = Array.isArray(incident.comments) ? incident.comments : [];
  const history = Array.isArray(incident.history) ? incident.history : [];

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
          <button class="btn btn-sm btn-warning mr-1" id="btnCambiarEstado">
            <i class="fas fa-exchange-alt mr-1"></i>Cambiar Estado
          </button>
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
                <p><span class="badge ${getPriorityBadgeClass(priorityName)} px-2 py-1">${escapeHtml(priorityName)}</span></p>

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
            <h3 class="card-title"><i class="fas fa-map-marker-alt mr-2"></i>Ubicación Geográfica</h3>
          </div>
          <div class="card-body">
            <div class="row mb-3">
              <div class="col-sm-4 text-center">
                <p class="detalle-label">País</p>
                <p class="font-weight-bold">${escapeHtml(countryName)}</p>
              </div>
              <div class="col-sm-4 text-center">
                <p class="detalle-label">Provincia</p>
                <p class="font-weight-bold">${escapeHtml(provinceName)}</p>
              </div>
              <div class="col-sm-4 text-center">
                <p class="detalle-label">Ciudad</p>
                <p class="font-weight-bold">${escapeHtml(cityName)}</p>
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
            <div class="map-placeholder" style="min-height:220px;">
              <i class="fas fa-map-pin"></i>
              <strong>${escapeHtml(cityName)}, ${escapeHtml(provinceName)}</strong>
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
            <div class="info-box bg-light mb-0">
              <span class="info-box-icon text-success"><i class="fas fa-calendar-check"></i></span>
              <div class="info-box-content">
                <span class="info-box-text text-muted">Días desde registro</span>
                <span class="info-box-number text-dark">${String(calculateDays(incident.created_at))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  hydrateStateModal(incident, states);
  bindCommentForm(incident);
  bindStateChangeForm(incident, states);
}

function hydrateStateModal(incident, states) {
  const select = document.getElementById('nuevoEstado');
  if (!select) return;

  select.innerHTML = states.map((state) => `
    <option value="${state.id}" ${Number(state.id) === Number(incident.state_id) ? 'selected' : ''}>
      ${escapeHtml(formatCatalogLabel(state.name))}
    </option>`).join('');
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

      const commentData = response?.data;
      incident.comments = [...(incident.comments || []), commentData];
      document.getElementById('listadoComentarios').innerHTML = renderComments(incident.comments);
      setText('commentsCount', incident.comments.length);
      setText('commentsMetric', incident.comments.length);
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
      showGlobalAlert('Seleccione un estado válido.', 'warning');
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
