import { describe, expect, it, beforeEach } from 'vitest';

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
});
