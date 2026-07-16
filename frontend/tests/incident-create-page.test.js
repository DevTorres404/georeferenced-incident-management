import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../app/js/presentation/dom-utils.js', () => ({
  $: vi.fn((id) => document.querySelector(id)),
  $$: vi.fn(() => []),
  hideSpinner: vi.fn(),
  showErrorAlert: vi.fn(),
  showSpinner: vi.fn(),
  showSuccessAlert: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/modules/catalogs/application/catalogs-service.js', () => ({
  getCatalogOverview: vi.fn(() => Promise.resolve({ categories: [] })),
}));

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  createIncident: vi.fn(),
  uploadIncidentAttachment: vi.fn(),
}));

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setFieldError: vi.fn(),
  clearFieldError: vi.fn(),
}));

vi.mock('../app/js/shared/components/coordinate-picker.js', () => ({
  createCoordinatePicker: vi.fn(() => ({
    map: null,
    invalidateSize: vi.fn(),
  })),
}));

vi.mock('../app/js/modules/territorial-units/application/territorial-unit-service.js', () => ({
  getTerritorialChildren: vi.fn(() => Promise.resolve([])),
  listTerritorialCantons: vi.fn(() => Promise.resolve([])),
  listTerritorialParishes: vi.fn(() => Promise.resolve([])),
  listTerritorialProvinces: vi.fn(() => Promise.resolve([])),
}));

