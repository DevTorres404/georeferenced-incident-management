import { escapeHtml, hidePageLoading, showPageLoading } from '../../incidents/presentation/incidents-ui.js?v=16';
import { fetchTeamOperators } from '../application/team-service.js?v=4';

const state = {
    operators: [],
};

async function initMyTeamPage() {
    await globalThis.renderLayout('my-team');

    showPageLoading();

    try {
        const operators = await fetchTeamOperators();
        state.operators = operators;

        await renderTeamPage(operators);
    } catch (err) {
        console.error('Error al cargar el equipo:', err);
        renderError();
    } finally {
        hidePageLoading();
    }
}

function renderSummaryCards(operators) {
    const container = document.getElementById('teamSummary');
    container.innerHTML = '';

    if (operators.length === 0) {
        return;
    }

    const totalActive = operators.reduce((sum, op) => sum + op.active_incidents, 0);
    const totalWorkload = operators.reduce((sum, op) => sum + op.workload_points, 0);
    const totalCapacity = operators.reduce((sum, op) => sum + op.max_workload_points, 0);
    const progressPercent = totalCapacity > 0 ? Math.round((totalWorkload / totalCapacity) * 100) : 0;

    container.innerHTML = `
        <div class="col-lg-3 col-6">
            <div class="small-box bg-info">
                <div class="inner">
                    <h3>${operators.length}</h3>
                    <p>Operadores asignados</p>
                </div>
                <div class="icon"><i class="fas fa-user-friends"></i></div>
            </div>
        </div>
        <div class="col-lg-3 col-6">
            <div class="small-box bg-danger">
                <div class="inner">
                    <h3>${totalActive}</h3>
                    <p>Incidencias activas</p>
                </div>
                <div class="icon"><i class="fas fa-exclamation-triangle"></i></div>
            </div>
        </div>
        <div class="col-lg-3 col-6">
            <div class="small-box bg-warning">
                <div class="inner">
                    <h3>${totalWorkload} / ${totalCapacity}</h3>
                    <p>Puntos de carga</p>
                </div>
                <div class="icon"><i class="fas fa-tachometer-alt"></i></div>
            </div>
        </div>
        <div class="col-lg-3 col-6">
            <div class="small-box ${progressPercent >= 80 ? 'bg-danger' : progressPercent >= 60 ? 'bg-warning' : 'bg-success'}">
                <div class="inner">
                    <h3>${progressPercent}%</h3>
                    <p>Capacidad utilizada</p>
                </div>
                <div class="icon"><i class="fas fa-chart-pie"></i></div>
            </div>
        </div>
    `;
}

function renderOperatorCard(op) {
    const name = `${escapeHtml(op.first_name)} ${escapeHtml(op.last_name)}`;
    const activeIncidents = op.active_incidents ?? 0;
    const workloadPoints = op.workload_points ?? 0;
    const maxWorkloadPoints = op.max_workload_points ?? 20;
    const zoneName = op.territory ? escapeHtml(op.territory) : 'Sin zona asignada';
    const loadPercent = maxWorkloadPoints > 0 ? Math.round((workloadPoints / maxWorkloadPoints) * 100) : 0;

    let loadBarClass = 'bg-success';
    let loadLabel = 'Baja';
    if (loadPercent >= 80) {
        loadBarClass = 'bg-danger';
        loadLabel = 'Crítica';
    } else if (loadPercent >= 60) {
        loadBarClass = 'bg-warning';
        loadLabel = 'Alta';
    } else if (loadPercent >= 30) {
        loadBarClass = 'bg-info';
        loadLabel = 'Moderada';
    }

    let incidentBadgeClass = 'badge-success';
    if (activeIncidents >= 5) {
        incidentBadgeClass = 'badge-danger';
    } else if (activeIncidents >= 3) {
        incidentBadgeClass = 'badge-warning';
    }

    return `
        <div class="col-lg-6 col-xl-4 mb-4">
            <div class="card card-outline card-primary h-100">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-user-circle text-primary mr-2"></i>${name}</h3>
                    <div class="card-tools">
                        <span class="badge ${incidentBadgeClass} badge-pill" title="Incidencias activas">
                            <i class="fas fa-exclamation-circle mr-1"></i>${activeIncidents}
                        </span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-sm-6">
                            <p class="detalle-label">Correo</p>
                            <p>${escapeHtml(op.email)}</p>
                        </div>
                        <div class="col-sm-6">
                            <p class="detalle-label">Zona operativa</p>
                            <p><i class="fas fa-map-marker-alt text-muted mr-1"></i>${zoneName}</p>
                        </div>
                    </div>
                    <hr>
                    <p class="detalle-label">Carga laboral</p>
                    <div class="mb-1 d-flex justify-content-between">
                        <span>${workloadPoints} / ${maxWorkloadPoints} pts</span>
                        <span class="text-muted">${loadLabel}</span>
                    </div>
                    <div class="progress progress-sm">
                        <div class="progress-bar ${loadBarClass}" role="progressbar"
                            style="width: ${loadPercent}%;" aria-valuenow="${loadPercent}" aria-valuemin="0" aria-valuemax="100">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderOperatorCards(operators) {
    const container = document.getElementById('teamCards');
    container.innerHTML = operators.map(renderOperatorCard).join('');

    const emptyEl = document.getElementById('teamEmpty');
    if (operators.length === 0) {
        emptyEl.classList.remove('d-none');
    } else {
        emptyEl.classList.add('d-none');
    }
}

async function renderTeamPage(operators) {
    renderSummaryCards(operators);
    renderOperatorCards(operators);
}

function renderError() {
    const container = document.getElementById('teamCards');
    container.innerHTML = `
        <div class="col-12">
            <div class="card card-outline card-danger">
                <div class="card-body text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <h5>Error al cargar el equipo</h5>
                    <p class="text-muted">No se pudo obtener la información de tu equipo. Intenta de nuevo.</p>
                    <button class="btn btn-primary" onclick="location.reload()">
                        <i class="fas fa-redo mr-1"></i> Reintentar
                    </button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('teamSummary').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', initMyTeamPage);
