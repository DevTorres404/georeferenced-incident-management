import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  addIncidentComment: vi.fn(),
  approveStateChangeRequest: vi.fn(),
  changeIncidentState: vi.fn(),
  getIncident: vi.fn(),
  getPendingStateChangeRequests: vi.fn(),
  getStateChangeRequests: vi.fn(),
  listPriorities: vi.fn(),
  listStates: vi.fn(),
  listStateTransitions: vi.fn(),
  rejectStateChangeRequest: vi.fn(),
  requestStateChange: vi.fn(),
  updateIncident: vi.fn(),
  uploadIncidentAttachment: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/application/subscribe-incident-comments.usecase.js', () => ({
  subscribeToIncidentComments: vi.fn(() => Promise.resolve({ cleanup: vi.fn() })),
}));

vi.mock('../app/js/modules/incidents/application/subscribe-incident-realtime.usecase.js', () => ({
  subscribeToIncidentRealtime: vi.fn(() => Promise.resolve({ cleanup: vi.fn() })),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? ''),
  formatCatalogLabel: (v) => ({ RESUELTA: 'Resuelta', CERRADA: 'Cerrada' })[v] || v || '-',
  formatDateTime: (v) => v || '-',
  formatShortDate: (v) => v || '-',
  getPriorityBadgeClass: vi.fn(() => 'badge-warning'),
  getStateBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateHexColor: vi.fn(() => '#000000'),
  getPriorityHexColor: vi.fn(() => '#000000'),
  showGlobalAlert: vi.fn(),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/core/config.js', () => ({
  API_URL: 'http://localhost/api',
  MAP_BASE_STYLES: { streets: { style: 'mapbox://styles/mapbox/streets-v11' } },
  MAP_ECUADOR_BOUNDS: [[-92.2, -5.25], [-75, 1.85]],
}));

let originalLocation;

const MODAL_FIXTURE = `
<div id="modalEstado">
  <select id="nuevoEstado"></select>
  <textarea id="comentarioEstado"></textarea>
  <button id="btnGuardarEstado"></button>
</div>
<div id="modalPrioridad">
  <select id="nuevaPrioridad"></select>
  <button id="btnGuardarPrioridad"></button>
</div>
<div id="modalAttachmentPreview">
  <img id="attachmentPreviewModalImage" />
  <div id="attachmentPreviewModalFallback"></div>
  <a id="attachmentPreviewModalOpen"></a>
</div>`;

const sampleIncident = {
  id: 1,
  code: 'INC-001',
  title: 'Fuga de agua',
  description: 'Ruptura de tuberia principal en la Av. Amazonas.',
  latitude: -0.18,
  longitude: -78.5,
  state_id: 1,
  state: { id: 1, name: 'Nueva' },
  priority_id: 1,
  priority: { id: 1, name: 'Alta' },
  category: { id: 1, name: 'Infraestructura' },
  subcategory: { id: 1, name: 'Agua Potable' },
  territorial_unit: { full_path: 'Pichincha > Quito > Centro' },
  address: 'Av. Amazonas y 10 de Agosto',
  address_reference: 'Frente al parque central',
  created_at: '2026-07-10T10:00:00',
  resolution_date: null,
  comments: [
    { id: 1, comment: 'Ya enviamos una cuadrilla', user: { first_name: 'Carlos', last_name: 'Mendez', role_name: 'Operador' }, created_at: '2026-07-10T11:00:00', is_internal: false },
    { id: 2, comment: 'Trabajo en progreso', user: { first_name: 'Ana', last_name: 'Lopez', role_name: 'Supervisor' }, created_at: '2026-07-10T12:00:00', is_internal: true },
  ],
  history: [
    { id: 1, previous_state_id: null, previous_state_name: null, new_state_id: 1, new_state_name: 'Nueva', user: { first_name: 'Sistema', last_name: '' }, comment: 'Incidencia registrada', created_at: '2026-07-10T10:00:00' },
    { id: 2, previous_state_id: 1, previous_state_name: 'Nueva', new_state_id: 2, new_state_name: 'En Progreso', user: { first_name: 'Carlos', last_name: 'Mendez' }, comment: 'Asignado a cuadrilla', created_at: '2026-07-10T11:30:00' },
  ],
  attachments: [
    { id: 1, original_name: 'foto.jpg', mime_type: 'image/jpeg', file_url: '/storage/incidents/foto.jpg', file_size_bytes: 204800, user: { first_name: 'Carlos', last_name: 'Mendez', role_name: 'Operador' }, created_at: '2026-07-10T11:00:00' },
    { id: 2, original_name: 'reporte.pdf', mime_type: 'application/pdf', file_url: '/storage/incidents/reporte.pdf', file_size_bytes: 1048576, user: { first_name: 'Ana', last_name: 'Lopez', role_name: 'Supervisor' }, created_at: '2026-07-10T12:00:00' },
  ],
};

