import { subscribePrivateChannel } from '../../../core/realtime-client.js?v=21';

async function subscribeToUserNotifications(user, onNotification, onStateChange = null) {
  const userId = user?.id || user?.user_id;
  if (!userId || typeof onNotification !== 'function') {
    return null;
  }

  return subscribePrivateChannel(`users.${userId}.notifications`, {
    'notification.created': (payload) => {
      if (payload?.notification) {
        onNotification(payload.notification);
      }
    },
  }, {
    onStateChange: ({ state }) => onStateChange?.(state),
  });
}

export { subscribeToUserNotifications };
