/**
 * Runtime-загрузка federated remotes из CLIENT_MODULE_REMOTES.
 *
 * remoteEntry.js должен экспортировать манифест (default или named `manifest`)
 * либо выставить globalThis.__ERGO_MODULE_REMOTES__[name].
 */

import { clientEnv } from '@/js/clientEnv.js'
import { parseModuleRemotes } from './parseModuleRemotes.js'
import { normalizeClientModuleManifest } from './clientModuleManifest.js'
import { logWarn, logError } from '@/js/utils/logError.js'
import bridge from '@/integrations/ModuleBridge.js'

function remoteBaseUrl(entryUrl) {
  return String(entryUrl || '').replace(/\/[^/]+$/, '')
}

function addStylesheet(href, datasetId) {
  if (document.querySelector(`link[data-ergo-remote-style="${datasetId}"]`)) {
    return
  }
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.ergoRemoteStyle = datasetId
  document.head.appendChild(link)
}

const injectedRemoteStyles = new Set()

/**
 * CSS remote-сборки не попадает в JS (lib + cssCodeSplit). Подключаем файлы с того же /remotes/.
 * На старте не зовём: семь копий хостового UI (~740 КБ) иначе качаются на каждой странице.
 * @param {string} entryUrl
 * @param {string} remoteName
 */
async function injectRemoteStyles(entryUrl, remoteName) {
  const base = remoteBaseUrl(entryUrl)
  if (!base) {
    return
  }
  try {
    const response = await fetch(`${base}/styles.json`)
    if (response.ok) {
      const files = await response.json()
      if (Array.isArray(files)) {
        files
          .filter((rel) => typeof rel === 'string' && rel.endsWith('.css'))
          .forEach((rel, index) => {
            const href = rel.startsWith('/')
              ? rel
              : `${base}/${rel.replace(/^\.\//, '')}`
            addStylesheet(href, `${remoteName}-${index}`)
          })
        return
      }
    }
  } catch {
    /* без styles.json стили remote не подключаем — сборка remote пишет этот файл */
  }
}

/**
 * @returns {{ name: string, entry: string }[]}
 */
export function getConfiguredModuleRemotes() {
  return parseModuleRemotes(clientEnv.moduleRemotes || '')
}

/**
 * Подключает CSS remote, когда открыта страница или виджет этого модуля.
 * @param {string} remoteName
 * @returns {Promise<void>}
 */
export async function ensureRemoteStyles(remoteName) {
  const name = String(remoteName || '').trim()
  if (!name || injectedRemoteStyles.has(name)) {
    return
  }
  const found = getConfiguredModuleRemotes().find((item) => item.name === name)
  if (!found) {
    return
  }
  injectedRemoteStyles.add(name)
  await injectRemoteStyles(found.entry, name)
}

bridge.provide('shell.ensure_remote_styles', ensureRemoteStyles, { override: true })

/** Дольше живой remoteEntry не отвечает: peer молчит, вкладку не держим. */
const REMOTE_ENTRY_TIMEOUT_MS = 4000
/** Повтор меню не открывает новую волну тех же зависших запросов. */
const UNREACHABLE_COOLDOWN_MS = 20000

/** @type {Map<string, number>} */
const unreachableUntilByOrigin = new Map()
/** @type {Set<string>} */
const unreachableNoted = new Set()

function entryOrigin(entryUrl) {
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/'
    return new URL(entryUrl, base).origin
  } catch {
    return String(entryUrl || '')
  }
}

function originCoolingDown(entryUrl) {
  const origin = entryOrigin(entryUrl)
  const until = unreachableUntilByOrigin.get(origin)
  if (typeof until !== 'number') {
    return false
  }
  if (until > Date.now()) {
    return true
  }
  unreachableUntilByOrigin.delete(origin)
  unreachableNoted.delete(origin)
  return false
}