describe('incident-create-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-0000-0000-000000000001' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('normalizeLocationName', () => {
    it('normalizes province name removing prefixes', async () => {
      const { normalizeLocationName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(normalizeLocationName('Provincia de Pichincha')).toBe('PICHINCHA');
    });

    it('returns empty for empty string', async () => {
      const { normalizeLocationName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(normalizeLocationName('')).toBe('');
    });

    it('returns empty for null', async () => {
      const { normalizeLocationName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(normalizeLocationName(null)).toBe('');
    });
  });

  describe('findUnitByName', () => {
    it('finds exact match', async () => {
      const { findUnitByName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const units = [{ id: 1, name: 'Pichincha' }];
      expect(findUnitByName(units, 'Pichincha')).toEqual(units[0]);
    });

    it('finds fuzzy match (contains)', async () => {
      const { findUnitByName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const units = [{ id: 1, name: 'Pichincha' }];
      expect(findUnitByName(units, 'Pichinch')).toEqual(units[0]);
    });

    it('returns null for empty array', async () => {
      const { findUnitByName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(findUnitByName([], 'test')).toBeNull();
    });

    it('returns null for no match', async () => {
      const { findUnitByName } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(findUnitByName([{ id: 1, name: 'Pichincha' }], 'Guayas')).toBeNull();
    });
  });

  describe('buildApproximateAddress', () => {
    it('builds formatted address from OSM result', async () => {
      const { buildApproximateAddress } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const result = { address: { road: 'Av 10', city: 'Quito', state: 'Pichincha' } };
      const address = buildApproximateAddress(result);
      expect(address).toContain('Av 10');
      expect(address).toContain('Quito');
      expect(address).toContain('Pichincha');
    });

    it('returns empty for null result', async () => {
      const { buildApproximateAddress } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(buildApproximateAddress(null)).toBe('');
    });

    it('falls back to display_name when address is empty', async () => {
      const { buildApproximateAddress } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const result = { display_name: 'Some Place, Ecuador', address: {} };
      expect(buildApproximateAddress(result)).toBe('Some Place, Ecuador');
    });
  });

  describe('formatFileSize', () => {
    it('returns 0 B for 0 bytes', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('returns KB for < 1 MB', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('returns MB for >= 1 MB', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
    });
  });

  describe('createClientId', () => {
    it('returns a string from crypto.randomUUID', async () => {
      const { createClientId } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(createClientId()).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('generates unique ids', async () => {
      vi.stubGlobal('crypto', undefined);
      const { createClientId } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      const id1 = createClientId();
      const id2 = createClientId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('setFormValue / getFormValue', () => {
    beforeEach(() => {
      document.body.innerHTML = '<input id="fTest" value="">';
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('setFormValue sets input value', async () => {
      const { setFormValue } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      setFormValue('fTest', 'new value');
      expect(document.getElementById('fTest').value).toBe('new value');
    });

    it('getFormValue reads input value', async () => {
      const { getFormValue, setFormValue } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      setFormValue('fTest', 'test value');
      expect(getFormValue('fTest')).toBe('test value');
    });

    it('setFormValue ignores null/undefined values', async () => {
      const { setFormValue, getFormValue } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fTest').value = 'original';
      setFormValue('fTest', null);
      expect(getFormValue('fTest')).toBe('original');
    });

    it('getFormValue returns empty for unknown id', async () => {
      const { getFormValue } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(getFormValue('nonExistentId')).toBe('');
    });
  });

  describe('Draft functions', () => {
    it('saveDraft and restoreDraft round-trip data', async () => {
      document.body.innerHTML = '<input id="fTitulo" value="test title">';
      const { saveDraft, restoreDraft, hasDraft, clearDraft } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(hasDraft()).toBe(false);
      saveDraft();
      expect(hasDraft()).toBe(true);
      document.getElementById('fTitulo').value = 'modified';
      const restored = restoreDraft();
      expect(restored).toBe(true);
      expect(document.getElementById('fTitulo').value).toBe('test title');
      clearDraft();
      expect(hasDraft()).toBe(false);
    });
  });
});

describe('incident-create-page.js — validation functions', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <input id="fTitulo" value="">
      <input id="fDescripcion" value="">
      <select id="fTipo"><option value="">Seleccione</option><option value="1">Daño</option></select>
      <input id="fCorreo" value="">
      <input id="fLatitud" value="">
      <input id="fLongitud" value="">
      <div id="fConfirmacion"></div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('validateText', () => {
    it('returns false when input is too short', async () => {
      const { validateText } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fTitulo').value = 'abc';
      expect(validateText('fTitulo', 5, 'msg')).toBe(false);
    });

    it('returns true when input is long enough', async () => {
      const { validateText } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fTitulo').value = 'long enough title';
      expect(validateText('fTitulo', 5, 'msg')).toBe(true);
    });
  });

  describe('validateTextMax', () => {
    it('returns true within limit', async () => {
      const { validateTextMax } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fTitulo').value = 'short';
      expect(validateTextMax('fTitulo', 120, 'msg')).toBe(true);
    });

    it('returns false when over limit', async () => {
      const { validateTextMax } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fTitulo').value = 'too long';
      expect(validateTextMax('fTitulo', 5, 'msg')).toBe(false);
    });
  });

  describe('validateSelect', () => {
    it('returns false when value is empty', async () => {
      const { validateSelect } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(validateSelect('fTipo', 'msg')).toBe(false);
    });

    it('returns true when value is selected', async () => {
      const { validateSelect } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fTipo').value = '1';
      expect(validateSelect('fTipo', 'msg')).toBe(true);
    });
  });

  describe('validateEmail', () => {
    it('returns false for empty email', async () => {
      const { validateEmail } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(validateEmail('fCorreo')).toBe(false);
    });

    it('returns false for invalid email', async () => {
      const { validateEmail } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fCorreo').value = 'not-an-email';
      expect(validateEmail('fCorreo')).toBe(false);
    });

    it('returns true for valid email', async () => {
      const { validateEmail } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fCorreo').value = 'test@example.com';
      expect(validateEmail('fCorreo')).toBe(true);
    });
  });

  describe('validateRequiredCoordinatePair', () => {
    it('returns false when lat/lng are empty', async () => {
      const { validateRequiredCoordinatePair } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      expect(validateRequiredCoordinatePair()).toBe(false);
    });

    it('returns true when lat/lng are valid', async () => {
      const { validateRequiredCoordinatePair } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fLatitud').value = '-0.229';
      document.getElementById('fLongitud').value = '-78.524';
      expect(validateRequiredCoordinatePair()).toBe(true);
    });

    it('returns false when lat is out of range', async () => {
      const { validateRequiredCoordinatePair } = await import('../app/js/modules/incidents/presentation/incident-create-page.js');
      document.getElementById('fLatitud').value = '100';
      document.getElementById('fLongitud').value = '-78.524';
      expect(validateRequiredCoordinatePair()).toBe(false);
    });
  });
});
