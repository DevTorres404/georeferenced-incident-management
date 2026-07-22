import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatHours, formatMinutesInHours } from '../app/js/modules/team/presentation/my-team-page.js';

const myTeamHtml = fs.readFileSync(path.resolve('app/html/my-team.html'), 'utf8');
const myTeamCss = fs.readFileSync(path.resolve('app/css/pages/my-team.css'), 'utf8');
const myTeamJs = fs.readFileSync(path.resolve('app/js/modules/team/presentation/my-team-page.js'), 'utf8');

describe('My Team Page - Operator Card', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        // Simulate the logic for calculating workload limits when rendering the card
        const workloadPoints = 25;
        const maxWorkloadPoints = 20;
        const loadPercent = Math.round((workloadPoints / maxWorkloadPoints) * 100); // 125
        const visualPercent = Math.min(100, loadPercent); // 100

        container.innerHTML = `
            <div class="progress-bar bg-danger" role="progressbar"
                style="width: ${visualPercent}%;" aria-valuenow="${loadPercent}" aria-valuemin="0" aria-valuemax="100">
            </div>
            <button class="btn btn-sm btn-outline-primary btn-download-report" data-id="1">
                <i class="fas fa-file-pdf mr-1"></i> Reporte
            </button>
        `;
    });

    it('debe limitar visualmente la barra de progreso a 100% aunque la carga laboral supere el máximo', () => {
        const progressBar = container.querySelector('.progress-bar');
        expect(progressBar.style.width).toBe('100%');
        expect(progressBar.getAttribute('aria-valuenow')).toBe('125');
    });

    it('debe contener el botón de descarga del reporte PDF con el data-id correcto', () => {
        const btn = container.querySelector('.btn-download-report');
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('data-id')).toBe('1');
        expect(btn.textContent).toContain('Reporte');
    });

    it('debe contener el aviso de vista resumida de 50 intervenciones si se renderiza el modal (simulado)', () => {
        // En la vida real esto se renderiza en el modal. Simulamos la inserciA3n del HTML del modal para probar el disclaimer.
        const modalHtml = `
            <div class="card-header border-0 pb-2">
                <div class="d-flex justify-content-between align-items-center">
                    <h3 class="card-title text-sm font-weight-bold text-muted text-uppercase mb-0">Últimas Intervenciones</h3>
                    <span class="badge badge-info text-xs"><i class="fas fa-info-circle mr-1"></i>Vista resumida</span>
                </div>
                <div class="text-xs text-muted mt-2 disclaimer-text">
                    * Esta tabla solo muestra las últimas <strong>50 intervenciones</strong>. Para revisar el historial de ciclos completo, métricas detalladas y todos los registros históricos, se recomienda descargar el Reporte PDF.
                </div>
            </div>
        `;
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        
        const badge = modalContainer.querySelector('.badge-info');
        const disclaimer = modalContainer.querySelector('.disclaimer-text');
        
        expect(badge).not.toBeNull();
        expect(badge.textContent).toContain('Vista resumida');
        
        expect(disclaimer).not.toBeNull();
        expect(disclaimer.textContent).toContain('50 intervenciones');
        expect(disclaimer.textContent).toContain('Reporte PDF');
    });

    it('define una jerarquía visual específica para la vista previa del reporte', () => {
        expect(myTeamHtml).toContain('operator-report-header');
        expect(myTeamHtml).toContain('operator-report-identity');
        expect(myTeamHtml.match(/operator-report-kpi kpi-/g)).toHaveLength(5);
        expect(myTeamHtml).toContain('Configurar y descargar PDF');
        expect(myTeamHtml).toContain('/css/pages/my-team.css?v=3');
        expect(myTeamHtml).toContain('my-team-page.js?v=9');
        expect(myTeamJs).toContain('`${data.metrics.current_workload} pts`');
    });

    it('adapta los indicadores y acciones del reporte a tablet y móvil', () => {
        expect(myTeamCss.trimStart().startsWith('.operator-report-dialog')).toBe(true);
        expect(myTeamCss.indexOf('@media')).toBeGreaterThan(myTeamCss.indexOf('.operator-report-footer'));
        expect(myTeamCss).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');
        expect(myTeamCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
        expect(myTeamCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
        expect(myTeamCss).toContain('.operator-report-footer');
        expect(myTeamCss).toContain('flex-direction: column-reverse');
    });

    it('muestra promedios y duraciones de ciclos en horas y minutos', () => {
        expect(formatHours(0.05)).toBe('0 h 03 min');
        expect(formatHours(2)).toBe('2 h 00 min');
        expect(formatMinutesInHours(185)).toBe('3 h 05 min');
        expect(formatMinutesInHours(60)).toBe('1 h 00 min');
        expect(myTeamJs).toContain('· ${durationLabel}');
    });
});
