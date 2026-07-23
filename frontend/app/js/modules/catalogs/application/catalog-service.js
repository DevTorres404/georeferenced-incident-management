/**
 * Servicio para consultar los catálogos desde el backend
 */
import { requestBackend } from '../../../infrastructure/backend-client.js?v=21'

export async function getCategories() {
  const result = await requestBackend('/catalogs/categories')
  return result?.data || result || []
}

export async function getSubcategories(categoryId) {
  if (!categoryId) {
    return []
  }

  const result = await requestBackend(`/catalogs/categories/${categoryId}/subcategories`)
  return result?.data || result || []
}
