/**
 * Implementación ligera de Store/PubSub para estado compartido
 * Cumple con skill_front.md
 */

let state = {};
const listeners = new Set();

export function getState() {
  return { ...state };
}

export function setState(partialState) {
  state = { ...state, ...partialState };
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  // Llamar al oyente con el estado actual al suscribirse
  listener(state);
}

export function unsubscribe(listener) {
  listeners.delete(listener);
}
