import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../app/js/infrastructure/backend-client.js?v=20', () => ({
  request: vi.fn(),
  extractErrorMessage: vi.fn((err, fallback) => err?.message || fallback)
}))

import { request } from '../app/js/infrastructure/backend-client.js?v=20'
import {
  activateRequestedTab,
  loadData,
  initEventHandlers,
  openCategoryModal,
  openResolveRequestModal,
  openSubcategoryModal,
  renderCategoriesTable,
  renderRequestsTable,
  renderSubcategoriesTable
} from '../app/js/modules/catalogs/presentation/category-management-page.js?v=9'

describe('category-management-page.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = `
      <div id="alertaGlobal" class="alert d-none"></div>
      <div id="catalogTabs">
        <a id="tabCategoriesLink" class="nav-link active" data-toggle="pill" href="#tabCategories" aria-selected="true"></a>
        <a id="tabRequestsLink" class="nav-link" data-toggle="pill" href="#tabRequests" aria-selected="false"></a>
      </div>
      <div id="tabCategories" class="tab-pane active show"></div>
      <div id="tabRequests" class="tab-pane"></div>
      <div id="bodyCategorias"></div>
      <div id="bodySubcategorias"></div>
      <table><tbody id="bodyRequests"></tbody></table>
      <span id="requestsBadgeCount" class="d-none"></span>
      <input type="search" id="categorySearch">
      <span id="categorySearchSummary"></span>
      <input type="search" id="subcategorySearch">
      <span id="subcategorySearchSummary"></span>
      <select id="filtroCatPadre"><option value="">Todas</option></select>

      <div id="modalCategoria" class="modal">
        <div id="modalCategoriaLabel"><span></span></div>
        <form id="formCategoria">
          <input type="hidden" id="catId" value="">
          <input type="text" id="catNombre" value="" required minlength="3" maxlength="100">
          <textarea id="catDescripcion" maxlength="255"></textarea>
          <input type="text" id="catIcono" value="fa-tags" required pattern="^fa-[a-z0-9-]+$">
          <button type="button" id="btnToggleIconPicker"></button>
          <div id="iconPickerPanel" class="d-none"><div id="iconPickerGrid"></div></div>
          <input type="text" id="catColor" value="#007bff" required pattern="^#[0-9A-Fa-f]{6}$">
          <input type="color" id="catColorPicker" value="#007bff">
          <small id="catColorWarning" class="d-none"></small>
          <input type="checkbox" id="catIsActive" checked>
          <i id="previewCatIcon"></i>
          <button type="submit" id="btnGuardarCategoria">Guardar</button>
        </form>
      </div>

      <div id="modalSubcategoria" class="modal">
        <div id="modalSubcategoriaLabel"><span></span></div>
        <form id="formSubcategoria">
          <input type="hidden" id="subCatId" value="">
          <select id="subCatParentId" required></select>
          <input type="text" id="subCatNombre" value="" required minlength="3" maxlength="100">
          <textarea id="subCatDescripcion" maxlength="255"></textarea>
          <input type="checkbox" id="subCatIsActive" checked>
          <button type="submit" id="btnGuardarSubcategoria">Guardar</button>
        </form>
      </div>

      <button id="btnNuevaCategoria">Nueva Cat</button>
      <button id="btnNuevoSubtipo">Nuevo Sub</button>
      <div id="modalResolveRequest">
        <input id="reqId">
        <div id="reqRequestSummary"></div>
        <div id="reqApprovalFields"></div>
        <div id="reqApprovalDescriptions"></div>
        <div id="reqApprovalAppearance"></div>
        <div id="reqApprovalCommentGroup"></div>
        <form id="formResolveRequest">
        <input id="reqCategoryName" required minlength="3" maxlength="100">
        <input id="reqSubcategoryName" required minlength="3" maxlength="100">
        <textarea id="reqCategoryDescription" maxlength="255"></textarea>
        <textarea id="reqSubcategoryDescription" maxlength="255"></textarea>
        <input id="reqCategoryIcon" required pattern="^fa-[a-z0-9-]+$">
        <i id="reqCategoryIconPreview"></i>
        <button type="button" id="btnToggleRequestIconPicker"></button>
        <div id="requestIconPickerPanel" class="d-none"><div id="requestIconPickerGrid"></div></div>
        <input id="reqCategoryColor" type="color" value="#007bff" required>
        <code id="reqCategoryColorValue">#007BFF</code>
        <textarea id="reqApprovalComment" maxlength="500"></textarea>
        <div id="reqRejectCommentGroup"></div>
        <textarea id="reqAdminComment" minlength="10" maxlength="500"></textarea>
        <div id="reqApproveInfo"></div>
        <button id="btnApproveRequest"></button>
        <button id="btnRejectRequest"></button>
        <button id="btnConfirmRejectRequest"></button>
        </form>
      </div>
    `
    globalThis.history.replaceState({}, '', '/html/category-management.html')
  })

  it('exports expected functions', () => {
    expect(typeof loadData).toBe('function')
    expect(typeof renderCategoriesTable).toBe('function')
    expect(typeof renderSubcategoriesTable).toBe('function')
    expect(typeof renderRequestsTable).toBe('function')
    expect(typeof openCategoryModal).toBe('function')
    expect(typeof openSubcategoryModal).toBe('function')
  })

  it('loads and renders categories and subcategories from backend', async () => {
    request.mockImplementation(path => {
      if (path.includes('subcategories')) {
        return Promise.resolve({
          data: [
            { id: 10, category_id: 1, name: 'Lámpara quemada', description: 'Foco no enciende', is_active: true }
          ]
        })
      }

      if (path.includes('categories')) {
        return Promise.resolve({
          data: [
            { id: 1, name: 'Alumbrado Público', description: 'Luces y luminarias', icon: 'fa-lightbulb', color: '#ffc107', is_active: true }
          ]
        })
      }

      return Promise.resolve({ data: [] })
    })

    await loadData()

    const bodyCat = document.getElementById('bodyCategorias')
    const bodySub = document.getElementById('bodySubcategorias')

    expect(bodyCat.innerHTML).toContain('Alumbrado Público')
    expect(bodyCat.innerHTML).toContain('fa-lightbulb')
    expect(request).toHaveBeenCalledWith('/admin/catalogs/categories?per_page=100', { noCache: true })
    expect(request).toHaveBeenCalledWith('/admin/catalogs/subcategories?per_page=100', { noCache: true })
    expect(request).toHaveBeenCalledWith('/admin/catalogs/category-requests', { noCache: true })
    expect(bodySub.innerHTML).toContain('Lámpara quemada')
  })

  it('filters categories and subcategories with accent-insensitive searches', async () => {
    request.mockImplementation(path => {
      if (path.includes('subcategories')) {
        return Promise.resolve({
          data: [
            { id: 10, category_id: 1, name: 'Lámpara quemada', description: 'Foco no enciende', is_active: true },
            { id: 11, category_id: 2, name: 'Bache profundo', description: 'Daño en calzada', is_active: true }
          ]
        })
      }

      if (path.includes('categories')) {
        return Promise.resolve({
          data: [
            { id: 1, name: 'Alumbrado Público', description: 'Luces y luminarias', icon: 'fa-lightbulb', color: '#ffc107', is_active: true },
            { id: 2, name: 'Vialidad', description: 'Calles y carreteras', icon: 'fa-road', color: '#dc3545', is_active: true }
          ]
        })
      }

      return Promise.resolve({ data: [] })
    })

    await loadData()
    initEventHandlers()

    const categorySearch = document.getElementById('categorySearch')
    categorySearch.value = 'publico'
    categorySearch.dispatchEvent(new Event('input', { bubbles: true }))

    expect(document.getElementById('bodyCategorias').textContent).toContain('Alumbrado Público')
    expect(document.getElementById('bodyCategorias').textContent).not.toContain('Vialidad')
    expect(document.getElementById('categorySearchSummary').textContent).toContain('1 de 2 categorías')

    const subcategorySearch = document.getElementById('subcategorySearch')
    subcategorySearch.value = 'foco'
    subcategorySearch.dispatchEvent(new Event('input', { bubbles: true }))

    expect(document.getElementById('bodySubcategorias').textContent).toContain('Lámpara quemada')
    expect(document.getElementById('bodySubcategorias').textContent).not.toContain('Bache profundo')
    expect(document.getElementById('subcategorySearchSummary').textContent).toContain('1 de 2 subtipos')
  })

  it('opens pending requests when the notification target includes its hash', () => {
    globalThis.history.replaceState({}, '', '/html/category-management.html#tabRequests')

    activateRequestedTab()

    expect(document.getElementById('tabRequestsLink').classList.contains('active')).toBe(true)
    expect(document.getElementById('tabRequestsLink').getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('tabRequests').classList.contains('show')).toBe(true)
    expect(document.getElementById('tabCategories').classList.contains('active')).toBe(false)
  })

  it('replaces indefinite loading rows when catalog loading fails', async () => {
    request.mockRejectedValue(new Error('Backend unavailable'))

    await loadData()

    expect(document.getElementById('bodyCategorias').textContent).toContain('No se pudieron cargar las categorías')
    expect(document.getElementById('bodySubcategorias').textContent).toContain('No se pudieron cargar los subtipos')
    expect(document.getElementById('bodyRequests').textContent).toContain('No se pudieron cargar las solicitudes')
    expect(document.getElementById('bodyCategorias').textContent).not.toContain('Cargando categorías')
  })

  it('populates modals for creating new categories and subcategories', () => {
    openCategoryModal()
    expect(document.getElementById('modalCategoriaLabel').textContent).toContain('Nueva Categoría')

    openSubcategoryModal()
    expect(document.getElementById('modalSubcategoriaLabel').textContent).toContain('Nuevo Subtipo')
  })

  it('uses the shared visual picker when creating a category', () => {
    initEventHandlers()

    document.getElementById('btnToggleIconPicker').click()
    document.querySelector('#iconPickerGrid [data-category-icon="fa-water"]').click()

    expect(document.getElementById('catIcono').value).toBe('fa-water')
    expect(document.getElementById('previewCatIcon').className).toContain('fa-water')
    expect(document.getElementById('iconPickerPanel').classList).toContain('d-none')
  })

  it('populates modals for editing existing categories and subcategories', () => {
    openCategoryModal({
      id: 5,
      name: 'Vías y Carreteras',
      description: 'Baches y asfalto',
      icon: 'fa-road',
      color: '#dc3545',
      is_active: false
    })

    expect(document.getElementById('catNombre').value).toBe('Vías y Carreteras')
    expect(document.getElementById('catIcono').value).toBe('fa-road')
    expect(document.getElementById('catIsActive').checked).toBe(false)

    openSubcategoryModal({
      id: 20,
      category_id: 5,
      name: 'Bache profundo',
      description: 'Hueco en vía principal',
      is_active: true
    })

    expect(document.getElementById('subCatNombre').value).toBe('Bache profundo')
  })

  it('shows incident, category and subtype context in pending requests', async () => {
    request.mockImplementation(path => {
      if (path.includes('category-requests')) {
        return Promise.resolve({
          data: [{
            id: 9,
            incidentId: 42,
            incidentCode: 'INC-2026-0042',
            requestedByName: 'Supervisor Uno',
            suggestedCategoryName: 'Infraestructura de gas',
            suggestedSubcategoryName: 'Fuga domiciliaria',
            reason: 'No existe una clasificación adecuada.',
            createdAt: '2026-07-25T10:00:00Z'
          }]
        })
      }

      return Promise.resolve({ data: [] })
    })

    await loadData()

    expect(document.getElementById('bodyRequests').textContent).toContain('INC-2026-0042')
    expect(document.getElementById('bodyRequests').textContent).toContain('Infraestructura de gas')
    expect(document.getElementById('bodyRequests').textContent).toContain('Fuga domiciliaria')
  })

  it('prefills final catalog values and sends the admin approval payload', async () => {
    const pendingRequest = {
      id: 9,
      incidentId: 42,
      incidentCode: 'INC-2026-0042',
      suggestedCategoryName: 'Infraestructura de gas',
      suggestedCategoryDescription: 'Incidencias relacionadas con redes y suministro de gas.',
      suggestedSubcategoryName: 'Fuga domiciliaria',
      suggestedIcon: 'fa-fire',
      reason: 'No existe una clasificación adecuada.'
    }
    openResolveRequestModal(pendingRequest, 'approve')
    initEventHandlers()
    request.mockResolvedValue({ message: 'OK' })

    document.getElementById('btnToggleRequestIconPicker').click()
    document.querySelector('#requestIconPickerGrid [data-category-icon="fa-bolt"]').click()
    document.getElementById('reqCategoryColor').value = '#dc3545'
    document.getElementById('reqCategoryColor').dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.getElementById('reqCategoryDescription').value).toBe(
      'Incidencias relacionadas con redes y suministro de gas.'
    )
    expect(document.getElementById('reqCategoryColorValue').textContent).toBe('#DC3545')
    document.getElementById('btnApproveRequest').click()
    await Promise.resolve()
    await Promise.resolve()

    expect(request).toHaveBeenCalledWith(
      '/admin/catalogs/category-requests/9/approve',
      expect.objectContaining({
        method: 'PUT',
        body: expect.any(String)
      })
    )
    const approvalCall = request.mock.calls.find(([path]) => path.endsWith('/approve'))
    expect(JSON.parse(approvalCall[1].body)).toMatchObject({
      category_name: 'Infraestructura de gas',
      category_description: 'Incidencias relacionadas con redes y suministro de gas.',
      subcategory_name: 'Fuga domiciliaria',
      icon: 'fa-bolt',
      color: '#dc3545'
    })
    expect(document.getElementById('reqCategoryIconPreview').className).toContain('fa-bolt')
  })

  it('lets the administrator correct the proposed names before approval', async () => {
    openResolveRequestModal({
      id: 10,
      incidentId: 43,
      suggestedCategoryName: 'gas',
      suggestedSubcategoryName: 'fuga',
      reason: 'La clasificación no existe actualmente.'
    }, 'approve')
    initEventHandlers()
    request.mockResolvedValue({ message: 'OK' })

    document.getElementById('reqCategoryName').value = '  Infraestructura   de gas  '
    document.getElementById('reqSubcategoryName').value = '  Fuga en red principal  '
    document.getElementById('btnApproveRequest').click()
    await Promise.resolve()
    await Promise.resolve()

    const approvalCall = request.mock.calls.find(([path]) => path.endsWith('/approve'))
    expect(JSON.parse(approvalCall[1].body)).toMatchObject({
      category_name: 'Infraestructura de gas',
      subcategory_name: 'Fuga en red principal'
    })
  })

  it('creates categories and subtypes through the regular admin forms', async () => {
    request.mockResolvedValue({ data: [] })
    initEventHandlers()

    document.getElementById('catNombre').value = '  Gestión   de residuos '
    document.getElementById('formCategoria').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith('/admin/catalogs/categories', expect.objectContaining({
        method: 'POST'
      }))
      expect(request).toHaveBeenCalledTimes(4)
    })
    const categoryCall = request.mock.calls.find(([path, options]) => path === '/admin/catalogs/categories' && options?.method === 'POST')
    expect(JSON.parse(categoryCall[1].body).name).toBe('Gestión de residuos')

    document.getElementById('subCatParentId').innerHTML = '<option value="8">Gestión de residuos</option>'
    document.getElementById('subCatParentId').value = '8'
    document.getElementById('subCatNombre').value = '  Recolección   omitida '
    document.getElementById('formSubcategoria').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith('/admin/catalogs/subcategories', expect.objectContaining({
        method: 'POST'
      }))
    })
    const subtypeCall = request.mock.calls.find(([path, options]) => path === '/admin/catalogs/subcategories' && options?.method === 'POST')
    expect(JSON.parse(subtypeCall[1].body)).toMatchObject({
      category_id: 8,
      name: 'Recolección omitida'
    })
  })

  it('blocks an invalid approval before calling the backend', async () => {
    openResolveRequestModal({
      id: 11,
      incidentId: 44,
      suggestedCategoryName: 'ab',
      suggestedSubcategoryName: 'cd',
      reason: 'La clasificación no existe actualmente.'
    }, 'approve')
    initEventHandlers()

    document.getElementById('reqCategoryIcon').value = 'icono-invalido'
    document.getElementById('btnApproveRequest').click()
    await Promise.resolve()

    expect(request).not.toHaveBeenCalled()
    expect(document.getElementById('alertaGlobal').textContent).toContain('Revisa los datos definitivos')
  })
})
