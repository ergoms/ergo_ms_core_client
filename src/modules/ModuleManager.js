/**
 * ГЛАВНЫЙ МЕНЕДЖЕР МОДУЛЕЙ
 *
 * Оркестрирует работу всех менеджеров модулей:
 * - RouteManager - управление роутами
 * - EndpointManager - управление API эндпоинтами
 * - IconManager - управление иконками
 * - PermissionRulesManager - управление правилами проверки прав
 */

import { RouteManager } from './routes/RouteManager.js'
import { EndpointManager } from './api/EndpointManager.js'
import { IconManager } from './icons/IconManager.js'
import { RouteGenerator } from './routes/RouteGenerator.js'
import { PermissionRulesManager } from './permissions/PermissionRulesManager.js'
import { PermissionSectionsManager } from './permissions/PermissionSectionsManager.js'
import { RouteGuardsManager } from './routing/RouteGuardsManager.js'
import { IntegrationsManager } from './integrations/IntegrationsManager.js'
import { fetchDisabledModules } from './core/disabledModules.js'
import { registerClientModule } from './core/registerClientModule.js'
import { parseModuleRemotes } from './core/parseModuleRemotes.js'
import { ensureSharedGlobs } from './core/ModuleLoader.js'
import { clientEnv } from '@/js/clientEnv.js'
import { authRoutes, coreRoutes } from '@/config/routes.js'
import { getLocaleManager } from './i18n/LocaleManager.js'
import { getThemeDefaultsManager } from './themes/ThemeDefaultsManager.js'
import { logError } from '@/js/utils/logError.js'
import { routeMapCoversPath, routesCoverPath } from './routes/vueRoutePath.js'

function getConfiguredModuleRemotes() {
  return parseModuleRemotes(clientEnv.moduleRemotes || '')
}

async function loadFederatedModules() {
  const mod = await import('./core/federatedModules.js')
  return mod.loadFederatedModules()
}

function yieldToBundledNavigation() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve()
      return
    }
    const finish = () => resolve()
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.setTimeout(finish, 0)
      })
      return
    }
    window.setTimeout(finish, 0)
  })
}

export class ModuleManager {
  constructor() {
    this.routeManager = new RouteManager()
    this.endpointManager = new EndpointManager()
    this.iconManager = new IconManager()
    this.permissionRulesManager = new PermissionRulesManager()
    this.permissionSectionsManager = new PermissionSectionsManager()
    this.routeGuardsManager = new RouteGuardsManager()
    this.integrationsManager = new IntegrationsManager()
    this.routeGenerator = null
    /** @type {import('./core/clientModuleManifest.js').ClientModuleManifest[]} */
    this.registeredManifests = []

    this.initialized = false
    this.coreReady = false
    this._initPromise = null
    this._coreReadyPromise = null
    this._resolveCoreReady = null
    /** @type {Set<string>} */
    this._loadedRemoteKeys = new Set()
    this._retryRemotesPromise = null
  }

  /**
   * Инициализация всех менеджеров.
   * Совпадает с ensureInitialized: прямой вызов из меню/виджетов не должен
   * запускать вторую загрузку remotes, пока первая ещё не выставила initialized.
   */
  async initialize() {
    await this.ensureInitialized()
  }

  /**
   * @returns {Promise<void>}
   */
  _markCoreReady() {
    if (this.coreReady) {
      return
    }
    this.coreReady = true
    this._resolveCoreReady?.()
  }

  _startInitialize() {
    if (this._initPromise) {
      return
    }
    this._coreReadyPromise = new Promise((resolve) => {
      this._resolveCoreReady = resolve
    })
    this._initPromise = this._doInitialize().catch((error) => {
      this._initPromise = null
      if (!this.coreReady) {
        this._coreReadyPromise = null
        this._resolveCoreReady = null
      }
      throw error
    })
  }

  async _doInitialize() {
    await ensureSharedGlobs()
    await Promise.all([
      this.routeManager.initialize(),
      this.endpointManager.initialize(),
      this.permissionRulesManager.initialize(),
      this.routeGuardsManager.initialize(),
      this.integrationsManager.initialize(),
    ])

    this.routeGenerator = new RouteGenerator(this.routeManager)
    this._markCoreReady()

    // На bundled-странице remotes ждут кадр, чтобы не забить HTTP/1.1.
    // Глубокая ссылка на remote — наоборот, грузим сразу, иначе первый
    // переход попадает в NotFound до addRoute.
    if (this._shouldYieldForBundledLanding()) {
      await yieldToBundledNavigation()
    }

    if (clientEnv.modularity === 'federated' || getConfiguredModuleRemotes().length) {
      await this._registerFederatedManifests(await loadFederatedModules())
    }

    this.initialized = true
  }

