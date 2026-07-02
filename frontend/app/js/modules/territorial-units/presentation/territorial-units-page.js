import { hideMainLoader, showMainLoader } from '../../../layout/loader.js?v=20';
import { escapeHtml } from '../../../shared/sanitizer.js?v=20';
import {
  createTerritorialUnit,
  deactivateTerritorialUnit,
  getTerritorialTree,
  listTerritorialUnits,
  updateTerritorialUnit,
} from '../application/territorial-unit-service.js?v=1';

const TYPE_LABELS = {
  province: 'Provincia',
  canton: 'Canton',
  parish: 'Parroquia',
  sector: 'Sector / Barrio',
};

const PARENT_TYPE_BY_TYPE = {
  province: null,
  canton: 'province',
  parish: 'canton',
  sector: 'parish',
};

let flatUnits = [];

document.addEventListener('DOMContentLoaded', initTerritorialUnitsPage);

async function initTerritorialUnitsPage() {
  window.renderLayout?.('territorial-units');
  bindEvents();
  await refresh();
}

function bindEvents() {
  document.getElementById('territorialType')?.addEventListener('change', populateParentOptions);
  document.getElementById('territorialForm')?.addEventListener('submit', saveUnit);
  document.getElementById('btnResetUnit')?.addEventListener('click', resetForm);
  document.getElementById('btnNewUnit')?.addEventListener('click', resetForm);
  document.getElementById('territorialSearch')?.addEventListener('input', renderFilteredTree);

  document.getElementById('territorialTree')?.addEventListener('click', async (event) => {
    const editButton = event.target.closest('.js-edit-unit');
    const deleteButton = event.target.closest('.js-delete-unit');

    if (editButton) {
      editUnit(editButton.dataset.unitId);
    }

    if (deleteButton) {
      await deactivateUnit(deleteButton.dataset.unitId);
    }
  });
}

async function refresh() {
  showMainLoader();
  try {
    const tree = await getTerritorialTree();
    flatUnits = flattenTree(tree);
    renderTree(tree);
    populateParentOptions();
  } catch (error) {
    showAlert(error.message || 'No se pudo cargar la gestion territorial.', 'danger');
  } finally {
    hideMainLoader();
  }
}

function renderFilteredTree() {
  const query = document.getElementById('territorialSearch')?.value.trim().toLowerCase() || '';
  if (!query) {
    renderTree(buildTreeFromFlat(flatUnits));
    return;
  }

  const matches = flatUnits.filter((unit) => {
    const text = `${unit.name} ${unit.full_path} ${unit.type}`.toLowerCase();
    return text.includes(query);
  });

  renderFlatList(matches);
}

function renderTree(units) {
  const target = document.getElementById('territorialTree');
  if (!target) return;

  if (!units.length) {
    target.innerHTML = '<p class="text-muted mb-0">No hay unidades territoriales registradas.</p>';
    return;
  }

  target.innerHTML = renderTreeNodes(units);
}

function renderTreeNodes(units) {
  return `<ul>${units.map((unit) => `
    <li>
      ${unitRow(unit)}
      ${unit.children?.length ? renderTreeNodes(unit.children) : ''}
    </li>
  `).join('')}</ul>`;
}

function renderFlatList(units) {
  const target = document.getElementById('territorialTree');
  if (!target) return;

  if (!units.length) {
    target.innerHTML = '<p class="text-muted mb-0">No se encontraron coincidencias.</p>';
    return;
  }

  target.innerHTML = units.map(unitRow).join('');
}

function unitRow(unit) {
  return `
    <div class="territorial-node">
      <div>
        <strong>${escapeHtml(unit.name)}</strong>
        <span class="badge badge-light ml-1">${escapeHtml(TYPE_LABELS[unit.type] || unit.type)}</span>
        <div class="text-muted small">${escapeHtml(unit.full_path)}</div>
      </div>
      <div class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-primary js-edit-unit" data-unit-id="${escapeHtml(unit.id)}">
          <i class="fas fa-edit"></i>
        </button>
        <button type="button" class="btn btn-outline-danger js-delete-unit" data-unit-id="${escapeHtml(unit.id)}">
          <i class="fas fa-ban"></i>
        </button>
      </div>
    </div>`;
}

