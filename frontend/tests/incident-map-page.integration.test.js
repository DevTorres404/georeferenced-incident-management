import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Module-level mocks ────────────────────────────────

vi.mock('../app/js/core/config.js', () => ({
  MAP_DEFAULT_CENTER: [-78.5, -1.5],
  MAP_DEFAULT_ZOOM: 7,
  MAP_STYLE_URL: 'https://example.com/style.json',
}));

vi.mock('../app/js/core/auth-session.js', () => ({
  readUser: vi.fn(() => ({ roles: [{ code: 'ADMIN' }] })),
}));

vi.mock('../app/js/layout/loader.js', () => ({
  showMainLoader: vi.fn(),
  hideMainLoader: vi.fn(),
}));

vi.mock('../app/js/shared/sanitizer.js', () => ({
  escapeHtml: (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
}));

vi.mock('../app/js/modules/map/application/map-service.js', () => ({
  getMapCatalogs: vi.fn(() => Promise.resolve({
    states: [{ id: 1, name: 'Abierto' }, { id: 2, name: 'En Proceso' }],
    priorities: [{ id: 1, name: 'Alta' }, { id: 2, name: 'Media' }],
    categories: [{ id: 1, name: 'Fuga' }],
  })),
  listIncidentMapPoints: vi.fn(() => Promise.resolve([
    {
      id: 1, code: 'INC-001', title: 'Fuga de agua',
      latitude: -0.18, longitude: -78.5,
      state: { name: 'open' }, priority: { name: 'Crítica' },
      category: { name: 'Infraestructura' },
      address: 'Av. Amazonas', city: { name: 'Quito' },
    },
    {
      id: 2, code: 'INC-002', title: 'Bache en calle',
      latitude: -0.22, longitude: -78.48,
      state: { name: 'in_progress' }, priority: { name: 'Media' },
      category: { name: 'Vialidad' },
      address: 'Calle 10', city: { name: 'Quito' },
    },
  ])),
}));

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
  requestAfter: vi.fn(),
}));

import { getMapCatalogs, listIncidentMapPoints } from '../app/js/modules/map/application/map-service.js';
import { readUser } from '../app/js/core/auth-session.js';
import { showMainLoader, hideMainLoader } from '../app/js/layout/loader.js';

// ─── DOM fixture ────────────────────────────────────────

const MAP_DOM = `
<div id="incidentsMap" style="height:500px"></div>
<div id="alertaGlobal" style="display:none"></div>
<div id="pageLoader"></div>
<input id="mapSearch" value="">
<select id="mapState"><option value="">Todos los estados</option></select>
<select id="mapPriority"><option value="">Todas las prioridades</option></select>
<select id="mapCategory"><option value="">Todas las categorias</option></select>
<button id="btnMapFilters" type="button">Filtrar</button>
<button id="btnClearMapFilters" type="button">Limpiar</button>
<div id="mapIncidentList"></div>
<div id="mapMineScope">
  <label><input id="mapMine" type="checkbox"> Mis reportes</label>
</div>
<div id="mapAssignedScope">
  <label><input id="mapAssignedToMe" type="checkbox"> Asignados a mi</label>
</div>
<span id="mapScopeContext"></span>
<span id="mapCounter">0 incidencias</span>
`;

function createMapMock() {
  // Stable source reference — getSource always returns the SAME object
  // so setData tracking works across multiple renderMarkers() calls.
  const sourceObj = {
    setData: vi.fn(),
    getClusterExpansionZoom: vi.fn((_id, cb) => cb(null, 12)),
  };
  let hasSource = false;

  const map = {
    _callbacks: {},
    on: vi.fn((ev, arg1, arg2) => {
      if (typeof arg1 === 'function') {
        map._callbacks[ev] = arg1;
      } else if (typeof arg2 === 'function') {
        map._callbacks[`${ev}:${arg1}`] = arg2;
      }
      return map;
    }),
    getSource: vi.fn(() => (hasSource ? sourceObj : null)),
    addSource: vi.fn(() => { hasSource = true; }),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    getCenter: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
    getZoom: vi.fn(() => 10),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    addControl: vi.fn(),
    resize: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
    getBounds: vi.fn(() => ({
      getNorth: () => 0, getSouth: () => -1, getEast: () => -78, getWest: () => -79,
    })),
    project: vi.fn(() => ({ x: 100, y: 200 })),
    unproject: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
    remove: vi.fn(),
  };
  return map;
}