  /**
   * Оболочка и вход уже есть в bundled-таблице — remotes можно подождать кадр.
   * Иначе это глубокая ссылка: yield только откладывает маршруты remote.
   */
  _shouldYieldForBundledLanding() {
    if (typeof window === 'undefined') {
      return true
    }
    if (clientEnv.modularity !== 'federated' && !getConfiguredModuleRemotes().length) {
      return true
    }
    const pathname = window.location.pathname || '/'
    if (routesCoverPath([...coreRoutes, ...authRoutes], pathname)) {
      return true
    }
    return routeMapCoversPath(this.routeManager.getAllRoutes(), pathname)
  }

  /**
   * @param {import('./core/clientModuleManifest.js').ClientModuleManifest[]} remotes
   */
  async _registerFederatedManifests(remotes) {
    for (const manifest of remotes) {
      if (!manifest?.moduleKey || this._loadedRemoteKeys.has(manifest.moduleKey)) {
        continue
      }
      try {
        await this.registerModule(manifest, `remote:${manifest.moduleKey}`)
        this._loadedRemoteKeys.add(manifest.moduleKey)
      } catch (error) {
        logError(
          `[federated] Не удалось зарегистрировать remote ${manifest.moduleKey}`,
          error,
        )
      }
    }
  }

  /**
   * Повторно тянет remotes, которые не зарегистрировались (502, сеть).
   * Уже загруженные не дублирует.
   */
  async retryMissingRemotes() {
    const configured = getConfiguredModuleRemotes()
    if (!configured.length) {
      return
    }
    const missing = configured.some((item) => !this._loadedRemoteKeys.has(item.name))
    if (!missing) {
      return
    }
    if (this._retryRemotesPromise) {
      await this._retryRemotesPromise
      return
    }
    this._retryRemotesPromise = this._registerFederatedManifests(await loadFederatedModules())
      .catch((error) => {
        logError('[federated] Повторная загрузка remotes не удалась', error)
      })
      .finally(() => {
        this._retryRemotesPromise = null
      })
    await this._retryRemotesPromise
  }

  /**
   * Регистрирует клиентский манифест модуля (federated / standalone / ручной).
   * @param {object} manifest
   * @param {string} [sourcePath]
   */
  async registerModule(manifest, sourcePath = 'manifest') {
    const registered = await registerClientModule(manifest, {
      routeManager: this.routeManager,
      endpointManager: this.endpointManager,
      permissionRulesManager: this.permissionRulesManager,
      permissionSectionsManager: this.permissionSectionsManager,
      routeGuardsManager: this.routeGuardsManager,
      integrationsManager: this.integrationsManager,
      localeManager: getLocaleManager(),
      themeDefaultsManager: getThemeDefaultsManager(),
    }, sourcePath)
    if (registered) {
      this.registeredManifests.push(registered)
      try {
        await getLocaleManager().mergeModuleLocales()
      } catch {
        /* locales optional at early boot */
      }
      // Proxy endpoints кэширует снимок до remotes — обновить без циклического import.
      try {
        const { syncEndpointsCache } = await import('@/js/api/endpoints.js')
        syncEndpointsCache()
      } catch {
        /* boot до загрузки endpoints.js */
      }
    }
    return registered
  }

  /**
   * Получает все роуты для Vue Router
   * @param {Array} coreRoutes - базовые роуты системы
   * @returns {Array}
   */
  async generateAllRoutes(coreRoutes = []) {
    await this.ensureCoreReady()
    return this.routeGenerator.generateAllRoutes(coreRoutes)
  }

  /**
   * Получает все эндпоинты
   * @returns {Object}
   */
  async getEndpoints() {
    await this.ensureCoreReady()
    return this.endpointManager.getAllEndpoints()
  }

  /**
   * Получает все правила проверки прав
   * @returns {Array}
   */
  async getPermissionRules() {
    await this.ensureCoreReady()
    return this.permissionRulesManager.getAllRules()
  }

  /**
   * Получает все route guards модулей и ядра (в алфавитном порядке по модулю)
   * @returns {Function[]}
   */
  async getRouteGuards() {
    await this.ensureCoreReady()
    return this.routeGuardsManager.getAllGuards()
  }

  /**
   * Получает все секции прав модулей
   * @returns {Array}
   */
  async getPermissionSections() {
    await this.ensureInitialized()
    await this.ensurePermissionSectionsInitialized()
    return this.permissionSectionsManager.getAllSections()
  }

