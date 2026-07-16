import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Module-level mocks ────────────────────────────────

vi.mock('../app/js/presentation/dom-utils.js', () => ({
  $: vi.fn((sel) => document.querySelector(sel)),
  $$: vi.fn((sel) => document.querySelectorAll(sel)),
  hideSpinner: vi.fn(),
  showErrorAlert: vi.fn(),
  showSpinner: vi.fn(),
  showSuccessAlert: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? ''),
  formatCatalogLabel: (v) => v || '-',
  showGlobalAlert: vi.fn(),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
  requestAfter: vi.fn(),
}));

vi.mock('../app/js/modules/catalogs/application/catalogs-service.js', () => ({
  getCatalogOverview: vi.fn(() => Promise.resolve({ categories: [] })),
}));

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  createIncident: vi.fn(() => Promise.resolve({ data: { id: 42 }, message: 'Registrada con exito' })),
  uploadIncidentAttachment: vi.fn(() => Promise.resolve()),
}));

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setFieldError: vi.fn(),
  clearFieldError: vi.fn(),
}));

vi.mock('../app/js/shared/components/coordinate-picker.js', () => ({
  createCoordinatePicker: vi.fn(() => ({
    map: { once: vi.fn((_ev, cb) => cb?.()), jumpTo: vi.fn() },
    invalidateSize: vi.fn(),
  })),
}));

vi.mock('../app/js/modules/territorial-units/application/territorial-unit-service.js', () => ({
  getTerritorialChildren: vi.fn(() => Promise.resolve([])),
  listTerritorialCantons: vi.fn(() => Promise.resolve([])),
  listTerritorialParishes: vi.fn(() => Promise.resolve([])),
  listTerritorialProvinces: vi.fn(() => Promise.resolve([])),
}));

// ─── Static imports for mocked dependencies ───────────

import { createIncident } from '../app/js/modules/incidents/application/incidents-service.js';
import { getCatalogOverview } from '../app/js/modules/catalogs/application/catalogs-service.js';
import { createCoordinatePicker } from '../app/js/shared/components/coordinate-picker.js';
import { showSuccessAlert } from '../app/js/presentation/dom-utils.js';
import { setFieldError } from '../app/js/shared/validators/validation-utils.js';

// ─── Global mocks ─────────────────────────────────────

globalThis.maplibregl = {
  Map: vi.fn(() => ({
    on: vi.fn().mockReturnThis(), remove: vi.fn(),
    getCenter: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
    getZoom: vi.fn(() => 10), setCenter: vi.fn(), setZoom: vi.fn(),
    addControl: vi.fn(), resize: vi.fn(), flyTo: vi.fn(),
    getSource: vi.fn(() => ({ setData: vi.fn() })),
    addSource: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn(), removeSource: vi.fn(),
    getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
  })),
  Marker: vi.fn(() => ({
    setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(), getLngLat: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
    setDraggable: vi.fn().mockReturnThis(), getElement: vi.fn(() => document.createElement('div')),
    setPopup: vi.fn().mockReturnThis(),
  })),
  Popup: vi.fn(() => ({
    setLngLat: vi.fn().mockReturnThis(), setHTML: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(), remove: vi.fn(),
  })),
  NavigationControl: vi.fn(), AttributionControl: vi.fn(),
};

globalThis.$ = vi.fn(() => ({
  on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(),
  val: vi.fn(), text: vi.fn(), html: vi.fn(),
  toggle: vi.fn(), addClass: vi.fn().mockReturnThis(), removeClass: vi.fn().mockReturnThis(),
  hasClass: vi.fn(), find: vi.fn().mockReturnThis(), closest: vi.fn().mockReturnThis(),
  data: vi.fn(), prop: vi.fn(), attr: vi.fn(), trigger: vi.fn(),
  show: vi.fn(), hide: vi.fn(), empty: vi.fn(), append: vi.fn(), remove: vi.fn(),
  fadeIn: vi.fn(), fadeOut: vi.fn(),
}));
globalThis.$.ajax = vi.fn();
globalThis.$.post = vi.fn();

// ─── DOM fixture ───────────────────────────────────────

