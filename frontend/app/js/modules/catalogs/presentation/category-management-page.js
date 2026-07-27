import { request, extractErrorMessage } from '../../../infrastructure/backend-client.js?v=20'
import { escapeHtml } from '../../../shared/sanitizer.js?v=20'
import {
  initializeCategoryIconPicker,
  setCategoryIconPickerValue
} from '../../../shared/category-icon-picker.js?v=1'

let categoriesData = []
let subcategoriesData = []
let requestsData = []

function normalizeCatalogName(value = '') {
  return String(value).trim().replace(/\s+/g, ' ')
}

function normalizeSearchText(value = '') {
  return normalizeCatalogName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLocaleLowerCase('es')
}

function updateSearchSummary(elementId, visibleCount, totalCount, label) {
  const summary = document.getElementById(elementId)
  if (!summary) {
    return
  }

  summary.textContent = `Mostrando ${visibleCount} de ${totalCount} ${label}.`
}

function catalogNamesMatch(first, second) {
  return normalizeCatalogName(first).localeCompare(
    normalizeCatalogName(second),
    'es',
    { sensitivity: 'base' }
  ) === 0
}

function hasDuplicateCategory(name, excludeId = null) {
  return categoriesData.some(category => {
    if (excludeId && String(category.id) === String(excludeId)) {
      return false
    }

    return catalogNamesMatch(category.name, name)
  })
}

function hasDuplicateSubcategory(categoryId, name, excludeId = null) {
  return subcategoriesData.some(subcategory => {
    if (excludeId && String(subcategory.id) === String(excludeId)) {
      return false
    }

    const parentId = subcategory.category_id ?? subcategory.categoryId
    return String(parentId) === String(categoryId) && catalogNamesMatch(subcategory.name, name)
  })
}

function validateForm(form) {
  if (!form || form.checkValidity()) {
    return true
  }

  form.reportValidity()
  return false
}

