import { firebaseConfig } from '../infrastructure/firebase-config.js';
import { request, requestRaw } from '../infrastructure/backend-client.js?v=14';
import { clearSession, updateUser, writeSession } from '../infrastructure/session-store.js';

let firebaseAuthPromise = null;

async function getFirebaseAuth() {
  if (!firebaseAuthPromise) {
    firebaseAuthPromise = Promise.all([
      import('https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js'),
    ]).then(([appModule, authModule]) => {
      const app = appModule.initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);
      const provider = new authModule.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      return {
        auth,
        provider,
        signInWithPopup: authModule.signInWithPopup,
      };
    });
  }

  return firebaseAuthPromise;
}

async function loginWithEmail(email, password) {
  const data = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (data.requires_2fa) {
    return data;
  }

  writeSession(data);
  return data;
}

async function verifyTwoFactorLogin(twoFactorToken, code) {
  const data = await request('/auth/2fa/verify-login', {
    method: 'POST',
    body: JSON.stringify({ two_factor_token: twoFactorToken, code }),
  });

  writeSession(data);
  return data;
}

async function enableTwoFactor() {
  return await request('/auth/2fa/enable', { method: 'POST' });
}

async function confirmTwoFactor(code) {
  return await request('/auth/2fa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

async function disableTwoFactor() {
  return await request('/auth/2fa/disable', { method: 'POST' });
}

async function registerLocal(payload) {
  const data = await request('/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  writeSession(data);
  return data;
}

async function submitGoogleToken(idToken, intent) {
  const data = await request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken, intent }),
  });

  writeSession(data);
  return data;
}

async function completeProfile(username) {
  const data = await request('/auth/profile', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });

  if (data.user) {
    updateUser(data.user);
  }

  return data;
}

async function restoreSession() {
  if (!window.SGIGSession?.hasValidSession?.()) {
    clearSession();
    return null;
  }

  try {
    const data = await request('/me');
    if (data.user) {
      updateUser(data.user);
    }
    return data.user;
  } catch {
    clearSession();
    return null;
  }
}

async function logout() {
  try {
    await request('/logout', { method: 'POST' });
  } catch {
    // Se limpia igualmente en el frontend.
  } finally {
    clearSession();
  }
}

function createFlowId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function openGoogleFlowChannel(flowId, onUpdate) {
  if (!window.Pusher) {
    return null;
  }

  const isHttps = window.location.protocol === 'https:';
  const socket = new window.Pusher('local-gic-key', {
    wsHost: window.location.hostname,
    wsPort: 8080,
    wssPort: 8080,
    forceTLS: isHttps,
    enabledTransports: isHttps ? ['ws', 'wss'] : ['ws'],
    disableStats: true,
    cluster: 'mt1',
  });

  const channelName = `auth.google.${flowId}`;
  const channel = socket.subscribe(channelName);
  channel.bind('google.registration.updated', onUpdate);

  return {
    channelName,
    socket,
    channel,
    cleanup() {
      try {
        channel.unbind('google.registration.updated', onUpdate);
      } catch {
        // noop
      }

      try {
        socket.unsubscribe(channelName);
      } catch {
        // noop
      }

      try {
        socket.disconnect();
      } catch {
        // noop
      }
    },
    onSubscribed(callback) {
      channel.bind('pusher:subscription_succeeded', callback);
    }
  };
}

async function registerWithGoogle({ intent = 'register', onStatus } = {}) {
  const { signInWithPopup, provider, auth } = await getFirebaseAuth();
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();

  if (typeof onStatus === 'function') {
    onStatus({
      status: 'processing',
      message: 'Verificando tus datos con Google...',
    });
  }

  return submitGoogleToken(idToken, intent);
}

const authService = {
  loginWithEmail,
  registerLocal,
  registerWithGoogle,
  completeProfile,
  restoreSession,
  logout,
  verifyTwoFactorLogin,
  enableTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
};

window.SGIGAuthService = authService;

export {
  completeProfile,
  loginWithEmail,
  logout,
  registerLocal,
  registerWithGoogle,
  restoreSession,
  verifyTwoFactorLogin,
  enableTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
};
