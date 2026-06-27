'use strict';

export const API_URL = window.SGIG_API_URL || window.SGI_API_URL || `${window.location.origin}/api`;
export const API_CACHE_TTL_MS = 30000;
export const APP_NAME = 'SGI';

window.SGIG_API_URL = API_URL;
window.SGI_API_URL = API_URL;
