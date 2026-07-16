import { describe, it, expect, vi } from 'vitest';

vi.mock('../app/js/shared/sanitizer.js', () => ({
  escapeHtml: (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
}));

describe('buildSidebarHtml', () => {
  it('returns HTML string for valid menu items', async () => {
    const { buildSidebarHtml } = await import('../app/js/layout/sidebar.js');
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', route: 'dashboard.html' },
      { id: 'incidents', label: 'Incidencias', icon: 'fa-list', route: 'incidents.html' },
    ];
    const html = buildSidebarHtml(items, 'dashboard');
    expect(html).toContain('nav');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Incidencias');
    expect(html).toContain('fa-chart-pie');
    expect(html).toContain('fa-list');
  });

  it('handles empty menu items gracefully', async () => {
    const { buildSidebarHtml } = await import('../app/js/layout/sidebar.js');
    const html = buildSidebarHtml([], 'test');
    expect(html).toContain('nav');
    expect(html).not.toContain('data-nav-id=');
  });

  it('handles null menu items gracefully', async () => {
    const { buildSidebarHtml } = await import('../app/js/layout/sidebar.js');
    expect(() => buildSidebarHtml(null, 'test')).not.toThrow();
    const html = buildSidebarHtml(null, 'test');
    expect(html).toContain('nav');
  });

  it('renders active state for current item', async () => {
    const { buildSidebarHtml } = await import('../app/js/layout/sidebar.js');
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', route: 'dashboard.html' },
      { id: 'incidents', label: 'Incidencias', icon: 'fa-list', route: 'incidents.html' },
    ];
    const html = buildSidebarHtml(items, 'dashboard');
    expect(html).toContain('data-nav-id="dashboard"');
    expect(html).toContain('active');
  });

  it('renders children recursively', async () => {
    const { buildSidebarHtml } = await import('../app/js/layout/sidebar.js');
    const items = [{
      id: 'workspace',
      label: 'Espacio de trabajo',
      icon: 'fa-th',
      children: [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', route: 'dashboard.html' },
        { id: 'incidents', label: 'Incidencias', icon: 'fa-list', route: 'incidents.html' },
      ],
    }];
    const html = buildSidebarHtml(items, 'dashboard');
    expect(html).toContain('has-treeview');
    expect(html).toContain('data-menu-toggle="true"');
    expect(html).toContain('nav-treeview');
    expect(html).toContain('Incidencias');
  });

  it('renders active state for parent when child is active', async () => {
    const { buildSidebarHtml } = await import('../app/js/layout/sidebar.js');
    const items = [{
      id: 'workspace',
      label: 'Espacio de trabajo',
      icon: 'fa-th',
      children: [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', route: 'dashboard.html' },
      ],
    }];
    const html = buildSidebarHtml(items, 'dashboard');
    expect(html).toContain('menu-open');
  });

  it('escapes HTML in labels and titles', async () => {
    const { buildSidebarHtml } = await import('../app/js/layout/sidebar.js');
    const items = [
      { id: 'bad', label: '<script>alert(1)</script>', icon: 'fa-circle', route: 'bad.html' },
    ];
    const html = buildSidebarHtml(items, '');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
