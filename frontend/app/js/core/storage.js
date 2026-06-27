/**
 * Wrapper sencillo para localStorage
 */

export const StorageService = {
  get(key) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      return localStorage.getItem(key);
    }
  },
  
  set(key, value) {
    const val = typeof value === 'object' ? JSON.stringify(value) : value;
    localStorage.setItem(key, val);
  },
  
  remove(key) {
    localStorage.removeItem(key);
  },
  
  clear() {
    localStorage.clear();
  }
};
