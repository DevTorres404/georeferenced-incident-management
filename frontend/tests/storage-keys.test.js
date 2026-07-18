import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEYS,
  FLASH_MESSAGES,
  getStorageItem,
  setStorageItem,
  getSessionItem,
  setSessionItem,
} from '../app/js/core/storage-keys.js';

describe('STORAGE_KEYS', () => {
  it('defines auth token key', () => {
    expect(STORAGE_KEYS.token).toBe('auth_token');
  });

  it('defines user data key', () => {
    expect(STORAGE_KEYS.user).toBe('user_data');
  });
});

describe('FLASH_MESSAGES', () => {
  it('defines password updated key', () => {
    expect(FLASH_MESSAGES.pwdUpdated).toBe('sgig_flash_message');
  });
});

describe('getStorageItem / setStorageItem', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and retrieves a string value', () => {
    setStorageItem('test-key', 'hello');
    expect(getStorageItem('test-key')).toBe('hello');
  });

  it('returns null for missing keys', () => {
    expect(getStorageItem('non-existent')).toBeNull();
  });

  it('stores an object as JSON', () => {
    const obj = { name: 'test', count: 42 };
    setStorageItem('obj-key', obj);
    expect(localStorage.getItem('obj-key')).toBe(JSON.stringify(obj));
  });

  it('stores a number as string', () => {
    setStorageItem('num-key', 99);
    expect(localStorage.getItem('num-key')).toBe('99');
  });
});

describe('getSessionItem / setSessionItem', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores and retrieves a string', () => {
    setSessionItem('s-test', 'value');
    expect(getSessionItem('s-test')).toBe('value');
  });

  it('returns null for missing items', () => {
    expect(getSessionItem('missing')).toBeNull();
  });
});
