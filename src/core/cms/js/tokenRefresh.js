import axios from 'axios'

import { resolveApiClientBaseUrl } from '@/js/api/baseUrl.js'
import {
  clearSessionHintCookie,
  getAccess,
  hasSessionHintCookie,
  isExpired,
  setTokens,
} from '@/core/cms/js/tokenStorage.js'
import {
  isRateLimitResponse,
  parseRetryAfterSeconds,
  showRateLimitNotice,
} from '@/composables/rateLimitNoticeState.js'
import { logWarn } from '@/js/utils/logError.js'

const AUTH_REFRESH_PATH = 'cms/adp/token-refresh/'
const AUTH_LOGOUT_PATH = 'cms/adp/logout/'
/** sessionStorage + localStorage: F5, новая вкладка, не новый браузерный профиль. */
const LOGOUT_GATE_STORAGE_KEY = 'ergo_server_logout_finalized'
/** Общий гейт на window: переживает дубликат модуля в бандле. */
const LOGOUT_GATE_GLOBAL = '__ERGO_MS_LOGOUT_GATE__'

/** Без интерцепторов apiClient: 401/429 на /logout/ не должны снова звать logout. */
const authBareClient = axios.create({
  withCredentials: true,
  timeout: 8000,
})

/** Отказ auth: сессии больше нет. */
const EXPECTED_REFRESH_FAILURE = new Set([400, 401])
/** Временный отказ: сессию не трогаем (лимит / бэкенд мигнул). */
const TRANSIENT_REFRESH_STATUSES = new Set([429, 502, 503, 504])

let refreshInProgress = null
let sessionRestorePromise = null
/** @type {boolean | null} null — ещё не проверяли, false — сессии нет, true — есть */
let sessionRestoreResolved = null
/**
 * После первого logout до явного login:
 * — не слать повторные POST /logout/
 * — не делать token-refresh (иначе refresh↔logout гонка и шторм запросов)
 */
let serverLogoutPromise = null
let logoutFinalized = false
/** Payload session-bootstrap из успешного token-refresh (один RTT на F5). */
let pendingSessionBootstrap = null
/** Последний refresh упал из‑за 429/5xx — нельзя считать сессию мёртвой. */
let lastRefreshWasTransient = false
/** Не спамить повторными refresh, пока действует Retry-After. */
let refreshBackoffUntil = 0

function storageGetGate(store) {
  try {
    return store.getItem(LOGOUT_GATE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function storageSetGate(store, finalized) {
  try {
    if (finalized) {
      store.setItem(LOGOUT_GATE_STORAGE_KEY, '1')
    } else {
      store.removeItem(LOGOUT_GATE_STORAGE_KEY)
    }
  } catch {
    // private mode / quota
  }
}

function readPersistedLogoutGate() {
  try {
    if (typeof sessionStorage !== 'undefined' && storageGetGate(sessionStorage)) {
      return true
    }
  } catch {
    /* нет sessionStorage */
  }
  try {
    if (typeof localStorage !== 'undefined' && storageGetGate(localStorage)) {
      return true
    }
  } catch {
    /* нет localStorage */
  }
  return false
}

function persistLogoutGate(finalized) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      storageSetGate(sessionStorage, finalized)
    }
  } catch {
    /* нет sessionStorage */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      storageSetGate(localStorage, finalized)
    }
  } catch {
    /* нет localStorage */
  }
}

function getSharedLogoutGate() {
  if (typeof window === 'undefined') {
    return null
  }
  const existing = window[LOGOUT_GATE_GLOBAL]
  if (existing && typeof existing === 'object') {
    return existing
  }
  const created = { promise: null }
  window[LOGOUT_GATE_GLOBAL] = created
  return created
}

export function isLogoutApiUrl(url) {
  return String(url || '').includes(AUTH_LOGOUT_PATH)
}

// F5 после logout: не повторять POST /logout/ и не оживлять refresh по cookie-подсказке.
{
  const sharedAtBoot = getSharedLogoutGate()
  if (sharedAtBoot?.promise) {
    logoutFinalized = true
    serverLogoutPromise = sharedAtBoot.promise
    sessionRestoreResolved = false
  } else if (readPersistedLogoutGate()) {
    logoutFinalized = true
    serverLogoutPromise = Promise.resolve()
    sessionRestoreResolved = false
    if (sharedAtBoot) {
      sharedAtBoot.promise = serverLogoutPromise
    }
  }
}

function closeLogoutGateFromOtherTab() {
  logoutFinalized = true
  if (!serverLogoutPromise) {
    serverLogoutPromise = Promise.resolve()
  }
  sessionRestoreResolved = false
  const shared = getSharedLogoutGate()
  if (shared) {
    shared.promise = serverLogoutPromise
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== LOGOUT_GATE_STORAGE_KEY) {
      return
    }
    // Только закрывать: сброс в другой вкладке (login) не открывает POST в этой.
    if (event.newValue === '1') {
      closeLogoutGateFromOtherTab()
    }
  })
}

