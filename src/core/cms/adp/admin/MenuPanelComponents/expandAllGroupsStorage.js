const STORAGE_KEY = 'menu_panel_expand_all_groups'

function readLegacyCookie() {
  const match = document.cookie.match(/(?:^|; )menu_panel_expand_all_groups=(true|false)(?:;|$)/)
  return match ? match[1] : null
}

function clearLegacyCookie() {
  document.cookie = `${STORAGE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
}

export function loadExpandAllGroups() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true' || stored === 'false') return stored === 'true'
  } catch {
    return false
  }

  const legacy = readLegacyCookie()
  if (legacy === null) return false

  const enabled = legacy === 'true'
  saveExpandAllGroups(enabled)
  clearLegacyCookie()
  return enabled
}

export function saveExpandAllGroups(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // Хранилище недоступно: выбор действует только до перезагрузки страницы.
  }
}