// ─── Tests ──────────────────────────────────────────────

describe('incident-map-page — integration', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = MAP_DOM;

    vi.stubGlobal('renderLayout', vi.fn());
    vi.stubGlobal('maplibregl', {
      Map: vi.fn(createMapMock),
      Marker: vi.fn(() => ({
        setLngLat: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getLngLat: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
        setDraggable: vi.fn().mockReturnThis(),
        getElement: vi.fn(() => document.createElement('div')),
        setPopup: vi.fn().mockReturnThis(),
      })),
      Popup: vi.fn(() => ({
        setLngLat: vi.fn().mockReturnThis(),
        setHTML: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
      })),
      NavigationControl: vi.fn(),
      AttributionControl: vi.fn(),
      GeolocateControl: vi.fn(),
      ScaleControl: vi.fn(),
      FullscreenControl: vi.fn(),
      LngLatBounds: vi.fn(() => ({ extend: vi.fn() })),
    });

    vi.stubGlobal('$', vi.fn(() => ({
      on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(),
      val: vi.fn(), text: vi.fn(), html: vi.fn(),
      toggle: vi.fn(), addClass: vi.fn().mockReturnThis(), removeClass: vi.fn().mockReturnThis(),
      hasClass: vi.fn(), find: vi.fn().mockReturnThis(), closest: vi.fn().mockReturnThis(),
      data: vi.fn(), prop: vi.fn(), attr: vi.fn(), trigger: vi.fn(),
      show: vi.fn(), hide: vi.fn(), empty: vi.fn(), append: vi.fn(), remove: vi.fn(),
    })));
    globalThis.$.ajax = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // ── 1. Module exports ────────────────────────────────

  describe('module exports', () => {
    it('exports all documented functions', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      const expected = [
        'userHasRole', 'normalizePriorityName', 'getPriorityBadgeClass', 'formatLabel', 'normalizeText',
        'initIncidentMapPage', 'initializeMap', 'renderMarkers', 'renderList',
        'focusPoint', 'buildPopupHtml', 'refreshMap', 'configureScopeControls', 'resetScopeControls',
        'showMessage', 'loadCatalogFilters', 'fillSelect', 'buildFilters', 'loadMapPoints',
        'updateCounter', 'bindEvents', 'showMapLibreMessage',
      ];
      expected.forEach((name) => {
        expect(mod).toHaveProperty(name);
        expect(typeof mod[name]).toBe('function');
      });
    });
  });

  // ── 2. Init via exported function ─────────────────────
  //
  // The module registers a document-level DOMContentLoaded listener at import time.
  // Rather than dispatching DOMContentLoaded (which accumulates stale listeners
  // across tests), we call initIncidentMapPage() directly.

  describe('initIncidentMapPage', () => {
    it('calls renderLayout, reads user, shows loader', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.initIncidentMapPage();

      expect(globalThis.renderLayout).toHaveBeenCalledWith('incident-map');
      expect(readUser).toHaveBeenCalled();
      expect(showMainLoader).toHaveBeenCalled();
    });

    it('creates maplibregl.Map with correct container and options', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.initIncidentMapPage();

      expect(globalThis.maplibregl.Map).toHaveBeenCalledTimes(1);
      const mapArgs = globalThis.maplibregl.Map.mock.calls[0][0];
      expect(mapArgs.container).toBe('incidentsMap');
      expect(mapArgs.center).toEqual([-78.5, -1.5]);
      expect(mapArgs.zoom).toBe(7);
      expect(mapArgs.style).toBe('https://example.com/style.json');
    });

    it('loads catalog filters and map points, hides loader', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.initIncidentMapPage();

      expect(getMapCatalogs).toHaveBeenCalled();
      expect(listIncidentMapPoints).toHaveBeenCalled();
      expect(hideMainLoader).toHaveBeenCalled();
    });

    it('shows error message when service fails', async () => {
      getMapCatalogs.mockRejectedValueOnce(new Error('Network error'));
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.initIncidentMapPage();

      const alerta = document.getElementById('alertaGlobal');
      expect(alerta.style.display).toBe('block');
      expect(alerta.textContent).toContain('Network error');
      expect(hideMainLoader).toHaveBeenCalled();
    });
  });

  // ── 3. Map initialization ────────────────────────────

  describe('map initialization', () => {
    it('creates Map with correct options', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();

      expect(globalThis.maplibregl.Map).toHaveBeenCalledWith({
        container: 'incidentsMap',
        style: 'https://example.com/style.json',
        center: [-78.5, -1.5],
        zoom: 7,
      });
    });

    it('adds navigation and fullscreen controls', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      expect(map.addControl).toHaveBeenCalledTimes(2);
      expect(map.addControl).toHaveBeenCalledWith(
        expect.any(Object),
        'top-right',
      );
    });

    it('registers load event listener', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      expect(map.on).toHaveBeenCalledWith('load', expect.any(Function));
    });

    it('shows fallback message when maplibregl is not available', async () => {
      vi.stubGlobal('maplibregl', null);
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();

      const mapEl = document.getElementById('incidentsMap');
      expect(mapEl.innerHTML).toContain('No se pudo cargar el mapa');
    });
  });

  // ── 4. Marker / cluster placement ────────────────────

  describe('marker and cluster placement', () => {
    it('calls addSource and addLayer on first render', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      await mod.loadMapPoints();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      const loadCb = map._callbacks.load;
      expect(loadCb).toBeDefined();
      loadCb();

      expect(map.addSource).toHaveBeenCalledWith('incidents-source', expect.objectContaining({
        type: 'geojson',
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      }));
      expect(map.addLayer).toHaveBeenCalledTimes(3);
    });

    it('calls setData instead of addSource on subsequent render', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      await mod.loadMapPoints();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      const source = map.getSource('incidents-source');
      expect(source).toBeNull();

      map._callbacks.load(); // first render — addSource and addLayer

      expect(map.addSource).toHaveBeenCalledTimes(1);
      expect(map.addLayer).toHaveBeenCalledTimes(3);

      // Second render — same source object, calls setData not addSource
      mod.renderMarkers();
      expect(map.addSource).toHaveBeenCalledTimes(1);
      expect(map.getSource('incidents-source').setData).toHaveBeenCalled();
    });

    it('includes incident data in geojson features', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      await mod.loadMapPoints();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      map._callbacks.load();

      expect(map.addSource).toHaveBeenCalledWith('incidents-source', expect.objectContaining({
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              geometry: expect.objectContaining({
                coordinates: [-78.5, -0.18],
              }),
              properties: expect.objectContaining({
                code: 'INC-001',
                id: 1,
                _priority_name: 'CRITICA',
              }),
            }),
          ]),
        }),
      }));
    });

    it('fits bounds when features exist', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      await mod.loadMapPoints();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      map._callbacks.load();

      expect(map.fitBounds).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ padding: 60, maxZoom: 15 }),
      );
    });
  });

  // ── 5. Cluster interaction ───────────────────────────

  describe('cluster interaction', () => {
    it('registers click handler on clusters layer', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      await mod.loadMapPoints();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      map._callbacks.load();

      expect(map.on).toHaveBeenCalledWith('click', 'incidents-clusters', expect.any(Function));
    });

    it('cluster click handler calls easeTo with zoom from source', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      await mod.loadMapPoints();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      map._callbacks.load();

      const handler = map._callbacks['click:incidents-clusters'];
      expect(handler).toBeDefined();
      handler({
        features: [{ properties: { cluster_id: 99 } }],
        lngLat: { lat: -0.2, lng: -78.5 },
      });

      expect(map.easeTo).toHaveBeenCalledWith({
        center: { lat: -0.2, lng: -78.5 },
        zoom: 12,
        duration: 300,
      });
    });
  });

  // ── 6. Point popup ───────────────────────────────────

  describe('point popup', () => {
    it('buildPopupHtml returns correct structure', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      const point = {
        id: 1, code: 'INC-001', title: 'Fuga',
        state: { name: 'open' }, priority: { name: 'Crítica' },
        address: 'Av. Amazonas', city: { name: 'Quito' },
      };
      const html = mod.buildPopupHtml(point);

      expect(html).toContain('INC-001');
      expect(html).toContain('Fuga');
      // formatLabel('open') -> 'open' (because of simple mock v => v || '-')
      expect(html).toContain('open');
      expect(html).toContain('Crítica');
      expect(html).toContain('Av. Amazonas');
      expect(html).toContain('incident-detail.html?id=1');
    });

    it('point click handler creates popup with correct content', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      await mod.loadMapPoints();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      map._callbacks.load();

      const handler = map._callbacks['click:incidents-points'];
      expect(handler).toBeDefined();

      handler({
        features: [{
          properties: {
            id: 1, code: 'INC-001', title: 'Fuga',
            state: { name: 'open' }, priority: { name: 'Crítica' },
            address: 'Av. Amazonas', city: { name: 'Quito' },
          },
        }],
        lngLat: { lat: -0.18, lng: -78.5 },
      });

      expect(globalThis.maplibregl.Popup).toHaveBeenCalledWith({ offset: 18 });
    });

    it('registers mouseenter/mouseleave handlers on points and clusters', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      await mod.loadMapPoints();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      map._callbacks.load();

      expect(map.on).toHaveBeenCalledWith('mouseenter', 'incidents-clusters', expect.any(Function));
      expect(map.on).toHaveBeenCalledWith('mouseleave', 'incidents-clusters', expect.any(Function));
      expect(map.on).toHaveBeenCalledWith('mouseenter', 'incidents-points', expect.any(Function));
      expect(map.on).toHaveBeenCalledWith('mouseleave', 'incidents-points', expect.any(Function));
    });
  });

  // ── 7. Focus / navigate to point ─────────────────────

  describe('focusPoint', () => {
    it('creates popup and eases to point location', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();

      const map = globalThis.maplibregl.Map.mock.results[0].value;
      map._callbacks.load();

      const point = {
        id: 1, code: 'INC-001', title: 'Fuga',
        latitude: -0.18, longitude: -78.5,
        state: { name: 'open' }, priority: { name: 'Crítica' },
        address: 'Av. Amazonas', city: { name: 'Quito' },
      };
      mod.focusPoint(point);

      expect(globalThis.maplibregl.Popup).toHaveBeenCalled();
      expect(map.easeTo).toHaveBeenCalledWith({
        center: [-78.5, -0.18],
        zoom: 16,
        duration: 650,
      });
    });

    it('does nothing when map is null', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      const point = {
        id: 1, latitude: -0.18, longitude: -78.5,
        state: { name: 'open' }, priority: { name: 'Crítica' },
      };

      expect(() => mod.focusPoint(point)).not.toThrow();
    });

    it('does nothing with invalid coordinates', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();

      expect(() => mod.focusPoint({ id: 1 })).not.toThrow();
    });
  });

  // ── 8. Filter integration ────────────────────────────

  describe('filter integration', () => {
    it('buildFilters reads values from DOM', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');

      // Populate selects so setting .value = '1' works
      await mod.loadCatalogFilters();

      document.getElementById('mapSearch').value = 'fuga';
      document.getElementById('mapState').value = '1';
      document.getElementById('mapPriority').value = '2';
      document.getElementById('mapCategory').value = '1';
      document.getElementById('mapMine').checked = true;

      const filters = mod.buildFilters();

      expect(filters.search).toBe('fuga');
      expect(filters.state_id).toBe('1');
      expect(filters.priority_id).toBe('2');
      expect(filters.category_id).toBe('1');
      expect(filters.mine).toBe(1);
      expect(filters.assigned_to_me).toBe('');
    });

    it('loadMapPoints calls service with filters and updates counter', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.loadMapPoints();

      expect(listIncidentMapPoints).toHaveBeenCalled();
      const counter = document.getElementById('mapCounter');
      expect(counter.textContent).toContain('2');
    });

    it('refreshMap chains load, render and hides loader', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();

      await mod.refreshMap();

      expect(listIncidentMapPoints).toHaveBeenCalled();
      expect(hideMainLoader).toHaveBeenCalled();
    });

    it('refreshMap shows error on failure', async () => {
      listIncidentMapPoints.mockRejectedValueOnce(new Error('Fallo'));
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.refreshMap();

      const alerta = document.getElementById('alertaGlobal');
      expect(alerta.style.display).toBe('block');
      expect(alerta.textContent).toContain('Fallo');
    });

    it('fillSelect populates a select element', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      const select = document.getElementById('mapState');
      select.innerHTML = '';

      mod.fillSelect('mapState', [{ id: 1, name: 'Abierto' }, { id: 2, name: 'Cerrado' }], 'Todos los estados');

      expect(select.options.length).toBe(3);
      expect(select.options[0].value).toBe('');
      expect(select.options[0].textContent).toBe('Todos los estados');
      expect(select.options[1].value).toBe('1');
      expect(select.options[1].textContent).toBe('Abierto');
    });

    it('loadCatalogFilters calls getMapCatalogs and fills selects', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.loadCatalogFilters();

      expect(getMapCatalogs).toHaveBeenCalled();
      const stateSelect = document.getElementById('mapState');
      expect(stateSelect.options.length).toBeGreaterThan(1);
      const prioritySelect = document.getElementById('mapPriority');
      expect(prioritySelect.options.length).toBeGreaterThan(1);
    });
  });

  // ── 9. Scope controls ────────────────────────────────
  //
  // configureScopeControls reads state.currentUser which is set by
  // initIncidentMapPage. Call the full init path so the user is populated.

  describe('scope controls', () => {
    it('enables mine/assigned for ADMIN', async () => {
      readUser.mockReturnValue({ roles: [{ code: 'ADMIN' }] });
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.initIncidentMapPage();

      const mine = document.getElementById('mapMine');
      const assigned = document.getElementById('mapAssignedToMe');
      expect(mine.disabled).toBe(false);
      expect(assigned.disabled).toBe(false);
      const context = document.getElementById('mapScopeContext');
      expect(context.textContent).toContain('Cobertura nacional');
    });

    it('applies operator restrictions', async () => {
      readUser.mockReturnValue({ roles: [{ code: 'OPERADOR' }] });
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.initIncidentMapPage();

      const mineScope = document.getElementById('mapMineScope');
      expect(mineScope.style.display).toBe('none');
      const assignedScope = document.getElementById('mapAssignedScope');
      expect(assignedScope.style.display).toBe('');
      const assigned = document.getElementById('mapAssignedToMe');
      expect(assigned.disabled).toBe(true);
      expect(assigned.checked).toBe(true);
    });

    it('applies supervisor context text', async () => {
      readUser.mockReturnValue({ roles: [{ code: 'SUPERVISOR' }] });
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.initIncidentMapPage();

      const context = document.getElementById('mapScopeContext');
      expect(context.textContent).toContain('zona operativa');
    });

    it('resetScopeControls resets mine/assigned checkboxes', async () => {
      readUser.mockReturnValue({ roles: [{ code: 'ADMIN' }] });
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.initIncidentMapPage();

      document.getElementById('mapMine').checked = true;
      mod.resetScopeControls();

      expect(document.getElementById('mapMine').checked).toBe(false);
    });
  });

  // ── 10. List rendering ───────────────────────────────

  describe('list rendering', () => {
    it('renderList renders incident items', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.loadMapPoints();
      mod.renderList();

      const list = document.getElementById('mapIncidentList');
      expect(list.innerHTML).toContain('INC-001');
      expect(list.innerHTML).toContain('Fuga de agua');
      expect(list.innerHTML).toContain('INC-002');
      const buttons = list.querySelectorAll('.js-focus-incident');
      expect(buttons.length).toBe(2);
    });

    it('renderList shows empty state when no points', async () => {
      listIncidentMapPoints.mockResolvedValueOnce([]);
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.loadMapPoints();
      mod.renderList();

      const list = document.getElementById('mapIncidentList');
      expect(list.innerHTML).toContain('No hay incidencias');
    });

    it('renderList does not throw when element is missing', async () => {
      document.getElementById('mapIncidentList').remove();
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      await mod.loadMapPoints();

      expect(() => mod.renderList()).not.toThrow();
    });
  });

  // ── 11. Utility functions ────────────────────────────

  describe('utility functions', () => {
    it('updateCounter sets counter text', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      document.getElementById('mapCounter').textContent = '';
      mod.updateCounter();
      expect(document.getElementById('mapCounter').textContent).toContain('0');
    });

    it('showMessage shows alert with given type', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.showMessage('Test error', 'danger');

      const alerta = document.getElementById('alertaGlobal');
      expect(alerta.style.display).toBe('block');
      expect(alerta.className).toContain('alert-danger');
      expect(alerta.textContent).toContain('Test error');
    });

    it('showMessage uses default type info', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.showMessage('Info msg');

      const alerta = document.getElementById('alertaGlobal');
      expect(alerta.className).toContain('alert-info');
    });
  });

  // ── 12. ShowMapLibreMessage fallback ──────────────────

  describe('showMapLibreMessage', () => {
    it('renders fallback message inside map container', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.showMapLibreMessage();

      const map = document.getElementById('incidentsMap');
      expect(map.innerHTML).toContain('No se pudo cargar el mapa');
      expect(map.innerHTML).toContain('MapLibre');
      expect(map.innerHTML).toContain('OpenFreeMap');
    });

    it('does not throw when map container is missing', async () => {
      document.getElementById('incidentsMap').remove();
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      expect(() => mod.showMapLibreMessage()).not.toThrow();
    });
  });

  // ── 13. Event bindings ───────────────────────────────

  describe('event bindings', () => {
    it('bindEvents attaches click handler to filter button', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      mod.bindEvents();

      document.getElementById('btnMapFilters').click();
      // refreshMap → loadMapPoints → listIncidentMapPoints (called synchronously)
      expect(listIncidentMapPoints).toHaveBeenCalled();
    });

    it('bindEvents clear button resets filters and refreshes', async () => {
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');
      mod.initializeMap();
      mod.bindEvents();

      document.getElementById('btnClearMapFilters').click();

      expect(document.getElementById('mapSearch').value).toBe('');
      expect(document.getElementById('mapState').value).toBe('');
      expect(listIncidentMapPoints).toHaveBeenCalled();
    });
  });

  // ── 14. Notification listener ────────────────────────
  //
  // The sgi:notification-created handler is registered inside initIncidentMapPage.
  // Call init first so the listener exists.

  describe('notification listener', () => {
    it('calls refreshMap when sgi:notification-created fires and page is visible', async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      const mod = await import('../app/js/modules/map/presentation/incident-map-page.js');

      // The event listener is set up inside initIncidentMapPage
      await mod.initIncidentMapPage();

      globalThis.dispatchEvent(new CustomEvent('sgi:notification-created'));

      await vi.waitFor(() => {
        expect(listIncidentMapPoints).toHaveBeenCalled();
      });
    });
  });
});
