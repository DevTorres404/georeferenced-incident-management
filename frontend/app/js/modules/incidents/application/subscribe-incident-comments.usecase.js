import { subscribePrivateChannel } from '../../../core/realtime-client.js?v=20';

async function subscribeToIncidentComments(incidentId, includeInternal, onComment) {
  if (!incidentId || typeof onComment !== 'function') return null;

  const subscriptions = [];
  const events = {
    'comment.created': (payload) => {
      if (payload?.comment) onComment(payload.comment);
    },
  };

  const publicSubscription = await subscribePrivateChannel(
    `incidents.${incidentId}.comments`,
    events
  );
  if (publicSubscription) subscriptions.push(publicSubscription);

  if (includeInternal) {
    const internalSubscription = await subscribePrivateChannel(
      `incidents.${incidentId}.internal-comments`,
      events
    );
    if (internalSubscription) subscriptions.push(internalSubscription);
  }

  return {
    cleanup() {
      subscriptions.forEach((subscription) => subscription.cleanup());
    },
  };
}

export { subscribeToIncidentComments };
