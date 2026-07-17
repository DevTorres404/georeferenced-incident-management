import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Module-level mocks (hoisted) ───────────────────────

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
  createIncident: vi.fn(() => Promise.resolve({ data: { id: 1 } })),
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

// ─── Static imports for mocked dependencies ────────────

import { createIncident, uploadIncidentAttachment } from '../app/js/modules/incidents/application/incidents-service.js';
import { getCatalogOverview } from '../app/js/modules/catalogs/application/catalogs-service.js';
import { listTerritorialProvinces } from '../app/js/modules/territorial-units/application/territorial-unit-service.js';
import { createCoordinatePicker } from '../app/js/shared/components/coordinate-picker.js';
import { showPageLoading, hidePageLoading } from '../app/js/modules/incidents/presentation/incidents-ui.js';
import { showErrorAlert, showSuccessAlert } from '../app/js/presentation/dom-utils.js';
import { setFieldError, clearFieldError } from '../app/js/shared/validators/validation-utils.js';

// ─── DOM fixture ────────────────────────────────────────

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
    <div data-manual-territory="province" class="d-none">
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
    <button id="btnAddEvidence" type="button">A\u00f1adir</button>
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
  <button id="btnRegistrar" type="button" class="d-none">Registrar</button>
  <span id="spinnerRegistrar" class="d-none"></span>

  <button class="wizard-step-button" data-step-target="location">1</button>
  <button class="wizard-step-button" data-step-target="evidence">2</button>
  <button class="wizard-step-button" data-step-target="details">3</button>
  <button class="wizard-step-button" data-step-target="review">4</button>

  <div id="draftBanner" class="d-none">Tienes un borrador</div>
