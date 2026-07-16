import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('incident creation static and About visibility', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.body.innerHTML = '<a id="btnCreateIncident" href="incident-create.html" hidden>Nueva Incidencia</a>';
    vi.stubGlobal('renderLayout', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('ships CTAs hidden and initializes About layout once', async () => {
    const incidentsHtml = readFileSync('app/html/incidents.html', 'utf8');
    const aboutHtml = readFileSync('app/html/about.html', 'utf8');
    expect(incidentsHtml).toMatch(/id="btnCreateIncident"[^>]*hidden/);
    expect(aboutHtml).toMatch(/id="btnCreateIncident"[^>]*hidden/);
    expect(aboutHtml.match(/\/js\/layout\/layout\.js/g)).toHaveLength(1);

    const { initAboutPage } = await import('../app/js/modules/about/presentation/about-page.js');
    await initAboutPage();
    expect(globalThis.renderLayout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ADMIN', ['incidents.create'], false],
    ['CIUDADANO', [{ code: 'incidents.create' }], false],
    ['SUPERVISOR', [], true],
    ['OPERADOR', [], true],
  ])('sets the About CTA hidden state for %s', async (role, permissions, hidden) => {
    localStorage.setItem('user_data', JSON.stringify({ roles: [{ codigo: role }], permissions }));
    const { initAboutPage } = await import('../app/js/modules/about/presentation/about-page.js');
    await initAboutPage();
    expect(document.getElementById('btnCreateIncident').hidden).toBe(hidden);
    expect(globalThis.renderLayout).toHaveBeenCalledTimes(1);
  });
});