/**
 * Забирает bootstrap из последнего token-refresh (если был). Повторный вызов — null.
 * @returns {object | null}
 */
export function takePendingSessionBootstrap() {
  const data = pendingSessionBootstrap
  pendingSessionBootstrap = null
  return data
}

export function storePendingSessionBootstrap(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    pendingSessionBootstrap = payload
  }
}

export function canAttemptTokenRefresh() {
  if (logoutFinalized || serverLogoutPromise) {
    return false
  }
  return hasSessionHintCookie()
}

/** Refresh временно недоступен (429/5xx) — сессия на сервере может быть жива. */
export function wasLastRefreshTransient() {
  return lastRefreshWasTransient
}

/** Сброс backoff перед кнопкой «Повторить» на оверлее 429. */
export function clearRefreshBackoff() {
  refreshBackoffUntil = 0
  lastRefreshWasTransient = false
  // Разрешить повторный restore после временного отказа.
  if (sessionRestoreResolved === false && hasSessionHintCookie() && !logoutFinalized) {
    sessionRestoreResolved = null
  }
}

/**
 * Повтор после оверлея 429: снять backoff и восстановить access.
 * @returns {Promise<'ok'|'rate_limited'|'gone'>}
 */
export async function retrySessionAfterRateLimit() {
  clearRefreshBackoff()

  const access = getAccess()
  if (access && !isExpired(access)) {
    markSessionRestoreResult(true)
    return 'ok'
  }

  if (!canAttemptTokenRefresh()) {
    return 'gone'
  }

  const newAccess = await performTokenRefresh()
  if (newAccess) {
    return 'ok'
  }
  if (lastRefreshWasTransient || canAttemptTokenRefresh()) {
    return 'rate_limited'
  }
  return 'gone'
}

export function invalidateSessionRestoreCache() {
  sessionRestoreResolved = false
  sessionRestorePromise = null
  pendingSessionBootstrap = null
  lastRefreshWasTransient = false
  refreshBackoffUntil = 0
  clearSessionHintCookie()
}

function markSessionRestoreResult(hasSession) {
  sessionRestoreResolved = hasSession
  if (!hasSession) {
    clearSessionHintCookie()
  }
}

function noteTransientRefreshFailure(errorOrResponse) {
  lastRefreshWasTransient = true
  const retryAfter = parseRetryAfterSeconds(errorOrResponse)
  const waitMs = Math.max(retryAfter, 1) * 1000
  refreshBackoffUntil = Math.max(refreshBackoffUntil, Date.now() + waitMs)
  // token-refresh в SILENT_URL_PARTS — оверлей зовём явно, иначе F5 под лимитом
  // выглядит как «тихий» разлогин без объяснения.
  if (isRateLimitResponse(errorOrResponse)) {
    showRateLimitNotice(retryAfter)
  }
}

/**
 * Однократная попытка восстановить сессию (main.js + startRoute guard).
 * Без подсказки о refresh не обращается к API — нет лишних 400 в консоли.
 * 429/5xx не помечают сессию мёртвой и не снимают session-hint cookie.
 */
export async function restoreSession() {
  if (logoutFinalized) {
    return false
  }

  const access = getAccess()
  if (access && !isExpired(access)) {
    markSessionRestoreResult(true)
    return true
  }

  if (sessionRestoreResolved === false) {
    return false
  }

  if (!canAttemptTokenRefresh()) {
    markSessionRestoreResult(false)
    return false
  }

  if (!sessionRestorePromise) {
    sessionRestorePromise = (async () => {
      const newAccess = await performTokenRefresh()
      if (newAccess) {
        markSessionRestoreResult(true)
        return true
      }
      // Временный отказ — кэш «сессии нет» не ставим, hint cookie оставляем.
      if (lastRefreshWasTransient || canAttemptTokenRefresh()) {
        return false
      }
      markSessionRestoreResult(false)
      return false
    })().finally(() => {
      sessionRestorePromise = null
    })
  }

  return sessionRestorePromise
}

/**
 * Живой access из памяти или тихий refresh при открытом гейте.
 * Не использует restoreSession: его кэш sessionRestoreResolved=false блокирует повторы.
 * @returns {Promise<string|null>}
 */
export async function ensureAccessToken() {
  const access = getAccess()
  if (access && !isExpired(access)) {
    return access
  }
  if (!canAttemptTokenRefresh()) {
    return null
  }
  return performTokenRefresh()
}

/**
 * Обновляет access-токен через SimpleJWT без apiClient (разрыв цикла tokenService ↔ manager).
 * @returns {Promise<string|null>} access или null при отсутствии/истечении сессии (без throw)
 */
