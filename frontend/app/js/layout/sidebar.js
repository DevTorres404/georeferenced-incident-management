import { escapeHtml } from '../shared/sanitizer.js?v=20';

export function buildSidebarHtml(menuItems, activeId) {
  return `
    <div class="sidebar">
      <div class="sgi-sidebar-section-label">Navegación</div>
      <nav class="mt-2">
        <ul class="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu" data-accordion="false">
          ${menuItems.map((item) => `
            <li class="nav-item">
              <a href="${escapeHtml(item.href)}" class="nav-link ${item.id === activeId ? 'active' : ''}">
                <i class="nav-icon fas ${escapeHtml(item.icon)}"></i>
                <p>${escapeHtml(item.label)}</p>
              </a>
            </li>
          `).join('')}
        </ul>
      </nav>
    </div>
  `;
}
