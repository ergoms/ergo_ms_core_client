import { ref, watch, computed } from 'vue'
import { CORE_ICON } from '@/config/coreIconNames.js'
import {
  applyThemeModePreference,
  readThemePreference,
  THEME_CHANGE_EVENT,
} from '@/js/theme-manager.js'
import { syncUiPreferencesFromStorage } from '@/core/cms/js/uiPreferencesSettings.js'
import {
  applyLocale,
  getCurrentLocale,
  getDefaultLocale,
  getLanguageOptions,
  normalizeLocale,
  setAppLocale,
  tGlobal,
} from '@/i18n/index.js'
import { apiClient } from '@/js/api/manager.js'
import { cmsEndpoints as endpoints } from '@/core/cms/js/endpoints.js'
import { getAccess } from '@/core/cms/js/tokenStorage.js'
import { logError } from '@/js/utils/logError.js'

export const THEME_OPTIONS = computed(() => {
  getCurrentLocale()
  return [
    { id: 'light', name: tGlobal('settings.system.themeLight'), icon: CORE_ICON.themeLight },
    { id: 'dark', name: tGlobal('settings.system.themeDark'), icon: CORE_ICON.themeDark },
    { id: 'auto', name: tGlobal('settings.system.themeAuto'), icon: CORE_ICON.themeAuto },
  ]
})

export const LANGUAGE_OPTIONS = computed(() => {
  getCurrentLocale()
  return getLanguageOptions().map((opt) => ({
    ...opt,
    icon: CORE_ICON.language,
  }))
})

const LANGUAGE_BASE_KEY = 'language'
const DEFAULT_THEME = 'auto'

const theme = ref(readThemePreference() || DEFAULT_THEME)
const language = ref(
  normalizeLocale(localStorage.getItem(LANGUAGE_BASE_KEY) || getDefaultLocale()),
)

/** Не слать PATCH профиля при применении языка из профиля / storage. */
let skipLanguagePersist = false

watch(
  theme,
  (val) => {
    // Значение уже в localStorage — пришло из другой вкладки и там применено.
    if (val === readThemePreference()) {
      return
    }
    applyThemeModePreference(val)
  },
  { immediate: false },
)

if (typeof window !== 'undefined') {
  window.addEventListener(THEME_CHANGE_EVENT, () => {
    theme.value = readThemePreference()
  })
}

watch(language, (val) => {
  const normalized = normalizeLocale(val)
  if (normalized !== val) {
    language.value = normalized
    return
  }
  localStorage.setItem(LANGUAGE_BASE_KEY, normalized)
  void setAppLocale(normalized)
  if (!skipLanguagePersist) {
    void persistLanguageToProfile(normalized)
  }
})

async function persistLanguageToProfile(locale) {
  if (!getAccess()) {
    return
  }
  try {
    await apiClient.put(endpoints.auth.profile, { language: locale })
  } catch (error) {
    logError('Не удалось сохранить язык профиля:', error)
  }
}

/**
 * Применяет язык из профиля API без повторного PATCH.
 * @param {string} locale
 */
export function applyLanguageFromProfile(locale) {
  const normalized = normalizeLocale(locale)
  if (language.value === normalized) {
    void setAppLocale(normalized)
    return
  }
  skipLanguagePersist = true
  try {
    language.value = normalized
    localStorage.setItem(LANGUAGE_BASE_KEY, normalized)
    void setAppLocale(normalized)
  } finally {
    skipLanguagePersist = false
  }
}

/** Синхронизирует реактивное состояние с localStorage (без сброса в дефолты). */
export function syncUiSettingsFromStorage() {
  theme.value = readThemePreference() || DEFAULT_THEME
  const stored = normalizeLocale(localStorage.getItem(LANGUAGE_BASE_KEY) || getDefaultLocale())
  skipLanguagePersist = true
  try {
    language.value = stored
    void setAppLocale(stored)
  } finally {
    skipLanguagePersist = false
  }
  syncUiPreferencesFromStorage()
}

/**
 * При смене пользователя подтягивает сохранённые UI-настройки.
 * Предпочтения темы/языка не сбрасываются при logout или 401.
 */
export function initUserSettings(userId) {
  if (userId != null) return
  syncUiSettingsFromStorage()
}

/** Начальная синхронизация locale (каталоги подгружает ensureBootLocales в main). */
applyLocale(language.value)

export function useUiSettings() {
  return {
    theme,
    language,
    THEME_OPTIONS,
    LANGUAGE_OPTIONS,
  }
}