export async function performTokenRefresh() {
  if (logoutFinalized || serverLogoutPromise) {
    return null
  }

  if (refreshInProgress) {
    return refreshInProgress
  }

  if (!canAttemptTokenRefresh()) {
    return null
  }

  if (Date.now() < refreshBackoffUntil) {
    lastRefreshWasTransient = true
    return null
  }

  refreshInProgress = (async () => {
    const accessAtStart = getAccess()
    try {
      const response = await authBareClient.post(
        `${resolveApiClientBaseUrl()}${AUTH_REFRESH_PATH}`,
        {},
        {
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) =>
            status === 200
            || EXPECTED_REFRESH_FAILURE.has(status)
            || TRANSIENT_REFRESH_STATUSES.has(status),
        },
      )

      if (logoutFinalized || serverLogoutPromise) {
        return null
      }

      if (TRANSIENT_REFRESH_STATUSES.has(response.status)) {
        noteTransientRefreshFailure(response)
        logWarn('[tokenRefresh] временный отказ refresh', {
          status: response.status,
        })
        return null
      }

      if (response.status !== 200) {
        const accessNow = getAccess()
        if (accessNow && accessNow !== accessAtStart && !isExpired(accessNow)) {
          lastRefreshWasTransient = false
          markSessionRestoreResult(true)
          return accessNow
        }
        lastRefreshWasTransient = false
        markSessionRestoreResult(false)
        return null
      }

      const newAccess = response.data?.access ?? response.data?.data?.access
      if (!newAccess) {
        lastRefreshWasTransient = false
        markSessionRestoreResult(false)
        return null
      }

      const bootstrap =
        response.data?.session_bootstrap ?? response.data?.data?.session_bootstrap
      storePendingSessionBootstrap(bootstrap)

      lastRefreshWasTransient = false
      refreshBackoffUntil = 0
      setTokens(newAccess)
      markSessionRestoreResult(true)
      return newAccess
    } catch (error) {
      // Сеть/таймаут — не снимаем session-hint и не закрываем гейт.
      lastRefreshWasTransient = true
      const retryAfter = parseRetryAfterSeconds(error)
      if (retryAfter > 0 || error?.response?.status === 429) {
        noteTransientRefreshFailure(error)
      } else {
        refreshBackoffUntil = Math.max(refreshBackoffUntil, Date.now() + 2000)
      }
      logWarn('[tokenRefresh] unexpected refresh failure', error)
      return null
    } finally {
      refreshInProgress = null
    }
  })()

  return refreshInProgress
}

/** Сброс только после успешного login — не из token-refresh. */
export function resetServerLogoutGate() {
  serverLogoutPromise = null
  logoutFinalized = false
  persistLogoutGate(false)
  const shared = getSharedLogoutGate()
  if (shared) {
    shared.promise = null
  }
}

export function isServerLogoutFinalized() {
  return logoutFinalized || readPersistedLogoutGate()
}

/**
 * Один POST /logout/ на волну истечения сессии до следующего login.
 * Гейт ставится синхронно до любого await — параллельные 401 не открывают второй POST.
 * @param {string} [reason] — кто закрыл гейт (для client-browser.log)
 */
export function performServerLogout(reason = 'unspecified') {
  const shared = getSharedLogoutGate()
  if (shared?.promise) {
    logoutFinalized = true
    serverLogoutPromise = shared.promise
    return shared.promise
  }
  if (serverLogoutPromise) {
    if (shared) {
      shared.promise = serverLogoutPromise
    }
    return serverLogoutPromise
  }
  if (logoutFinalized || readPersistedLogoutGate()) {
    const done = Promise.resolve()
    logoutFinalized = true
    serverLogoutPromise = done
    if (shared) {
      shared.promise = done
    }
    return done
  }

  logoutFinalized = true
  persistLogoutGate(true)

  const headers = {}
  const access = getAccess()
  if (access && !isExpired(access)) {
    headers.Authorization = `Bearer ${access}`
  }

  let settle = () => {}
  const pending = new Promise((resolve) => {
    settle = resolve
  })
  serverLogoutPromise = pending
  if (shared) {
    shared.promise = pending
  }

  void (async () => {
    try {
      logWarn('[tokenRefresh] refresh-гейт закрыт', { reason })
      invalidateSessionRestoreCache()
      await authBareClient.post(
        `${resolveApiClientBaseUrl()}${AUTH_LOGOUT_PATH}`,
        {},
        {
          headers,
          validateStatus: (status) =>
            (status >= 200 && status < 300) || status === 401 || status === 429,
        },
      )
    } catch {
      // ignore — локальная очистка всё равно выполняется вызывающим кодом
    } finally {
      settle()
    }
  })()

  return pending
}
