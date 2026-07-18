import {
  MAP_BASE_STYLES,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_ECUADOR_BOUNDS,
  REVERSE_GEOCODING_URL,
} from '../../core/config.js?v=21';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

export function createCoordinatePicker(options) {
  const mapElement = document.getElementById(options.mapId);
  const latitudeInput = document.getElementById(options.latitudeInputId);
  const longitudeInput = document.getElementById(options.longitudeInputId);

  if (!mapElement || !latitudeInput || !longitudeInput) {
    return null;
  }

  if (!globalThis.maplibregl) {
    mapElement.innerHTML = `
      <div class="map-empty-state">
        <i class="fas fa-map-marker-alt"></i>
        <strong>No se pudo cargar el mapa</strong>
        <span>Ingresa latitud y longitud manualmente para continuar.</span>
      </div>`;
    return null;
  }

  const initialCenter = readInputsAsLngLat(latitudeInput, longitudeInput) || options.center || MAP_DEFAULT_CENTER;
  const map = new globalThis.maplibregl.Map({
    container: mapElement,
    style: MAP_BASE_STYLES.streets.style,
    center: initialCenter,
    zoom: options.zoom || MAP_DEFAULT_ZOOM,
    maxBounds: MAP_ECUADOR_BOUNDS,
  });
  let marker = null;
  let activeStyle = 'streets';
  let reverseGeocodeTimer = null;
  let geolocateControl = null;

  map.addControl(new globalThis.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new globalThis.maplibregl.FullscreenControl(), 'top-right');
  addLayerSwitcher(mapElement, setBaseLayer);
  addSearchControl(mapElement, onSearchResult);
  addGeolocateButton(mapElement, onGeolocate);

  function setPosition(latitude, longitude, source = 'map', optionsOverride = {}) {
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return;

    const lat = Number(latitude);
    const lng = Number(longitude);
    const lngLat = [lng, lat];

    if (!marker) {
      marker = new globalThis.maplibregl.Marker({ draggable: true, color: options.markerColor || '#17a2b8' })
        .setLngLat(lngLat)
        .addTo(map);
      marker.on('dragend', () => {
        const position = marker.getLngLat();
        setPosition(position.lat, position.lng, 'marker');
      });
    } else {
      marker.setLngLat(lngLat);
    }

    if (source !== 'input') {
      latitudeInput.value = formatCoordinate(lat);
      longitudeInput.value = formatCoordinate(lng);
      latitudeInput.dispatchEvent(new Event('input', { bubbles: true }));
      longitudeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    map.easeTo({
      center: lngLat,
      zoom: Math.max(map.getZoom(), options.selectedZoom || 15),
      duration: source === 'input' ? 350 : 650,
    });

    if (options.reverseGeocode !== false && !optionsOverride.skipReverseGeocode) {
      scheduleReverseGeocode(lat, lng);
    }
  }

  function setBaseLayer(styleKey) {
    const baseStyle = MAP_BASE_STYLES[styleKey];
    if (!baseStyle || styleKey === activeStyle) return;
    activeStyle = styleKey;
    map.setStyle(baseStyle.style);
  }

  function scheduleReverseGeocode(latitude, longitude) {
    globalThis.clearTimeout(reverseGeocodeTimer);
    reverseGeocodeTimer = globalThis.setTimeout(async () => {
      try {
        const result = await reverseGeocode(latitude, longitude);
        if (typeof options.onReverseGeocode === 'function') options.onReverseGeocode(result);
      } catch {
        // La geocodificación inversa falló (posible rate limit)
        if (typeof options.onReverseGeocode === 'function') options.onReverseGeocode(null);
      }
    }, 1050); // Aumentado a >1s porque Nominatim permite max 1 req/sec
  }

  function syncFromInputs() {
    const position = readInputsAsLatLng(latitudeInput, longitudeInput);
    if (position) setPosition(position[0], position[1], 'input');
  }

  function onSearchResult(lat, lng, displayName) {
    setPosition(lat, lng, 'search');
    if (options.onReverseGeocode) {
      // Al buscar por dirección ya tenemos el nombre; lo enviamos directamente
      options.onReverseGeocode({ display_name: displayName });
    }
  }

  function onGeolocate(lat, lng) {
    setPosition(lat, lng, 'geolocate');
  }

  map.on('click', (event) => {
    setPosition(event.lngLat.lat, event.lngLat.lng, 'map');
  });

  latitudeInput.addEventListener('input', syncFromInputs);
  longitudeInput.addEventListener('input', syncFromInputs);

  const initialInputPosition = readInputsAsLatLng(latitudeInput, longitudeInput);
  if (initialInputPosition) {
    map.once('load', () => setPosition(initialInputPosition[0], initialInputPosition[1], 'input', { skipReverseGeocode: true }));
  }

  return {
    map,
    setPosition,
    invalidateSize: () => globalThis.setTimeout(() => map.resize(), 120),
  };
}

// ─── Búsqueda por dirección ────────────────────────────────────────

function addSearchControl(mapElement, onResult) {
  const container = document.createElement('div');
  container.className = 'map-search-control';
  const panelId = `${mapElement.id}-address-search-panel`;
  const resultsId = `${panelId}-results`;
  container.innerHTML = `
    <button type="button" class="map-search-toggle" aria-label="Buscar dirección" title="Buscar dirección"
      aria-expanded="false" aria-controls="${panelId}">
      <i class="fas fa-search" aria-hidden="true"></i>
    </button>
    <div class="map-search-panel" id="${panelId}" role="search" aria-label="Búsqueda de dirección" hidden>
      <div class="map-search-wrapper">
        <i class="fas fa-search map-search-icon" aria-hidden="true"></i>
        <input type="text" class="map-search-input" placeholder="Buscar dirección…" autocomplete="off"
          aria-label="Buscar dirección" aria-controls="${resultsId}">
        <button type="button" class="map-search-close" aria-label="Cerrar búsqueda" title="Cerrar búsqueda">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <div class="map-search-results" id="${resultsId}" aria-live="polite" style="display:none;"></div>
    </div>`;
  mapElement.appendChild(container);

  const toggle = container.querySelector('.map-search-toggle');
  const panel = container.querySelector('.map-search-panel');
  const input = container.querySelector('.map-search-input');
  const closeButton = container.querySelector('.map-search-close');
  const resultsEl = container.querySelector('.map-search-results');
  let debounceTimer = null;
  let searchController = null;

  function expandSearch() {
    container.classList.add('is-expanded');
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function collapseSearch({ restoreFocus = false } = {}) {
    globalThis.clearTimeout(debounceTimer);
    searchController?.abort();
    searchController = null;
    resultsEl.innerHTML = '';
    resultsEl.style.display = 'none';
    container.classList.remove('is-expanded');
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', expandSearch);
  closeButton.addEventListener('click', () => collapseSearch({ restoreFocus: true }));

  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.preventDefault();
    collapseSearch({ restoreFocus: true });
  });

  input.addEventListener('input', () => {
    globalThis.clearTimeout(debounceTimer);
    searchController?.abort();
    searchController = null;
    const query = input.value.trim();
    if (query.length < 3) {
      resultsEl.innerHTML = '';
      resultsEl.style.display = 'none';
      return;
    }
    debounceTimer = globalThis.setTimeout(() => doSearch(query), 400);
  });

  document.addEventListener('click', (event) => {
    if (!panel.hidden && !container.contains(event.target)) collapseSearch();
  });

  async function doSearch(query) {
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    resultsEl.innerHTML = '<div class="map-search-result-item is-loading">Buscando…</div>';
    resultsEl.style.display = 'block';

    try {
      const url = new URL(NOMINATIM_SEARCH_URL);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '5');
      url.searchParams.set('countrycodes', 'ec');
      url.searchParams.set('accept-language', 'es');

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SGI-GeoreferencedIncidentManagement/1.0 (sgi@labtorres.me)',
        },
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Error en la búsqueda');

      const data = await response.json();
      if (panel.hidden || controller.signal.aborted) return;
      if (!Array.isArray(data) || data.length === 0) {
        resultsEl.innerHTML = '<div class="map-search-result-item is-empty">Sin resultados</div>';
        return;
      }

      resultsEl.innerHTML = data
        .map(
          (item) =>
            `<button type="button" class="map-search-result-item" data-lat="${item.lat}" data-lon="${item.lon}">
              <i class="fas fa-map-pin mr-1"></i> ${escapeHtml(item.display_name)}
            </button>`
        )
        .join('');

      resultsEl.querySelectorAll('.map-search-result-item').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const lat = Number.parseFloat(btn.dataset.lat);
          const lon = Number.parseFloat(btn.dataset.lon);
          resultsEl.style.display = 'none';
          resultsEl.innerHTML = '';
          input.value = btn.textContent.trim();
          onResult(lat, lon, btn.textContent.trim());
        });
      });
    } catch (error) {
      if (error.name === 'AbortError' || panel.hidden) return;
      resultsEl.innerHTML = '<div class="map-search-result-item is-error">Error al buscar</div>';
    } finally {
      if (searchController === controller) searchController = null;
    }
  }
}