const sampleTransitions = [
  { id: 1, source_state_id: 1, target_state_id: 2, is_active: true, target_state_name: 'En Progreso', requires_comment: false, allowed_roles: ['ADMIN', 'OPERATOR'] },
  { id: 2, source_state_id: 1, target_state_id: 3, is_active: true, target_state_name: 'Resuelta', requires_comment: true, allowed_roles: ['ADMIN'] },
  { id: 3, source_state_id: 2, target_state_id: 3, is_active: true, target_state_name: 'Resuelta', requires_comment: true, allowed_roles: ['ADMIN'] },
  { id: 4, source_state_id: 1, target_state_id: 4, is_active: false, target_state_name: 'Cancelada' },
];

function flushMicrotasks() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

describe('Integration — incident-detail-page', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    originalLocation = globalThis.location;

    document.body.innerHTML = `
      <span id="breadcrumbId"></span>
      <title id="pageTitle"></title>
      <div id="contenidoDetalle"></div>
      ${MODAL_FIXTURE}`;
    const url = new URL('http://localhost/incident-detail.html');
    url.searchParams.set('id', '1');
    Object.defineProperty(globalThis, 'location', {
      value: url,
      configurable: true,
      writable: true,
    });

    globalThis.renderLayout = vi.fn();
    globalThis.$ = vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      val: vi.fn(),
      text: vi.fn(),
      html: vi.fn(),
      toggle: vi.fn(),
      addClass: vi.fn().mockReturnThis(),
      removeClass: vi.fn().mockReturnThis(),
      hasClass: vi.fn(),
      find: vi.fn().mockReturnThis(),
      closest: vi.fn().mockReturnThis(),
      data: vi.fn(),
      prop: vi.fn(),
      attr: vi.fn(),
      trigger: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      empty: vi.fn(),
      append: vi.fn(),
      remove: vi.fn(),
      serialize: vi.fn(() => ''),
      modal: vi.fn(),
      tooltip: vi.fn(),
    }));
    globalThis.$.ajax = vi.fn();
    globalThis.$.post = vi.fn();
    globalThis.jQuery = globalThis.$;

    globalThis.maplibregl = {
      Map: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getCenter: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
        getZoom: vi.fn(() => 10),
        setCenter: vi.fn(),
        setZoom: vi.fn(),
        addControl: vi.fn(),
        resize: vi.fn(),
        flyTo: vi.fn(),
        getSource: vi.fn(() => ({ setData: vi.fn() })),
        addSource: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        removeSource: vi.fn(),
        getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
      })),
      Marker: vi.fn(() => ({
        setLngLat: vi.fn().mockReturnThis(),
        setPopup: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getLngLat: vi.fn(() => ({ lat: -0.18, lng: -78.5 })),
        setDraggable: vi.fn().mockReturnThis(),
        getElement: vi.fn(() => document.createElement('div')),
      })),
      Popup: vi.fn(() => ({
        setLngLat: vi.fn().mockReturnThis(),
        setHTML: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
      })),
      NavigationControl: vi.fn(),
      FullscreenControl: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    delete globalThis.renderLayout;
    delete globalThis.maplibregl;
    delete globalThis.$;
    delete globalThis.jQuery;
    globalThis.location = originalLocation;
    vi.clearAllMocks();
  });

  // ─── 1. Exports still work ──────────────────────────────────────

  describe('1. Exports', () => {
    it('all exported functions exist', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(typeof mod.initIncidentDetailPage).toBe('function');
      expect(typeof mod.hasCoordinates).toBe('function');
      expect(typeof mod.territoryLabel).toBe('function');
      expect(typeof mod.getAvailableStateTransitions).toBe('function');
      expect(typeof mod.isTransitionAllowedForCurrentUser).toBe('function');
      expect(typeof mod.renderComments).toBe('function');
      expect(typeof mod.renderAttachments).toBe('function');
      expect(typeof mod.renderHistory).toBe('function');
      expect(typeof mod.calculateDays).toBe('function');
      expect(typeof mod.formatFileSize).toBe('function');
      expect(typeof mod.renderStateSelector).toBe('function');
    });
  });

  // ─── 2. DOMContentLoaded triggers init ────────────────────────────

  describe('2. DOMContentLoaded triggers init', () => {
    it('calls getIncident on DOMContentLoaded', async () => {
      const { getIncident, listStateTransitions, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      );
      getIncident.mockResolvedValue({ data: sampleIncident });
      listStateTransitions.mockResolvedValue({ data: sampleTransitions });
      listPriorities.mockResolvedValue({ data: [] });

      localStorage.setItem(
        'user_data',
        JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }], permissions: [] })
      );

      await import('../app/js/modules/incidents/presentation/incident-detail-page.js');

      document.dispatchEvent(new Event('DOMContentLoaded'));

      await vi.waitFor(() => {
        expect(getIncident).toHaveBeenCalledWith('1');
      });
    });

    it('renders incident title and code in the page', async () => {
      const { getIncident, listStateTransitions, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      );
      getIncident.mockResolvedValue({ data: sampleIncident });
      listStateTransitions.mockResolvedValue({ data: sampleTransitions });
      listPriorities.mockResolvedValue({ data: [] });

      localStorage.setItem(
        'user_data',
        JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }], permissions: [] })
      );

      const mod = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));

      await vi.waitFor(() => {
        const container = document.getElementById('contenidoDetalle');
        expect(container.innerHTML).toContain('INC-001');
      });
    });

    it('renders pending state requests with mobile card labels and complete actions', async () => {
      const service = await import('../app/js/modules/incidents/application/incidents-service.js');
      service.getIncident.mockResolvedValue({ data: sampleIncident });
      service.listStateTransitions.mockResolvedValue({ data: sampleTransitions });
      service.listPriorities.mockResolvedValue({ data: [] });
      service.getStateChangeRequests.mockResolvedValue({
        data: [{
          id: 17,
          status: 'pending',
          requestedByUserName: 'Luis Fernando Peñafiel',
          requestedStateName: 'RESUELTA',
          requestedStateColor: '#7fbd42',
          reason: 'La atención fue completada.',
          created_at: '2026-07-21T18:30:00',
        }],
      });
      localStorage.setItem('user_data', JSON.stringify({
        roles: [{ code: 'SUPERVISOR' }],
        permissions: ['incidents.edit'],
      }));

      const { initIncidentDetailPage } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      await initIncidentDetailPage();

      const card = document.querySelector('.pending-state-requests-card');
      expect(card).not.toBeNull();
      expect(card.querySelector('[data-label="Solicitante"]')?.textContent).toContain('Luis Fernando Peñafiel');
      expect(card.querySelector('[data-label="Estado solicitado"]')?.textContent).toContain('Resuelta');
      expect(card.querySelector('[data-label="Razón"]')?.textContent).toContain('La atención fue completada.');
      expect(card.querySelector('[data-label="Fecha"]')).not.toBeNull();
      expect(card.querySelectorAll('.pending-state-request-actions .btn')).toHaveLength(2);
    });

    it.each([
      ['ADMIN', ['incidents.create'], true],
      ['CIUDADANO', [{ codigo: 'incidents.create' }], true],
      ['SUPERVISOR', [], false],
      ['OPERADOR', [], false],
    ])('applies incidents.create to the %s New CTA', async (role, permissions, allowed) => {
      const service = await import('../app/js/modules/incidents/application/incidents-service.js');
      service.getIncident.mockResolvedValue({ data: sampleIncident });
      service.listPriorities.mockResolvedValue({ data: [] });
      service.listStates.mockResolvedValue({ data: [] });
      service.getStateChangeRequests.mockResolvedValue({ data: [] });
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: role }], permissions }));

      const { initIncidentDetailPage } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      await initIncidentDetailPage();

      expect(document.getElementById('contenidoDetalle').innerHTML.includes('incident-create.html')).toBe(allowed);
    });
  });

  // ─── 3. Coordinate validation integration ────────────────────────

  describe('3. Coordinate validation', () => {
    it('hasCoordinates returns true for valid Ecuador coords', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates({ latitude: -0.18, longitude: -78.5 })).toBe(true);
    });

    it('hasCoordinates returns false for invalid coords', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates({ latitude: 10, longitude: -78.5 })).toBe(false);
    });

    it('hasCoordinates returns false for null input', async () => {
      const { hasCoordinates } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(hasCoordinates(null)).toBe(false);
    });
  });

  // ─── 4. Territory label extraction ───────────────────────────────

  describe('4. Territory label', () => {
    it('extracts full_path from territorial_unit', async () => {
      const { territoryLabel } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(territoryLabel({ territorial_unit: { full_path: 'Pichincha > Quito' } })).toBe('Pichincha > Quito');
    });

    it('falls back to address_reference', async () => {
      const { territoryLabel } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(territoryLabel({ address_reference: 'Calle 1' })).toBe('Calle 1');
    });

    it('returns dash for empty data', async () => {
      const { territoryLabel } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(territoryLabel({})).toBe('-');
    });
  });

  // ─── 5. State transitions ──────────────────────────────────────

  describe('5. State transitions', () => {
    it('filters transitions by source state', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'ADMIN' }] }));
      const { getAvailableStateTransitions } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );
      const result = getAvailableStateTransitions({ state_id: 1 }, sampleTransitions);
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.target_state_name)).toEqual(['En Progreso', 'Resuelta']);
    });

    it('filters by user permissions — no matching role', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'VIEWER' }] }));
      const { getAvailableStateTransitions } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );
      const restricted = [
        { source_state_id: 1, target_state_id: 2, is_active: true, allowed_roles: ['ADMIN'] },
      ];
      const result = getAvailableStateTransitions({ state_id: 1 }, restricted);
      expect(result).toHaveLength(0);
    });

    it('renders state selector options in the DOM', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'ADMIN' }] }));
      document.body.innerHTML = `
        <span id="breadcrumbId"></span>
        <title id="pageTitle"></title>
        <div id="contenidoDetalle"></div>
        ${MODAL_FIXTURE}`;

      const { renderStateSelector } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );

      const container = document.getElementById('contenidoDetalle');
      container.innerHTML = `
        <div class="input-group input-group-sm d-inline-flex align-middle mr-1" style="width:auto;min-width:210px;">
          <div class="input-group-prepend" id="stateHistoryTooltip">
            <span class="input-group-text bg-warning border-warning text-dark">
              <i class="fas fa-sync-alt"></i>
            </span>
          </div>
          <select class="custom-select custom-select-sm border-warning" id="estadoDirecto"></select>
        </div>`;

      renderStateSelector({ state_id: 1, state: { name: 'Nueva' }, priority_id: 1, priority: { id: 1, name: 'Alta' } }, sampleTransitions);
      const select = document.getElementById('estadoDirecto');
      expect(select).not.toBeNull();
      expect(select.options.length).toBe(3);
      expect(select.options[0].text).toContain('Nueva');
      expect(select.options[1].text).toContain('En Progreso');
      expect(select.options[2].text).toContain('Resuelta');
      expect(select.options[2].text).toContain('requiere comentario');
    });

    it('renders RESUELTA as current and CERRADA as the distinct target', async () => {
      localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: 'SUPERVISOR' }] }));
      document.body.innerHTML = `
        <select id="estadoDirecto"></select>
        <div id="statePriorityHint" class="d-none"></div>`;

      const { renderStateSelector } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );

      renderStateSelector(
        { state_id: 4, state: { name: 'RESUELTA' }, priority_id: 1 },
        [{
          source_state_id: 4,
          target_state_id: 5,
          target_state_name: 'CERRADA',
          allowed_roles: ['SUPERVISOR'],
          is_active: true,
          requires_comment: false,
        }],
      );

      const options = [...document.getElementById('estadoDirecto').options].map((option) => option.text);
      expect(options).toEqual(['Resuelta (actual)', 'Cerrada']);
    });

    it('shows CERRADA to REABIERTA only for backend-authorized roles', async () => {
      const { renderStateSelector } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );
      const transition = {
        source_state_id: 5,
        target_state_id: 7,
        target_state_name: 'REABIERTA',
        allowed_roles: ['ADMIN', 'SUPERVISOR'],
        is_active: true,
        requires_comment: true,
      };

      for (const role of ['ADMIN', 'SUPERVISOR', 'OPERADOR', 'CIUDADANO']) {
        localStorage.setItem('user_data', JSON.stringify({ roles: [{ code: role }] }));
        document.body.innerHTML = `
          <select id="estadoDirecto"></select>
          <div id="statePriorityHint" class="d-none"></div>`;

        renderStateSelector(
          { state_id: 5, state: { name: 'CERRADA' }, priority_id: 1 },
          [transition],
        );

        const optionValues = [...document.getElementById('estadoDirecto').options]
          .map((option) => Number(option.value));
        const isAuthorized = ['ADMIN', 'SUPERVISOR'].includes(role);
        expect(optionValues, role).toEqual(isAuthorized ? [5, 7] : [5]);
      }
    });
  });

  // ─── 6. Comments rendering ─────────────────────────────────────

  describe('6. Comments rendering', () => {
    it('renders comments into DOM with user info and text', async () => {
      const { renderComments } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');

      const container = document.createElement('div');
      container.innerHTML = renderComments(sampleIncident.comments);

      expect(container.textContent).toContain('Carlos Mendez (Operador)');
      expect(container.textContent).toContain('Ya enviamos una cuadrilla');
      expect(container.textContent).toContain('Ana Lopez (Supervisor)');
      expect(container.textContent).toContain('Trabajo en progreso');
    });

    it('shows empty state when no comments', async () => {
      const { renderComments } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const html = renderComments([]);
      expect(html).toContain('Sin comentarios');
    });

    it('renders comments through full init flow', async () => {
      const { getIncident, listStateTransitions, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      );
      getIncident.mockResolvedValue({ data: sampleIncident });
      listStateTransitions.mockResolvedValue({ data: [] });
      listPriorities.mockResolvedValue({ data: [] });

      localStorage.setItem(
        'user_data',
        JSON.stringify({ id: 1, roles: [{ code: 'VIEWER' }], permissions: [] })
      );

      const { initIncidentDetailPage } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );
      await initIncidentDetailPage();
      await flushMicrotasks();

      const list = document.getElementById('listadoComentarios');
      expect(list).not.toBeNull();
      expect(list.textContent).toContain('Carlos Mendez');
      expect(list.textContent).toContain('Ya enviamos una cuadrilla');
    });
  });

  // ─── 7. Attachments rendering ──────────────────────────────────

  describe('7. Attachments rendering', () => {
    it('renders attachment cards with file info', async () => {
      const { renderAttachments } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');

      const container = document.createElement('div');
      container.innerHTML = renderAttachments(sampleIncident.attachments);

      expect(container.textContent).toContain('foto.jpg');
      expect(container.textContent).toContain('reporte.pdf');
      expect(container.textContent).toContain('Subido por Carlos Mendez (Operador)');
      expect(container.textContent).toContain('Subido por Ana Lopez (Supervisor)');
      expect(container.querySelectorAll('.attachment-card')).toHaveLength(2);
    });

    it('shows empty state when no attachments', async () => {
      const { renderAttachments } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const html = renderAttachments([]);
      expect(html).toContain('No hay evidencias');
    });

    it('formatFileSize handles various sizes', async () => {
      const { formatFileSize } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(2048)).toBe('2.0 KB');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(-1)).toBe('Tamano no disponible');
    });
  });

  // ─── 8. History / Activity log ──────────────────────────────────

  describe('8. History / Activity log', () => {
    it('renders history entries with event details', async () => {
      const { renderHistory } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');

      const container = document.createElement('div');
      container.innerHTML = renderHistory(sampleIncident.history);

      expect(container.textContent).toContain('Incidencia registrada');
      expect(container.textContent).toContain('En Progreso');
      expect(container.textContent).toContain('Carlos Mendez');
      expect(container.textContent).toContain('Asignado a cuadrilla');
    });

    it('shows empty state when no history', async () => {
      const { renderHistory } = await import('../app/js/modules/incidents/presentation/incident-detail-page.js');
      const html = renderHistory([]);
      expect(html).toContain('Sin historial');
    });

    it('renders history through full init flow', async () => {
      const { getIncident, listStateTransitions, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      );
      getIncident.mockResolvedValue({ data: sampleIncident });
      listStateTransitions.mockResolvedValue({ data: [] });
      listPriorities.mockResolvedValue({ data: [] });

      localStorage.setItem(
        'user_data',
        JSON.stringify({ id: 1, roles: [{ code: 'VIEWER' }], permissions: [] })
      );

      const { initIncidentDetailPage } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );
      await initIncidentDetailPage();
      await flushMicrotasks();

      const timeline = document.getElementById('timelineHistorial');
      expect(timeline).not.toBeNull();
      expect(timeline.textContent).toContain('Incidencia registrada');
      expect(timeline.textContent).toContain('Asignado a cuadrilla');
    });
  });

  // ─── 9. Map integration (maplibregl) ─────────────────────────────

  describe('9. Map integration', () => {
    it('initializes maplibregl.Map when coordinates are present', async () => {
      const { getIncident, listStateTransitions, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      );
      getIncident.mockResolvedValue({ data: sampleIncident });
      listStateTransitions.mockResolvedValue({ data: [] });
      listPriorities.mockResolvedValue({ data: [] });

      localStorage.setItem(
        'user_data',
        JSON.stringify({ id: 1, roles: [{ code: 'VIEWER' }], permissions: [] })
      );

      const { initIncidentDetailPage } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );
      await initIncidentDetailPage();
      await flushMicrotasks();

      expect(globalThis.maplibregl.Map).toHaveBeenCalled();
      const mapCall = globalThis.maplibregl.Map.mock.calls[0][0];
      expect(mapCall.container).toBe(document.getElementById('incidentDetailMap'));
      expect(mapCall.center).toEqual([-78.5, -0.18]);
      expect(mapCall.zoom).toBe(15);
    });

    it('creates a Marker with popup when coordinates are present', async () => {
      const { getIncident, listStateTransitions, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      );
      getIncident.mockResolvedValue({ data: sampleIncident });
      listStateTransitions.mockResolvedValue({ data: [] });
      listPriorities.mockResolvedValue({ data: [] });

      localStorage.setItem(
        'user_data',
        JSON.stringify({ id: 1, roles: [{ code: 'VIEWER' }], permissions: [] })
      );

      const { initIncidentDetailPage } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );
      await initIncidentDetailPage();
      await flushMicrotasks();

      expect(globalThis.maplibregl.Marker).toHaveBeenCalled();
      expect(globalThis.maplibregl.Popup).toHaveBeenCalled();
    });

    it('does not initialize map when coordinates are missing', async () => {
      const incidentNoCoords = { ...sampleIncident, latitude: null, longitude: null };
      const { getIncident, listStateTransitions, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      );
      getIncident.mockResolvedValue({ data: incidentNoCoords });
      listStateTransitions.mockResolvedValue({ data: [] });
      listPriorities.mockResolvedValue({ data: [] });

      localStorage.setItem(
        'user_data',
        JSON.stringify({ id: 1, roles: [{ code: 'VIEWER' }], permissions: [] })
      );

      const { initIncidentDetailPage } = await import(
        '../app/js/modules/incidents/presentation/incident-detail-page.js'
      );
      await initIncidentDetailPage();
      await flushMicrotasks();

      expect(globalThis.maplibregl.Map).not.toHaveBeenCalled();

      const mapContainer = document.getElementById('incidentDetailMap');
      expect(mapContainer.textContent).toContain('No hay coordenadas');
    });
  });
});