async function populateParentOptions() {
  const type = document.getElementById('territorialType')?.value || 'province';
  const parentSelect = document.getElementById('territorialParent');
  if (!parentSelect) return;

  const expectedParentType = PARENT_TYPE_BY_TYPE[type];
  parentSelect.textContent = '';

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = expectedParentType ? 'Seleccione unidad padre' : 'Sin padre';
  parentSelect.appendChild(empty);
  parentSelect.disabled = !expectedParentType;

  if (!expectedParentType) return;

  const currentId = document.getElementById('territorialId')?.value;
  const parents = await listTerritorialUnits({ type: expectedParentType });
  parents
    .filter((unit) => String(unit.id) !== String(currentId))
    .forEach((unit) => {
      const option = document.createElement('option');
      option.value = unit.id;
      option.textContent = unit.full_path || unit.name;
      parentSelect.appendChild(option);
    });
}

async function saveUnit(event) {
  event.preventDefault();
  const id = document.getElementById('territorialId')?.value;
  const payload = {
    name: document.getElementById('territorialName')?.value.trim(),
    type: document.getElementById('territorialType')?.value,
    parent_id: document.getElementById('territorialParent')?.value || null,
    code: document.getElementById('territorialCode')?.value.trim() || null,
    is_active: document.getElementById('territorialActive')?.checked ?? true,
  };

  if (!payload.name) {
    showAlert('Ingresa el nombre de la unidad territorial.', 'warning');
    return;
  }

  showMainLoader();
  try {
    const response = id
      ? await updateTerritorialUnit(id, payload)
      : await createTerritorialUnit(payload);
    showAlert(response?.message || 'Unidad territorial guardada correctamente.', 'success');
    resetForm();
    await refresh();
  } catch (error) {
    showAlert(error.message || 'No se pudo guardar la unidad territorial.', 'danger');
  } finally {
    hideMainLoader();
  }
}

async function editUnit(id) {
  const unit = flatUnits.find((item) => String(item.id) === String(id));
  if (!unit) return;

  setValue('territorialId', unit.id);
  setValue('territorialName', unit.name);
  setValue('territorialType', unit.type);
  setValue('territorialCode', unit.code || '');
  document.getElementById('territorialActive').checked = Boolean(unit.is_active);
  document.getElementById('territorialFormTitle').textContent = 'Editar unidad territorial';
  await populateParentOptions();
  setValue('territorialParent', unit.parent_id || '');
}

async function deactivateUnit(id) {
  if (!window.confirm('Deseas desactivar esta unidad territorial?')) return;

  showMainLoader();
  try {
    const response = await deactivateTerritorialUnit(id);
    showAlert(response?.message || 'Unidad territorial desactivada correctamente.', 'success');
    await refresh();
  } catch (error) {
    showAlert(error.message || 'No se pudo desactivar la unidad territorial.', 'danger');
  } finally {
    hideMainLoader();
  }
}

function resetForm() {
  document.getElementById('territorialForm')?.reset();
  setValue('territorialId', '');
  document.getElementById('territorialActive').checked = true;
  document.getElementById('territorialFormTitle').textContent = 'Nueva unidad territorial';
  populateParentOptions();
}

function flattenTree(units, result = []) {
  units.forEach((unit) => {
    result.push(unit);
    if (Array.isArray(unit.children)) {
      flattenTree(unit.children, result);
    }
  });
  return result;
}

function buildTreeFromFlat(units) {
  const byId = new Map(units.map((unit) => [String(unit.id), { ...unit, children: [] }]));
  const roots = [];

  byId.forEach((unit) => {
    if (unit.parent_id && byId.has(String(unit.parent_id))) {
      byId.get(String(unit.parent_id)).children.push(unit);
    } else {
      roots.push(unit);
    }
  });

  return roots;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function showAlert(message, type = 'info') {
  if (window.showGlobalAlert) {
    window.showGlobalAlert(message, type);
    return;
  }

  const target = document.getElementById('alertaGlobal');
  if (!target) return;
  target.className = `alert alert-${type}`;
  target.textContent = message;
  target.style.display = 'block';
}
