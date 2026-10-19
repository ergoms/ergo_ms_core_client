import axios from 'axios'

import { loadCollector } from '@/core/client_monitor/loadCollector.js'
import tokenService from '@/core/cms/js/tokenService'
import { clientEnv } from '@/js/clientEnv.js'
import {
  canAttemptTokenRefresh,
  ensureAccessToken,
  isLogoutApiUrl,
  isServerLogoutFinalized,
  performServerLogout,
  wasLastRefreshTransient,
} from '@/core/cms/js/tokenRefresh.js'
import { savePostLoginReturnPath } from '@/core/cms/js/postLoginReturn.js'
import { hasSessionHintCookie, isExpired } from '@/core/cms/js/tokenStorage.js'
import { applyMaintenanceFromResponse, isMaintenanceResponse } from '@/composables/useMaintenanceMode.js'
import {
  applyRateLimitFromResponse,
  isRateLimitActive,
  isRateLimitResponse,
  showRateLimitNotice,
} from '@/composables/useRateLimitNotice.js'
import { resolveApiBaseUrl } from '@/js/api/baseUrl.js'
import { extractApiError, isModuleUnavailableError } from '@/js/utils/apiErrorMessage.js'
import { axiosSameOriginMediaRequest } from '@/js/utils/mediaDownload.js'
import { logError, logWarn, sanitizeError } from '@/js/utils/logError.js'
import { getCurrentLocale } from '@/i18n/index.js'

function bearerAccess(headers) {
  const raw = headers?.Authorization || headers?.authorization || ''
  if (typeof raw !== 'string') {
    return ''
  }
  const prefix = 'Bearer '
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : ''
}

function setRequestAuthorization(config, token) {
  if (!config || !token) {
    return
  }
  const value = `Bearer ${token}`
  const headers = config.headers
  if (headers && typeof headers.set === 'function') {
    headers.set('Authorization', value)
    return
  }
  config.headers = { ...(headers || {}), Authorization: value }
}

const AXIOS_GET_CONFIG_KEYS = new Set([
  'params',
  'headers',
  'signal',
  'timeout',
  'responseType',
  'onUploadProgress',
  'onDownloadProgress',
  'cancelToken',
])

/**
 * apiClient.get(url, query) — второй аргумент уже query.
 * Частый вызов в стиле axios get(url, { params, responseType }) иначе уходит
 * как params[from]=… и сервер не видит from / organization_id.
 */
function splitAxiosStyleGetArgs(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params) || params instanceof FormData) {
    return { query: params, requestConfig: {} }
  }
  const keys = Object.keys(params)
  const nested = params.params
  const hasNestedQuery = nested != null && typeof nested === 'object' && !Array.isArray(nested)
  const extraKeys = keys.filter((key) => key !== 'params')
  const extrasAreAxios = extraKeys.every((key) => AXIOS_GET_CONFIG_KEYS.has(key))
  if (hasNestedQuery && extrasAreAxios) {
    const requestConfig = {}
    extraKeys.forEach((key) => {
      requestConfig[key] = params[key]
    })
    return { query: nested, requestConfig }
  }
  if (keys.length && keys.every((key) => AXIOS_GET_CONFIG_KEYS.has(key) && key !== 'params')) {
    return { query: {}, requestConfig: { ...params } }
  }
  return { query: params, requestConfig: {} }
}

async function messageFromDownloadError(error) {
  const data = error?.response?.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text())
      const detail = parsed.detail || parsed.message
      if (typeof detail === 'string' && detail.trim()) {
        return detail
      }
    } catch {
      /* ответ не JSON */
    }
  }
  if (typeof data?.detail === 'string' && data.detail.trim()) {
    return data.detail
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message
  }
  return error?.message || 'Ошибка при скачивании файла'
}

/**
 * Класс для работы с API
 */
