import { clientEnv } from '@/js/clientEnv.js'
import { realtimeApi } from '@/js/realtime/realtimeApi.js'

const DEFAULT_INTERVALS_MS = {
  presence: 45000,
  notifications: 10000,
  adminPresence: 10000,
  chat: 3000,
}

const ACTIVE_INTERVALS_MS = {
  presence: 45000,
  notifications: 8000,
  adminPresence: 8000,
  chat: 2000,
}

const BUILD_POLL_MS = {
  presence: clientEnv.realtimePollPresenceMs,
  notifications: clientEnv.realtimePollNotificationsMs,
  adminPresence: clientEnv.realtimePollAdminPresenceMs,
  chat: clientEnv.realtimePollMessengerMs,
}

const API_POLL_KEY_TO_CHANNEL = {
  presence: 'presence',
  notifications: 'notifications',
  admin_presence: 'adminPresence',
  chat: 'chat',
}

/** @type {'websocket' | 'sse' | 'http_polling' | null} */
let runtimeTransport = null
/** @type {Record<string, number>} */
let runtimePollIntervalsMs = {}
/** @type {Record<string, boolean> | null} */
let runtimeCapabilities = null

function normalizeTransport(mode) {
  const value = String(mode || 'websocket').trim().toLowerCase()
  if (value === 'http_polling' || value === 'sse') {
    return value
  }
  return 'websocket'
}

function readBuildTransport() {
  return normalizeTransport(clientEnv.realtimeTransport)
}

function readBuildIntervalMs(channel) {
  const ms = BUILD_POLL_MS[channel]
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

/**
 * @param {object} data
 */
export function applyRealtimeConfigFromApi(data) {
  if (!data || typeof data !== 'object') {
    return
  }
  if (data.transport) {
    runtimeTransport = normalizeTransport(data.transport)
  }
  if (data.capabilities && typeof data.capabilities === 'object') {
    runtimeCapabilities = { ...data.capabilities }
  }
  if (data.poll_intervals && typeof data.poll_intervals === 'object') {
    for (const [apiKey, seconds] of Object.entries(data.poll_intervals)) {
      const channel = API_POLL_KEY_TO_CHANNEL[apiKey]
      const parsed = Number.parseInt(String(seconds ?? ''), 10)
      if (channel && Number.isFinite(parsed) && parsed > 0) {
        runtimePollIntervalsMs[channel] = parsed * 1000
      }
    }
  }
}

let initPromise = null

export function initRealtimeConfig() {
  if (initPromise) {
    return initPromise
  }
  initPromise = (async () => {
    try {
      const resp = await realtimeApi.config()
      applyRealtimeConfigFromApi(resp?.data ?? resp)
    } catch {
      // REALTIME_* из .env
    }
  })()
  return initPromise
}

/**
 * @returns {'websocket' | 'sse' | 'http_polling'}
 */
export function getRealtimeTransport() {
  return runtimeTransport ?? readBuildTransport()
}

export function getRealtimeCapabilities() {
  return runtimeCapabilities ?? {}
}

export function isWebSocketMode() {
  return getRealtimeTransport() === 'websocket'
}

export function isSseMode() {
  return getRealtimeTransport() === 'sse'
}

export function isHttpPollingMode() {
  return getRealtimeTransport() === 'http_polling'
}

function resolveIntervalMs(channel) {
  if (runtimePollIntervalsMs[channel]) {
    return runtimePollIntervalsMs[channel]
  }
  const fromBuild = readBuildIntervalMs(channel)
  if (fromBuild !== null) {
    return fromBuild
  }
  return null
}

/**
 * @param {'presence' | 'notifications' | 'adminPresence' | 'chat'} channel
 */
export function pollIntervalMs(channel) {
  return resolveIntervalMs(channel) ?? DEFAULT_INTERVALS_MS[channel] ?? 10000
}

/**
 * @param {'presence' | 'notifications' | 'adminPresence' | 'chat'} channel
 */
export function activePollIntervalMs(channel) {
  const resolved = resolveIntervalMs(channel)
  if (resolved !== null) {
    return resolved
  }
  return ACTIVE_INTERVALS_MS[channel] ?? pollIntervalMs(channel)
}

export function isPushTransport() {
  return isWebSocketMode() || isSseMode()
}
