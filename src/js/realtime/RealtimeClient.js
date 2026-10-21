import {
  getRealtimeCapabilities,
  isHttpPollingMode,
  isSseMode,
  isWebSocketMode,
} from '@/js/realtime/config.js'
import { realtimeApi } from '@/js/realtime/realtimeApi.js'
import { createSseTransport } from '@/js/realtime/transports/sse.js'

const FALLBACK_FAILURE_THRESHOLD = 3

let instance = null

export class RealtimeClient {
  constructor() {
    this._handlers = new Map()
    this._connection = null
    this._capabilities = null
    this._activeTopics = new Set()
    this._streamFailures = 0
    this._usingFallback = false
  }

  getCapabilities() {
    return getRealtimeCapabilities() || this._capabilities || {}
  }

  on(eventType, handler) {
    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, new Set())
    }
    this._handlers.get(eventType).add(handler)
    return () => this._handlers.get(eventType)?.delete(handler)
  }

  _dispatch(event, data) {
    const handlers = this._handlers.get(data?.type)
    if (handlers) {
      for (const handler of handlers) {
        handler(event, data)
      }
    }
    const wildcard = this._handlers.get('*')
    if (wildcard) {
      for (const handler of wildcard) {
        handler(event, data)
      }
    }
  }

  async subscribe(topic) {
    this._activeTopics.add(topic)
    if (isSseMode() && !this._usingFallback) {
      try {
        await realtimeApi.subscribe(topic)
      } catch {
        // access denied — ignore
      }
    }
  }

  async unsubscribe(topic) {
    this._activeTopics.delete(topic)
    if (isSseMode() && !this._usingFallback) {
      try {
        await realtimeApi.unsubscribe(topic)
      } catch {
        // ignore
      }
    }
  }

  isConnected() {
    return this._connection?.isAuthenticated?.() ?? false
  }

  reconnectStream() {
    this._connection?.reconnect?.()
  }

  connectSse(handlers = {}) {
    if (this._connection?.isAuthenticated?.() && isSseMode()) {
      handlers.onAuthenticated?.()
      return this._connection
    }
    this.disconnect()
    this._connection = createSseTransport({
      ...handlers,
      onAuthenticated: () => {
        this._streamFailures = 0
        handlers.onAuthenticated?.()
      },
      onMessage: (event, data) => {
        this._dispatch(event, data)
        handlers.onMessage?.(event, data)
      },
      onError: () => {
        this._streamFailures += 1
        if (this._streamFailures >= FALLBACK_FAILURE_THRESHOLD) {
          this._enablePollingFallback(handlers)
        }
        handlers.onError?.()
      },
      onClose: (event, intentional) => {
        handlers.onClose?.(event, intentional)
      },
    })
    return this._connection
  }

  _enablePollingFallback(handlers) {
    if (this._usingFallback || !isSseMode()) {
      return
    }
    this._usingFallback = true
    this.disconnect()
    handlers.onFallback?.('http_polling')
  }

  ensureConnected(handlers = {}) {
    if (this._connection?.isAuthenticated?.()) {
      return this._connection
    }
    if (isSseMode() && !this._usingFallback) {
      return this.connectSse(handlers)
    }
    if (isWebSocketMode()) {
      return null
    }
    return null
  }

  disconnect() {
    this._connection?.close?.()
    this._connection = null
  }
}

export function getRealtimeClient() {
  if (!instance) {
    instance = new RealtimeClient()
  }
  return instance
}

export function messengerTopic(contentType, objectId) {
  return `chat:${contentType}:${objectId}`
}

export function presenceAdminTopic() {
  return 'presence:admin'
}

export function presencePeerTopic(publicId) {
  return `presence:peer:${publicId}`
}

export { isHttpPollingMode, isSseMode, isWebSocketMode }