class ApiClient {
  constructor() {
    this.baseUrl = resolveApiBaseUrl()
    this.apiPath = 'api/'
    const fullBase = this.baseUrl ? `${this.baseUrl}${this.apiPath}` : `/${this.apiPath}`
    this.client = axios.create({
      baseURL: fullBase,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this._setupInterceptors()

    // Сессионный мониторинг API — только если включён, не в стартовом чанке.
    if (clientEnv.monitoringEnabled) {
      void loadCollector().then(({ installAxiosMonitor }) => {
        installAxiosMonitor(this.client)
      })
    }
  }


  /**
   * Настройка интерцепторов axios
   */
  _setupInterceptors() {
    // Интерцептор запросов: тихий refresh перед отправкой
    this.client.interceptors.request.use(async (config) => {
      const mediaReq = axiosSameOriginMediaRequest(config.url)
      if (mediaReq) {
        config.url = mediaReq.url
        config.baseURL = mediaReq.baseURL
      }
      if (config._needToken && !tokenService.getAccess()) {
        const access = await ensureAccessToken()
        if (access) {
          setRequestAuthorization(config, access)
        } else if (!canAttemptTokenRefresh() && hasSessionHintCookie()) {
          logWarn('[apiClient] защищённый запрос без токена: refresh-гейт закрыт', {
            url: config.url,
          })
        }
      } else if (tokenService.shouldRefresh()) {
        const access = await tokenService.tryRefresh()
        if (access) {
          // Токен мог уже истечь к моменту _addAuthToken — подставляем свежий
          // в текущий запрос, иначе уйдёт просроченный Bearer.
          setRequestAuthorization(config, access)
        }
      }
      if (config._needToken) {
        setRequestAuthorization(config, tokenService.getAccess())
      }
      const headers = config.headers || {}
      headers['Accept-Language'] = getCurrentLocale()
      config.headers = headers
      return config
    })

    // Интерцептор ответов: одноразовый silent refresh при 401 и повтор
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config
        if (applyMaintenanceFromResponse(error)) {
          return Promise.reject(error)
        }
        if (applyRateLimitFromResponse(error)) {
          return Promise.reject(error)
        }

        const requestUrl = String(originalRequest?.url || '')
        // Ingest логов/монитора: 401 гостя не должен рвать сессию и уводить со страницы
        // (forgot-password: send-code 500 → logError → client-log 401 → ложный logout).
        // POST /logout/ сам по себе не должен снова звать logout (иначе 401/429 → шторм).
        if (
          requestUrl.includes('client-log')
          || requestUrl.includes('client-monitor')
          || isLogoutApiUrl(requestUrl)
        ) {
          return Promise.reject(error)
        }

        if (isServerLogoutFinalized()) {
          return Promise.reject(error)
        }

        if (error.response?.status === 401 && !originalRequest?._retry) {
          const headers = originalRequest?.headers || {}
          const hadAuthHeader = Boolean(headers.Authorization || headers.authorization)

          // Защищённый запрос без Bearer: access пропал из памяти, сессия на сервере может жить.
          if (!hadAuthHeader && originalRequest?._needToken) {
            originalRequest._retry = true
            const access = await ensureAccessToken()
            if (access) {
              this._addAuthToken(originalRequest)
              return this.client(originalRequest)
            }
            // Во время backoff refresh не шумим на каждый параллельный 401.
            if (!wasLastRefreshTransient()) {
              logWarn('[apiClient] 401 без Bearer: не удалось восстановить access', {
                url: requestUrl,
              })
            }
            return Promise.reject(error)
          }

          // Гостевой 401 без Bearer — ожидаемо для публичных эндпоинтов
          if (!hadAuthHeader) {
            return Promise.reject(error)
          }

          const sentAccess = bearerAccess(headers)
          const currentAccess = tokenService.getAccess()
          // Вход в session-scope уже подменил access; старый Bearer в полёте не должен
          // запускать refresh по отозванному cookie и logout.
          if (
            currentAccess
            && sentAccess
            && currentAccess !== sentAccess
            && !isExpired(currentAccess)
          ) {
            originalRequest._retry = true
            this._addAuthToken(originalRequest)
            return this.client(originalRequest)
          }

          originalRequest._retry = true
          const access = await tokenService.tryRefresh()
          if (access) {
            this._addAuthToken(originalRequest)
            return this.client(originalRequest)
          }
          // Лимит / временный отказ refresh — оверлей 429, не страница логина.
          if (wasLastRefreshTransient() || isRateLimitActive()) {
            if (!isRateLimitActive() && wasLastRefreshTransient()) {
              showRateLimitNotice(0)
            }
            return Promise.reject(error)
          }
          savePostLoginReturnPath()
          void this.logout()
          if (typeof window !== 'undefined' && window.location) {
            const path = window.location.pathname || ''
            // /start — не маршрут (есть /start-page); уводил на NotFound(requiresAuth) → цикл logout
            if (
              !path.includes('/start-page') &&
              !path.includes('/login') &&
              !path.includes('/register') &&
              !path.includes('/forgot-password') &&
              !path.includes('/reset-password')
            ) {
              window.location.href = '/login'
            }
          }
        }
        return Promise.reject(error)
      }
    )
  }

  /**
   * Базовый метод для выполнения HTTP запросов
   */
  async _request(method, endpoint, dataOrParams = {}, needToken = true, requestConfig = {}, options = {}) {
    try {
      const config = { ...requestConfig }
      if (needToken) {
        config._needToken = true
      }

      if (needToken) {
        this._addAuthToken(config)
      }

      // Обработка FormData
      if (dataOrParams instanceof FormData) {
        config.headers = {
          ...config.headers,
          'Content-Type': undefined
        }
      }

      let response
      switch (method.toUpperCase()) {
        case 'GET':
        case 'DELETE':
          config.params = dataOrParams
          response = await this.client[method.toLowerCase()](endpoint, config)
          break
        default: // POST, PUT, PATCH
          response = await this.client[method.toLowerCase()](endpoint, dataOrParams, config)
      }

      return this.handleResponse(response)
    } catch (error) {
      const status = error.response?.status
      if (options.quietStatuses?.includes(status)) {
        return {
          success: false,
          status,
          data: error.response?.data ?? null,
          message: error.response?.data?.detail
            || error.response?.data?.message
            || error.message,
        }
      }
      this.handleError(error)
      throw error
    }
  }

