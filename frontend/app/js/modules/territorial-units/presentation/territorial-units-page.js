document.addEventListener('DOMContentLoaded', initTerritorialUnitsPage)

function initTerritorialUnitsPage() {
  globalThis.renderLayout?.('territorial-units')

  const target = 'operational-structure.html'
  document.querySelectorAll('[data-go-operational-structure="true"]').forEach(actionButton => {
    actionButton.addEventListener('click', () => {
      globalThis.location.href = target
    })
  })

  globalThis.setTimeout(() => {
    globalThis.location.href = target
  }, 1200)
}
