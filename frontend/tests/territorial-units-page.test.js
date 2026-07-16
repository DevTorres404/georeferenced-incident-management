import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('territorial-units-page', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="testLayout"></div>
      <button data-go-operational-structure="true">Go</button>
    `;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sets up handlers and redirects after DOMContentLoaded', async () => {
    vi.stubGlobal('renderLayout', vi.fn());
    const origLocation = { ...globalThis.location };
    vi.stubGlobal('location', { ...origLocation, href: '' });

    // Import triggers document.addEventListener('DOMContentLoaded', ...)
    await import('../app/js/modules/territorial-units/presentation/territorial-units-page.js');

    // Fire DOMContentLoaded to trigger init
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Should have called renderLayout
    expect(globalThis.renderLayout).toHaveBeenCalledWith('territorial-units');

    // Button click should set location
    globalThis.location.href = '';
    document.querySelector('[data-go-operational-structure="true"]')
      .dispatchEvent(new Event('click', { bubbles: true }));
    expect(globalThis.location.href).toBe('operational-structure.html');

    // After timeout, should redirect
    globalThis.location.href = '';
    vi.advanceTimersByTime(1200);
    expect(globalThis.location.href).toBe('operational-structure.html');
  });
});