function showGlobalAlert(message, type = 'success') {
  const alertDiv = document.getElementById('alertaGlobal')
  if (!alertDiv) {
    if (globalThis.showGlobalAlert) {
      globalThis.showGlobalAlert(message, type)
    }

    return
  }

  alertDiv.className = `alert alert-${type} alert-dismissible fade show`
  alertDiv.innerHTML = `
    ${escapeHtml(message)}
    <button type="button" class="close" data-dismiss="alert" aria-label="Cerrar">
      <span aria-hidden="true">&times;</span>
    </button>
  `
  alertDiv.classList.remove('d-none')

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function loadData() {
  renderCatalogLoadingState()

  try {
    const [catResponse, subResponse, reqResponse] = await Promise.all([
      request('/admin/catalogs/categories?per_page=100', { noCache: true }),
      request('/admin/catalogs/subcategories?per_page=100', { noCache: true }),
      request('/admin/catalogs/category-requests', { noCache: true })
    ])

    categoriesData = Array.isArray(catResponse?.data) ? catResponse.data : (catResponse?.data?.data || [])
    subcategoriesData = Array.isArray(subResponse?.data) ? subResponse.data : (subResponse?.data?.data || [])
    requestsData = Array.isArray(reqResponse?.data) ? reqResponse.data : (reqResponse?.data?.data || [])

    updateRequestsBadge()
    renderCategoriesTable()
    populateCategoryFilter()
    renderSubcategoriesTable()
    renderRequestsTable()
  } catch (error) {
    const msg = extractErrorMessage(error, 'No se pudieron cargar los catálogos.')
    renderCatalogLoadError()
    showGlobalAlert(msg, 'danger')
  }
}

function renderCatalogLoadingState() {
  setTableState('bodyCategorias', 7, 'Cargando categorías...')
  setTableState('bodySubcategorias', 5, 'Cargando subtipos...')
  setTableState('bodyRequests', 6, 'Cargando solicitudes...')
}

function renderCatalogLoadError() {
  setTableState('bodyCategorias', 7, 'No se pudieron cargar las categorías. Recarga la página para intentarlo nuevamente.', true)
  setTableState('bodySubcategorias', 5, 'No se pudieron cargar los subtipos.', true)
  setTableState('bodyRequests', 6, 'No se pudieron cargar las solicitudes pendientes.', true)
}

function setTableState(bodyId, colspan, message, isError = false) {
  const body = document.getElementById(bodyId)
  if (!body) {
    return
  }

  body.innerHTML = `
    <tr>
      <td colspan="${colspan}" class="text-center py-4 ${isError ? 'text-danger' : 'text-muted'}">
        ${isError ? '<i class="fas fa-exclamation-triangle mr-1"></i>' : ''}
        ${escapeHtml(message)}
      </td>
    </tr>
  `
}

function renderCategoriesTable() {
  const tbody = document.getElementById('bodyCategorias')
  if (!tbody) {
    return
  }

  if (categoriesData.length === 0) {
    updateSearchSummary('categorySearchSummary', 0, 0, 'categorías')
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No existen categorías registradas.</td></tr>'
    return
  }

  const searchTerm = normalizeSearchText(document.getElementById('categorySearch')?.value)
  let filteredCategories = categoriesData
  if (searchTerm) {
    filteredCategories = categoriesData.filter(category => normalizeSearchText([
      category.name,
      category.description,
      category.is_active ? 'activa' : 'inactiva'
    ].filter(Boolean).join(' ')).includes(searchTerm))
  }

  updateSearchSummary(
    'categorySearchSummary',
    filteredCategories.length,
    categoriesData.length,
    'categorías'
  )

  if (filteredCategories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No se encontraron categorías que coincidan con la búsqueda.</td></tr>'
    return
  }

  tbody.innerHTML = filteredCategories.map(cat => {
    const iconClass = cat.icon ? escapeHtml(cat.icon) : 'fa-tags'
    const colorHex = cat.color ? escapeHtml(cat.color) : '#007bff'
    const isActive = Boolean(cat.is_active)
    const subCount = subcategoriesData.filter(s => Number(s.category_id ?? s.categoryId) === Number(cat.id)).length

    return `
      <tr>
        <td class="text-center align-middle">
          <span class="badge p-2" style="background-color: ${colorHex}; color: #fff;">
            <i class="fas ${iconClass}"></i>
          </span>
        </td>
        <td class="align-middle font-weight-bold">${escapeHtml(cat.name)}</td>
        <td class="align-middle text-muted small">${escapeHtml(cat.description || 'Sin descripción')}</td>
        <td class="text-center align-middle">
          <span class="badge border" style="background-color: ${colorHex}; color: #fff; font-family: monospace;">
            ${colorHex}
          </span>
        </td>
        <td class="text-center align-middle">
          <span class="badge badge-info px-2 py-1">${subCount} subtipos</span>
        </td>
        <td class="text-center align-middle">
          <span class="badge ${isActive ? 'badge-success' : 'badge-secondary'} px-2 py-1">
            ${isActive ? 'Activa' : 'Inactiva'}
          </span>
        </td>
        <td class="text-center align-middle">
          <button type="button" class="btn btn-xs btn-outline-primary mr-1 btn-edit-cat" data-id="${cat.id}" title="Editar categoría">
            <i class="fas fa-edit"></i>
          </button>
          <button type="button" class="btn btn-xs ${isActive ? 'btn-outline-warning' : 'btn-outline-success'} btn-toggle-cat" data-id="${cat.id}" data-active="${isActive ? '0' : '1'}" title="${isActive ? 'Desactivar' : 'Activar'}">
            <i class="fas ${isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
        </td>
      </tr>
    `
  }).join('')

  bindCategoryActions()
}

function populateCategoryFilter() {
  const selectFilter = document.getElementById('filtroCatPadre')
  const selectModal = document.getElementById('subCatParentId')

  if (selectFilter) {
    const currentVal = selectFilter.value
    selectFilter.innerHTML = `<option value="">Todas las categorías</option>${
      categoriesData.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}`
    selectFilter.value = currentVal
  }

  if (selectModal) {
    selectModal.innerHTML = `<option value="">Seleccione una categoría</option>${
      categoriesData.filter(c => c.is_active).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}`
  }
}

function renderSubcategoriesTable() {
  const tbody = document.getElementById('bodySubcategorias')
  if (!tbody) {
    return
  }

  const filterCatId = document.getElementById('filtroCatPadre')?.value || ''
  const searchTerm = normalizeSearchText(document.getElementById('subcategorySearch')?.value)
  let categoryFiltered = subcategoriesData

  if (filterCatId) {
    categoryFiltered = subcategoriesData.filter(s => String(s.category_id ?? s.categoryId) === String(filterCatId))
  }

  let filteredSubcategories = categoryFiltered
  if (searchTerm) {
    filteredSubcategories = categoryFiltered.filter(subcategory => {
      const categoryId = subcategory.category_id ?? subcategory.categoryId
      const parentCategory = categoriesData.find(category => Number(category.id) === Number(categoryId))
      const isActive = Boolean(subcategory.is_active ?? subcategory.isActive)
      const searchableText = [
        subcategory.name,
        subcategory.description,
        parentCategory?.name,
        isActive ? 'activo' : 'inactivo'
      ].filter(Boolean).join(' ')

      return normalizeSearchText(searchableText).includes(searchTerm)
    })
  }

  updateSearchSummary(
    'subcategorySearchSummary',
    filteredSubcategories.length,
    categoryFiltered.length,
    'subtipos'
  )

  if (filteredSubcategories.length === 0) {
    let message = 'No se encontraron subtipos que coincidan con la búsqueda o categoría seleccionada.'
    if (subcategoriesData.length === 0) {
      message = 'No existen subtipos registrados.'
    }

    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">${message}</td></tr>`
    return
  }

  tbody.innerHTML = filteredSubcategories.map(sub => {
    const catId = sub.category_id ?? sub.categoryId
    const parentCat = categoriesData.find(c => Number(c.id) === Number(catId))
    const parentName = parentCat ? parentCat.name : `Categoría ID: ${catId}`
    const parentColor = parentCat?.color || '#007bff'
    const parentIcon = parentCat?.icon || 'fa-tags'
    const isActive = Boolean(sub.is_active ?? sub.isActive)

    return `
      <tr>
        <td class="align-middle">
          <span class="badge mr-1" style="background-color: ${escapeHtml(parentColor)}; color: #fff;">
            <i class="fas ${escapeHtml(parentIcon)} mr-1"></i>${escapeHtml(parentName)}
          </span>
        </td>
        <td class="align-middle font-weight-bold">${escapeHtml(sub.name)}</td>
        <td class="align-middle text-muted small">${escapeHtml(sub.description || 'Sin descripción')}</td>
        <td class="text-center align-middle">
          <span class="badge ${isActive ? 'badge-success' : 'badge-secondary'} px-2 py-1">
            ${isActive ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td class="text-center align-middle">
          <button type="button" class="btn btn-xs btn-outline-primary mr-1 btn-edit-sub" data-id="${sub.id}" title="Editar subtipo">
            <i class="fas fa-edit"></i>
          </button>
          <button type="button" class="btn btn-xs ${isActive ? 'btn-outline-warning' : 'btn-outline-success'} btn-toggle-sub" data-id="${sub.id}" data-active="${isActive ? '0' : '1'}" title="${isActive ? 'Desactivar' : 'Activar'}">
            <i class="fas ${isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
        </td>
      </tr>
    `
  }).join('')

  bindSubcategoryActions()
}

function updateRequestsBadge() {
  const badge = document.getElementById('requestsBadgeCount')
  if (!badge) {
    return
  }

  if (requestsData.length > 0) {
    badge.textContent = requestsData.length
    badge.classList.remove('d-none')
  } else {
    badge.classList.add('d-none')
  }
}

function renderRequestsTable() {
  const tbody = document.getElementById('bodyRequests')
  if (!tbody) {
    return
  }

  if (requestsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No hay solicitudes pendientes.</td></tr>'
    return
  }

  tbody.innerHTML = requestsData.map(req => {
    const dateStr = new Date(req.created_at || req.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const userStr = escapeHtml(req.requestedByName || 'Usuario desconocido')
    const categoryName = req.suggestedCategoryName || req.suggested_name || ''
    const subcategoryName = req.suggestedSubcategoryName || ''
    const incidentCode = req.incidentCode || `INC-${req.incidentId}`

    return `
      <tr>
        <td class="align-middle text-muted small">${dateStr}</td>
        <td class="align-middle">
          <a href="incident-detail.html?id=${encodeURIComponent(req.incidentId)}" class="font-weight-bold">
            ${escapeHtml(incidentCode)}
          </a>
        </td>
        <td class="align-middle font-weight-bold">${userStr}</td>
        <td class="align-middle">
          <span class="d-block font-weight-bold">${escapeHtml(categoryName)}</span>
          <small class="text-muted"><i class="fas fa-level-down-alt mr-1"></i>${escapeHtml(subcategoryName)}</small>
        </td>
        <td class="align-middle small">${escapeHtml(req.reason)}</td>
        <td class="text-center align-middle">
          <button type="button" class="btn btn-xs btn-outline-success mr-1 btn-approve-req" data-id="${req.id}" title="Aprobar">
            <i class="fas fa-check"></i>
          </button>
          <button type="button" class="btn btn-xs btn-outline-danger btn-reject-req" data-id="${req.id}" title="Rechazar">
            <i class="fas fa-times"></i>
          </button>
        </td>
      </tr>
    `
  }).join('')

  bindRequestActions()
}

function bindRequestActions() {
  document.querySelectorAll('.btn-approve-req').forEach(btn => {
    btn.addEventListener('click', () => {
      const req = requestsData.find(r => String(r.id) === String(btn.dataset.id))
      if (req) {
        openResolveRequestModal(req, 'approve')
      }
    })
  })

  document.querySelectorAll('.btn-reject-req').forEach(btn => {
    btn.addEventListener('click', () => {
      const req = requestsData.find(r => String(r.id) === String(btn.dataset.id))
      if (req) {
        openResolveRequestModal(req, 'reject')
      }
    })
  })
}

function openResolveRequestModal(req, action) {
  const reqId = document.getElementById('reqId')
  const requestSummary = document.getElementById('reqRequestSummary')
  const categoryName = document.getElementById('reqCategoryName')
  const subcategoryName = document.getElementById('reqSubcategoryName')
  const categoryDescription = document.getElementById('reqCategoryDescription')
  const subcategoryDescription = document.getElementById('reqSubcategoryDescription')
  const categoryColor = document.getElementById('reqCategoryColor')
  const approvalComment = document.getElementById('reqApprovalComment')
  const approvalSections = [
    document.getElementById('reqApprovalFields'),
    document.getElementById('reqApprovalDescriptions'),
    document.getElementById('reqApprovalAppearance'),
    document.getElementById('reqApprovalCommentGroup')
  ]
  const reqRejectCommentGroup = document.getElementById('reqRejectCommentGroup')
  const reqAdminComment = document.getElementById('reqAdminComment')
  const reqApproveInfo = document.getElementById('reqApproveInfo')
  const btnApproveRequest = document.getElementById('btnApproveRequest')
  const btnRejectRequest = document.getElementById('btnRejectRequest')
  const btnConfirmRejectRequest = document.getElementById('btnConfirmRejectRequest')

  reqId.value = req.id
  const suggestedCategoryName = req.suggestedCategoryName || req.suggested_name || ''
  const suggestedSubcategoryName = req.suggestedSubcategoryName || ''
  requestSummary.innerHTML = `
    <div class="font-weight-bold mb-1">${escapeHtml(req.incidentCode || `INC-${req.incidentId}`)}</div>
    <div><strong>Propuesta:</strong> ${escapeHtml(suggestedCategoryName)} / ${escapeHtml(suggestedSubcategoryName)}</div>
    <div class="mt-1"><strong>Justificación:</strong> ${escapeHtml(req.reason)}</div>
  `
  categoryName.value = suggestedCategoryName
  subcategoryName.value = suggestedSubcategoryName
  categoryDescription.value = req.suggestedCategoryDescription || ''
  subcategoryDescription.value = req.reason
  setCategoryIconPickerValue('reqCategoryIcon', req.suggestedIcon || 'fa-tags')
  categoryColor.value = getUniqueColor()
  document.getElementById('reqCategoryColorValue').textContent = categoryColor.value.toUpperCase()
  approvalComment.value = ''

  if (action === 'approve') {
    approvalSections.forEach(section => section?.classList.remove('d-none'))
    reqRejectCommentGroup.style.display = 'none'
    reqAdminComment.removeAttribute('required')
    reqApproveInfo.classList.remove('d-none')
    btnApproveRequest.classList.remove('d-none')
    btnRejectRequest.classList.add('d-none')
    btnConfirmRejectRequest.classList.add('d-none')
  } else {
    approvalSections.forEach(section => section?.classList.add('d-none'))
    reqRejectCommentGroup.style.display = 'block'
    reqAdminComment.setAttribute('required', 'true')
    reqAdminComment.value = ''
    reqApproveInfo.classList.add('d-none')
    btnApproveRequest.classList.add('d-none')
    btnRejectRequest.classList.add('d-none')
    btnConfirmRejectRequest.classList.remove('d-none')
  }

  globalThis.jQuery?.('#modalResolveRequest').modal('show')
}

function bindCategoryActions() {
  document.querySelectorAll('.btn-edit-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = categoriesData.find(c => String(c.id) === String(btn.dataset.id))
      if (cat) {
        openCategoryModal(cat)
      }
    })
  })

  document.querySelectorAll('.btn-toggle-cat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id } = btn.dataset
      const newActive = btn.dataset.active === '1'
      const cat = categoriesData.find(c => String(c.id) === String(id))

      try {
        await request(`/admin/catalogs/categories/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: cat.name,
            description: cat.description || '',
            icon: cat.icon || 'fa-tags',
            color: cat.color || '#007bff',
            is_active: newActive
          })
        })
        showGlobalAlert(`Categoría ${newActive ? 'activada' : 'desactivada'} correctamente.`, 'success')
        await loadData()
      } catch (error) {
        showGlobalAlert(extractErrorMessage(error, 'No se pudo actualizar el estado de la categoría.'), 'danger')
      }
    })
  })

}

function bindSubcategoryActions() {
  document.querySelectorAll('.btn-edit-sub').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = subcategoriesData.find(s => String(s.id) === String(btn.dataset.id))
      if (sub) {
        openSubcategoryModal(sub)
      }
    })
  })

  document.querySelectorAll('.btn-toggle-sub').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id } = btn.dataset
      const newActive = btn.dataset.active === '1'
      const sub = subcategoriesData.find(s => String(s.id) === String(id))

      try {
        await request(`/admin/catalogs/subcategories/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            category_id: sub.category_id,
            name: sub.name,
            description: sub.description || '',
            is_active: newActive
          })
        })
        showGlobalAlert(`Subtipo ${newActive ? 'activado' : 'desactivado'} correctamente.`, 'success')
        await loadData()
      } catch (error) {
        showGlobalAlert(extractErrorMessage(error, 'No se pudo actualizar el estado del subtipo.'), 'danger')
      }
    })
  })

}

