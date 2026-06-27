/**
 * Servicio para consultar los catálogos desde el backend
 */
import { requestBackend } from '../../../core/api-client.js?v=14';

export async function getCountries() {
  const result = await requestBackend('/catalogs/countries');
  return result?.data || result || [];
}

export async function getProvinces(countryId) {
  if (!countryId) return [];
  const result = await requestBackend(`/catalogs/countries/${countryId}/provinces`);
  return result?.data || result || [];
}

export async function getCities(provinceId) {
  if (!provinceId) return [];
  const result = await requestBackend(`/catalogs/provinces/${provinceId}/cities`);
  return result?.data || result || [];
}

export async function getCategories() {
  const result = await requestBackend('/catalogs/categories');
  return result?.data || result || [];
}

export async function getSubcategories(categoryId) {
  if (!categoryId) return [];
  const result = await requestBackend(`/catalogs/categories/${categoryId}/subcategories`);
  return result?.data || result || [];
}
