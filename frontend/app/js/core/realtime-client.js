import { API_URL, REVERB_APP_KEY, REVERB_HOST, REVERB_PORT, REVERB_SCHEME } from './config.js?v=20';
import { getSession } from './auth-session.js?v=14';

const PUSHER_CDN = 'https://js.pusher.com/8.4.0/pusher.min.js';

let scriptPromise = null;
let socket = null;

function loadPusherScript() {
  if (window.Pusher) {
    return Promise.resolve(window.Pusher);
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PUSHER_CDN;
      script.async = true;
      script.onload = () => resolve(window.Pusher);
      script.onerror = () => reject(new Error('No se pudo cargar el cliente de tiempo real.'));
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

function baseUrlFromApiUrl() {
  return API_URL.replace(/\/api\/?$/, '');
}

async function getRealtimeSocket() {
  const Pusher = await loadPusherScript();
  const { token } = getSession();

  if (!token) {
    return null;
  }

  if (socket) {
    return socket;
  }

  socket = new Pusher(REVERB_APP_KEY, {
    wsHost: REVERB_HOST,
    wsPort: REVERB_PORT,
    wssPort: REVERB_PORT,
    forceTLS: REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
    disableStats: true,
    cluster: 'mt1',
    authEndpoint: `${baseUrlFromApiUrl()}/broadcasting/auth`,
    auth: {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  });

  return socket;
}

async function subscribePrivateChannel(channelName, events = {}) {
  const activeSocket = await getRealtimeSocket();
  if (!activeSocket) {
    return null;
  }

  const channel = activeSocket.subscribe(`private-${channelName}`);

  Object.entries(events).forEach(([eventName, handler]) => {
    channel.bind(eventName, handler);
  });

  return {
    channelName,
    channel,
    cleanup() {
      Object.entries(events).forEach(([eventName, handler]) => {
        channel.unbind(eventName, handler);
      });
      activeSocket.unsubscribe(`private-${channelName}`);
    },
  };
}

export { subscribePrivateChannel };