const PALETTE_COLORS = [
  '#007bff',
  '#28a745',
  '#dc3545',
  '#ffc107',
  '#17a2b8',
  '#6f42c1',
  '#fd7e14',
  '#e83e8c',
  '#20c997',
  '#6c757d',
  '#1e293b',
  '#0284c7'
]

function checkColorIsUsed(colorHex, excludeCatId = null) {
  if (!colorHex) {
    return false
  }

  const target = colorHex.toLowerCase()
  return categoriesData.some(c => {
    if (excludeCatId && String(c.id) === String(excludeCatId)) {
      return false
    }

    return c.color && c.color.toLowerCase() === target
  })
}

function getUniqueColor(excludeCatId = null) {
  const available = PALETTE_COLORS.find(hex => !checkColorIsUsed(hex, excludeCatId))
  if (available) {
    return available
  }

  // Si todos los presets están ocupados, generar uno aleatorio que no se repita
  for (let i = 0; i < 50; i++) {
    const randomHex = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
    if (!checkColorIsUsed(randomHex, excludeCatId)) {
      return randomHex
    }
  }

  return '#007bff'
}

function updateColorValidation() {
  const catId = document.getElementById('catId')?.value
  const colorHex = document.getElementById('catColor')?.value.trim()
  const catColorWarning = document.getElementById('catColorWarning')
  const catColorInput = document.getElementById('catColor')

  if (!colorHex) {
    return true
  }

  const isUsed = checkColorIsUsed(colorHex, catId)
  if (isUsed) {
    catColorWarning?.classList.remove('d-none')
    catColorInput?.classList.add('is-invalid')
  } else {
    catColorWarning?.classList.add('d-none')
    catColorInput?.classList.remove('is-invalid')
  }

  return !isUsed
}

