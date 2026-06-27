import { requestBackend } from '../../../core/api-client.js?v=14';
import { listIncidents } from '../../incidents/application/incidents-service.js?v=14';

export async function getDashboardMetrics() {
  const [metricsResult, incidentsResult] = await Promise.all([
    requestBackend('/dashboard/metrics'),
    listIncidents({ per_page: 5 }),
  ]);

  return {
    ...(metricsResult?.data || metricsResult || {}),
    recentIncidents: Array.isArray(incidentsResult?.data) ? incidentsResult.data : [],
  };
}