function noteUnreachable(entryUrl, remoteName) {
  const origin = entryOrigin(entryUrl)
  if (!origin) {
    return
  }
  const cooling = (unreachableUntilByOrigin.get(origin) || 0) > Date.now()
  if (!cooling) {
    unreachableUntilByOrigin.set(origin, Date.now() + UNREACHABLE_COOLDOWN_MS)
  }
  if (unreachableNoted.has(origin)) {
    return
  }
  unreachableNoted.add(origin)
  logWarn(
    `[federated] Remote ${remoteName} недоступен, остальные с того же адреса пропускаем до повтора`,
  )
}

function isUnreachableError(error) {
  const name = String(error?.name || '')
  if (name === 'AbortError' || name === 'TimeoutError') {
    return true
  }
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network error')
    || message.includes('load failed')
    || message.includes('timeout')
    || message.includes('aborted')
    || message.includes('gateway')
    || message.includes('http 502')
    || message.includes('http 503')
    || message.includes('http 504')
  )
}

/**
 * import() нельзя оборвать, и script tag держит вкладку до 504.
 * Короткий fetch при отказе peer отпускает соединение и не запускает вторую попытку.
 * @param {string} entryUrl
 */
async function assertRemoteEntryReachable(entryUrl) {
  if (typeof fetch !== 'function' || typeof AbortController === 'undefined') {
    return
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_ENTRY_TIMEOUT_MS)
  try {
    const response = await fetch(entryUrl, {
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      const error = new Error(`remoteEntry HTTP ${response.status}`)
      error.name = 'TimeoutError'
      throw error
    }
    if (!response.ok) {
      throw new Error(`remoteEntry HTTP ${response.status}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {string} entryUrl
 * @param {string} remoteName
 * @returns {Promise<object|null>}
 */
async function importRemoteEntry(entryUrl, remoteName) {
  if (originCoolingDown(entryUrl)) {
    const error = new Error(`remoteEntry недоступен: ${entryUrl}`)
    error.name = 'TimeoutError'
    throw error
  }

  try {
    await assertRemoteEntryReachable(entryUrl)
  } catch (error) {
    if (isUnreachableError(error)) {
      noteUnreachable(entryUrl, remoteName)
    }
    throw error
  }

  try {
    const mod = await import(/* @vite-ignore */ entryUrl)
    if (mod?.default && typeof mod.default === 'object') {
      return mod.default
    }
    if (mod?.manifest && typeof mod.manifest === 'object') {
      return mod.manifest
    }
    if (mod?.moduleKey) {
      return mod
    }
  } catch (error) {
    if (isUnreachableError(error)) {
      noteUnreachable(entryUrl, remoteName)
      throw error
    }
    logWarn(`[federated] ESM import ${remoteName} (${entryUrl}) не удался, пробуем script tag`, error)
  }

  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-ergo-remote="${remoteName}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.type = 'module'
    script.src = entryUrl
    script.dataset.ergoRemote = remoteName
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Не удалось загрузить remoteEntry: ${entryUrl}`))
    document.head.appendChild(script)
  })

  const bag = globalThis.__ERGO_MODULE_REMOTES__
  if (bag && typeof bag === 'object' && bag[remoteName]) {
    return bag[remoteName]
  }
  return null
}

/**
 * @returns {Promise<import('./clientModuleManifest.js').ClientModuleManifest[]>}
 */
export async function loadFederatedModules() {
  const remotes = getConfiguredModuleRemotes()
  if (!remotes.length) {
    return []
  }

  const loaded = await Promise.all(
    remotes.map(async ({ name, entry }) => {
      try {
        const raw = await importRemoteEntry(entry, name)
        const manifest = normalizeClientModuleManifest(raw, name)
        if (!manifest) {
          logWarn(`[federated] Remote ${name}: манифест не распознан`)
          return null
        }
        return manifest
      } catch (error) {
        if (isUnreachableError(error)) {
          noteUnreachable(entry, name)
          return null
        }
        logError(`[federated] Ошибка загрузки remote ${name}`, error)
        return null
      }
    }),
  )
  return loaded.filter(Boolean)
}
