import { API_URL, REVERB_APP_KEY, REVERB_HOST, REVERB_PORT, REVERB_SCHEME } from './config.js?v=21'
import { getSession } from './auth-session.js?v=14'

const PUSHER_CDN = 'https://js.pusher.com/8.4.0/pusher.min.js'
const SCRIPT_LOAD_TIMEOUT_MS = 10000

let scriptPromise = null
let socket = null
let socketToken = null

function reportRealtimeState(channelName, state, error = null) {
  const detail = { channelName, state, error }
  globalThis.dispatchEvent(new CustomEvent('sgi:realtime-state', { detail }))
  return detail
}

function loadPusherScript() {
  if (globalThis.Pusher) {
    return Promise.resolve(globalThis.Pusher)
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      const timeoutId = globalThis.setTimeout(() => {
        script.remove()
        reject(new Error('El cliente de tiempo real excedio el tiempo de carga.'))
      }, SCRIPT_LOAD_TIMEOUT_MS)

      script.src = PUSHER_CDN
      script.async = true
      script.addEventListener('load', () => {
        globalThis.clearTimeout(timeoutId)
        resolve(globalThis.Pusher)
      })

      script.addEventListener('error', () => {
        globalThis.clearTimeout(timeoutId)
        reject(new Error('No se pudo cargar el cliente de tiempo real.'))
      })

      document.head.appendChild(script)
    }).catch(error => {
      scriptPromise = null
      throw error
    })
  }

  return scriptPromise
}

function baseUrlFromApiUrl() {
  return API_URL.replace(/\/api\/?$/, '')
}

async function getRealtimeSocket() {
  const Pusher = await loadPusherScript()
  const { token } = getSession()

  if (!token) {
    return null
  }

  if (socket && socketToken === token) {
    return socket
  }

  socket?.disconnect?.()

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
        Accept: 'application/json'
      }
    }
  })
  socketToken = token

  return socket
}

async function subscribePrivateChannel(channelName, events = {}, options = {}) {
  let activeSocket
  try {
    activeSocket = await getRealtimeSocket()
  } catch (error) {
    options.onStateChange?.(reportRealtimeState(channelName, 'unavailable', error))
    throw error
  }

  if (!activeSocket) {
    options.onStateChange?.(reportRealtimeState(channelName, 'unavailable'))
    return null
  }

  const channel = activeSocket.subscribe(`private-${channelName}`)
  const notifyState = (state, error = null) => {
    options.onStateChange?.(reportRealtimeState(channelName, state, error))
  }

  const handleSubscriptionSucceeded = () => notifyState('subscribed')
  const handleSubscriptionError = error => notifyState('unavailable', error)
  const handleConnectionState = ({ current }) => {
    if (current === 'connected') {
      notifyState(channel.subscribed ? 'subscribed' : 'connecting')
      return
    }

    notifyState(current || 'disconnected')
  }

  Object.entries(events).forEach(([eventName, handler]) => {
    channel.bind(eventName, handler)
  })
  channel.bind('pusher:subscription_succeeded', handleSubscriptionSucceeded)
  channel.bind('pusher:subscription_error', handleSubscriptionError)
  activeSocket.connection.bind('state_change', handleConnectionState)
  notifyState(activeSocket.connection.state === 'connected' ? 'connecting' : activeSocket.connection.state)

  return {
    channelName,
    channel,
    cleanup() {
      Object.entries(events).forEach(([eventName, handler]) => {
        channel.unbind(eventName, handler)
      })
      channel.unbind('pusher:subscription_succeeded', handleSubscriptionSucceeded)
      channel.unbind('pusher:subscription_error', handleSubscriptionError)
      activeSocket.connection.unbind('state_change', handleConnectionState)
      activeSocket.unsubscribe(`private-${channelName}`)
    }
  }
}

export { subscribePrivateChannel }
