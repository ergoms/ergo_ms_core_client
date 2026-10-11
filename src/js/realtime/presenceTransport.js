import { createWebSocketTransport } from '@/js/realtime/transports/websocket.js'
import { isHttpPollingMode, isSseMode, pollIntervalMs } from '@/js/realtime/config.js'
import { getRealtimeClient, presencePeerTopic } from '@/js/realtime/RealtimeClient.js'
import { registerPollJob } from '@/js/realtime/pollCoordinator.js'
import { isSyncPollingAuthenticated, registerSyncChannel, } from '@/js/realtime/syncPollingHub.js'
import { presenceApi, sendPresenceOfflineBeacon } from '@/js/realtime/presenceApi.js'
import { PRESENCE_DELTA_EVENT, PRESENCE_USER_TOPIC, PRESENCE_WATCH_EVENT, buildClientEnvelope, } from '@/js/realtime/envelope.js'
import { fetchBatch, listWatchedPublicIds, mergeSnapshot, } from '@/core/cms/adp/js/presence/presenceStore.js'

import { getPresenceConnectionContext } from '@/js/realtime/presenceConnectionContext.js'

const WS_PATH = '/ws/presence/'

function attachPageHideOfflineBeacon(context) {
  function onPageHide(event) {
    if (event.persisted) {
      return
    }
    sendPresenceOfflineBeacon(context)
  }

  window.addEventListener('pagehide', onPageHide)
  return () => window.removeEventListener('pagehide', onPageHide)
}

function applyPresenceDelta(event, data, handlers) {
  if (data?.type === PRESENCE_DELTA_EVENT && data.payload?.users) {
    mergeSnapshot(data.payload.users)
  }
  handlers.onMessage?.(event, data)
}

function connectPresenceWebSocket(handlers) {
  const context = getPresenceConnectionContext()
  const connection = createWebSocketTransport(WS_PATH, {
    ...handlers,
    onMessage: (event, data) => applyPresenceDelta(event, data, handlers),
  })
  const removePageHide = attachPageHideOfflineBeacon(context)
  const originalClose = connection.close.bind(connection)

  return {
    ...connection,
    close() {
      removePageHide()
      originalClose()
    },
    syncWatchedPublicIds(ids) {
      const socket = connection.getSocket()
      if (socket?.readyState !== WebSocket.OPEN || !connection.isAuthenticated()) {
        return
      }
      try {
        socket.send(JSON.stringify(
          buildClientEnvelope(PRESENCE_WATCH_EVENT, { public_ids: ids }, PRESENCE_USER_TOPIC),
        ))
      } catch {
        // ignore
      }
    },
  }
}

function connectPresenceHttpPolling(handlers) {
  const context = getPresenceConnectionContext()
  let intentionalClose = false
  const removePageHide = attachPageHideOfflineBeacon(context)

  const handler = {
    onAuthenticated: () => handlers.onAuthenticated?.(),
    onError: () => handlers.onError?.(),
    onHeartbeat: () => {
      const ids = listWatchedPublicIds()
      if (ids.length) {
        void fetchBatch(ids)
      }
    },
  }
  const unregister = registerSyncChannel('presence', handler)

  function onPageHide(event) {
    if (intentionalClose || event.persisted) {
      return
    }
    intentionalClose = true
    sendPresenceOfflineBeacon(context)
  }

  window.addEventListener('pagehide', onPageHide)

  return {
    close({ preserveConnection = false } = {}) {
      intentionalClose = true
      removePageHide()
      window.removeEventListener('pagehide', onPageHide)
      unregister()
      if (!preserveConnection) void presenceApi.offline(context).catch(() => {})
      handlers.onClose?.({}, true)
    },
    getSocket() {
      return null
    },
    isAuthenticated() {
      return isSyncPollingAuthenticated()
    },
    reconnect() {
      intentionalClose = false
    },
    syncWatchedPublicIds(ids) {
      if (ids.length) {
        void fetchBatch(ids)
      }
    },
  }
}

function connectPresenceSse(handlers) {
  const context = getPresenceConnectionContext()
  const removePageHide = attachPageHideOfflineBeacon(context)
  let unregisterPoll = null
  let authenticated = false
  const subscribed = new Set()
  const client = getRealtimeClient()

  async function sendHeartbeat() {
    if (document.visibilityState === 'hidden') {
      return
    }
    try {
      await presenceApi.heartbeat()
      if (!authenticated) {
        authenticated = true
        handlers.onAuthenticated?.()
      }
    } catch {
      authenticated = false
      handlers.onError?.()
    }
  }

  client.ensureConnected()
  unregisterPoll = registerPollJob('presence-sse-heartbeat', sendHeartbeat, pollIntervalMs('presence'))
  void sendHeartbeat()

  const offDelta = client.on(PRESENCE_DELTA_EVENT, (event, data) => {
    applyPresenceDelta(event, data, handlers)
  })

  return {
    close({ preserveConnection = false } = {}) {
      offDelta?.()
      for (const topic of subscribed) {
        void client.unsubscribe(topic)
      }
      subscribed.clear()
      removePageHide()
      unregisterPoll?.()
      authenticated = false
      if (!preserveConnection) void presenceApi.offline(context).catch(() => {})
      handlers.onClose?.({}, true)
    },
    getSocket() {
      return null
    },
    isAuthenticated() {
      return authenticated
    },
    reconnect() {
      authenticated = false
      void sendHeartbeat()
    },
    syncWatchedPublicIds(ids) {
      const next = new Set(
        (ids || []).map((publicId) => presencePeerTopic(publicId)),
      )
      for (const topic of [...subscribed]) {
        if (!next.has(topic)) {
          subscribed.delete(topic)
          void client.unsubscribe(topic)
        }
      }
      for (const topic of next) {
        if (subscribed.has(topic)) {
          continue
        }
        subscribed.add(topic)
        void client.subscribe(topic)
      }
    },
  }
}

export function connectPresenceTransport(handlers = {}) {
  if (isHttpPollingMode()) {
    return connectPresenceHttpPolling(handlers)
  }
  if (isSseMode()) {
    return connectPresenceSse(handlers)
  }
  return connectPresenceWebSocket(handlers)
}
