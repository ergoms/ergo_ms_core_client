/**
 * Единый разбор тела ошибки DRF/axios для UI, toast и логов.
 */

import { tGlobal } from '@/i18n/index.js'

function defaultFallback() {
  return tGlobal('errors.api.tryLater')
}

function isHtmlBody(value) {
  return typeof value === 'string' && value.trim().startsWith('<')
}

/**
 * @param {unknown} data — error.response.data или plain object
 * @param {{ fallback?: string, mode?: 'first' | 'join' }} [options]
 * @returns {string}
 */
export function parseApiErrorData(data, options = {}) {
  const fallback = options.fallback ?? defaultFallback()
  const mode = options.mode ?? 'first'

  if (data == null) {
    return fallback
  }
  if (typeof data === 'string') {
    // Тело — HTML-страница сервера (debug-трейс, 500, страница прокси): пользователю она бесполезна.
    return isHtmlBody(data) ? fallback : data
  }
  if (typeof data !== 'object') {
    return String(data)
  }

  const directKeys = ['error', 'message', 'detail', 'non_field_errors']
  for (const key of directKeys) {
    const value = data[key]
    if (value == null) {
      continue
    }
    if (typeof value === 'string') {
      return value
    }
    if (Array.isArray(value) && value.length) {
      return String(value[0])
    }
  }

  const entries = Object.entries(data)
  if (!entries.length) {
    return fallback
  }

  if (mode === 'join') {
    return entries
      .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
      .map((item) => (item == null ? '' : String(item)))
      .filter(Boolean)
      .join(', ') || fallback
  }

  const [, firstValue] = entries[0]
  if (Array.isArray(firstValue) && firstValue.length) {
    return String(firstValue[0])
  }
  if (typeof firstValue === 'string') {
    return firstValue
  }

  return fallback
}

/**
 * Nginx подменяет обрыв upstream модуля на 502/503/504 и detail module_unavailable.
 * Это не ошибка страницы: apiClient уже пишет предупреждение.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isModuleUnavailableError(error) {
  const status = error?.response?.status
  if (status !== 502 && status !== 503 && status !== 504) {
    return false
  }
  const data = error?.response?.data
  const detail = typeof data === 'object' && data ? data.detail : data
  const headers = error?.response?.headers || {}
  return Boolean(
    headers['x-ergo-module-unavailable']
    || headers['X-Ergo-Module-Unavailable']
    || detail === 'module_unavailable'
  )
}

/**
 * @param {unknown} error — axios error или объект с response.data
 * @param {string} [fallback]
 * @returns {string}
 */
export function extractApiError(error, fallback) {
  const status = error?.response?.status
  if (status === 429) {
    return tGlobal('errors.api.tooManyRequests')
  }
  if (status === 413) {
    return tGlobal('errors.api.payloadTooLarge')
  }
  if (isModuleUnavailableError(error)) {
    return tGlobal('errors.api.moduleUnavailable')
  }
  const data = error?.response?.data
  if (typeof status === 'number' && status >= 500) {
    const detail = isHtmlBody(data) ? '' : parseApiErrorData(data, { fallback: '', mode: 'first' })
    return detail || fallback || tGlobal('errors.api.serverTryLater')
  }
  return parseApiErrorData(data ?? error, {
    fallback: fallback ?? defaultFallback(),
    mode: 'first',
  })
}
