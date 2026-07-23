import { escapeHtml, hidePageLoading, showPageLoading } from '../../incidents/presentation/incidents-ui.js?v=16'
import { fetchTeamOperators } from '../application/team-service.js?v=4'

const state = {
  operators: []
}

export function formatHours(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours < 0) {
    return '0 h 00 min'
  }

  return formatMinutesInHours(Math.round(hours * 60))
}

export function formatMinutesInHours(minutes) {
  const totalMinutes = Math.max(0, Math.round(Number(minutes) || 0))
  const hours = Math.floor(totalMinutes / 60)
  const remainingMinutes = String(totalMinutes % 60).padStart(2, '0')

  return `${hours} h ${remainingMinutes} min`
}

async function initMyTeamPage() {
  await globalThis.renderLayout('my-team')

  showPageLoading()

  try {
    const operators = await fetchTeamOperators()
    state.operators = operators

    await renderTeamPage(operators)
    setupEventListeners()
  } catch (error) {
    console.error('Error al cargar el equipo:', error)
    renderError()
  } finally {
    hidePageLoading()
  }
}

function renderSummaryCards(operators) {
  const container = document.getElementById('teamSummary')
  container.innerHTML = ''

  if (operators.length === 0) {
    return
  }

  const totalActive = operators.reduce((sum, op) => sum + op.active_incidents, 0)
  const totalWorkload = operators.reduce((sum, op) => sum + op.workload_points, 0)
  const totalCapacity = operators.reduce((sum, op) => sum + op.max_workload_points, 0)
  const progressPercent = totalCapacity > 0 ? Math.round((totalWorkload / totalCapacity) * 100) : 0

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
            <div class="small-box ${progressPercent >= 80 ? 'bg-danger' : (progressPercent >= 60 ? 'bg-warning' : 'bg-success')}">
                <div class="inner">
                    <h3>${progressPercent}%</h3>
                    <p>Capacidad utilizada</p>
                </div>
                <div class="icon"><i class="fas fa-chart-pie"></i></div>
            </div>
        </div>
    `
}

function renderOperatorCard(op) {
  const name = `${escapeHtml(op.first_name)} ${escapeHtml(op.last_name)}`
  const activeIncidents = op.active_incidents ?? 0
  const workloadPoints = op.workload_points ?? 0
  const maxWorkloadPoints = op.max_workload_points ?? 20
  const zoneName = op.territory ? escapeHtml(op.territory) : 'Sin zona asignada'
  const loadPercent = maxWorkloadPoints > 0 ? Math.round((workloadPoints / maxWorkloadPoints) * 100) : 0
  const visualPercent = Math.min(100, loadPercent)

  let loadBarClass = 'bg-success'
  let loadLabel = 'Baja'
  if (loadPercent >= 80) {
    loadBarClass = 'bg-danger'
    loadLabel = 'Crítica'
  } else if (loadPercent >= 60) {
    loadBarClass = 'bg-warning'
    loadLabel = 'Alta'
  } else if (loadPercent >= 30) {
    loadBarClass = 'bg-info'
    loadLabel = 'Moderada'
  }

  let incidentBarClass = 'bg-success'
  let incidentLabel = 'Baja'
  // Asumimos un máximo visual referencial de 10 incidencias para la barra
  const maxVisualIncidents = 10
  const incidentPercent = Math.min(100, Math.round((activeIncidents / maxVisualIncidents) * 100))

  if (activeIncidents >= 5) {
    incidentBarClass = 'bg-danger'
    incidentLabel = 'Crítica'
  } else if (activeIncidents >= 3) {
    incidentBarClass = 'bg-warning'
    incidentLabel = 'Alta'
  }

  return `
        <div class="col-lg-6 col-xl-4 mb-4">
            <div class="card card-outline card-primary h-100">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-user-circle text-primary mr-2"></i>${name}</h3>
                    <div class="card-tools">
                        <button class="btn btn-sm btn-outline-primary btn-download-report" data-id="${op.id}" title="Descargar reporte de trabajo">
                            <i class="fas fa-file-pdf mr-1"></i> Reporte
                        </button>
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
                    <p class="detalle-label mb-1">Incidencias activas</p>
                    <div class="mb-1 d-flex justify-content-between">
                        <span>${activeIncidents} tickets</span>
                        <span class="text-muted">${incidentLabel}</span>
                    </div>
                    <div class="progress progress-sm mb-3">
                        <div class="progress-bar ${incidentBarClass}" role="progressbar"
                            style="width: ${incidentPercent}%;" aria-valuenow="${incidentPercent}" aria-valuemin="0" aria-valuemax="100">
                        </div>
                    </div>
                    
                    <p class="detalle-label mb-1">Carga laboral</p>
                    <div class="mb-1 d-flex justify-content-between">
                        <span>${workloadPoints} / ${maxWorkloadPoints} pts</span>
                        <span class="text-muted">${loadLabel}</span>
                    </div>
                    <div class="progress progress-sm">
                        <div class="progress-bar ${loadBarClass}" role="progressbar"
                            style="width: ${visualPercent}%;" aria-valuenow="${loadPercent}" aria-valuemin="0" aria-valuemax="100">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
}

