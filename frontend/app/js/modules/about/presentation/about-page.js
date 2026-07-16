import { hasPermission } from '../../../core/auth-session.js?v=16';

export async function initAboutPage() {
  if (typeof globalThis.renderLayout !== 'function') return;

  await globalThis.renderLayout('about');
  const createButton = document.getElementById('btnCreateIncident');
  if (createButton) createButton.hidden = !hasPermission('incidents.create');
}

document.addEventListener('DOMContentLoaded', initAboutPage);
