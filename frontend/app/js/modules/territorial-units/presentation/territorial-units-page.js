document.addEventListener('DOMContentLoaded', initTerritorialUnitsPage);

function initTerritorialUnitsPage() {
  window.renderLayout?.('territorial-units');

  const target = 'operational-structure.html';
  document.querySelectorAll('[data-go-operational-structure="true"]').forEach((actionButton) => {
    actionButton.addEventListener('click', () => {
      window.location.href = target;
    });
  });

  window.setTimeout(() => {
    window.location.href = target;
  }, 1200);
}