function openCategoryModal(cat = null) {
  const modalLabel = document.getElementById('modalCategoriaLabel')
  const catId = document.getElementById('catId')
  const catNombre = document.getElementById('catNombre')
  const catDescripcion = document.getElementById('catDescripcion')
  const catIcono = document.getElementById('catIcono')
  const catColor = document.getElementById('catColor')
  const catColorPicker = document.getElementById('catColorPicker')
  const catIsActive = document.getElementById('catIsActive')
  const previewIcon = document.getElementById('previewCatIcon')

  if (cat) {
    if (modalLabel) {
      modalLabel.querySelector('span').textContent = 'Editar Categoría'
    }

    if (catId) {
      catId.value = cat.id
    }

    if (catNombre) {
      catNombre.value = cat.name
    }

    if (catDescripcion) {
      catDescripcion.value = cat.description || ''
    }

    if (catIcono) {
      catIcono.value = cat.icon || 'fa-tags'
    }

    if (catColor) {
      catColor.value = cat.color || '#007bff'
    }

    if (catColorPicker) {
      catColorPicker.value = cat.color || '#007bff'
    }

    if (catIsActive) {
      catIsActive.checked = Boolean(cat.is_active)
    }

    if (previewIcon) {
      previewIcon.className = `fas ${cat.icon || 'fa-tags'}`
    }
  } else {
    const initialColor = getUniqueColor()
    if (modalLabel) {
      modalLabel.querySelector('span').textContent = 'Nueva Categoría'
    }

    if (catId) {
      catId.value = ''
    }

    if (catNombre) {
      catNombre.value = ''
    }

    if (catDescripcion) {
      catDescripcion.value = ''
    }

    if (catIcono) {
      catIcono.value = 'fa-tags'
    }

    if (catColor) {
      catColor.value = initialColor
    }

    if (catColorPicker) {
      catColorPicker.value = initialColor
    }

    if (catIsActive) {
      catIsActive.checked = true
    }

    if (previewIcon) {
      previewIcon.className = 'fas fa-tags'
    }
  }

  updateColorValidation()
  globalThis.jQuery?.('#modalCategoria').modal('show')
}

