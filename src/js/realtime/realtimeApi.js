import { resolveApiClientBaseUrl } from '@/js/api/baseUrl.js'
import { apiClient } from '@/js/api/manager'

export const realtimeApi = {
  config() {
    return apiClient.get('realtime/config/')
  },

  sync(params = {}) {
    return apiClient.get('realtime/sync/', params)
  },

  subscribe(topic) {
    // Тема модуля может быть ещё не зарегистрирована на этом API — не шумим в консоль.
    return apiClient.post(
      'realtime/subscriptions/',
      { action: 'subscribe', topic },
      true,
      { quietStatuses: [403, 404] },
    )
  },

  unsubscribe(topic) {
    return apiClient.post(
      'realtime/subscriptions/',
      { action: 'unsubscribe', topic },
      true,
      { quietStatuses: [403, 404] },
    )
  },
}

export function buildRealtimeStreamUrl() {
  const base = resolveApiClientBaseUrl()
  return `${base}realtime/stream/`
}
