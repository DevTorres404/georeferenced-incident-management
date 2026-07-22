import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(path, 'utf8');

const notificationsCss = read('app/css/components/notifications.css');
const responsiveCss = read('app/css/responsive.css');
const authCss = read('app/css/auth.css');
const dashboardCss = read('app/css/pages/dashboard.css');
const auditCss = read('app/css/pages/audit.css');
const myTeamCss = read('app/css/pages/my-team.css');
const incidentsCss = read('app/css/pages/incidents.css');
const reportsCss = read('app/css/pages/reports.css');
const assignmentCss = read('app/css/pages/assignment-management.css');
const dashboardHtml = read('app/html/dashboard.html');
const auditHtml = read('app/html/audit-logs.html');
const myTeamHtml = read('app/html/my-team.html');
const incidentsHtml = read('app/html/incidents.html');
const reportsHtml = read('app/html/reports.html');
const incidentDetailHtml = read('app/html/incident-detail.html');
const registerHtml = read('app/html/register.html');
const indexHtml = read('app/index.html');
const dashboardJs = read('app/js/modules/dashboard/presentation/dashboard-page.js');
const auditJs = read('app/js/modules/audit/presentation/audit-logs-page.js');
const myTeamJs = read('app/js/modules/team/presentation/my-team-page.js');
const incidentsJs = read('app/js/modules/incidents/presentation/incidents-page.js');
const userRolesJs = read('app/js/modules/users/presentation/user-roles-page.js');

describe('responsive layout contracts', () => {
  it('anchors the mobile notification dropdown to the viewport', () => {
    expect(notificationsCss).toMatch(/@media \(max-width: 575\.98px\)[\s\S]*?\.sgi-notif-dropdown\s*{[\s\S]*?position:\s*fixed !important;/);
    expect(notificationsCss).toMatch(/\.sgi-notif-dropdown\s*{[\s\S]*?left:\s*10px !important;[\s\S]*?width:\s*auto;/);
    expect(notificationsCss).toMatch(/\.sgi-notif-dropdown\s*{[\s\S]*?transform:\s*none !important;/);
  });

  it('keeps dashboard rows inside a Bootstrap container', () => {
    expect(dashboardHtml).toMatch(/<div class="content">\s*<div class="container-fluid">/);
  });

  it('lets the login hero typography scale through CSS', () => {
    [indexHtml, registerHtml].forEach((html) => {
      const titleTag = html.match(/<h1 id="auth-system-title"[^>]*>/)?.[0] || '';
      expect(titleTag).not.toContain('font-size:');
      expect(html).toContain('/css/auth.css?v=21');
    });
    expect(authCss).toContain('font-size: clamp(2.5rem, 4.5vw, 4.5rem);');
  });

  it('uses responsive classes instead of inline filter widths', () => {
    expect(reportsHtml).not.toMatch(/id="(?:fFechaInicial|fFechaFinal|selectTipoFiltro|selectEstadoFiltro)"[^>]*style="[^"]*width:/);
    expect(incidentsHtml).not.toMatch(/id="(?:filterScope|filterState|filterPriority)"[^>]*style="[^"]*width:/);
    expect(reportsHtml.match(/reports-filter-(?:date|select)/g)).toHaveLength(4);
    expect(incidentsHtml.match(/incident-filter-(?:scope|state|priority)/g)).toHaveLength(3);
    expect(reportsCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.reports-filter-date,[\s\S]*?width:\s*100%;/);
    expect(incidentsCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.incident-filter-scope,[\s\S]*?width:\s*100%;/);
  });

  it('keeps KPI grids at one column on narrow screens', () => {
    const narrowOverride = responsiveCss.match(/@media \(max-width: 450px\)\s*{[\s\S]*?\n}/)?.[0] || '';
    expect(narrowOverride).not.toContain('grid-template-columns');
    expect(dashboardCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.dash-kpi-grid\s*{\s*grid-template-columns:\s*1fr;/);
    expect(incidentsCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.inc-kpi-grid\s*{\s*grid-template-columns:\s*1fr;/);
    expect(reportsCss).toMatch(/@media \(max-width: 576px\)[\s\S]*?\.reports-kpi-grid\s*{\s*grid-template-columns:\s*1fr;/);
  });

  it('does not leak assignment table column rules into other pages', () => {
    expect(assignmentCss).not.toMatch(/^\s*\.table\s+(?:th|td):nth-child/gm);
  });

  it('stacks every assignment field on narrow screens without hiding columns', () => {
    expect(assignmentCss).toMatch(/@media \(max-width: 1199\.98px\)[\s\S]*?#assignmentTable tbody td\s*{[\s\S]*?display:\s*grid !important;/);
    expect(assignmentCss).toContain('content: attr(data-label);');
    expect(assignmentCss).not.toMatch(/#assignmentTable (?:th|td):nth-child\([^)]*\)[\s\S]{0,100}?display:\s*none;/);
  });

  it('stacks the remaining wide operational tables with labeled fields', () => {
    expect(dashboardCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.dash-table tbody td\s*{[\s\S]*?display:\s*grid;/);
    expect(auditCss).toMatch(/@media \(max-width: 767\.98px\)[\s\S]*?\.audit-log-table > tbody > tr > td\s*{[\s\S]*?display:\s*grid;/);
    expect(myTeamCss).toMatch(/@media \(max-width: 767\.98px\)[\s\S]*?\.team-preview-table tbody td\s*{[\s\S]*?display:\s*grid;/);

    expect(dashboardJs.match(/data-label=/g)).toHaveLength(7);
    expect(auditJs.match(/data-label=/g)).toHaveLength(6);
    expect(myTeamJs.match(/data-label=/g)).toHaveLength(6);
    expect(auditHtml).toContain('audit-log-table-wrap');
    expect(myTeamHtml).toContain('team-preview-table-wrap');
  });

  it('keeps existing composite mobile rows functional where desktop columns are hidden', () => {
    expect(incidentsJs).toContain("d-block d-md-none");
    expect(incidentsJs).toContain('incident-detail.html?id=${row.id}');
    expect(userRolesJs).toContain('d-flex d-md-none justify-content-end');
    expect(userRolesJs).toContain('btn-assign-role');
    expect(userRolesJs).toContain('btn-deactivate-user');
  });

  it('bumps cache versions for responsive assets', () => {
    const pagesWithAppCss = readdirSync('app/html')
      .filter((file) => file.endsWith('.html'))
      .map((file) => read(`app/html/${file}`))
      .filter((html) => html.includes('/css/app.css'));

    [...pagesWithAppCss, indexHtml]
      .forEach((html) => expect(html).toMatch(/\/css\/app\.css\?v=(?:68|69)/));
    expect(dashboardHtml).toContain('/css/pages/dashboard.css');
    expect(incidentsHtml).toContain('/css/pages/incidents.css');
    expect(reportsHtml).toContain('/css/pages/reports.css');
  });
});
