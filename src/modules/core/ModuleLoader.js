/**
 * БАЗОВЫЙ КЛАСС ДЛЯ ЗАГРУЗКИ МОДУЛЕЙ
 * 
 * Предоставляет базовую функциональность для загрузки файлов
 * из core и внешних модулей с поддержкой кеширования
 * 
 * Vite требует статические паттерны для import.meta.glob,
 * поэтому загружаем все файлы заранее и фильтруем по необходимости
 * 
 * Карта страниц грузится одним динамическим импортом при первой инициализации,
 * а не вместе с оболочкой: иначе import.meta.glob всех .vue сидит в modulepreload.
 */

import { getDisabledModulesSync } from './disabledModules.js'

// Глобальный кеш для результатов loadAllModulesAsync
const asyncModulesCache = new Map()

// ============================================================================
// Глобы заполняет ensureSharedGlobs() при первой инициализации маршрутов.
// ============================================================================
const sharedGlobs = {
  coreRoutes: {},
  coreEndpoints: {},
  corePermissionRules: {},
  corePermissionSections: {},
  coreRouteGuards: {},
  coreIntegrations: {},
  coreComponents: {},
  modulesRoutes: {},
  modulesEndpoints: {},
  modulesPermissionRules: {},
  modulesPermissionSections: {},
  modulesRouteGuards: {},
  modulesIntegrations: {},
  modulesThemeDefaults: {},
  modulesLocales: {},
  modulesComponents: {},
}

let sharedGlobsPromise = null

export function ensureSharedGlobs() {
  if (!sharedGlobsPromise) {
    sharedGlobsPromise = import('./sharedGlobs.generated.js').then((generatedGlobs) => {
      sharedGlobs.coreRoutes = generatedGlobs.coreRoutes
      sharedGlobs.coreEndpoints = generatedGlobs.coreEndpoints
      sharedGlobs.corePermissionRules = generatedGlobs.corePermissionRules
      sharedGlobs.corePermissionSections = generatedGlobs.corePermissionSections
      sharedGlobs.coreRouteGuards = generatedGlobs.coreRouteGuards
      sharedGlobs.coreIntegrations = generatedGlobs.coreIntegrations
      sharedGlobs.coreComponents = generatedGlobs.coreComponents
      sharedGlobs.modulesRoutes = {
        ...generatedGlobs.modulesRoutes,
        ...generatedGlobs.modulesRoutesNested,
      }
      sharedGlobs.modulesEndpoints = generatedGlobs.modulesEndpoints
      sharedGlobs.modulesPermissionRules = generatedGlobs.modulesPermissionRules
      sharedGlobs.modulesPermissionSections = {
        ...generatedGlobs.modulesPermissionSections,
        ...generatedGlobs.modulesPermissionSectionsNested,
      }
      sharedGlobs.modulesRouteGuards = generatedGlobs.modulesRouteGuards
      sharedGlobs.modulesIntegrations = {
        ...generatedGlobs.modulesIntegrations,
        ...generatedGlobs.modulesIntegrationsNested,
      }
      sharedGlobs.modulesThemeDefaults = generatedGlobs.modulesThemeDefaults
      sharedGlobs.modulesLocales = generatedGlobs.modulesLocales
      sharedGlobs.modulesComponents = generatedGlobs.modulesComponents
      return sharedGlobs
    }).catch((error) => {
      sharedGlobsPromise = null
      throw error
    })
  }
  return sharedGlobsPromise
}

export class ModuleLoader {
  constructor() {
    this.cache = new Map()
    // Используем глобы, загруженные при импорте модуля (top-level)
    this.globs = sharedGlobs
  }