  // HTTP методы
  async get(endpoint, params = {}, needToken = true, options = {}) {
    const { query, requestConfig } = splitAxiosStyleGetArgs(params)
    return this._request('GET', endpoint, query, needToken, requestConfig, options)
  }

  async post(endpoint, data = {}, needToken = true) {
    return this._request('POST', endpoint, data, needToken)
  }

  async put(endpoint, data = {}, needToken = true) {
    return this._request('PUT', endpoint, data, needToken)
  }

  async patch(endpoint, data = {}, needToken = true) {
    return this._request('PATCH', endpoint, data, needToken)
  }

  async delete(endpoint, params = {}, needToken = true) {
    return this._request('DELETE', endpoint, params, needToken)
  }

  /**
   * Скачивание файлов (бинарные данные)
   */
  async downloadFile(endpoint, params = {}, method = 'GET', needToken = true, requestConfig = {}) {
    try {
      const config = {
        responseType: 'blob',
        ...requestConfig,
      }
      if (needToken) {
        config._needToken = true
      }

      if (needToken) {
        this._addAuthToken(config)
      }

      if (params instanceof FormData) {
        config.headers = {
          ...config.headers,
          'Content-Type': undefined,
        }
      }

      let response
      if (method.toUpperCase() === 'POST') {
        response = await this.client.post(endpoint, params, config)
      } else {
        config.params = params
        response = await this.client.get(endpoint, config)
      }

      if (response.data instanceof Blob) {
        return {
          success: true,
          data: response.data,
          message: 'Файл успешно загружен',
          status: response.status,
          headers: response.headers
        }
      } else {
        return {
          success: false,
          message: 'Получен некорректный формат файла',
          data: null
        }
      }
    } catch (error) {
      return {
        success: false,
        message: await messageFromDownloadError(error),
        data: null,
        status: error.response?.status
      }
    }
  }

  /**
   * Добавление токена авторизации в конфигурацию
   */
  _addAuthToken(config) {
    setRequestAuthorization(config, tokenService.getAccess())
    return config
  }

  /**
   * Выход из системы
   */
  async logout() {
    // Сначала гейт: иначе await import ниже снова пускает параллельные POST.
    const pending = performServerLogout('apiClient-401')
    tokenService.clear()
    try {
      const { useUserStore } = await import('@/core/cms/js/userStore.js')
      useUserStore().finalizeSession()
    } catch {
      /* pinia ещё не готов */
    }
    await pending
  }

  /**
   * Обработка успешных ответов
   */
  handleResponse(response) {
    if (response.status >= 200 && response.status < 300) {
      const data = response.data || {}

      // Для DELETE-запросов с кодом 204
      if (response.status === 204) {
        return {
          success: true,
          data: null,
          message: 'Успешно удалено',
          status: response.status
        }
      }

      // Если сервер вернул success: false, сохраняем это значение
      const success = data.success !== undefined ? data.success : true

      return {
        success,
        data: data.data || data,
        message: data.message,
        status: response.status
      }
    }

    return {
      success: false,
      errors: response.data,
      status: response.status
    }
  }

  /**
   * Обработка ошибок
   */
  handleError(error) {
    const requestUrl = String(error?.config?.url || '')
    if (requestUrl.includes('client-log') || requestUrl.includes('client-monitor')) {
      return {
        success: false,
        message: error.message,
        status: error.response?.status,
        errors: error.response?.data,
      }
    }


    const status = error.response?.status
    const hadAuthHeader = Boolean(error?.config?.headers?.Authorization)

    // Ожидаемый 503 режима технических works — оверлей уже показан, без шума в консоли.
    if (isMaintenanceResponse(error)) {
      const { message } = sanitizeError(error)
      return {
        success: false,
        message,
        status,
        errors: error.response?.data,
      }
    }

    if (isRateLimitResponse(error)) {
      const { message } = sanitizeError(error)
      return {
        success: false,
        message,
        status,
        errors: error.response?.data,
      }
    }

    const data = error.response?.data
    if (isModuleUnavailableError(error)) {
      const message = extractApiError(error)
      logWarn('[apiClient] module unavailable', { url: requestUrl, status })
      return {
        success: false,
        message,
        status,
        errors: data,
      }
    }

    // Гость без Bearer — ожидаемый 401, интерцептор уже обработал сессию.
    if (status === 401 && !hadAuthHeader) {
      const { message } = sanitizeError(error)
      return {
        success: false,
        message,
        status,
        errors: error.response?.data,
      }
    }

    const { message } = sanitizeError(error)

    logError('API Error', error)

    return {
      success: false,
      message,
      status,
      errors: error.response?.data
    }
  }

  /**
   * Получить базовый URL
   */
  getBaseUrl() {
    return this.baseUrl
  }

  /**
   * Получить токен авторизации
   */
  getAuthToken() {
    return tokenService.getAccess()
  }
}

// Экспорт синглтона
export const apiClient = new ApiClient()