  /**
   * Формирует начальное состояние прав из всех секций
   * @param {Array} [sections] - секции (по умолчанию все обнаруженные)
   * @returns {Object}
   */
  async buildInitialPermissionState(sections) {
    await this.ensureInitialized()
    await this.ensurePermissionSectionsInitialized()
    return this.permissionSectionsManager.buildInitialPermissionState(sections)
  }

  /**
   * Получает иконку по имени
   * @param {string} iconName - имя иконки
   * @returns {Object|null}
   */
  getIcon(iconName) {
    return this.iconManager.getIcon(iconName)
  }

  /**
   * Получает конфигурацию роута по имени
   * @param {string} routeName - имя роута
   * @returns {Object|null}
   */
  async getRouteConfig(routeName) {
    await this.ensureInitialized()
    return this.routeManager.getRouteConfig(routeName)
  }

  /**
   * Получает эндпоинт по имени
   * @param {string} endpointName - имя эндпоинта
   * @returns {string|null}
   */
  async getEndpoint(endpointName) {
    await this.ensureInitialized()
    return this.endpointManager.getEndpoint(endpointName)
  }

  /**
   * Валидирует всю конфигурацию модулей
   * @returns {Object}
   */
  async validateAll() {
    await this.ensureInitialized()

    const routeValidation = this.routeManager.validateAllRoutes()
    const endpointValidation = this.endpointManager.validateEndpoints()
    const permissionRulesValidation = this.permissionRulesManager.validateAllRules()

    return {
      isValid: routeValidation.isValid && endpointValidation.isValid && permissionRulesValidation.isValid,
      routes: routeValidation,
      endpoints: endpointValidation,
      permissionRules: permissionRulesValidation
    }
  }

  /**
   * Получает статистику по всем модулям
   * @returns {Object}
   */
  async getStatistics() {
    await this.ensureInitialized()

    return {
      routes: this.routeManager.getStatistics(),
      endpoints: this.endpointManager.getStatistics(),
      icons: this.iconManager.getStatistics(),
      permissionRules: this.permissionRulesManager.getStatistics(),
      permissionSections: this.permissionSectionsManager.getStatistics(),
      routeGuards: this.routeGuardsManager.getStatistics(),
      integrations: this.integrationsManager.getStatistics(),
      manifests: this.registeredManifests.length,
    }
  }

  /**
   * Очищает весь кеш
   */
  clearCache() {
    this.routeManager.clearCache()
    this.endpointManager.clearCache()
    this.permissionRulesManager.clearCache()
    this.permissionSectionsManager.clearCache()
    this.routeGuardsManager.clearCache()
    this.integrationsManager.clearCache()
    this.registeredManifests = []
    this.initialized = false
    this.coreReady = false
    this._initPromise = null
    this._coreReadyPromise = null
    this._resolveCoreReady = null
    this._loadedRemoteKeys = new Set()
    this._retryRemotesPromise = null
  }

  /**
   * Ядровые менеджеры готовы. Remotes могут ещё грузиться — сессия уже может идти.
   */
  async ensureCoreReady() {
    if (this.coreReady) {
      return
    }
    this._startInitialize()
    await this._coreReadyPromise
  }

  /**
   * Обеспечивает инициализацию
   */
  async ensureInitialized() {
    if (this.initialized) {
      return
    }
    this._startInitialize()
    await this._initPromise
  }

  async ensurePermissionSectionsInitialized() {
    if (!this.permissionSectionsManager.initialized) {
      await this.permissionSectionsManager.initialize()
    }
  }

  /**
   * Подгружает список disabled-модулей с API (silent, не блокирует запуск при ошибке).
   * Вызывать после успешной аутентификации для синхронизации с сервером.
   * @param {Object} apiClient - инстанс axios/api manager
   */
  async refreshDisabledModules(apiClient) {
    try {
      if (apiClient) {
        await fetchDisabledModules(apiClient)
      }
    } catch {
      // Если API недоступен — используется DISABLED_MODULES из .env
    }
  }

  get routes() {
    return this.routeManager
  }

  get endpoints() {
    return this.endpointManager
  }

  get icons() {
    return this.iconManager
  }

  get permissionRules() {
    return this.permissionRulesManager
  }

  get permissionSections() {
    return this.permissionSectionsManager
  }

  get routeGuards() {
    return this.routeGuardsManager
  }

  get integrations() {
    return this.integrationsManager
  }
}

export default ModuleManager
