/**
 * Ленивая загрузка иконок Lucide по одной (dist/esm/icons/*.mjs),
 * без import всего barrel @lucide/vue в критический путь.
 *
 * Канонический формат имени — Lucide PascalCase (`User`, `MessageSquareText`).
 * Модули и API передают строку; рендер — через LucideIcon / getLucideIconAsync.
 */

import { CORE_ICON_LOADERS } from '@/js/lucideCoreIcons.generated.js'

/**
 * Приводит произвольную строку к каноническому Lucide PascalCase.
 * Принимает: `User`, `user`, `user-round`, `UserIcon`, `lucide:Bell`.
 * Компоненты Vue и пустые значения → null.
 *
 * @param {unknown} name
 * @returns {string|null}
 */
export function normalizeLucideIconName(name) {
  if (typeof name !== 'string') {
    return null
  }
  let s = name.trim()
  if (!s) {
    return null
  }
  if (s.startsWith('lucide:')) {
    s = s.slice(7).trim()
  }
  if (!s) {
    return null
  }
  if (s.endsWith('Icon') && s.length > 4 && s[s.length - 5] !== '-') {
    const without = s.slice(0, -4)
    if (/^[A-Za-z]/.test(without)) {
      s = without
    }
  }
  if (s.includes('-') || s.includes('_')) {
    s = s
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('')
  } else if (s.charAt(0) === s.charAt(0).toLowerCase()) {
    s = s.charAt(0).toUpperCase() + s.slice(1)
  }
  return s || null
}

const iconComponentCache = new Map()
/** file (kebab) → component — общие алиасы Home/House */
const iconComponentByFile = new Map()
/** @type {Map<string, Promise<unknown>>} */
const iconLoadPromises = new Map()

/** @type {Promise<{ LUCIDE_ICON_FILES: Record<string, string>, LUCIDE_ICON_NAMES: string[] }>|null} */
let iconMapPromise = null

function loadIconMapModule() {
  if (!iconMapPromise) {
    iconMapPromise = import('@/js/lucideIconFiles.generated.js')
  }
  return iconMapPromise
}

/** @type {Promise<typeof import('./lucideIconGlob.js')>|null} */
let iconGlobPromise = null

function loadIconGlob() {
  if (!iconGlobPromise) {
    iconGlobPromise = import('./lucideIconGlob.js')
  }
  return iconGlobPromise
}

/**
 * @param {string} iconName PascalCase или нормализуемая строка (Home, Settings, …)
 * @returns {Promise<import('vue').Component|null>}
 */
async function loadIconComponent(iconName) {
  const key = normalizeLucideIconName(iconName)
  if (!key) {
    return null
  }
  if (iconComponentCache.has(key)) {
    return iconComponentCache.get(key)
  }
  if (iconLoadPromises.has(key)) {
    return iconLoadPromises.get(key)
  }

  const promise = (async () => {
    const coreLoader = CORE_ICON_LOADERS[key]
    let file = null
    let mod = null
    if (coreLoader) {
      mod = await coreLoader()
    } else {
      const { LUCIDE_ICON_FILES } = await loadIconMapModule()
      file = LUCIDE_ICON_FILES[key]
      if (!file) {
        return null
      }
      if (iconComponentByFile.has(file)) {
        const cached = iconComponentByFile.get(file)
        iconComponentCache.set(key, cached)
        return cached
      }
      const { loadIconModule } = await loadIconGlob()
      mod = await loadIconModule(file)
    }
    if (!mod) {
      return null
    }
    if (!file) {
      file = key
    }
    const component = mod.default || null
    if (component) {
      iconComponentByFile.set(file, component)
      iconComponentCache.set(key, component)
    }
    return component
  })()

  iconLoadPromises.set(key, promise)
  try {
    return await promise
  } finally {
    iconLoadPromises.delete(key)
  }
}

/** @deprecated больше не тянет весь barrel; no-op для совместимости IconManager */
export function preloadLucideIcons() {
  return Promise.resolve()
}

export async function getLucideIconAsync(iconName) {
  return loadIconComponent(iconName)
}

export function getLucideIconSync(iconName) {
  const key = normalizeLucideIconName(iconName)
  if (!key) {
    return null
  }
  return iconComponentCache.get(key) || null
}

export async function getLucideIconNames() {
  const { LUCIDE_ICON_NAMES } = await loadIconMapModule()
  return [...LUCIDE_ICON_NAMES]
}

export async function preloadLucideIconNames(iconNames) {
  if (!Array.isArray(iconNames) || iconNames.length === 0) {
    return
  }
  const unique = [
    ...new Set(
      iconNames
        .map((name) => normalizeLucideIconName(name))
        .filter(Boolean),
    ),
  ]
  await Promise.all(unique.map((name) => loadIconComponent(name)))
}

export function getLoadedLucideIconMapping() {
  return Object.fromEntries(iconComponentCache.entries())
}

export function clearLucideIconCache() {
  iconComponentCache.clear()
  iconComponentByFile.clear()
  iconLoadPromises.clear()
}