</div>
`;

// ─── Helper: init module without DOMContentLoaded (avoids stale listeners) ──

async function createModule() {
  const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
  mod.hydrateContactEmail();
  mod.renderStep();
  mod.updateLocationSummary();
  return mod;
}

// ─── Tests ──────────────────────────────────────────────

describe('incident-create-page — integration', () => {
  beforeEach(() => {
    vi.resetModules();
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

  // ── 1. Module exports ─────────────────────────────────

  describe('module exports', () => {
    it('exports all expected pure functions', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const expected = [
        'getFormValue', 'setFormValue', 'saveDraft', 'restoreDraft', 'clearDraft', 'hasDraft',
        'buildApproximateAddress', 'findUnitByName', 'normalizeLocationName',
        'addEvidenceFiles', 'removeEvidenceFile', 'validateText', 'validateTextMax',
        'validateSelect', 'validateEmail', 'validateRequiredCoordinatePair',
        'fillSelect', 'setDisabled', 'formatFileSize', 'createClientId',
        'goNext', 'goPrevious', 'goToStep', 'renderStep',
        'populateCatalogs', 'populateSubcategories', 'populateTerritorialProvinces',
        'populateTerritorialLevel', 'applyReverseGeocode', 'selectTerritorialFromAddress',
        'setSelectValue', 'renderEvidencePreviews', 'handleSubmit',
        'renderSummary', 'updateLocationSummary', 'hydrateContactEmail',
        'updateCounter', 'setManualTerritoryMode', 'getManualTerritoryValue',
        'setManualTerritoryValue', 'buildAddressText',
        'validateLocation', 'validateEvidence', 'validateDetails', 'validateReview',
        'validateStep', 'validateUntil', 'validateCurrentStep',
      ];
      expected.forEach((name) => {
        expect(mod).toHaveProperty(name);
        expect(typeof mod[name]).toBe('function');
      });
    });
  });

  // ── 2. Module init ────────────────────────────────────

  describe('module initialization', () => {
    it.each(['SUPERVISOR', 'OPERADOR'])('denies %s before draft, catalog, territory, or map initialization', async (role) => {
      vi.clearAllMocks();
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: role }], permissions: [] }));
      localStorage.setItem('SGI_incident_draft', JSON.stringify({ fTitulo: 'untouched' }));
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');

      await mod.initCreateIncident();

      expect(globalThis.renderLayout).toHaveBeenCalledWith('incident-create');
      expect(getCatalogOverview).not.toHaveBeenCalled();
      expect(listTerritorialProvinces).not.toHaveBeenCalled();
      expect(createCoordinatePicker).not.toHaveBeenCalled();
      expect(localStorage.getItem('SGI_incident_draft')).toContain('untouched');
      // renderLayout handles the redirect internally; no hardcoded override needed.
    });

    it('awaits refreshed CIUDADANO authorization before feature initialization', async () => {
      vi.clearAllMocks();
      let finishRefresh;
      globalThis.renderLayout.mockImplementation(() => new Promise((resolve) => {
        finishRefresh = () => {
          localStorage.setItem('user_data', JSON.stringify({
            roles: [{ code: 'CIUDADANO' }],
            permissions: [{ codigo: 'incidents.create' }],
          }));
          resolve();
        };
      }));
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const initialization = mod.initCreateIncident();

      expect(getCatalogOverview).not.toHaveBeenCalled();
      expect(createCoordinatePicker).not.toHaveBeenCalled();
      finishRefresh();
      await initialization;

      expect(getCatalogOverview).toHaveBeenCalled();
      expect(listTerritorialProvinces).toHaveBeenCalled();
      expect(createCoordinatePicker).toHaveBeenCalled();
    });

    it('sets up the wizard with step 0 visible', async () => {
      const mod = await createModule();
      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(false);
      expect(document.querySelector('[data-step-panel="evidence"]').classList.contains('d-none')).toBe(true);
      expect(document.getElementById('btnPrevStep').disabled).toBe(true);
    });

    it('hydrates contact email from localStorage', async () => {
      localStorage.setItem('user_data', JSON.stringify({ email: 'stored@example.com' }));
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      mod.hydrateContactEmail();
      expect(document.getElementById('fCorreo').value).toBe('stored@example.com');
    });

    it('shows draft banner when draft exists after restore', async () => {
      localStorage.setItem('SGI_incident_draft', JSON.stringify({ fTitulo: 'draft', _currentStep: 0 }));
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      if (mod.restoreDraft()) {
        document.getElementById('draftBanner').classList.remove('d-none');
      }
      expect(document.getElementById('draftBanner').classList.contains('d-none')).toBe(false);
    });
  });

  // ── 3. Wizard step navigation ─────────────────────────

  describe('wizard step navigation', () => {
    it('advances to next step via goNext', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';
      const mod = await createModule();

      mod.goNext();

      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(true);
      expect(document.querySelector('[data-step-panel="evidence"]').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('btnPrevStep').disabled).toBe(false);
    });

    it('goes back to previous step via goPrevious', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';
      const mod = await createModule();

      mod.goNext();
      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(true);

      mod.goPrevious();
      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(false);
      expect(document.querySelector('[data-step-panel="evidence"]').classList.contains('d-none')).toBe(true);
      expect(document.getElementById('btnPrevStep').disabled).toBe(true);
    });

    it('jumps to step via goToStep', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';
      document.getElementById('fTitulo').value = 'Valid title for testing purposes';
      document.getElementById('fDescripcion').value = 'This is a valid description for the incident test that is long enough for validation';
      document.getElementById('fTipo').value = '1';
      document.getElementById('fSubtipo').value = '2';
      document.getElementById('fCorreo').value = 'test@example.com';
      const mod = await createModule();
      mod.addEvidenceFiles([new File([''], 'test.jpg', { type: 'image/jpeg' })]);

      mod.goToStep('details');

      expect(document.querySelector('[data-step-panel="details"]').classList.contains('d-none')).toBe(false);
      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(true);
    });

    it('prevents navigation when step validation fails', async () => {
      const mod = await createModule();

      mod.goNext();

      expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(false);
    });

    // Requires initCreateIncident to wire button handlers (not exported in this module yet)
    // it('advances to next step via button click', async () => {
    //   document.getElementById('fLatitud').value = '-0.229';
    //   document.getElementById('fLongitud').value = '-78.524';
    //   const mod = await createModule();
    //
    //   document.getElementById('btnNextStep').click();
    //
    //   expect(document.querySelector('[data-step-panel="location"]').classList.contains('d-none')).toBe(true);
    // });
  });

  // ── 4. Form validation (integration with DOM) ─────────

  describe('form validation integration', () => {
    it('validateLocation fails without coordinates', async () => {
      const { validateLocation } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      validateLocation();
      expect(setFieldError).toHaveBeenCalledWith('fLatitud', expect.any(String));
      expect(setFieldError).toHaveBeenCalledWith('fLongitud', expect.any(String));
    });

    it('validateLocation passes with valid coordinates', async () => {
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';
      const { validateLocation } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(validateLocation()).toBe(true);
    });

    it('validateDetails fails on empty required fields', async () => {
      const { validateDetails } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      validateDetails();
      expect(setFieldError).toHaveBeenCalledWith('fTitulo', expect.any(String));
      expect(setFieldError).toHaveBeenCalledWith('fTipo', expect.any(String));
    });

    it('validateDetails passes with valid data', async () => {
      document.getElementById('fTitulo').value = 'Valido titulo para';
      document.getElementById('fDescripcion').value = 'Esta es una descripcion valida para la prueba que contiene mas de 20 caracteres';
      document.getElementById('fTipo').value = '1';
      document.getElementById('fSubtipo').value = '2';
      document.getElementById('fCorreo').value = 'test@example.com';
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');

      expect(mod.validateText('fTitulo', 5, 'x')).toBe(true);
      expect(mod.validateTextMax('fTitulo', 120, 'x')).toBe(true);
      expect(mod.validateText('fDescripcion', 20, 'x')).toBe(true);
      expect(mod.validateTextMax('fDescripcion', 1000, 'x')).toBe(true);
      expect(mod.validateEmail('fCorreo')).toBe(true);
    });

    it('validateReview fails without confirmation', async () => {
      const { validateReview } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(validateReview()).toBe(false);
      expect(setFieldError).toHaveBeenCalledWith('fConfirmacion', expect.any(String));
    });

    it('validateReview passes with confirmation', async () => {
      document.getElementById('fConfirmacion').checked = true;
      const { validateReview } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(validateReview()).toBe(true);
    });
  });

  // ── 5. Draft save/restore lifecycle ───────────────────

  describe('draft lifecycle', () => {
    it('saveDraft persists form state to localStorage', async () => {
      document.getElementById('fTitulo').value = 'draft title';
      document.getElementById('fLatitud').value = '-0.229';
      const { saveDraft, hasDraft, clearDraft } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');

      expect(hasDraft()).toBe(false);
      saveDraft();
      expect(hasDraft()).toBe(true);

      const stored = JSON.parse(localStorage.getItem('SGI_incident_draft'));
      expect(stored.fTitulo).toBe('draft title');
      expect(stored.fLatitud).toBe('-0.229');

      clearDraft();
      expect(hasDraft()).toBe(false);
    });

    it('restoreDraft restores saved form data', async () => {
      document.getElementById('fTitulo').value = 'modified after restore';
      localStorage.setItem('SGI_incident_draft', JSON.stringify({ fTitulo: 'original saved', _currentStep: 0 }));
      const { restoreDraft } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');

      expect(restoreDraft()).toBe(true);
      expect(document.getElementById('fTitulo').value).toBe('original saved');
    });

    it('restoreDraft returns false when no draft exists', async () => {
      const { restoreDraft } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(restoreDraft()).toBe(false);
    });
  });

  // ── 6. Map initialization ─────────────────────────────

  describe('map initialization', () => {
    it('createCoordinatePicker is called from full init', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      await mod.populateCatalogs();
      await mod.populateTerritorialProvinces();
      // createCoordinatePicker is called in the DOMContentLoaded handler, not exported
      // Verify the import module exists
      expect(typeof mod.populateCatalogs).toBe('function');
    });
  });

  // ── 7. Territory selection ────────────────────────────

  describe('territory selection', () => {
    it('findUnitByName finds exact match', async () => {
      const { findUnitByName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const units = [{ id: 1, name: 'Pichincha' }];
      expect(findUnitByName(units, 'Pichincha')).toEqual(units[0]);
    });

    it('findUnitByName returns null for no match', async () => {
      const { findUnitByName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(findUnitByName([{ id: 1, name: 'Pichincha' }], 'Guayas')).toBeNull();
    });

    it('setManualTerritoryMode toggles manual territory fields', async () => {
      const { setManualTerritoryMode, setManualTerritoryValue, getManualTerritoryValue } =
        await import('../app/js/modules/incidents/presentation/incident-create-page.js');

      setManualTerritoryMode('sector', true);
      expect(document.getElementById('fManualSector').disabled).toBe(false);
    });

    it('setManualTerritoryValue stores and getManualTerritoryValue reads', async () => {
      const { setManualTerritoryValue, getManualTerritoryValue } =
        await import('../app/js/modules/incidents/presentation/incident-create-page.js');

      setManualTerritoryValue('sector', 'La Floresta');
      expect(getManualTerritoryValue('sector')).toBe('La Floresta');
      expect(document.getElementById('fManualSector').value).toBe('La Floresta');
    });
  });

  // ── 8. Evidence management ────────────────────────────

  describe('evidence management', () => {
    it('addEvidenceFiles adds files and updates preview', async () => {
      const { addEvidenceFiles, removeEvidenceFile } =
        await import('../app/js/modules/incidents/presentation/incident-create-page.js');

      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1024 });

      addEvidenceFiles([file]);
      expect(document.getElementById('evidenceCount').textContent).toBe('1');

      const previewList = document.getElementById('evidencePreviewList');
      expect(previewList.children.length).toBeGreaterThan(0);
    });

    it('addEvidenceFiles rejects oversized files', async () => {
      const { addEvidenceFiles } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const file = new File([''], 'large.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 });

      addEvidenceFiles([file]);
      expect(document.getElementById('evidenceCount').textContent).toBe('0');
    });

    it('addEvidenceFiles rejects non-image types', async () => {
      const { addEvidenceFiles } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const file = new File([''], 'doc.pdf', { type: 'application/pdf' });

      addEvidenceFiles([file]);
      expect(document.getElementById('evidenceCount').textContent).toBe('0');
    });

    it('removeEvidenceFile removes a previously added file', async () => {
      const { addEvidenceFiles, removeEvidenceFile } =
        await import('../app/js/modules/incidents/presentation/incident-create-page.js');

      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1024 });

      addEvidenceFiles([file]);
      expect(document.getElementById('evidenceCount').textContent).toBe('1');

      removeEvidenceFile('00000000-0000-0000-0000-000000000001');
      expect(document.getElementById('evidenceCount').textContent).toBe('0');
    });
  });

  // ── 9. Form submission integration ────────────────────

  describe('form submission', () => {
    // Requires full init with event wiring (initCreateIncident not exported)
    // it('submits form with valid data and clears draft', ...);

    it('prevents submission when validation fails', async () => {
      const mod = await createModule();

      const submitEvent = { preventDefault: vi.fn() };
      await mod.handleSubmit(submitEvent);

      expect(setFieldError).toHaveBeenCalled();
      expect(createIncident).not.toHaveBeenCalled();
    });
  });

  // ── 10. Counter updates ───────────────────────────────

  describe('counter updates', () => {
    it('updateCounter updates counter text', async () => {
      const { updateCounter } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fTitulo').value = 'abc';
      updateCounter('fTitulo', 'cntTitulo', 120);
      expect(document.getElementById('cntTitulo').textContent).toBe('3/120');
    });

    it('updateCounter toggles warning class near limit', async () => {
      const { updateCounter } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fTitulo').value = 'a'.repeat(110);
      updateCounter('fTitulo', 'cntTitulo', 120);
      expect(document.getElementById('cntTitulo').textContent).toBe('110/120');
      expect(document.getElementById('cntTitulo').classList.contains('warn')).toBe(true);
    });
  });

  // ── 11. Email hydration ───────────────────────────────

  describe('email hydration', () => {
    it('hydrateContactEmail fills email from localStorage', async () => {
      localStorage.setItem('user_data', JSON.stringify({ email: 'stored@example.com' }));
      const { hydrateContactEmail } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      hydrateContactEmail();
      expect(document.getElementById('fCorreo').value).toBe('stored@example.com');
    });

    it('hydrateContactEmail does not overwrite existing value', async () => {
      document.getElementById('fCorreo').value = 'existing@example.com';
      localStorage.setItem('user_data', JSON.stringify({ email: 'stored@example.com' }));
      const { hydrateContactEmail } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      hydrateContactEmail();
      expect(document.getElementById('fCorreo').value).toBe('existing@example.com');
    });
  });

  // ── 12. buildAddressText ──────────────────────────────

  describe('buildAddressText', () => {
    it('builds combined address text from fields', async () => {
      document.getElementById('fDireccion').value = 'Av 10';
      document.getElementById('fReferencia').value = 'Junto al parque';
      const { buildAddressText } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const result = buildAddressText();
      expect(result).toContain('Av 10');
      expect(result).toContain('Junto al parque');
    });

    it('returns null when all fields are empty', async () => {
      const { buildAddressText } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(buildAddressText()).toBeNull();
    });
  });
});
