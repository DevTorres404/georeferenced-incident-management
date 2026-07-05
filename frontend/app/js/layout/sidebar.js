import { escapeHtml } from '../shared/sanitizer.js?v=20';

export function buildSidebarHtml(menuItems, activeId) {
  return `
    <div class="sidebar">
      <div class="sgi-sidebar-section-label">Navegacion</div>
      <nav class="mt-2">
        <ul class="nav nav-pills nav-sidebar flex-column" role="menu" data-accordion="false">
          ${menuItems.map((item) => renderMenuItem(item, activeId)).join('')}
        </ul>
      </nav>
    </div>
  `;
}

function renderMenuItem(item, activeId) {
  const children = Array.isArray(item.children) ? item.children : [];
  const childHtml = children.map((child) => renderMenuItem(child, activeId)).join('');
  const hasChildren = children.length > 0;
  const isActive = item.id === activeId;
  const hasActiveChild = hasChildren && children.some((child) => containsActiveItem(child, activeId));
  const itemClasses = ['nav-item'];
  const submenuId = hasChildren ? `submenu-${escapeHtml(item.id || item.label || 'group')}` : '';

  if (hasChildren) {
    itemClasses.push('has-treeview');
  }
  if (hasActiveChild) {
    itemClasses.push('menu-open');
  }

  const linkClasses = ['nav-link'];
  if (isActive || hasActiveChild) {
    linkClasses.push('active');
  }

  const href = hasChildren ? '#' : item.href;
  return `
    <li class="${itemClasses.join(' ')}">
      <a
        href="${escapeHtml(href || '#')}"
        class="${linkClasses.join(' ')}"
        ${hasChildren ? 'data-menu-toggle="true"' : ''}
        ${hasChildren ? `aria-expanded="${hasActiveChild ? 'true' : 'false'}"` : ''}
        ${hasChildren ? `aria-controls="${submenuId}"` : ''}
      >
        <i class="nav-icon fas ${escapeHtml(item.icon || 'fa-circle')}"></i>
        <p>
          ${escapeHtml(item.label || '')}
          ${hasChildren ? '<i class="right fas fa-angle-left"></i>' : ''}
        </p>
      </a>
      ${hasChildren ? `<ul id="${submenuId}" class="nav nav-treeview">${childHtml}</ul>` : ''}
    </li>
  `;
}

function containsActiveItem(item, activeId) {
  if (item.id === activeId) {
    return true;
  }

  const children = Array.isArray(item.children) ? item.children : [];
  return children.some((child) => containsActiveItem(child, activeId));
}