const WIZARD_DOM = `
<div id="formNuevaIncidencia">
  <div data-step-panel="location">
    <div id="incidentLocationMap" style="height:300px"></div>
    <input id="fDireccion" />
    <input id="fReferencia" />
    <input id="fLatitud" />
    <input id="fLongitud" />
    <div class="form-group">
      <select id="fTerritorialProvince"><option value="">Seleccione provincia</option></select>
    </div>
    <div class="form-group">
      <select id="fTerritorialCanton" disabled><option value="">Seleccione canton</option></select>
    </div>
    <div class="form-group">
      <select id="fTerritorialParish" disabled><option value="">Seleccione parroquia</option></select>
    </div>
    <div data-manual-territory="sector" class="d-none">
      <input id="fManualSector" />
    </div>
    <span id="selectedLocationText"></span>
    <span id="selectedTerritoryText"></span>
    <span id="selectedLatitude"></span>
    <span id="selectedLongitude"></span>
    <span id="locationStatusBadge" class="badge"></span>
    <div id="locationStepHint"></div>
  </div>

  <div data-step-panel="evidence" class="d-none">
    <div id="evidenceDropzone"></div>
    <input id="fEvidence" type="file" />
    <button id="btnAddEvidence" type="button">Añadir</button>
    <div id="evidencePreviewList"></div>
    <span id="evidenceCount">0</span>
    <div id="evidenceFeedback"></div>
  </div>

  <div data-step-panel="details" class="d-none">
    <input id="fTitulo" />
    <span id="cntTitulo">0/120</span>
    <textarea id="fDescripcion"></textarea>
    <span id="cntDescripcion">0/1000</span>
    <div class="form-group">
      <select id="fTipo"><option value="">Seleccione tipo</option></select>
    </div>
    <div class="form-group">
      <select id="fSubtipo" disabled><option value="">Primero seleccione tipo</option></select>
    </div>
    <input id="fCorreo" />
    <div id="detailsStepHint"></div>
  </div>

  <div data-step-panel="review" class="d-none">
    <div id="resumenIncidencia"></div>
    <input type="checkbox" id="fConfirmacion" />
    <div id="alertaFormulario" class="d-none"></div>
  </div>

  <button id="btnNextStep" type="button">Siguiente</button>
  <button id="btnPrevStep" type="button" disabled>Anterior</button>
  <button id="btnRegistrar" type="submit" class="d-none">Registrar</button>
  <span id="spinnerRegistrar" class="d-none"></span>

  <button class="wizard-step-button" data-step-target="location">1</button>
  <button class="wizard-step-button" data-step-target="evidence">2</button>
  <button class="wizard-step-button" data-step-target="details">3</button>
  <button class="wizard-step-button" data-step-target="review">4</button>

  <div id="draftBanner" class="d-none">Tienes un borrador</div>
</div>
`;

// ─── Tests ─────────────────────────────────────────────

