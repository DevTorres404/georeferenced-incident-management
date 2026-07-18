/**
 * Storage Keys Centralizado
 *
 * Define todas las claves usadas en localStorage/sessionStorage.
 * Cambiar aquí afecta automáticamente a todos los módulos que importan este archivo.
 *
 * Uso:
 *   import { STORAGE_KEYS, FLASH_MESSAGES } from '../core/storage-keys.js';
 *   const token = localStorage.getItem(STORAGE_KEYS.token);
 */

export const STORAGE_KEYS = {
  // Autenticación
  token: 'auth_token',
  user: 'user_data',
  expiresAt: 'auth_expires_at',
  lastActivityAt: 'auth_last_activity_at',
};

export const FLASH_MESSAGES = {
  credentialUpdated: 'sgig_flash_message',
  sessionExpired: 'sgig_session_expired',
  redirectAfterLogin: 'sgig_redirect_after_login',
};

/**
 * Getter seguro para tokens desde localStorage
 * Retorna null si no existe en lugar de undefined
 */
export function getStorageItem(key) {
  const value = localStorage.getItem(key);
  return value === null ? null : value;
}

/**
 * Setter seguro para localStorage
 * Maneja JSON automáticamente si es un objeto
 */
export function setStorageItem(key, value) {
  if (typeof value === 'object' && value !== null) {
    localStorage.setItem(key, JSON.stringify(value));
  } else {
    localStorage.setItem(key, String(value));
  }
}

/**
 * Getter seguro desde sessionStorage
 */
export function getSessionItem(key) {
  const value = sessionStorage.getItem(key);
  return value === null ? null : value;
}

/**
 * Setter seguro en sessionStorage
 */
export function setSessionItem(key, value) {
  if (typeof value === 'object' && value !== null) {
    sessionStorage.setItem(key, JSON.stringify(value));
  } else {
    sessionStorage.setItem(key, String(value));
  }
}
