import { requestBackend } from '../../../infrastructure/backend-client.js?v=21';

/**
 * Obtiene la lista de operadores a cargo del supervisor autenticado.
 *
 * @returns {Promise<Array>}
 */
async function fetchTeamOperators() {
    const response = await requestBackend('/team/operators', { noCache: true });
    return Array.isArray(response?.data) ? response.data : [];
}

export { fetchTeamOperators };
