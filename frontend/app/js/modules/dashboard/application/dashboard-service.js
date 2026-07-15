import { requestBackend } from '../../../infrastructure/backend-client.js?v=21';
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
