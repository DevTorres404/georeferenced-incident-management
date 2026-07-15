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

  if (!window.maplibregl) {
    mapElement.innerHTML = `
      <div class="map-empty-state">
        <i class="fas fa-map-marker-alt"></i>
        <strong>No se pudo cargar el mapa</strong>
        <span>Ingresa latitud y longitud manualmente para continuar.</span>
      </div>`;
    return null;
  }

  const initialCenter = readInputsAsLngLat(latitudeInput, longitudeInput) || options.center || MAP_DEFAULT_CENTER;
  const map = new window.maplibregl.Map({
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

  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new window.maplibregl.FullscreenControl(), 'top-right');
  addLayerSwitcher(mapElement, setBaseLayer);
  addSearchControl(mapElement, onSearchResult);
  addGeolocateButton(mapElement, onGeolocate);

  function setPosition(latitude, longitude, source = 'map', optionsOverride = {}) {
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return;

    const lat = Number(latitude);
    const lng = Number(longitude);
    const lngLat = [lng, lat];

    if (!marker) {
      marker = new window.maplibregl.Marker({ draggable: true, color: options.markerColor || '#17a2b8' })
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
    window.clearTimeout(reverseGeocodeTimer);
    reverseGeocodeTimer = window.setTimeout(async () => {
      try {
        const result = await reverseGeocode(latitude, longitude);
        if (typeof options.onReverseGeocode === 'function') options.onReverseGeocode(result);
      } catch {
        // La geocodificacion inversa es una ayuda visual; el usuario puede editar manualmente.
      }
    }, 450);
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
    invalidateSize: () => window.setTimeout(() => map.resize(), 120),
  };
}

// ─── Búsqueda por dirección ────────────────────────────────────────

function addSearchControl(mapElement, onResult) {
  const container = document.createElement('div');
  container.className = 'map-search-control';
  container.innerHTML = `
    <div class="map-search-wrapper">
      <i class="fas fa-search map-search-icon"></i>
      <input type="text" class="map-search-input" placeholder="Buscar dirección…" autocomplete="off">
      <div class="map-search-results" style="display:none;"></div>
    </div>`;
  mapElement.appendChild(container);

  const input = container.querySelector('.map-search-input');
  const resultsEl = container.querySelector('.map-search-results');
  let debounceTimer = null;
  let searchInFlight = false;

  input.addEventListener('input', () => {
    window.clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 3) {
      resultsEl.style.display = 'none';
      return;
    }
    debounceTimer = window.setTimeout(() => doSearch(query), 400);
  });

  // Cerrar resultados al hacer clic fuera
  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) resultsEl.style.display = 'none';
  });

  async function doSearch(query) {
    if (searchInFlight) return;
    searchInFlight = true;
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
      });

      if (!response.ok) throw new Error('Error en la búsqueda');

      const data = await response.json();
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
        btn.addEventListener('click', () => {
          const lat = parseFloat(btn.dataset.lat);
          const lon = parseFloat(btn.dataset.lon);
          resultsEl.style.display = 'none';
          input.value = btn.textContent.trim();
          onResult(lat, lon, btn.textContent.trim());
        });
      });
    } catch {
      resultsEl.innerHTML = '<div class="map-search-result-item is-error">Error al buscar</div>';
    } finally {
      searchInFlight = false;
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
