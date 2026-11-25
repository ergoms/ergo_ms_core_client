/**
 * Менеджер тем: применение цветов к DOM, кеш в localStorage, режим light/dark/auto.
 * Начальные значения — из bootstrap-variables.js (синхронизированы с _theme.scss).
 */

import { logError, logWarn } from '@/js/utils/logError.js'
import {
  COLOR_DESCRIPTIONS,
  BOOTSTRAP_VARIABLES,
  getThemeScssColors,
  getBootstrapByCategories as getBootstrapCategories,
} from './bootstrap-variables.js'
import {
  buildThemeCss,
  hasCustomColors,
  COLOR_VAR_MAP,
  BOOTSTRAP_BRIDGE_FROM_COLORS,
} from './theme-css-builder.js'
import { clearCspStyleSheet, setCspStyleSheet } from './cspStyleSheet.js'

export { COLOR_VAR_MAP, BOOTSTRAP_BRIDGE_FROM_COLORS, hasCustomColors }

const THEME_STORAGE_KEY = 'theme'
const ACTIVE_THEME_STORAGE_KEY = 'activeTheme'
const ACTIVE_SITE_PAIR_STORAGE_KEY = 'activeSiteThemePair'
const CUSTOM_THEME_STYLE_ID = 'custom-theme-styles'

export const THEME_MODES = ['light', 'dark', 'auto']
export const THEME_CHANGE_EVENT = 'ergo:theme-change'

function notifyThemeChange() {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, {
    detail: {
      preference: readThemePreference(),
      mode: getCurrentThemeMode(),
    },
  }))
}

export function readThemePreference() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored && THEME_MODES.includes(stored)) {
    return stored
  }

  return 'auto'
}

export function writeThemePreference(mode) {
  if (!THEME_MODES.includes(mode)) return
  localStorage.setItem(THEME_STORAGE_KEY, mode)
}