function openSubcategoryModal(sub = null) {
  populateCategoryFilter()

  const modalLabel = document.getElementById('modalSubcategoriaLabel')
  const subCatId = document.getElementById('subCatId')
  const subCatParentId = document.getElementById('subCatParentId')
  const subCatNombre = document.getElementById('subCatNombre')
  const subCatDescripcion = document.getElementById('subCatDescripcion')
  const subCatIsActive = document.getElementById('subCatIsActive')

  if (sub) {
    if (modalLabel) {
      modalLabel.querySelector('span').textContent = 'Editar Subtipo'
    }

    if (subCatId) {
      subCatId.value = sub.id
    }

    if (subCatParentId) {
      subCatParentId.value = sub.category_id
    }

    if (subCatNombre) {
      subCatNombre.value = sub.name
    }

    if (subCatDescripcion) {
      subCatDescripcion.value = sub.description || ''
    }

    if (subCatIsActive) {
      subCatIsActive.checked = Boolean(sub.is_active)
    }
  } else {
    if (modalLabel) {
      modalLabel.querySelector('span').textContent = 'Nuevo Subtipo'
    }

    if (subCatId) {
      subCatId.value = ''
    }

    const currentFilter = document.getElementById('filtroCatPadre')?.value || ''
    if (subCatParentId) {
      subCatParentId.value = currentFilter
    }

    if (subCatNombre) {
      subCatNombre.value = ''
    }

    if (subCatDescripcion) {
      subCatDescripcion.value = ''
    }

    if (subCatIsActive) {
      subCatIsActive.checked = true
    }
  }

  globalThis.jQuery?.('#modalSubcategoria').modal('show')
}

