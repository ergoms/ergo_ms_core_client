/**
 * Единый sync для http_polling: один GET /realtime/sync/ вместо нескольких REST-запросов.
 */
import { activePollIntervalMs, pollIntervalMs } from '@/js/realtime/config.js'
import { buildClientEnvelope } from '@/js/realtime/envelope.js'
import { registerPollJob } from '@/js/realtime/pollCoordinator.js'
import { realtimeApi } from '@/js/realtime/realtimeApi.js'
import { getPresenceConnectionContext } from '@/js/realtime/presenceConnectionContext.js'

const channels = {
  notifications: { count: 0, lastRun: 0 },
  presence: { count: 0, lastRun: 0 },
  adminPresence: { count: 0, lastRun: 0 },
}

const listeners = {
  notifications: new Set(),
  presence: new Set(),
  adminPresence: new Set(),
}

let lastNotificationId = 0
let notificationCursorReady = false
let unregisterPoll = null
let syncInFlight = false
let authenticated = false

function channelInterval(channel) {
  return document.visibilityState === 'visible'
    ? activePollIntervalMs(channel)
    : pollIntervalMs(channel)
}

function computeTickInterval() {
  const active = []
  if (channels.notifications.count > 0) {
    active.push(channelInterval('notifications'))
  }
  if (channels.presence.count > 0) {
    active.push(channelInterval('presence'))
  }
  if (channels.adminPresence.count > 0) {
    active.push(channelInterval('adminPresence'))
  }
  if (active.length === 0) {
    return 10000
  }
  return Math.min(...active)
}

function ensurePolling() {
  if (unregisterPoll) {
    unregisterPoll()
    unregisterPoll = null
  }
  const hasConsumers = Object.values(channels).some((c) => c.count > 0)
  if (!hasConsumers) {
    authenticated = false
    return
  }
  unregisterPoll = registerPollJob('realtime-sync', () => runSync(), computeTickInterval())
}

function shouldRunChannel(channel) {
  if (channels[channel].count <= 0) {
    return false
  }
  const interval = channelInterval(channel)
  return Date.now() - channels[channel].lastRun >= interval
}

async function runSync() {
  if (syncInFlight || document.visibilityState === 'hidden') {
    return
  }

  const wantNotifications = shouldRunChannel('notifications')
  const wantPresence = shouldRunChannel('presence')
  const wantAdmin = shouldRunChannel('adminPresence')
  if (!wantNotifications && !wantPresence && !wantAdmin) {
    return
  }

  const params = {}
  if (wantNotifications) {
    if (notificationCursorReady || lastNotificationId > 0) {
      params.notifications_after_id = lastNotificationId
      notificationCursorReady = true
    }
    channels.notifications.lastRun = Date.now()
  }
  if (wantPresence) {
    params.presence_heartbeat = true
    params.presence_connection_id = getPresenceConnectionContext()?.connectionId
    channels.presence.lastRun = Date.now()
  }
  if (wantAdmin) {
    params.presence_admin_snapshot = true
    channels.adminPresence.lastRun = Date.now()
  }

  syncInFlight = true
  try {
    const resp = await realtimeApi.sync(params)
    const data = resp?.data ?? resp
    if (!authenticated) {
      authenticated = true
      for (const handler of listeners.notifications) {
        handler.onAuthenticated?.()
      }
      for (const handler of listeners.presence) {
        handler.onAuthenticated?.()
      }
      for (const handler of listeners.adminPresence) {
        handler.onAuthenticated?.()
      }
    }

    if (wantNotifications) {
      if (!notificationCursorReady) {
        const latest = Number(data?.latest_notification_id)
        if (Number.isFinite(latest) && latest > lastNotificationId) {
          lastNotificationId = latest
        }
        notificationCursorReady = true
      }
      const items = Array.isArray(data?.notifications) ? data.notifications : []
      for (const notification of items) {
        if (notification?.id > lastNotificationId) {
          lastNotificationId = notification.id
        }
        for (const handler of listeners.notifications) {
          handler.onMessage?.(null, buildClientEnvelope('notification_new', notification))
        }
      }
      for (const handler of listeners.notifications) {
        handler.onPollMeta?.({ unreadCount: Number(data?.unread_count ?? 0) })
      }
    }

    if (wantPresence && data?.presence) {
      for (const handler of listeners.presence) {
        handler.onHeartbeat?.(data.presence)
      }
    }

    if (wantAdmin && data?.admin_presence?.users) {
      for (const handler of listeners.adminPresence) {
        handler.onSnapshot?.(data.admin_presence.users)
      }
    }
  } catch {
    authenticated = false
    for (const handler of listeners.notifications) {
      handler.onError?.()
    }
    for (const handler of listeners.presence) {
      handler.onError?.()
    }
    for (const handler of listeners.adminPresence) {
      handler.onError?.()
    }
  } finally {
    syncInFlight = false
  }
}

/**
 * @param {'notifications' | 'presence' | 'adminPresence'} channel
 * @param {object} handler
 */
export function registerSyncChannel(channel, handler) {
  listeners[channel].add(handler)
  channels[channel].count += 1
  channels[channel].lastRun = 0
  ensurePolling()

  return () => {
    listeners[channel].delete(handler)
    channels[channel].count = Math.max(0, channels[channel].count - 1)
    ensurePolling()
  }
}

export function setSyncLastNotificationId(id) {
  const parsed = Number.parseInt(String(id ?? ''), 10)
  if (Number.isFinite(parsed) && parsed > lastNotificationId) {
    lastNotificationId = parsed
    notificationCursorReady = true
  }
}

/** Сброс курсора polling при logout / смене сессии. */
export function resetSyncNotificationCursor() {
  lastNotificationId = 0
  notificationCursorReady = false
}

export function isSyncPollingAuthenticated() {
  return authenticated
}

export function triggerSyncNow() {
  channels.notifications.lastRun = 0
  channels.presence.lastRun = 0
  channels.adminPresence.lastRun = 0
  void runSync()
}
