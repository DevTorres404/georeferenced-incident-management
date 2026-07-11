import { requestBackend } from '../../../core/api-client.js?v=21';

/**
 * Obtener todos los catálogos en una sola llamada si el backend lo soporta,
 * o exportar métodos específicos.
 */
export async function getCatalogOverview() {
  const result = await requestBackend('/catalogs');
  return result?.data || result || {};
}