  /**
   * Получает глобы для конкретного типа файлов
   * @param {string} type - тип файлов (routes, endpoints, components)
   * @param {string} source - источник (core, modules, all)
   * @returns {Object}
   */
  getGlobsByType(type, source = 'all') {
    const typeMap = {
      'js/routes.js': ['coreRoutes', 'modulesRoutes'],
      'js/endpoints.js': ['coreEndpoints', 'modulesEndpoints'],
      'js/permission-rules.js': ['corePermissionRules', 'modulesPermissionRules'],
      'js/permission-sections.js': ['corePermissionSections', 'modulesPermissionSections'],
      'js/routeGuard.js': ['coreRouteGuards', 'modulesRouteGuards'],
      'js/integrations.js': ['coreIntegrations', 'modulesIntegrations'],
      'js/theme-defaults.js': ['modulesThemeDefaults'],
      'js/locales.js': ['modulesLocales'],
      'components': ['coreComponents', 'modulesComponents']
    }

    const keys = typeMap[type] || []
    let result = {}

    keys.forEach(key => {
      if (source === 'all' || 
          (source === 'core' && key.startsWith('core')) ||
          (source === 'modules' && key.startsWith('modules'))) {
        const globData = this.globs[key] || {}
        result = { ...result, ...globData }
      }
    })

    return this._filterDisabledModules(result)
  }

  /**
   * Фильтрует результаты glob, исключая отключённые модули
   * @param {Object} globResult - объект { path: module }
   * @returns {Object} - отфильтрованный объект
   */
  _filterDisabledModules(globResult) {
    const disabled = getDisabledModulesSync()
    if (!disabled?.size) return globResult

    const filtered = {}
    for (const [path, value] of Object.entries(globResult)) {
      const moduleName = this.extractModuleName(path, this.isExternalModule(path))
      if (moduleName && disabled.has(moduleName)) continue
      filtered[path] = value
    }
    return filtered
  }

  /**
   * Загружает файлы из core модулей
   * @param {string} pattern - паттерн для поиска файлов
   * @returns {Object} - объект с загруженными модулями
   */
  loadCoreModules(pattern) {
    return this.getGlobsByType(pattern, 'core')
  }

  /**
   * Загружает файлы из внешних модулей
   * @param {string} pattern - паттерн для поиска файлов
   * @returns {Object} - объект с загруженными модулями
   */
  loadExternalModules(pattern) {
    return this.getGlobsByType(pattern, 'modules')
  }

  /**
   * Загружает файлы из core и внешних модулей одновременно
   * @param {string} pattern - паттерн для поиска файлов
   * @returns {Object} - объединенный объект с загруженными модулями
   */
  loadAllModules(pattern) {
    return this.getGlobsByType(pattern, 'all')
  }

  /**
   * Асинхронная загрузка всех модулей с промисами
   * @param {string} pattern - паттерн для поиска файлов
   * @returns {Promise<Object>} - промис с загруженными модулями
   */
  async loadAllModulesAsync(pattern) {
    await ensureSharedGlobs()
    // Проверяем кеш для этого паттерна
    if (asyncModulesCache.has(pattern)) {
      return asyncModulesCache.get(pattern)
    }
    
    const modules = this.loadAllModules(pattern)
    const loaded = {}

    await Promise.all(
      Object.entries(modules).map(async ([path, loader]) => {
        if (typeof loader === 'function') {
          const module = await loader()
          loaded[path] = module?.default ?? module
        } else {
          loaded[path] = loader?.default ?? loader
        }
      })
    )
    
    // Кешируем результат
    asyncModulesCache.set(pattern, loaded)
    return loaded
  }

  /**
   * Извлекает имя модуля из пути
   * @param {string} path - путь к файлу модуля
   * @param {boolean} isExternal - является ли модуль внешним
   * @returns {string} - имя модуля
   */
  extractModuleName(path, isExternal = false) {
    if (isExternal) {
      // …/modules/<name>/client/js/… → <name>
      const match = path.match(/modules\/([^/]+)\/client/)
      return match ? match[1] : null
    } else {
      // …/core/<area>/… → <area>
      const match = path.match(/core\/([^/]+)/)
      return match ? match[1] : null
    }
  }

  /**
   * Определяет, является ли путь внешним модулем
   * @param {string} path - путь к файлу
   * @returns {boolean}
   */
  isExternalModule(path) {
    return path.includes('/modules/')
  }

  /**
   * Очищает весь кеш
   */
  clearCache() {
    this.cache.clear()
    asyncModulesCache.clear()
  }

  /**
   * Очищает кеш для конкретного паттерна
   * @param {string} pattern - паттерн для очистки
   */
  clearCacheByPattern(pattern) {
    const keysToDelete = []
    
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key))

    for (const key of asyncModulesCache.keys()) {
      if (key.includes(pattern)) {
        asyncModulesCache.delete(key)
      }
    }
  }
}

export default ModuleLoader

