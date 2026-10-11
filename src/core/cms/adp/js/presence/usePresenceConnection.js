import tokenService from '@/core/cms/js/tokenService'
import { useUserStore } from '@/core/cms/js/userStore.js'
import { connectPresenceTransport } from '@/js/realtime/presenceTransport.js'
import { PRESENCE_PING_EVENT, PRESENCE_USER_TOPIC, buildClientEnvelope, } from '@/js/realtime/envelope.js'
import { clearLiveSelfPresence, listWatchedPublicIds, setLiveSelfPresence, setPresenceWatchListener, } from './presenceStore.js'

import { getPresenceConnectionContext } from '@/js/realtime/presenceConnectionContext.js'
import { sendPresenceOfflineBeacon } from '@/js/realtime/presenceApi.js'
import { logError } from '@/js/utils/logError'

const PING_INTERVAL_MS = 45000
let activeContext = null
let activeToken = null
let connectionGeneration = 0

let wsConnection = null
let pingTimer = null
let intentionalClose = false
let connectionPromise = null

function clearPingTimer() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

async function sendPing() {
  try {
    if (tokenService.shouldRefresh()) await tokenService.tryRefresh()
    const socket = wsConnection?.getSocket()
    const context = getPresenceConnectionContext()
    if (socket?.readyState === WebSocket.OPEN && context) {
      socket.send(JSON.stringify(buildClientEnvelope(PRESENCE_PING_EVENT, {
        connection_id: context.connectionId,
      }, PRESENCE_USER_TOPIC)))
    }
  } catch (error) {
    logError('Presence heartbeat failed:', error)
  }
}

function startPingTimer() {
  clearPingTimer()
  void sendPing()
  pingTimer = setInterval(() => { void sendPing() }, PING_INTERVAL_MS)
}

function syncLiveSelfPresence() {
  try {
    setLiveSelfPresence(useUserStore().user?.public_id)
  } catch {
    // Pinia ещё не готов — batch/подключение повторят позже.
  }
}

function syncWatchedPeers() {
  wsConnection?.syncWatchedPublicIds?.(listWatchedPublicIds())
}

setPresenceWatchListener(syncWatchedPeers)

function openSocket() {
  if (!tokenService.getAccess()) {
    return
  }

  if (wsConnection && !intentionalClose) {
    return
  }

  intentionalClose = false
  activeContext = getPresenceConnectionContext()
  activeToken = activeContext?.token || null
  wsConnection?.close()

  const generation = ++connectionGeneration
  wsConnection = connectPresenceTransport({
    onAuthenticated: () => {
      if (generation !== connectionGeneration) return
      startPingTimer()
      // Индикатор в меню читает presenceStore; без этой записи он остаётся
      // offline после batch, который успел ответить до heartbeat/WS.
      syncLiveSelfPresence()
      syncWatchedPeers()
    },
    onClose: (_event, wasIntentional) => {
      if (generation !== connectionGeneration) return
      clearPingTimer()
      if (wasIntentional || intentionalClose) {
        clearLiveSelfPresence()
        wsConnection = null
      }
    },
    onError: () => {
      if (generation !== connectionGeneration) return
      clearPingTimer()
    },
  })
}

export function ensurePresenceConnected() {
  if (!tokenService.getAccess()) {
    return Promise.resolve()
  }

  if (wsConnection?.isAuthenticated()) {
    syncLiveSelfPresence()
    syncWatchedPeers()
    return Promise.resolve()
  }

  if (wsConnection && !intentionalClose) {
    return Promise.resolve()
  }

  if (connectionPromise) {
    return connectionPromise
  }

  connectionPromise = Promise.resolve().finally(() => {
    openSocket()
    connectionPromise = null
  })

  return connectionPromise
}

export function disconnectPresenceConnection({ preserveConnection = false } = {}) {
  connectionGeneration += 1
  intentionalClose = true
  clearPingTimer()
  clearLiveSelfPresence()
  wsConnection?.close({ preserveConnection })
  wsConnection = null
}

export function resetPresenceConnection() {
  disconnectPresenceConnection()
}


if (typeof window !== 'undefined') {
  window.addEventListener('access-token-changed', () => {
    const next = getPresenceConnectionContext()
    if (activeContext?.signature === next?.signature && activeToken === next?.token) return
    if (activeContext && activeContext.signature !== next?.signature) sendPresenceOfflineBeacon(activeContext, 'scope_changed')
    disconnectPresenceConnection({ preserveConnection: activeContext?.signature === next?.signature })
    activeContext = next
    if (next) void ensurePresenceConnected()
  })
}