export function resolveThemeMode(mode) {
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

export function getDefaultColors(baseTheme = 'light') {
  return getThemeScssColors(baseTheme)
}

export function getDefaultThemeConfig() {
  return {
    light: getDefaultColors('light'),
    dark: getDefaultColors('dark'),
  }
}

export function applyBootstrapThemeMode(mode) {
  const resolved = resolveThemeMode(mode)
  document.documentElement.setAttribute('data-bs-theme', resolved)
  clearCspStyleSheet(CUSTOM_THEME_STYLE_ID)
}

function resolveColorsForAppearanceMode(savedTheme, resolvedMode) {
  const savedBase = savedTheme.base_theme || savedTheme.baseTheme || 'light'
  if (savedBase === resolvedMode) {
    return savedTheme.colors
  }

  const defaults = getDefaultColors(resolvedMode)
  const savedAccent = savedTheme.colors?.accent
  const savedBaseAccent = getDefaultColors(savedBase).accent

  if (savedAccent && savedAccent !== savedBaseAccent) {
    return { ...defaults, accent: savedAccent }
  }

  return defaults
}

/**
 * Точный вариант из закэшированной пары light+dark темы сайта (если применим к savedTheme).
 * Возвращает null, если пары нет, она устарела или не содержит нужного варианта.
 */
function resolveExactVariantForMode(savedTheme, resolvedMode) {
  const pair = loadSiteThemePairFromCache()
  const variant = pair?.variants?.[resolvedMode]
  if (!variant) {
    return null
  }
  // Пара актуальна для текущей активной темы: совпадает id хотя бы одного из вариантов.
  const pairThemeIds = [pair.variants.light?.id, pair.variants.dark?.id].filter((id) => id != null)
  if (savedTheme?.id != null && pairThemeIds.length && !pairThemeIds.includes(savedTheme.id)) {
    return null
  }
  return {
    ...savedTheme,
    id: variant.id,
    name: variant.name,
    base_theme: resolvedMode,
    colors: variant.colors || {},
    bootstrap_colors: variant.bootstrap_colors || variant.bootstrapColors || {},
  }
}

/**
 * Применить предпочтение light/dark/auto с учётом активной кастомной темы.
 * Режим из шестерёнки всегда задаёт data-bs-theme; палитра подстраивается под него.
 * Если для активной темы известна пара light+dark — берётся точный вариант,
 * иначе — приближение через resolveColorsForAppearanceMode.
 */
export function applyThemeModePreference(mode) {
  writeThemePreference(mode)
  const resolvedMode = resolveThemeMode(mode)
  const savedTheme = loadThemeFromLocalStorage()

  if (savedTheme && hasCustomColors(savedTheme.colors)) {
    const exactVariant = resolveExactVariantForMode(savedTheme, resolvedMode)
    applyTheme(
      exactVariant || {
        ...savedTheme,
        base_theme: resolvedMode,
        colors: resolveColorsForAppearanceMode(savedTheme, resolvedMode),
      },
      false,
    )
    return
  }

  applyBootstrapThemeMode(mode)
  notifyThemeChange()
}

export function applyTheme(theme, saveToStorage = true) {
  if (!theme) {
    logWarn('[theme-manager] Тема не передана')
    return
  }

  const preference = readThemePreference()
  const baseTheme = theme.base_theme || theme.baseTheme || resolveThemeMode(preference)
  const colors = theme.colors || {}
  const bootstrapColors = theme.bootstrap_colors || theme.bootstrapColors || {}

  document.documentElement.setAttribute('data-bs-theme', baseTheme)

  const cssRules = buildThemeCss({
    baseTheme,
    colors,
    bootstrapColors,
  })
  setCspStyleSheet(CUSTOM_THEME_STYLE_ID, cssRules)

  if (saveToStorage) {
    saveThemeToLocalStorage(theme)
  }

  notifyThemeChange()
}

export function previewTheme(theme) {
  applyTheme(theme, false)
}

export function getCurrentThemeMode() {
  return resolveThemeMode(readThemePreference())
}

/**
 * Сброс превью редактора к SCSS-дефолтам (не трогает global activeTheme).
 */
export function resetPreviewToDefaults(baseTheme = 'light') {
  clearCspStyleSheet(CUSTOM_THEME_STYLE_ID)
  document.documentElement.setAttribute('data-bs-theme', baseTheme)
  return {
    base_theme: baseTheme,
    colors: getDefaultColors(baseTheme),
    bootstrap_colors: {},
  }
}

export function resetToInitialTheme(baseTheme = null) {
  const mode = baseTheme || getCurrentThemeMode()
  clearCspStyleSheet(CUSTOM_THEME_STYLE_ID)
  document.documentElement.setAttribute('data-bs-theme', mode)
  localStorage.removeItem(ACTIVE_THEME_STORAGE_KEY)
  applyThemeModePreference(readThemePreference())
  return {
    base_theme: mode,
    colors: getDefaultColors(mode),
    bootstrap_colors: {},
  }
}

export function resetTheme() {
  return resetToInitialTheme()
}

export function saveThemeToLocalStorage(theme) {
  try {
    localStorage.setItem(ACTIVE_THEME_STORAGE_KEY, JSON.stringify(theme))
  } catch (e) {
    logError('[theme-manager] Ошибка сохранения темы:', e)
  }
}

export function loadThemeFromLocalStorage() {
  try {
    const stored = localStorage.getItem(ACTIVE_THEME_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    logError('[theme-manager] Ошибка загрузки темы:', e)
  }
  return null
}

export function clearCachedActiveTheme() {
  localStorage.removeItem(ACTIVE_THEME_STORAGE_KEY)
}

/**
 * Кэш активной пары light+dark темы сайта (аналог кэша модульных тем).
 * Позволяет при смене режима подставить точный вариант вместо приближения.
 */
export function saveSiteThemePairToCache(pair) {
  try {
    if (pair) {
      localStorage.setItem(ACTIVE_SITE_PAIR_STORAGE_KEY, JSON.stringify(pair))
    } else {
      localStorage.removeItem(ACTIVE_SITE_PAIR_STORAGE_KEY)
    }
  } catch (e) {
    logError('[theme-manager] Ошибка сохранения пары темы сайта:', e)
  }
}

export function loadSiteThemePairFromCache() {
  try {
    const stored = localStorage.getItem(ACTIVE_SITE_PAIR_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    logError('[theme-manager] Ошибка загрузки пары темы сайта:', e)
  }
  return null
}

let systemThemeListenerAttached = false

function attachSystemThemeListener() {
  if (systemThemeListenerAttached) {
    return
  }
  systemThemeListenerAttached = true

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (readThemePreference() !== 'auto') {
      return
    }
    applyThemeModePreference('auto')
  })
}

const CROSS_TAB_THEME_KEYS = new Set([
  THEME_STORAGE_KEY,
  ACTIVE_THEME_STORAGE_KEY,
  ACTIVE_SITE_PAIR_STORAGE_KEY,
])

let crossTabListenerAttached = false

/**
 * Событие storage приходит только в другие вкладки, поэтому повторного применения
 * в исходной вкладке нет. Повторная запись того же значения `theme` событие не шлёт,
 * так что вкладки не перезаписывают ключ друг за другом.
 */
function attachCrossTabThemeListener() {
  if (crossTabListenerAttached || typeof window === 'undefined') {
    return
  }
  crossTabListenerAttached = true

  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage) {
      return
    }
    // key === null — localStorage.clear() в другой вкладке.
    if (event.key !== null && !CROSS_TAB_THEME_KEYS.has(event.key)) {
      return
    }
    applyThemeModePreference(readThemePreference())
  })
}

export function initTheme() {
  attachSystemThemeListener()
  attachCrossTabThemeListener()
  applyThemeModePreference(readThemePreference())
}

export function getColorDescriptions() {
  return COLOR_DESCRIPTIONS
}

export function getBootstrapByCategories() {
  return getBootstrapCategories()
}

export function getBootstrapColorDescriptions() {
  const descriptions = {}
  for (const category of Object.values(BOOTSTRAP_VARIABLES)) {
    for (const [key, config] of Object.entries(category.variables)) {
      descriptions[key] = {
        label: config.label,
        description: config.variable,
      }
    }
  }
  return descriptions
}