describe('incident-create-page — wizard lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = WIZARD_DOM;
    vi.stubGlobal('renderLayout', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-0000-0000-000000000001' });
    vi.stubGlobal('location', { href: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // ── 1. Export check ─────────────────────────────────

  describe('initCreateIncident export', () => {
    it('exports initCreateIncident as a function', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(mod.initCreateIncident).toBeDefined();
      expect(typeof mod.initCreateIncident).toBe('function');
    });
  });

  // ── 2. Full wizard init ─────────────────────────────

  describe('full wizard initialization', () => {
    it('sets step 1 visible and hides other steps', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      const panels = document.querySelectorAll('[data-step-panel]');
      expect(panels[0].classList.contains('d-none')).toBe(false);
      for (let i = 1; i < panels.length; i++) {
        expect(panels[i].classList.contains('d-none')).toBe(true);
      }
    });

    it('initializes navigation button visibility', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      expect(document.getElementById('btnPrevStep').disabled).toBe(true);
      expect(document.getElementById('btnNextStep').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('btnRegistrar').classList.contains('d-none')).toBe(true);
    });

    it('initializes progress indicators', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      const buttons = document.querySelectorAll('.wizard-step-button');
      expect(buttons[0].classList.contains('is-active')).toBe(true);
      for (let i = 1; i < buttons.length; i++) {
        expect(buttons[i].classList.contains('is-active')).toBe(false);
      }
    });

    it('calls getCatalogOverview and createCoordinatePicker', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      expect(getCatalogOverview).toHaveBeenCalled();
      expect(createCoordinatePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          mapId: 'incidentLocationMap',
          latitudeInputId: 'fLatitud',
          longitudeInputId: 'fLongitud',
        })
      );
    });
  });

  // ── 3. Step navigation flow ─────────────────────────

  describe('step navigation flow', () => {
    it('advances to next step via Siguiente click when location valid', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      document.getElementById('btnNextStep').click();

      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(true);
      expect(document.querySelector('[data-step-panel="evidence"]').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('btnPrevStep').disabled).toBe(false);
    });

    it('goes back to previous step via Anterior click', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      document.getElementById('btnNextStep').click();
      expect(document.querySelector('[data-step-panel="evidence"]').classList.contains('d-none')).toBe(false);

      document.getElementById('btnPrevStep').click();
      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('btnPrevStep').disabled).toBe(true);
    });

    it('navigates through all 4 steps with valid data', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      // 1 → 2 (location → evidence)
      document.getElementById('btnNextStep').click();
      expect(document.querySelector('[data-step-panel="evidence"]').classList.contains('d-none')).toBe(false);

      // 2 → 3 (evidence → details)
      document.getElementById('btnNextStep').click();
      expect(document.querySelector('[data-step-panel="details"]').classList.contains('d-none')).toBe(false);

      // Populate select options manually (catalogs mock returns empty by default)
      const tipoEl = document.getElementById('fTipo');
      tipoEl.innerHTML = '<option value="">Seleccione tipo</option><option value="1">Daño estructural</option>';
      const subtipoEl = document.getElementById('fSubtipo');
      subtipoEl.innerHTML = '<option value="">Seleccione subtipo</option><option value="10">Grieta</option>';
      subtipoEl.disabled = false;

      // Fill details with values matching the options above
      document.getElementById('fTitulo').value = 'Título de prueba válido';
      document.getElementById('fDescripcion').value = 'Descripción de prueba para la incidencia que tiene más de veinte caracteres';
      document.getElementById('fTipo').value = '1';
      document.getElementById('fSubtipo').value = '10';
      document.getElementById('fCorreo').value = 'test@example.com';

      // 3 → 4 (details → review)
      document.getElementById('btnNextStep').click();
      expect(document.querySelector('[data-step-panel="review"]').classList.contains('d-none')).toBe(false);

      // Verify progress indicators reflect final state
      const buttons = document.querySelectorAll('.wizard-step-button');
      expect(buttons[0].classList.contains('is-complete')).toBe(true);
      expect(buttons[3].classList.contains('is-active')).toBe(true);
    });
  });

  // ── 4. Form validation on step change ────────────────

  describe('form validation on step change', () => {
    it('stays on step 1 when no coordinates entered', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      document.getElementById('btnNextStep').click();

      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(false);
      expect(setFieldError).toHaveBeenCalledWith('fLatitud', expect.any(String));
    });

    it('allows advance after filling valid coordinates', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';

      document.getElementById('btnNextStep').click();

      expect(document.querySelector('[data-step-panel="evidence"]').classList.contains('d-none')).toBe(false);
    });
  });

  // ── 5. Map / coordinate picker step ──────────────────

  describe('map initialization', () => {
    it('creates coordinate picker with correct options during init', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      expect(createCoordinatePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          mapId: 'incidentLocationMap',
          latitudeInputId: 'fLatitud',
          longitudeInputId: 'fLongitud',
          center: [-78.55, -1.7],
          zoom: 6.15,
        })
      );
    });

    it('invalidates map size when step changes', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      const mockPicker = createCoordinatePicker.mock.results[0].value;

      document.getElementById('btnNextStep').click();

      expect(mockPicker.invalidateSize).toHaveBeenCalled();
    });
  });

  // ── 6. Draft save/restore ────────────────────────────

  describe('draft save and restore', () => {
    it('saves draft on step change during init flow', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      document.getElementById('btnNextStep').click();

      const stored = JSON.parse(localStorage.getItem('SGI_incident_draft'));
      expect(stored).not.toBeNull();
      expect(stored._currentStep).toBe(1);
      expect(stored.fLatitud).toBe('-0.229');
    });

    it('restores saved draft fields on reinit', async () => {
      localStorage.setItem('SGI_incident_draft', JSON.stringify({
        fTitulo: 'Restored from draft',
        fLatitud: '-0.18',
        fLongitud: '-78.5',
        _currentStep: 0,
        _savedAt: Date.now(),
      }));

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      expect(document.getElementById('fTitulo').value).toBe('Restored from draft');
      expect(document.getElementById('fLatitud').value).toBe('-0.18');
      expect(document.getElementById('fLongitud').value).toBe('-78.5');
    });

    it('shows draft restoration banner when draft exists', async () => {
      localStorage.setItem('SGI_incident_draft', JSON.stringify({
        fTitulo: 'Draft',
        _currentStep: 0,
        _savedAt: Date.now(),
      }));

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      expect(document.getElementById('draftBanner').classList.contains('d-none')).toBe(false);
    });
  });

  // ── 7. Full form submission ──────────────────────────

  describe('full form submission', () => {
    it('submits form with all data via handleSubmit', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';
      document.getElementById('fTitulo').value = 'Título de prueba válido';
      document.getElementById('fDescripcion').value = 'Descripción de prueba para la incidencia que tiene más de veinte caracteres';
      document.getElementById('fCorreo').value = 'test@example.com';
      document.getElementById('fDireccion').value = 'Av. Prueba, Quito';
      document.getElementById('fReferencia').value = 'Frente al parque';
      document.getElementById('fConfirmacion').checked = true;

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      // Populate type selects (catalogs mock returns empty)
      const tipoEl = document.getElementById('fTipo');
      tipoEl.innerHTML = '<option value="">Seleccione tipo</option><option value="1">Daño estructural</option>';
      const subtipoEl = document.getElementById('fSubtipo');
      subtipoEl.innerHTML = '<option value="">Seleccione subtipo</option><option value="10">Grieta</option>';
      subtipoEl.disabled = false;
      tipoEl.value = '1';
      subtipoEl.value = '10';

      mod.goNext();
      mod.goNext();
      mod.goNext();

      const event = { preventDefault: vi.fn() };
      await mod.handleSubmit(event);

      expect(createIncident).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Título de prueba válido',
        latitude: -0.229,
        longitude: -78.524,
        category_id: 1,
        subcategory_id: 10,
      }));

      expect(showSuccessAlert).toHaveBeenCalled();
    });

    it('clears draft after successful submission', async () => {
      localStorage.setItem('SGI_incident_draft', JSON.stringify({
        fTitulo: 'Draft to clear',
        _currentStep: 2,
        _savedAt: Date.now(),
      }));

      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';
      document.getElementById('fTitulo').value = 'Título de prueba válido';
      document.getElementById('fDescripcion').value = 'Descripción de prueba para la incidencia que tiene más de veinte caracteres';
      document.getElementById('fCorreo').value = 'test@example.com';
      document.getElementById('fDireccion').value = 'Av. Prueba, Quito';
      document.getElementById('fConfirmacion').checked = true;

      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.initCreateIncident();

      // Populate type selects
      const tipoEl = document.getElementById('fTipo');
      tipoEl.innerHTML = '<option value="">Seleccione tipo</option><option value="1">Daño estructural</option>';
      const subtipoEl = document.getElementById('fSubtipo');
      subtipoEl.innerHTML = '<option value="">Seleccione subtipo</option><option value="10">Grieta</option>';
      subtipoEl.disabled = false;
      tipoEl.value = '1';
      subtipoEl.value = '10';

      mod.goNext();
      mod.goNext();
      mod.goNext();

      const event = { preventDefault: vi.fn() };
      await mod.handleSubmit(event);

      expect(localStorage.getItem('SGI_incident_draft')).toBeNull();
    });
  });
});
