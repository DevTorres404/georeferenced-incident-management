import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? ''),
  formatCatalogLabel: (v) => v || '-',
  formatShortDate: (v) => v || '-',
  getPriorityBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateHexColor: vi.fn(() => '#000000'),
  getPriorityHexColor: vi.fn(() => '#000000'),
  showGlobalAlert: vi.fn(),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  assignIncidentOperators: vi.fn(),
  getIncident: vi.fn(),
  listAssignmentOperators: vi.fn(),
  listIncidents: vi.fn(),
}));

describe('assignment-management-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    
    // Mock globalThis.$ for DataTable usage in renderTable
    const mockDataTable = {
      clear: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockReturnThis(),
      rows: vi.fn().mockReturnThis(),
      add: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
    };
    mockDataTable.DataTable = vi.fn().mockReturnValue(mockDataTable);
    
    globalThis.$ = vi.fn().mockReturnValue(mockDataTable);
    globalThis.$.fn = {
      DataTable: {
        isDataTable: vi.fn().mockReturnValue(false)
      }
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('uniqueValues', () => {
    it('extracts unique sorted values', async () => {
      const { uniqueValues } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(uniqueValues(['b', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('filters out empty/falsy values', async () => {
      const { uniqueValues } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(uniqueValues(['a', '', null, undefined, 'b'])).toEqual(['a', 'b']);
    });

    it('trims whitespace', async () => {
      const { uniqueValues } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(uniqueValues(['  a  ', 'b'])).toEqual(['a', 'b']);
    });

    it('returns empty array for empty input', async () => {
      const { uniqueValues } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(uniqueValues([])).toEqual([]);
    });

    it('sorts alphabetically using localeCompare', async () => {
      const { uniqueValues } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(uniqueValues(['Zona B', 'Zona A'])).toEqual(['Zona A', 'Zona B']);
    });
  });

  describe('userHasRole', () => {
    it('returns true when user has the role (string roles)', async () => {
      const { userHasRole } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(userHasRole({ roles: ['ADMIN', 'OPERATOR'] }, 'ADMIN')).toBe(true);
    });

    it('returns true with object roles using code field', async () => {
      const { userHasRole } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(userHasRole({ roles: [{ code: 'SUPERVISOR' }] }, 'SUPERVISOR')).toBe(true);
    });

    it('returns true with object roles using codigo field', async () => {
      const { userHasRole } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(userHasRole({ roles: [{ codigo: 'ADMIN' }] }, 'ADMIN')).toBe(true);
    });

    it('returns false when user lacks the role', async () => {
      const { userHasRole } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(userHasRole({ roles: ['OPERATOR'] }, 'ADMIN')).toBe(false);
    });

    it('returns false for null user', async () => {
      const { userHasRole } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(userHasRole(null, 'ADMIN')).toBe(false);
    });

    it('returns false for user without roles property', async () => {
      const { userHasRole } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(userHasRole({ name: 'test' }, 'ADMIN')).toBe(false);
    });

    it('is case-insensitive', async () => {
      const { userHasRole } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(userHasRole({ roles: ['admin'] }, 'ADMIN')).toBe(true);
    });
  });

  describe('includesNormalized', () => {
    it('returns true when value contains expected (case-insensitive)', async () => {
      const { includesNormalized } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(includesNormalized('Critica', 'critica')).toBe(true);
    });

    it('returns false when value does not contain expected', async () => {
      const { includesNormalized } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(includesNormalized('alta', 'critica')).toBe(false);
    });

    it('handles null value', async () => {
      const { includesNormalized } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(includesNormalized(null, 'test')).toBe(false);
    });

    it('handles undefined value', async () => {
      const { includesNormalized } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(includesNormalized(undefined, 'test')).toBe(false);
    });
  });

  describe('isResolvedState', () => {
    it('returns true for resuelta', async () => {
      const { isResolvedState } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(isResolvedState('Resuelta')).toBe(true);
    });

    it('returns true for cerrada', async () => {
      const { isResolvedState } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(isResolvedState('Cerrada')).toBe(true);
    });

    it('returns true for cancelada', async () => {
      const { isResolvedState } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(isResolvedState('Cancelada')).toBe(true);
    });

    it('returns true for rechazada', async () => {
      const { isResolvedState } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(isResolvedState('Rechazada')).toBe(true);
    });

    it('returns false for non-resolved state', async () => {
      const { isResolvedState } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(isResolvedState('Pendiente')).toBe(false);
    });

    it('returns false for null', async () => {
      const { isResolvedState } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(isResolvedState(null)).toBe(false);
    });
  });

  describe('buildOperatorCapacityLabel', () => {
    it('builds capacity string from operator data', async () => {
      const { buildOperatorCapacityLabel } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const op = { active_incidents: 3, max_active_incidents: 10, workload_points: 15, max_workload_points: 50 };
      expect(buildOperatorCapacityLabel(op)).toBe('3/10 activas · 15/50 pts');
    });

    it('handles zero values', async () => {
      const { buildOperatorCapacityLabel } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const op = { active_incidents: 0, max_active_incidents: 5, workload_points: 0, max_workload_points: 50 };
      expect(buildOperatorCapacityLabel(op)).toBe('0/5 activas · 0/50 pts');
    });
  });

  describe('buildOperatorOptionLabel', () => {
    it('builds label with name and capacity', async () => {
      const { buildOperatorOptionLabel } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const op = { full_name: 'Juan Pérez', active_incidents: 2, max_active_incidents: 10, workload_points: 8, max_workload_points: 50 };
      expect(buildOperatorOptionLabel(op)).toBe('Juan Pérez · 2/10 activas · 8/50 pts');
    });

    it('falls back to email when no full_name', async () => {
      const { buildOperatorOptionLabel } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const op = { email: 'juan@test.com', active_incidents: 0, max_active_incidents: 5, workload_points: 0, max_workload_points: 50 };
      expect(buildOperatorOptionLabel(op)).toContain('juan@test.com');
    });
  });

  describe('readSessionUser', () => {
    it('parses and returns user from localStorage', async () => {
      localStorage.setItem('user_data', JSON.stringify({ id: 1, name: 'Test' }));
      const { readSessionUser } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(readSessionUser()).toEqual({ id: 1, name: 'Test' });
    });

    it('returns null when no user_data in localStorage', async () => {
      const { readSessionUser } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(readSessionUser()).toBeNull();
    });

    it('returns null on invalid JSON', async () => {
      localStorage.setItem('user_data', '{invalid}');
      const { readSessionUser } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(readSessionUser()).toBeNull();
    });
  });

  describe('fillSelect', () => {
    it('fills options preserving the first option', async () => {
      document.body.innerHTML = '<select id="testSelect"><option value="">Todos</option></select>';
      const { fillSelect } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      fillSelect('testSelect', ['Crítica', 'Alta']);
      const options = document.getElementById('testSelect').options;
      expect(options.length).toBe(3);
      expect(options[0].value).toBe('');
      expect(options[1].value).toBe('Crítica');
      expect(options[2].value).toBe('Alta');
    });

    it('does nothing when element does not exist', async () => {
      const { fillSelect } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(() => fillSelect('nonExistent', ['a'])).not.toThrow();
    });

    it('handles empty values array', async () => {
      document.body.innerHTML = '<select id="testSelect"><option value="">Todos</option></select>';
      const { fillSelect } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      fillSelect('testSelect', []);
      expect(document.getElementById('testSelect').options.length).toBe(1);
    });
  });

  describe('renderError', () => {
    it('renders error message in tbody', async () => {
      document.body.innerHTML = '<table><tbody id="assignmentTableBody"></tbody></table>';
      const { renderError } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      renderError('Algo salió mal');
      expect(document.getElementById('assignmentTableBody').innerHTML).toContain('Algo salió mal');
    });

    it('does nothing when tbody is missing', async () => {
      const { renderError } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(() => renderError('error')).not.toThrow();
    });
  });

  describe('renderKpis', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div id="assignmentKpis"></div>';
    });

    it('renders all five KPI cards', async () => {
      const { renderKpis } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const incidents = [
        { id: 1, assignee_user_id: null, priority: { name: 'Crítica' } },
        { id: 2, assignee_user_id: 5, priority: { name: 'Alta' } },
      ];
      renderKpis(incidents, []);
      const html = document.getElementById('assignmentKpis').innerHTML;
      expect(html).toContain('Sin asignar');
      expect(html).toContain('Criticas');
      expect(html).toContain('Altas');
      expect(html).toContain('Vencidas');
      expect(html).toContain('Operadores disponibles');
    });

    it('counts overdue incidents based on due_date', async () => {
      const { renderKpis } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const incidents = [
        { id: 1, due_date: pastDate, state: { name: 'Pendiente' }, assignee_user_id: 5 },
      ];
      renderKpis(incidents, []);
      const html = document.getElementById('assignmentKpis').innerHTML;
      expect(html).toContain('Vencidas');
    });

    it('does nothing when #assignmentKpis is missing', async () => {
      document.body.innerHTML = '';
      const { renderKpis } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(() => renderKpis([], [])).not.toThrow();
    });
  });

  describe('renderTable', () => {
    beforeEach(() => {
      document.body.innerHTML = '<table><tbody id="assignmentTableBody"></tbody></table>';
    });

    it('renders empty state when filteredIncidents is empty', async () => {
      const { renderTable } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      renderTable({ filteredIncidents: [] });
      expect(document.getElementById('assignmentTableBody').innerHTML).toContain('No hay incidencias');
    });

    it('renders incident row with assignment chips', async () => {
      const { renderTable } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const state = {
        filteredIncidents: [
          {
            id: 1,
            code: 'INC-001',
            title: 'Fuga de agua',
            priority: { name: 'Crítica', color: '#ff0000' },
            state: { name: 'Pendiente', color: '#ffa500' },
            zone_name: 'Norte',
            territorial_unit: { full_path: 'Provincia > Cantón' },
            created_at: '2024-01-15',
            assignments: [
              { user_id: 10, full_name: 'Juan Pérez', assignment_role: 'primary' },
              { user_id: 11, full_name: 'Ana Gómez', assignment_role: 'support' },
            ],
          },
        ],
      };
      renderTable(state);
      const html = document.getElementById('assignmentTableBody').innerHTML;
      expect(html).toContain('INC-001');
      expect(html).toContain('Fuga de agua');
      expect(html).toContain('Juan Pérez');
      expect(html).toContain('Ana Gómez');
      expect(html).toContain('Principal');
      expect(html).toContain('Apoyo');
      expect(html).toContain('background-color: #ff0000');
      expect(html).toContain('background-color: #ffa500');
    });

    it('renders "Sin asignación" when no assignments', async () => {
      const { renderTable } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const state = {
        filteredIncidents: [
          { id: 1, code: 'INC-001', title: 'Test', assignments: [], priority: {}, state: {} },
        ],
      };
      renderTable(state);
      expect(document.getElementById('assignmentTableBody').innerHTML).toContain('Sin asignación');
    });

    it('does nothing when tbody is missing', async () => {
      document.body.innerHTML = '';
      const { renderTable } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      expect(() => renderTable({ filteredIncidents: [] })).not.toThrow();
    });
  });

  describe('applyFilters', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <input id="filterSearch" value="">
        <input id="filterPriority" value="">
        <input id="filterState" value="">
        <input id="filterCategory" value="">
        <input id="filterTerritory" value="">
        <input id="filterOperator" value="">
        <div id="assignmentKpis"></div>
        <table><tbody id="assignmentTableBody"></tbody></table>
      `;
    });

    it('returns all incidents when no filters active', async () => {
      const { applyFilters } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      const state = {
        incidents: [
          { id: 1, code: 'INC-001', title: 'A', priority: { name: 'Crítica' }, state: { name: 'Pendiente' } },
          { id: 2, code: 'INC-002', title: 'B', priority: { name: 'Alta' }, state: { name: 'Resuelta' } },
        ],
        filteredIncidents: [],
        operators: [],
      };
      applyFilters(state);
      expect(state.filteredIncidents).toHaveLength(2);
    });

    it('filters by search term (code or title)', async () => {
      const { applyFilters } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      document.getElementById('filterSearch').value = 'INC-001';
      const state = {
        incidents: [
          { id: 1, code: 'INC-001', title: 'Fuga', priority: {}, state: {} },
          { id: 2, code: 'INC-002', title: 'Otro', priority: {}, state: {} },
        ],
        filteredIncidents: [],
        operators: [],
      };
      applyFilters(state);
      expect(state.filteredIncidents).toHaveLength(1);
      expect(state.filteredIncidents[0].id).toBe(1);
    });

    it('filters by priority', async () => {
      const { applyFilters } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      document.getElementById('filterPriority').value = 'Crítica';
      const state = {
        incidents: [
          { id: 1, code: 'C1', priority: { name: 'Crítica' }, state: {} },
          { id: 2, code: 'A1', priority: { name: 'Alta' }, state: {} },
        ],
        filteredIncidents: [],
        operators: [],
      };
      applyFilters(state);
      expect(state.filteredIncidents).toHaveLength(1);
      expect(state.filteredIncidents[0].code).toBe('C1');
    });

    it('filters by state', async () => {
      const { applyFilters } = await import('../app/js/modules/incidents/presentation/assignment-management-page.js');
      document.getElementById('filterState').value = 'Resuelta';
      const state = {
        incidents: [
          { id: 1, state: { name: 'Pendiente' }, priority: {} },
          { id: 2, state: { name: 'Resuelta' }, priority: {} },
        ],
        filteredIncidents: [],
        operators: [],
      };
      applyFilters(state);
      expect(state.filteredIncidents).toHaveLength(1);
      expect(state.filteredIncidents[0].id).toBe(2);
    });
  });
});
