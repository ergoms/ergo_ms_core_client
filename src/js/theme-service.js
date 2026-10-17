import { apiClient } from '@/js/api/manager'
import { endpoints, initEndpoints } from '@/js/api/endpoints.js'
import { isMaintenanceResponse } from '@/composables/useMaintenanceMode.js'
import { logWarn } from '@/js/utils/logError.js'
import { getAccess } from '@/core/cms/js/tokenStorage.js'
import { applyThemeModePreference, initTheme, loadThemeFromLocalStorage, readThemePreference, resolveThemeMode, saveSiteThemePairToCache, saveThemeToLocalStorage, THEME_MODES, } from '@/js/theme-manager.js'
import { whenSessionReady } from '@/js/sessionReady.js'

function normalizeThemePayload(data) {
  if (!data || typeof data !== 'object') {
    return null
  }
  return {
    id: data.id,
    name: data.name,
    module_key: data.module_key || null,
    base_theme: data.base_theme || 'light',
    colors: data.colors || {},
    bootstrap_colors: data.bootstrap_colors || {},
    module_tokens: data.module_tokens || {},
    is_active: data.is_active,
    is_default: data.is_default,
    is_available: data.is_available,
    is_system: data.is_system,
  }
}

/** Ответ /themes/active/ (сайт): пара {pair_key, name, is_default, variants: {light, dark}}. */
function normalizeSiteThemePairPayload(data) {
  if (!data || typeof data !== 'object' || !data.variants) {
    return null
  }
  return {
    pair_key: data.pair_key || null,
    name: data.name || '',
    is_default: Boolean(data.is_default),
    variants: {
      light: data.variants.light ? normalizeThemePayload(data.variants.light) : null,
      dark: data.variants.dark ? normalizeThemePayload(data.variants.dark) : null,
    },
  }
}

/**
 * Кладёт пару light+dark в кэш и применяет вариант под режим шестерёнки
 * (localStorage `theme`), а не только base_theme темы.
 * @returns {object|null} применённый вариант
 */
export function applySiteThemePair(data) {
  const pair = normalizeSiteThemePairPayload(data)
  const anchorVariant = pair?.variants.light || pair?.variants.dark
  if (!pair || !anchorVariant) {
    return null
  }
  saveSiteThemePairToCache(pair)
  const stored = localStorage.getItem('theme')
  const preference = (stored && THEME_MODES.includes(stored))
    ? stored
    : (anchorVariant.base_theme === 'dark' ? 'dark' : readThemePreference())
  const resolvedMode = resolveThemeMode(preference)
  const variant = pair.variants[resolvedMode] || anchorVariant
  saveThemeToLocalStorage(variant)
  applyThemeModePreference(preference)
  return variant
}

/**
 * Загружает эффективную тему (пару light+dark) с API и применяет её.
 * Для авторизованного — личная палитра или стандарт сайта.
 * Без сессии кэш не затирается стандартом: экран входа остаётся на последней палитре.
 * Первый визит без кэша берёт стандарт сайта.
 */
export async function syncSiteThemeFromApi() {
  await initEndpoints()
  // Access только в памяти: на F5 сначала restoreSession, иначе active/ без JWT
  // вернёт стандарт сайта и затрёт личную палитру в localStorage.
  await whenSessionReady()
  if (!getAccess() && loadThemeFromLocalStorage()) {
    initTheme()
    return loadThemeFromLocalStorage()
  }
  try {
    // needToken=true: для авторизованного — личная палитра; без токена — стандарт сайта.
    const res = await apiClient.get(endpoints.themes.active, {}, true)
    if (res.success && res.data && !res.data.detail) {
      const applied = applySiteThemePair(res.data)
      if (applied) {
        return applied
      }
    }
  } catch (e) {
    if (!isMaintenanceResponse(e)) {
      logWarn('Не удалось загрузить активную тему с сервера', e)
    }
  }

  initTheme()
  return null
}

/** Восстанавливает активную тему сайта после редактора (превью не сохраняется). */
export async function restoreSiteThemeAfterEditor() {
  const { clearModuleTheme } = await import('@/js/module-theme-manager.js')
  clearModuleTheme()
  return syncSiteThemeFromApi()
}