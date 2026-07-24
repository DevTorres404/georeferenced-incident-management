import { request, extractErrorMessage } from '../../../infrastructure/backend-client.js?v=20'
import { escapeHtml } from '../../../shared/sanitizer.js?v=20'

let categoriesData = []
let subcategoriesData = []

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
  try {
    const [catResponse, subResponse] = await Promise.all([
      request('/admin/catalogs/categories?per_page=100'),
      request('/admin/catalogs/subcategories?per_page=100')
    ])

    categoriesData = Array.isArray(catResponse?.data) ? catResponse.data : (catResponse?.data?.data || [])
    subcategoriesData = Array.isArray(subResponse?.data) ? subResponse.data : (subResponse?.data?.data || [])

    renderCategoriesTable()
    populateCategoryFilter()
    renderSubcategoriesTable()
  } catch (error) {
    const msg = extractErrorMessage(error, 'No se pudieron cargar los catálogos.')
    showGlobalAlert(msg, 'danger')
  }
}

function renderCategoriesTable() {
  const tbody = document.getElementById('bodyCategorias')
  if (!tbody) {
    return
  }

  if (categoriesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No existen categorías registradas.</td></tr>'
    return
  }

  tbody.innerHTML = categoriesData.map(cat => {
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
          <button type="button" class="btn btn-xs ${isActive ? 'btn-outline-warning' : 'btn-outline-success'} mr-1 btn-toggle-cat" data-id="${cat.id}" data-active="${isActive ? '0' : '1'}" title="${isActive ? 'Desactivar' : 'Activar'}">
            <i class="fas ${isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
          <button type="button" class="btn btn-xs btn-outline-danger btn-delete-cat" data-id="${cat.id}" data-name="${escapeHtml(cat.name)}" title="Eliminar categoría">
            <i class="fas fa-trash"></i>
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
    selectFilter.innerHTML = '<option value="">Todas las categorías</option>' +
      categoriesData.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
    selectFilter.value = currentVal
  }

  if (selectModal) {
    selectModal.innerHTML = '<option value="">Seleccione una categoría</option>' +
      categoriesData.filter(c => c.is_active).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  }
}

function renderSubcategoriesTable() {
  const tbody = document.getElementById('bodySubcategorias')
  if (!tbody) {
    return
  }

  const filterCatId = document.getElementById('filtroCatPadre')?.value || ''
  let filtered = subcategoriesData

  if (filterCatId) {
    filtered = subcategoriesData.filter(s => String(s.category_id) === String(filterCatId))
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No existen subtipos registrados para el filtro seleccionado.</td></tr>'
    return
  }

  tbody.innerHTML = filtered.map(sub => {
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
          <button type="button" class="btn btn-xs ${isActive ? 'btn-outline-warning' : 'btn-outline-success'} mr-1 btn-toggle-sub" data-id="${sub.id}" data-active="${isActive ? '0' : '1'}" title="${isActive ? 'Desactivar' : 'Activar'}">
            <i class="fas ${isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
          <button type="button" class="btn btn-xs btn-outline-danger btn-delete-sub" data-id="${sub.id}" data-name="${escapeHtml(sub.name)}" title="Eliminar subtipo">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `
  }).join('')

  bindSubcategoryActions()
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
      const id = btn.dataset.id
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

  document.querySelectorAll('.btn-delete-cat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const name = btn.dataset.name
      if (!confirm(`¿Está seguro de eliminar la categoría "${name}"? Esta acción no se puede deshacer.`)) {
        return
      }

      try {
        await request(`/admin/catalogs/categories/${id}`, { method: 'DELETE' })
        showGlobalAlert(`Categoría "${name}" eliminada correctamente.`, 'success')
        await loadData()
      } catch (error) {
        showGlobalAlert(extractErrorMessage(error, 'No se pudo eliminar la categoría.'), 'danger')
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
      const id = btn.dataset.id
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

  document.querySelectorAll('.btn-delete-sub').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const name = btn.dataset.name
      if (!confirm(`¿Está seguro de eliminar el subtipo "${name}"? Esta acción no se puede deshacer.`)) {
        return
      }

      try {
        await request(`/admin/catalogs/subcategories/${id}`, { method: 'DELETE' })
        showGlobalAlert(`Subtipo "${name}" eliminado correctamente.`, 'success')
        await loadData()
      } catch (error) {
        showGlobalAlert(extractErrorMessage(error, 'No se pudo eliminar el subtipo.'), 'danger')
      }
    })
  })
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
    if (modalLabel) modalLabel.querySelector('span').textContent = 'Editar Categoría'
    if (catId) catId.value = cat.id
    if (catNombre) catNombre.value = cat.name
    if (catDescripcion) catDescripcion.value = cat.description || ''
    if (catIcono) catIcono.value = cat.icon || 'fa-tags'
    if (catColor) catColor.value = cat.color || '#007bff'
    if (catColorPicker) catColorPicker.value = cat.color || '#007bff'
    if (catIsActive) catIsActive.checked = Boolean(cat.is_active)
    if (previewIcon) previewIcon.className = `fas ${cat.icon || 'fa-tags'}`
  } else {
    if (modalLabel) modalLabel.querySelector('span').textContent = 'Nueva Categoría'
    if (catId) catId.value = ''
    if (catNombre) catNombre.value = ''
    if (catDescripcion) catDescripcion.value = ''
    if (catIcono) catIcono.value = 'fa-tags'
    if (catColor) catColor.value = '#007bff'
    if (catColorPicker) catColorPicker.value = '#007bff'
    if (catIsActive) catIsActive.checked = true
    if (previewIcon) previewIcon.className = 'fas fa-tags'
  }

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
    if (modalLabel) modalLabel.querySelector('span').textContent = 'Editar Subtipo'
    if (subCatId) subCatId.value = sub.id
    if (subCatParentId) subCatParentId.value = sub.category_id
    if (subCatNombre) subCatNombre.value = sub.name
    if (subCatDescripcion) subCatDescripcion.value = sub.description || ''
    if (subCatIsActive) subCatIsActive.checked = Boolean(sub.is_active)
  } else {
    if (modalLabel) modalLabel.querySelector('span').textContent = 'Nuevo Subtipo'
    if (subCatId) subCatId.value = ''
    const currentFilter = document.getElementById('filtroCatPadre')?.value || ''
    if (subCatParentId) subCatParentId.value = currentFilter
    if (subCatNombre) subCatNombre.value = ''
    if (subCatDescripcion) subCatDescripcion.value = ''
    if (subCatIsActive) subCatIsActive.checked = true
  }

  globalThis.jQuery?.('#modalSubcategoria').modal('show')
}

const PRESET_ICONS = [
  'fa-tags', 'fa-lightbulb', 'fa-road', 'fa-water', 'fa-fire', 'fa-shield-alt',
  'fa-exclamation-triangle', 'fa-wrench', 'fa-building', 'fa-tree', 'fa-bus',
  'fa-car-crash', 'fa-bolt', 'fa-trash-alt', 'fa-hospital', 'fa-broadcast-tower',
  'fa-traffic-light', 'fa-hard-hat', 'fa-plug', 'fa-first-aid', 'fa-biohazard',
  'fa-tools', 'fa-paw', 'fa-cloud-showers-heavy', 'fa-bullhorn', 'fa-cog'
]

function setupIconPicker() {
  const grid = document.getElementById('iconPickerGrid')
  const panel = document.getElementById('iconPickerPanel')
  const toggleBtn = document.getElementById('btnToggleIconPicker')
  const catIcono = document.getElementById('catIcono')
  const previewIcon = document.getElementById('previewCatIcon')

  if (!grid || !panel || !toggleBtn || !catIcono) {
    return
  }

  grid.innerHTML = PRESET_ICONS.map(icon => `
    <button type="button" class="btn btn-sm btn-outline-secondary p-1 btn-select-icon" data-icon="${icon}" title="${icon}" style="width: 32px; height: 32px;">
      <i class="fas ${icon}"></i>
    </button>
  `).join('')

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('d-none')
  })

  grid.querySelectorAll('.btn-select-icon').forEach(btn => {
    btn.addEventListener('click', () => {
      const icon = btn.dataset.icon
      catIcono.value = icon
      if (previewIcon) {
        previewIcon.className = `fas ${icon}`
      }
      panel.classList.add('d-none')
    })
  })
}

function initEventHandlers() {
  setupIconPicker()
  document.getElementById('btnNuevaCategoria')?.addEventListener('click', () => openCategoryModal())
  document.getElementById('btnNuevoSubtipo')?.addEventListener('click', () => openSubcategoryModal())
  document.getElementById('filtroCatPadre')?.addEventListener('change', () => renderSubcategoriesTable())

  const catIcono = document.getElementById('catIcono')
  const previewIcon = document.getElementById('previewCatIcon')
  catIcono?.addEventListener('input', () => {
    if (previewIcon) {
      previewIcon.className = `fas ${catIcono.value.trim() || 'fa-tags'}`
    }
  })

  const catColor = document.getElementById('catColor')
  const catColorPicker = document.getElementById('catColorPicker')
  catColorPicker?.addEventListener('input', () => {
    if (catColor) catColor.value = catColorPicker.value
  })
  catColor?.addEventListener('input', () => {
    if (catColorPicker && /^#[0-9A-Fa-f]{6}$/.test(catColor.value)) {
      catColorPicker.value = catColor.value
    }
  })

  // Submit Form Categoría
  document.getElementById('formCategoria')?.addEventListener('submit', async (e) => {
    e.preventDefault()

    const id = document.getElementById('catId')?.value
    const name = document.getElementById('catNombre')?.value.trim()
    const description = document.getElementById('catDescripcion')?.value.trim()
    const icon = document.getElementById('catIcono')?.value.trim() || 'fa-tags'
    const color = document.getElementById('catColor')?.value.trim() || '#007bff'
    const is_active = document.getElementById('catIsActive')?.checked ?? true

    if (!name) {
      showGlobalAlert('El nombre de la categoría es obligatorio.', 'warning')
      return
    }

    const btnSubmit = document.getElementById('btnGuardarCategoria')
    if (btnSubmit) btnSubmit.disabled = true

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
      if (btnSubmit) btnSubmit.disabled = false
    }
  })

  // Submit Form Subcategoría
  document.getElementById('formSubcategoria')?.addEventListener('submit', async (e) => {
    e.preventDefault()

    const id = document.getElementById('subCatId')?.value
    const category_id = document.getElementById('subCatParentId')?.value
    const name = document.getElementById('subCatNombre')?.value.trim()
    const description = document.getElementById('subCatDescripcion')?.value.trim()
    const is_active = document.getElementById('subCatIsActive')?.checked ?? true

    if (!category_id) {
      showGlobalAlert('Debe seleccionar la categoría padre.', 'warning')
      return
    }
    if (!name) {
      showGlobalAlert('El nombre del subtipo es obligatorio.', 'warning')
      return
    }

    const btnSubmit = document.getElementById('btnGuardarSubcategoria')
    if (btnSubmit) btnSubmit.disabled = true

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
      if (btnSubmit) btnSubmit.disabled = false
    }
  })
}

document.addEventListener('DOMContentLoaded', () => {
  initEventHandlers()
  loadData()
})

export {
  loadData,
  renderCategoriesTable,
  renderSubcategoriesTable,
  openCategoryModal,
  openSubcategoryModal
}
