import { API_CACHE_TTL_MS, API_URL } from '../core/config.js?v=20';

class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = details.status || 0;
    this.errors = details.errors || null;
    this.data = details.data || null;
  }
}

const pendingControllers = new Map();

function getCacheScope(token) {
  return token ? `auth_${String(token).slice(-12)}` : 'anon';
}

function getCacheKey(path, token) {
  return `SGI_API_CACHE_${getCacheScope(token)}_${path}`;
}

function clearApiCache() {
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith('SGI_API_CACHE_') || key === 'SGI_notifications_cache')
    .forEach((key) => sessionStorage.removeItem(key));
}

async function requestRaw(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const token = localStorage.getItem(globalThis.SGIGSession?.STORAGE_KEYS?.token || 'auth_token');
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    Accept: 'application/json',
    ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // 1. Caché para peticiones GET (TTL de 30 segundos)
  const cacheKey = getCacheKey(path, token);
  if (method === 'GET' && !options.noCache) {
    const cachedStr = sessionStorage.getItem(cacheKey);
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (Date.now() - cached.timestamp < API_CACHE_TTL_MS) {
          return { response: { ok: true, status: 200, headers: new Headers() }, data: cached.data };
        }
      } catch(e) {}
    }
  }

  // 2. AbortController para prevenir race conditions y peticiones duplicadas
  const requestKey = `${method}_${path}`;
  if (pendingControllers.has(requestKey)) {
    pendingControllers.get(requestKey).abort();
  }
  const controller = new AbortController();
  pendingControllers.set(requestKey, controller);
  
  const fetchOptions = { ...options, headers, signal: controller.signal };
  if (options.noCache) {
    fetchOptions.cache = 'no-store';
  }

  try {
    const response = await fetch(`${API_URL}${path}`, fetchOptions);
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : {};

    if ((response.status === 401 || response.status === 419) && token) {
      globalThis.dispatchEvent(new Event('sgi:unauthorized'));
    }

    if (method === 'GET' && response.ok && !options.noCache) {
      sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
    }

    return { response, data };
  } catch (err) {
    if (err.name === 'AbortError') {
      // Retornar un error silencioso para que la capa superior no muestre alertas
      const fakeError = new Error('Petición cancelada');
      fakeError.isAborted = true;
      throw fakeError;
    }
    throw err;
  } finally {
    if (pendingControllers.get(requestKey) === controller) {
      pendingControllers.delete(requestKey);
    }
  }
}

async function request(path, options = {}) {
  try {
    const { response, data } = await requestRaw(path, options);

    if (!response.ok) {
      throw new ApiError(extractErrorMessage(data, response.status), {
        status: response.status,
        errors: data?.errors || null,
        data,
      });
    }

    return data;
  } catch (err) {
    if (err.isAborted) {
      return new Promise(() => {}); // Promesa que nunca se resuelve para evitar renders corruptos
    }
    throw err;
  }
}

function extractErrorMessage(data, fallback = 'La solicitud no pudo completarse.') {
  const errors = data && typeof data === 'object' ? data.errors : null;
  if (errors && typeof errors === 'object') {
    const firstError = Object.values(errors).flat().find(Boolean);
    if (firstError) {
      return firstError;
    }
  }

  if (data?.message) return data.message;

  const statusMessages = {
    400: 'La solicitud no pudo procesarse. Revise los datos ingresados.',
    401: 'Su sesión ha expirado. Inicie sesión nuevamente.',
    403: 'No tiene permisos para realizar esta acción.',
    404: 'El recurso solicitado no fue encontrado.',
    409: 'Ya existe un registro con esta información.',
    419: 'La sesión expiró. Recargue la página e intente nuevamente.',
    422: 'Revisa los datos ingresados.',
    429: 'Ha realizado demasiados intentos. Espere un momento e intente nuevamente.',
    500: 'Ocurrió un error interno. Intente nuevamente más tarde.',
  };

  return statusMessages[fallback] || fallback;
}

const requestBackend = request;

const api = {
  API_URL,
  ApiError,
  request,
  requestRaw,
  requestBackend,
  clearApiCache,
  extractErrorMessage,
};

globalThis.SGIGApi = api;

export { API_URL, ApiError, clearApiCache, extractErrorMessage, request, requestBackend, requestRaw };
