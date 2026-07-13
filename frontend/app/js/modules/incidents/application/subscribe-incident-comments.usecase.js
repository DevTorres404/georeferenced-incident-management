import { subscribePrivateChannel } from '../../../core/realtime-client.js?v=21';

async function subscribeToIncidentComments(incidentId, includeInternal, onComment, onStateChange = null) {
  if (!incidentId || typeof onComment !== 'function') return null;

  const subscriptions = [];
  const channelNames = [
    `incidents.${incidentId}.comments`,
    ...(includeInternal ? [`incidents.${incidentId}.internal-comments`] : []),
  ];
  const channelStates = new Map();
  const events = {
    'comment.created': (payload) => {
      if (payload?.comment) onComment(payload.comment);
    },
  };
  const updateChannelState = ({ channelName, state }) => {
    channelStates.set(channelName, state);
    const states = channelNames.map((name) => channelStates.get(name) || 'connecting');
    onStateChange?.(states.every((value) => value === 'subscribed') ? 'subscribed' : state);
  };

  const publicSubscription = await subscribePrivateChannel(
    channelNames[0],
    events,
    { onStateChange: updateChannelState }
  );
  if (publicSubscription) subscriptions.push(publicSubscription);

  if (includeInternal) {
    const internalSubscription = await subscribePrivateChannel(
      `incidents.${incidentId}.internal-comments`,
      events,
      { onStateChange: updateChannelState }
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