function renderOperatorCards(operators) {
  const container = document.getElementById('teamCards')
  container.innerHTML = operators.map(renderOperatorCard).join('')

  const emptyEl = document.getElementById('teamEmpty')
  if (operators.length === 0) {
    emptyEl.classList.remove('d-none')
  } else {
    emptyEl.classList.add('d-none')
  }
}

async function renderTeamPage(operators) {
  renderSummaryCards(operators)
  renderOperatorCards(operators)
}

function renderError() {
  const container = document.getElementById('teamCards')
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
    `
  document.getElementById('teamSummary').innerHTML = ''
}

function setupEventListeners() {
  document.getElementById('teamCards').addEventListener('click', async e => {
    const btn = e.target.closest('.btn-download-report')
    if (btn) {
      const id = btn.getAttribute('data-id')
      await openPreviewModal(id)
    }
  })

  const btnDownload = document.getElementById('btnDownloadPreviewReport')

  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      // Mostrar modal de opciones de descarga
      $('#downloadOptionsModal').modal('show')
    })
  }

  const btnConfirmDownload = document.getElementById('btnConfirmDownload')
  if (btnConfirmDownload) {
    btnConfirmDownload.addEventListener('click', async () => {
      const id = document.getElementById('btnDownloadPreviewReport').getAttribute('data-id')
      const limitSelect = document.getElementById('downloadLimitSelect')
      const limit = limitSelect ? limitSelect.value : '50'

      if (id) {
        // Cerramos el modal de opciones
        $('#downloadOptionsModal').modal('hide')

        const downloadBtn = document.getElementById('btnDownloadPreviewReport')
        await downloadWorkReport(id, downloadBtn, limit)
      }
    })
  }
}

async function openPreviewModal(id) {
  // Show modal in loading state
  $('#reportPreviewModal').modal('show')
  document.getElementById('reportPreviewLoading').classList.remove('d-none')
  document.getElementById('reportPreviewContent').classList.add('d-none')

  const actionsContainer = document.getElementById('reportActionsContainer')
  if (actionsContainer) {
    actionsContainer.classList.add('d-none')
  }

  try {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
    const baseUrl = window.SGI_API_URL || '/api'

    // Vista previa siempre pide 50 por defecto para velocidad
    const response = await fetch(`${baseUrl}/team/operators/${id}/work-report-data?limit=50`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Error al cargar la vista previa del reporte')
    }

    const data = await response.json()

    // Populate modal data
    document.getElementById('previewOpName').textContent = `${data.operator.first_name} ${data.operator.last_name}`
    document.getElementById('previewOpEmail').textContent = data.operator.email
    document.getElementById('previewOpId').textContent = `ID #${String(data.operator.id).padStart(5, '0')}`

    document.getElementById('previewCurrentWorkload').textContent = `${data.metrics.current_workload} pts`
    document.getElementById('previewTotalAssigned').textContent = data.metrics.total_assigned
    document.getElementById('previewTotalResolved').textContent = data.metrics.total_resolved
    document.getElementById('previewAvgHours').textContent = formatHours(data.metrics.avg_response_hours)
    document.getElementById('previewReopenRate').textContent = data.metrics.reopen_rate

    // Populate table
    const tbody = document.getElementById('previewTicketsTable')
    tbody.innerHTML = ''

    if (!data.recent_incidents || data.recent_incidents.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3 team-preview-empty-state">No hay intervenciones registradas.</td></tr>'
    } else {
      data.recent_incidents.forEach(item => {
        const tr = document.createElement('tr')
        const inc = item.incident
        const title = inc.title ? escapeHtml(inc.title) : '-'

        let cyclesHtml = ''
        if (item.history && item.history.length > 0) {
          const filteredHistory = item.history.filter(h => {
            if (!h.state_name) {
              return false
            }

            const state = h.state_name.toUpperCase()
            return state.includes('PROGRESO') || state.includes('PROCESO')
          })

          if (filteredHistory.length > 0) {
            cyclesHtml = '<div class="mt-1" style="font-size: 0.75rem;">'
            filteredHistory.forEach((h, idx) => {
              const dateStr = h.assignment_date ? h.assignment_date.slice(0, 16).replace('T', ' ') : ''
              let endStr = ''

              if (h.assignment_date && h.duration_minutes !== null) {
                const startDate = new Date(h.assignment_date)
                startDate.setMinutes(startDate.getMinutes() + h.duration_minutes)
                const day = String(startDate.getDate()).padStart(2, '0')
                const mon = String(startDate.getMonth() + 1).padStart(2, '0')
                const yr = startDate.getFullYear()
                const hr = String(startDate.getHours()).padStart(2, '0')
                const min = String(startDate.getMinutes()).padStart(2, '0')
                endStr = ` \nFinalizó: ${day}/${mon}/${yr} ${hr}:${min}`
              }

              const durationLabel = (h.duration_minutes !== undefined && h.duration_minutes !== null) ?
                formatMinutesInHours(h.duration_minutes) :
                ''
              const dur = durationLabel ? ` \nTiempo: ${durationLabel}` : ''
              const by = h.assigned_by_name ? ` \nPor: ${h.assigned_by_name}` : ''

              cyclesHtml += `<span class="badge badge-light border mr-1 mb-1" title="Inició: ${dateStr}${endStr}${dur}${by}">#${idx + 1} ${h.state_name} - ${h.priority_name}${durationLabel ? ` · ${durationLabel}` : ''}</span>`
            })

            if (inc.state && inc.state.is_final_state) {
              const closedDate = inc.updated_at ? inc.updated_at.slice(0, 16).replace('T', ' ') : ''
              const closedIdx = filteredHistory.length + 1
              const stateName = inc.state.name ? inc.state.name.toUpperCase() : 'CERRADA'
              cyclesHtml += `<span class="badge badge-success border mr-1 mb-1" title="Fecha de cierre: ${closedDate} \n* La incidencia ya no admite actualizaciones">${stateName} (DEFINITIVO)</span>`
            }

            cyclesHtml += '</div>'
          }
        }

        const titleHtml = `<td data-label="Título">
                    <div class="text-truncate" style="max-width: 250px;" title="${title}">
                        ${title}
                        ${item.reopen_count > 0 ? `<span class="badge badge-danger ml-1" title="Reasignado ${item.reopen_count} veces tras resolverse">Reabierto: ${item.reopen_count}</span>` : ''}
                    </div>
                    ${cyclesHtml}
                </td>`

        const catName = inc.category ? escapeHtml(inc.category.name) : '-'
        const stateColor = inc.state ? escapeHtml(inc.state.color) : '#95a5a6'
        const stateName = inc.state ? escapeHtml(inc.state.name).toUpperCase() : 'DESCONOCIDO'
        const terrName = inc.territorial_unit ? escapeHtml(inc.territorial_unit.name) : 'No especificada'

        // Format date manually if it's ISO, or just show it as is
        let dateStr = '-'
        if (item.latest_assignment_date) {
          const d = new Date(item.latest_assignment_date)
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0')
            const mon = String(d.getMonth() + 1).padStart(2, '0')
            const yr = d.getFullYear()
            const hr = String(d.getHours()).padStart(2, '0')
            const min = String(d.getMinutes()).padStart(2, '0')
            dateStr = `${day}/${mon}/${yr} ${hr}:${min}`
          }
        }

        tr.innerHTML = `
                    <td data-label="Ticket"><strong>#${String(inc.id).padStart(6, '0')}</strong></td>
                    ${titleHtml}
                    <td data-label="Categoría">${catName}</td>
                    <td data-label="Estado"><span style="color: ${stateColor}; font-weight: bold;">${stateName}</span></td>
                    <td data-label="Territorio">${terrName}</td>
                    <td data-label="Asignación">${dateStr}</td>
                `
        tbody.appendChild(tr)
      })
    }

    document.getElementById('btnDownloadPreviewReport').setAttribute('data-id', id)

    document.getElementById('reportPreviewLoading').classList.add('d-none')
    document.getElementById('reportPreviewContent').classList.remove('d-none')
    if (actionsContainer) {
      actionsContainer.classList.remove('d-none')
    }
  } catch (error) {
    console.error('Error al obtener datos de preview:', error)
    $('#reportPreviewModal').modal('hide')
    alert('No se pudo cargar la vista previa del reporte.')
  }
}

async function downloadWorkReport(id, btn, limit = '50') {
  try {
    btn.disabled = true
    const icon = btn.querySelector('i')
    if (icon) {
      icon.className = 'fas fa-spinner fa-spin mr-1'
    }

    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
    const baseUrl = window.SGI_API_URL || '/api'

    const response = await fetch(`${baseUrl}/team/operators/${id}/work-report?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Error al generar el reporte')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_operador_${id}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error al descargar el PDF', error)
    alert('No se pudo descargar el reporte.')
  } finally {
    btn.disabled = false
    const icon = btn.querySelector('i')
    if (icon) {
      icon.className = 'fas fa-download mr-1'
    }
  }
}

document.addEventListener('DOMContentLoaded', initMyTeamPage)
