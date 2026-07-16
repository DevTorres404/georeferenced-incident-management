import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  listIncidents: vi.fn(),
  listStates: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  formatCatalogLabel: (v) => v || '-',
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setFieldError: vi.fn(),
  clearFieldError: vi.fn(),
  setupValidationListeners: vi.fn(),
}));

describe('reports-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('CHART_COLORS', () => {
    it('defines all expected color keys', async () => {
      const { CHART_COLORS } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(CHART_COLORS.primary).toBe('#0ea5e9');
      expect(CHART_COLORS.success).toBe('#10b981');
      expect(CHART_COLORS.warning).toBe('#f59e0b');
      expect(CHART_COLORS.danger).toBe('#ef4444');
      expect(CHART_COLORS.palette).toHaveLength(8);
    });
  });

  describe('CHART_DEFAULTS', () => {
    it('has responsive true', async () => {
      const { CHART_DEFAULTS } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(CHART_DEFAULTS.responsive).toBe(true);
      expect(CHART_DEFAULTS.legend.position).toBe('bottom');
    });
  });

  describe('uniqueSortedValues', () => {
    it('returns sorted unique values from array', async () => {
      const { uniqueSortedValues } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const result = uniqueSortedValues(['Z', 'a', 'b', 'a', '']);
      expect(result).toEqual(['a', 'b', 'Z']);
    });

    it('returns empty array for empty input', async () => {
      const { uniqueSortedValues } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(uniqueSortedValues([])).toEqual([]);
    });

    it('filters out falsy values', async () => {
      const { uniqueSortedValues } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(uniqueSortedValues([null, undefined, '', 'a'])).toEqual(['a']);
    });
  });

  describe('parseDate', () => {
    it('parses valid date string', async () => {
      const { parseDate } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const result = parseDate('2025-01-15T10:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(0);
    });

    it('returns null for null input', async () => {
      const { parseDate } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(parseDate(null)).toBeNull();
    });

    it('returns null for invalid date', async () => {
      const { parseDate } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(parseDate('not-a-date')).toBeNull();
    });
  });

  describe('startOfDay / endOfDay', () => {
    it('startOfDay sets time to 00:00:00.000', async () => {
      const { startOfDay } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const result = startOfDay('2025-06-15');
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('endOfDay sets time to 23:59:59.999', async () => {
      const { endOfDay } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const result = endOfDay('2025-06-15');
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });
  });

  describe('normalizeText', () => {
    it('removes accents and uppercases', async () => {
      const { normalizeText } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(normalizeText('Crítica')).toBe('CRITICA');
    });

    it('trims whitespace', async () => {
      const { normalizeText } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(normalizeText('  hola  ')).toBe('HOLA');
    });
  });

  describe('normalizeState', () => {
    it('replaces spaces with underscores', async () => {
      const { normalizeState } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(normalizeState('En Proceso')).toBe('EN_PROCESO');
    });
  });

  describe('equalsNormalized', () => {
    it('compares ignoring case and accents', async () => {
      const { equalsNormalized } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(equalsNormalized('Crítica', 'CRITICA')).toBe(true);
      expect(equalsNormalized('foo', 'bar')).toBe(false);
    });
  });

  describe('includesNormalized', () => {
    it('checks substring ignoring case and accents', async () => {
      const { includesNormalized } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(includesNormalized('Prioridad Crítica', 'critica')).toBe(true);
      expect(includesNormalized('Prioridad Baja', 'critica')).toBe(false);
    });
  });

  describe('monthKey', () => {
    it('formats date as YYYY-MM', async () => {
      const { monthKey } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const date = new Date(2025, 0, 15);
      expect(monthKey(date)).toBe('2025-01');
    });
  });

  describe('daysBetween', () => {
    it('returns positive day difference', async () => {
      const { daysBetween } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-10');
      expect(daysBetween(start, end)).toBe(9);
    });

    it('returns 0 when start is after end', async () => {
      const { daysBetween } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const start = new Date('2025-01-10');
      const end = new Date('2025-01-01');
      expect(daysBetween(start, end)).toBe(0);
    });
  });

  describe('territoryTail', () => {
    it('extracts last segment from path', async () => {
      const { territoryTail } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(territoryTail('Ecuador / Pichincha / Quito')).toBe('Quito');
    });

    it('returns default for empty path', async () => {
      const { territoryTail } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(territoryTail('')).toBe('Sin territorio');
    });
  });

  describe('getTopEntry', () => {
    it('returns entry with highest count', async () => {
      const { getTopEntry } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const result = getTopEntry({ a: 1, b: 10, c: 5 });
      expect(result.label).toBeDefined();
      expect(result.count).toBe(10);
    });

    it('returns null for empty object', async () => {
      const { getTopEntry } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(getTopEntry({})).toBeNull();
    });
  });

  describe('buildRangeLabel', () => {
    it('builds label from date filters', async () => {
      const { buildRangeLabel } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const filters = { startDate: '2025-01-01', endDate: '2025-01-31' };
      expect(buildRangeLabel(filters)).toContain('desde');
      expect(buildRangeLabel(filters)).toContain('hasta');
    });

    it('returns empty for no dates', async () => {
      const { buildRangeLabel } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(buildRangeLabel({})).toBe('');
    });
  });

  describe('escapeCsvValue', () => {
    it('wraps value in quotes', async () => {
      const { escapeCsvValue } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(escapeCsvValue('hello')).toBe('"hello"');
    });

    it('escapes double quotes inside value', async () => {
      const { escapeCsvValue } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(escapeCsvValue('he"llo')).toBe('"he""llo"');
    });
  });

  describe('matchesFilters', () => {
    it('returns true when no filters applied', async () => {
      const { matchesFilters } = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(matchesFilters({}, {})).toBe(true);
    });

    it('filters by category', async () => {
      const { matchesFilters } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const incident = { category: { name: 'Daño' } };
      expect(matchesFilters(incident, { category: 'Daño' })).toBe(true);
      expect(matchesFilters(incident, { category: 'Otro' })).toBe(false);
    });
  });

  describe('normalizeMonthlyTrend', () => {
    it('converts monthlyBuckets to arrays', async () => {
      const { normalizeMonthlyTrend, monthKey, formatMonthLabel } = await import('../app/js/modules/reports/presentation/reports-page.js');
      const buckets = new Map();
      const key = monthKey(new Date(2025, 0));
      buckets.set(key, { registered: 10, resolved: 5, pending: 3 });
      const result = normalizeMonthlyTrend(buckets);
      expect(result.months[0]).toBe(formatMonthLabel(key));
      expect(result.registered).toEqual([10]);
    });
  });
});
