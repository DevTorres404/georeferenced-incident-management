'use strict';

const IS_LOCAL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

export const API_URL =
  window.SGI_API_URL ||
  (IS_LOCAL
    ? 'http://127.0.0.1:8000/api'
    : 'https://api.labtorres.me/api');

export const API_CACHE_TTL_MS = 30000;

export const APP_NAME = 'SGI';

export const REVERB_APP_KEY =
  window.SGI_REVERB_APP_KEY ||
  'local-gic-key';

export const REVERB_HOST =
  window.SGI_REVERB_HOST ||
  (IS_LOCAL ? '127.0.0.1' : 'api.labtorres.me');

export const REVERB_PORT =
  Number(window.SGI_REVERB_PORT || (IS_LOCAL ? 8080 : 443));

export const REVERB_SCHEME =
  window.SGI_REVERB_SCHEME ||
  (IS_LOCAL ? 'http' : 'https');

export const MAP_DEFAULT_CENTER =
  window.SGI_MAP_DEFAULT_CENTER || [-78.4678, -1.8312];

export const MAP_DEFAULT_ZOOM =
  Number(window.SGI_MAP_DEFAULT_ZOOM || 6);

export const MAP_STYLE_URL =
  window.SGI_MAP_STYLE_URL ||
  'https://tiles.openfreemap.org/styles/liberty';

export const MAP_ECUADOR_NAVIGATION_REGIONS =
  window.SGI_MAP_ECUADOR_NAVIGATION_REGIONS || {
    continental: [[-81.25, -5.1], [-75.0, 1.85]],
    galapagos: [[-92.2, -1.75], [-89.1, 1.75]],
  };

export const MAP_ECUADOR_BOUNDS =
  window.SGI_MAP_ECUADOR_BOUNDS || [[-92.2, -5.25], [-75.0, 1.85]];

export const MAP_BASE_STYLES =
  window.SGI_MAP_BASE_STYLES || {
    streets: {
      label: 'Calles',
      style: MAP_STYLE_URL,
    },
    satellite: {
      label: 'Satelital',
      style: {
        version: 8,
        sources: {
          'esri-world-imagery': {
            type: 'raster',
            tiles: [
              'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: 'Tiles &copy; Esri',
          },
        },
        layers: [
          {
            id: 'esri-world-imagery',
            type: 'raster',
            source: 'esri-world-imagery',
          },
        ],
      },
    },
  };

export const REVERSE_GEOCODING_URL =
  window.SGI_REVERSE_GEOCODING_URL ||
  'https://nominatim.openstreetmap.org/reverse';

window.SGI_API_URL = API_URL;