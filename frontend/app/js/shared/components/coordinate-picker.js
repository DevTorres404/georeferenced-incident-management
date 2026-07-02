import {
  MAP_BASE_STYLES,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_ECUADOR_BOUNDS,
  REVERSE_GEOCODING_URL,
} from '../../core/config.js?v=21';

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

  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new window.maplibregl.FullscreenControl(), 'top-right');
  addLayerSwitcher(mapElement, setBaseLayer);

  function setPosition(latitude, longitude, source = 'map', optionsOverride = {}) {
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return;
    }

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
        if (typeof options.onReverseGeocode === 'function') {
          options.onReverseGeocode(result);
        }
      } catch {
        // La geocodificacion inversa es una ayuda visual; el usuario puede editar manualmente.
      }
    }, 450);
  }

  function syncFromInputs() {
    const position = readInputsAsLatLng(latitudeInput, longitudeInput);
    if (position) {
      setPosition(position[0], position[1], 'input');
    }
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
    },
  });

  if (!response.ok) {
    throw new Error('No se pudo obtener la direccion aproximada.');
  }

  return response.json();
}

function addLayerSwitcher(mapElement, onChange) {
  const switcher = document.createElement('div');
  switcher.className = 'map-layer-switcher';
  switcher.innerHTML = `
    <button type="button" class="is-active" data-map-style="streets">Calles</button>
    <button type="button" data-map-style="satellite">Satelital</button>
  `;

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

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }

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