// ─── Botón "Mi ubicación" ───────────────────────────────────────────

function addGeolocateButton(mapElement, onGeolocate) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'map-geolocate-btn';
  btn.title = 'Usar mi ubicación';
  btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
  btn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      btn.title = 'Geolocalización no disponible';
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onGeolocate(position.coords.latitude, position.coords.longitude);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
      },
      () => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
        btn.title = 'No se pudo obtener la ubicación';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
  mapElement.appendChild(btn);
}

// ─── Funciones existentes ──────────────────────────────────────────

async function reverseGeocode(latitude, longitude) {
  const url = new URL(REVERSE_GEOCODING_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SGI-GeoreferencedIncidentManagement/1.0 (sgi@labtorres.me)',
    },
  });

  if (!response.ok) throw new Error('No se pudo obtener la dirección aproximada.');
  return response.json();
}

function addLayerSwitcher(mapElement, onChange) {
  const switcher = document.createElement('div');
  switcher.className = 'map-layer-switcher';
  switcher.innerHTML = `
    <button type="button" class="is-active" data-map-style="streets">Calles</button>
    <button type="button" data-map-style="satellite">Satelital</button>`;

  switcher.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-map-style]');
    if (!button) return;
    switcher.querySelectorAll('button').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    onChange(button.dataset.mapStyle);
  });

  mapElement.appendChild(switcher);
}

function readInputsAsLatLng(latitudeInput, longitudeInput) {
  const latitude = Number(latitudeInput.value);
  const longitude = Number(longitudeInput.value);
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  return [latitude, longitude];
}

function readInputsAsLngLat(latitudeInput, longitudeInput) {
  const position = readInputsAsLatLng(latitudeInput, longitudeInput);
  return position ? [position[1], position[0]] : null;
}

function isValidLatitude(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= -90 && number <= 90;
}

function isValidLongitude(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= -180 && number <= 180;
}

function formatCoordinate(value) {
  return Number(value).toFixed(6);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export {
  escapeHtml,
  formatCoordinate,
  isValidLatitude,
  isValidLongitude,
  readInputsAsLatLng,
  readInputsAsLngLat,
};