function setupIconPicker() {
  initializeCategoryIconPicker({
    inputId: 'catIcono',
    previewId: 'previewCatIcon',
    toggleId: 'btnToggleIconPicker',
    panelId: 'iconPickerPanel',
    gridId: 'iconPickerGrid'
  })

  initializeCategoryIconPicker({
    inputId: 'reqCategoryIcon',
    previewId: 'reqCategoryIconPreview',
    toggleId: 'btnToggleRequestIconPicker',
    panelId: 'requestIconPickerPanel',
    gridId: 'requestIconPickerGrid'
  })
}

function initEventHandlers() {
  setupIconPicker()
  document.getElementById('btnNuevaCategoria')?.addEventListener('click', () => openCategoryModal())
  document.getElementById('btnNuevoSubtipo')?.addEventListener('click', () => openSubcategoryModal())
  document.getElementById('filtroCatPadre')?.addEventListener('change', () => renderSubcategoriesTable())
  document.getElementById('categorySearch')?.addEventListener('input', () => renderCategoriesTable())
  document.getElementById('subcategorySearch')?.addEventListener('input', () => renderSubcategoriesTable())

  const catColor = document.getElementById('catColor')
  const catColorPicker = document.getElementById('catColorPicker')
  catColorPicker?.addEventListener('input', () => {
    if (catColor) {
      catColor.value = catColorPicker.value
    }

    updateColorValidation()
  })
  catColor?.addEventListener('input', () => {
    if (catColorPicker && /^#[\dA-Fa-f]{6}$/.test(catColor.value)) {
      catColorPicker.value = catColor.value
    }

    updateColorValidation()
  })

  const reqCategoryColor = document.getElementById('reqCategoryColor')
  const reqCategoryColorValue = document.getElementById('reqCategoryColorValue')
  reqCategoryColor?.addEventListener('input', () => {
    if (reqCategoryColorValue) {
      reqCategoryColorValue.textContent = reqCategoryColor.value.toUpperCase()
    }
  })

  // Submit Form Categoría
  document.getElementById('formCategoria')?.addEventListener('submit', async e => {
    e.preventDefault()

    const form = e.currentTarget
    if (!validateForm(form)) {
      showGlobalAlert('Revisa los campos marcados antes de guardar la categoría.', 'warning')
      return
    }

    const id = document.getElementById('catId')?.value
    const nameInput = document.getElementById('catNombre')
    const name = normalizeCatalogName(nameInput?.value)
    const description = document.getElementById('catDescripcion')?.value.trim()
    const icon = document.getElementById('catIcono')?.value.trim() || 'fa-tags'
    const color = document.getElementById('catColor')?.value.trim() || '#007bff'
    const is_active = document.getElementById('catIsActive')?.checked ?? true

    if (nameInput) {
      nameInput.value = name
    }

    if (hasDuplicateCategory(name, id)) {
      showGlobalAlert('Ya existe una categoría con ese nombre.', 'warning')
      nameInput?.focus()
      return
    }

    if (!updateColorValidation()) {
      showGlobalAlert('El color elegido ya está asignado a otra categoría. Por favor seleccione un color único.', 'warning')
      return
    }

    const btnSubmit = document.getElementById('btnGuardarCategoria')
    if (btnSubmit) {
      btnSubmit.disabled = true
    }

    try {
      if (id) {
        await request(`/admin/catalogs/categories/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, description, icon, color, is_active })
        })
        showGlobalAlert('Categoría actualizada correctamente.', 'success')
      } else {
        await request('/admin/catalogs/categories', {
          method: 'POST',
          body: JSON.stringify({ name, description, icon, color, is_active })
        })
        showGlobalAlert('Categoría creada correctamente.', 'success')
      }

      globalThis.jQuery?.('#modalCategoria').modal('hide')
      await loadData()
    } catch (error) {
      showGlobalAlert(extractErrorMessage(error, 'No se pudo guardar la categoría.'), 'danger')
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false
      }
    }
  })

  // Submit Form Subcategoría
  document.getElementById('formSubcategoria')?.addEventListener('submit', async e => {
    e.preventDefault()

    const form = e.currentTarget
    if (!validateForm(form)) {
      showGlobalAlert('Revisa los campos marcados antes de guardar el subtipo.', 'warning')
      return
    }

    const id = document.getElementById('subCatId')?.value
    const category_id = document.getElementById('subCatParentId')?.value
    const nameInput = document.getElementById('subCatNombre')
    const name = normalizeCatalogName(nameInput?.value)
    const description = document.getElementById('subCatDescripcion')?.value.trim()
    const is_active = document.getElementById('subCatIsActive')?.checked ?? true

    if (nameInput) {
      nameInput.value = name
    }

    if (hasDuplicateSubcategory(category_id, name, id)) {
      showGlobalAlert('Ya existe un subtipo con ese nombre dentro de la categoría seleccionada.', 'warning')
      nameInput?.focus()
      return
    }

    const btnSubmit = document.getElementById('btnGuardarSubcategoria')
    if (btnSubmit) {
      btnSubmit.disabled = true
    }

    try {
      if (id) {
        await request(`/admin/catalogs/subcategories/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ category_id: Number(category_id), name, description, is_active })
        })
        showGlobalAlert('Subtipo actualizado correctamente.', 'success')
      } else {
        await request('/admin/catalogs/subcategories', {
          method: 'POST',
          body: JSON.stringify({ category_id: Number(category_id), name, description, is_active })
        })
        showGlobalAlert('Subtipo creado correctamente.', 'success')
      }

      globalThis.jQuery?.('#modalSubcategoria').modal('hide')
      await loadData()
    } catch (error) {
      showGlobalAlert(extractErrorMessage(error, 'No se pudo guardar el subtipo.'), 'danger')
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false
      }
    }
  })

  // Resolve Request Buttons
  document.getElementById('btnApproveRequest')?.addEventListener('click', async () => {
    const id = document.getElementById('reqId')?.value
    if (!id) {
      return
    }

    const form = document.getElementById('formResolveRequest')
    if (!validateForm(form)) {
      showGlobalAlert('Revisa los datos definitivos antes de aprobar la solicitud.', 'warning')
      return
    }

    const categoryNameInput = document.getElementById('reqCategoryName')
    const subcategoryNameInput = document.getElementById('reqSubcategoryName')
    const categoryName = normalizeCatalogName(categoryNameInput?.value)
    const subcategoryName = normalizeCatalogName(subcategoryNameInput?.value)
    const categoryDescription = document.getElementById('reqCategoryDescription')?.value.trim()
    const subcategoryDescription = document.getElementById('reqSubcategoryDescription')?.value.trim()
    const icon = document.getElementById('reqCategoryIcon')?.value.trim()
    const color = document.getElementById('reqCategoryColor')?.value
    const adminComment = document.getElementById('reqApprovalComment')?.value.trim()

    if (categoryNameInput) {
      categoryNameInput.value = categoryName
    }

    if (subcategoryNameInput) {
      subcategoryNameInput.value = subcategoryName
    }

    if (hasDuplicateCategory(categoryName)) {
      showGlobalAlert('Ya existe una categoría con ese nombre. Ajusta el nombre definitivo antes de aprobar.', 'warning')
      categoryNameInput?.focus()
      return
    }

    if (checkColorIsUsed(color)) {
      showGlobalAlert('El color definitivo ya está asignado a otra categoría.', 'warning')
      return
    }

    const btnSubmit = document.getElementById('btnApproveRequest')
    if (btnSubmit) {
      btnSubmit.disabled = true
    }

    try {
      await request(`/admin/catalogs/category-requests/${id}/approve`, {
        method: 'PUT',
        body: JSON.stringify({
          category_name: categoryName,
          subcategory_name: subcategoryName,
          category_description: categoryDescription || null,
          subcategory_description: subcategoryDescription || null,
          icon,
          color,
          admin_comment: adminComment || null
        })
      })
      showGlobalAlert('Categoría y subtipo creados; la incidencia fue clasificada.', 'success')
      globalThis.jQuery?.('#modalResolveRequest').modal('hide')
      await loadData()
    } catch (error) {
      showGlobalAlert(extractErrorMessage(error, 'Error al aprobar solicitud.'), 'danger')
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false
      }
    }
  })

  document.getElementById('btnConfirmRejectRequest')?.addEventListener('click', async () => {
    const id = document.getElementById('reqId')?.value
    const comment = document.getElementById('reqAdminComment')?.value.trim()

    if (!comment || comment.length < 10) {
      showGlobalAlert('El comentario de rechazo debe tener al menos 10 caracteres.', 'warning')
      return
    }

    const btnSubmit = document.getElementById('btnConfirmRejectRequest')
    if (btnSubmit) {
      btnSubmit.disabled = true
    }

    try {
      await request(`/admin/catalogs/category-requests/${id}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ comment })
      })
      showGlobalAlert('Solicitud rechazada exitosamente.', 'success')
      globalThis.jQuery?.('#modalResolveRequest').modal('hide')
      await loadData()
    } catch (error) {
      showGlobalAlert(extractErrorMessage(error, 'Error al rechazar solicitud.'), 'danger')
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false
      }
    }
  })
}

function activateRequestedTab() {
  if (globalThis.location?.hash !== '#tabRequests') {
    return
  }

  const link = document.getElementById('tabRequestsLink')
  const pane = document.getElementById('tabRequests')
  if (!link || !pane) {
    return
  }

  if (globalThis.jQuery?.fn?.tab) {
    globalThis.jQuery(link).tab('show')
    return
  }

  document.querySelectorAll('[data-toggle="pill"]').forEach(tab => {
    tab.classList.remove('active')
    tab.setAttribute('aria-selected', 'false')
  })
  document.querySelectorAll('.tab-pane').forEach(tabPane => {
    tabPane.classList.remove('active', 'show')
  })
  link.classList.add('active')
  link.setAttribute('aria-selected', 'true')
  pane.classList.add('active', 'show')
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof globalThis.renderLayout === 'function') {
    await globalThis.renderLayout('category-management')
  }

  initEventHandlers()
  activateRequestedTab()
  loadData()
})

export {
  loadData,
  renderCategoriesTable,
  renderSubcategoriesTable,
  renderRequestsTable,
  openCategoryModal,
  openSubcategoryModal,
  openResolveRequestModal,
  initEventHandlers,
  activateRequestedTab
}
