import { subscribePrivateChannel } from '../../../core/realtime-client.js?v=21'

async function subscribeToIncidentRealtime(incidentId, callbacks = {}, onStateChange = null) {
  if (!incidentId) {
    return null
  }

  const subscriptions = []
  const channelStates = new Map()
  const updateChannelState = ({ channelName, state }) => {
    channelStates.set(channelName, state)
    const values = [...channelStates.values()]
    if (onStateChange) {
      onStateChange(values.every(v => v === 'subscribed') ? 'subscribed' : state)
    }
  }

  const wrapCallback = fn => payload => {
    if (payload) {
      fn(payload)
    }
  }

  // Canal de cambios de estado
  if (callbacks.onStateChanged) {
    const stateSub = await subscribePrivateChannel(
      `incidents.${incidentId}.state`,
      { 'incident.state.changed': wrapCallback(callbacks.onStateChanged) },
      { onStateChange: updateChannelState }
    )
    if (stateSub) {
      subscriptions.push(stateSub)
    }
  }

  // Canal de asignaciones
  if (callbacks.onAssigned) {
    const assignSub = await subscribePrivateChannel(
      `incidents.${incidentId}.assignments`,
      { 'incident.assigned': wrapCallback(callbacks.onAssigned) },
      { onStateChange: updateChannelState }
    )
    if (assignSub) {
      subscriptions.push(assignSub)
    }
  }

  return subscriptions.length ?
    {
      cleanup() {
        subscriptions.forEach(s => s.cleanup())
      }
    } :
    null
}

export { subscribeToIncidentRealtime }
