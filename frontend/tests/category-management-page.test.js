import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../app/js/infrastructure/backend-client.js?v=20', () => ({
  request: vi.fn(),
  extractErrorMessage: vi.fn((err, fallback) => err?.message || fallback)
}))

import { request } from '../app/js/infrastructure/backend-client.js?v=20'
import {
  loadData,
  openCategoryModal,
  openSubcategoryModal,
  renderCategoriesTable,
  renderSubcategoriesTable
} from '../app/js/modules/catalogs/presentation/category-management-page.js?v=1'

describe('category-management-page.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = `
      <div id="alertaGlobal" class="alert d-none"></div>
      <div id="bodyCategorias"></div>
      <div id="bodySubcategorias"></div>
      <select id="filtroCatPadre"><option value="">Todas</option></select>
      <select id="subCatParentId"><option value="">Seleccione</option></select>

      <div id="modalCategoria" class="modal">
        <div id="modalCategoriaLabel"><span></span></div>
        <form id="formCategoria">
          <input type="hidden" id="catId" value="">
          <input type="text" id="catNombre" value="">
          <textarea id="catDescripcion"></textarea>
          <input type="text" id="catIcono" value="fa-tags">
          <input type="text" id="catColor" value="#007bff">
          <input type="color" id="catColorPicker" value="#007bff">
          <input type="checkbox" id="catIsActive" checked>
          <i id="previewCatIcon"></i>
          <button type="submit" id="btnGuardarCategoria">Guardar</button>
        </form>
      </div>

      <div id="modalSubcategoria" class="modal">
        <div id="modalSubcategoriaLabel"><span></span></div>
        <form id="formSubcategoria">
          <input type="hidden" id="subCatId" value="">
          <select id="subCatParentId"></select>
          <input type="text" id="subCatNombre" value="">
          <textarea id="subCatDescripcion"></textarea>
          <input type="checkbox" id="subCatIsActive" checked>
          <button type="submit" id="btnGuardarSubcategoria">Guardar</button>
        </form>
      </div>

      <button id="btnNuevaCategoria">Nueva Cat</button>
      <button id="btnNuevoSubtipo">Nuevo Sub</button>
    `
  })

  it('exports expected functions', () => {
    expect(typeof loadData).toBe('function')
    expect(typeof renderCategoriesTable).toBe('function')
    expect(typeof renderSubcategoriesTable).toBe('function')
    expect(typeof openCategoryModal).toBe('function')
    expect(typeof openSubcategoryModal).toBe('function')
  })

  it('loads and renders categories and subcategories from backend', async () => {
    request.mockImplementation((path) => {
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
    expect(bodySub.innerHTML).toContain('Lámpara quemada')
  })

  it('populates modals for creating new categories and subcategories', () => {
    openCategoryModal()
    expect(document.getElementById('modalCategoriaLabel').textContent).toContain('Nueva Categoría')

    openSubcategoryModal()
    expect(document.getElementById('modalSubcategoriaLabel').textContent).toContain('Nuevo Subtipo')
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
})
