import { apiClient } from '@/js/api/manager'
import { resolveApiClientBaseUrl } from '@/js/api/baseUrl.js'
import tokenService from '@/core/cms/js/tokenService'
import { cmsEndpoints } from '@/core/cms/js/endpoints.js'

import { getPresenceConnectionContext } from '@/js/realtime/presenceConnectionContext.js'

const ep = cmsEndpoints.cms.presence

export const presenceApi = {
  heartbeat() {
    return apiClient.post(ep.heartbeat, { connection_id: getPresenceConnectionContext()?.connectionId })
  },

  offline(context = getPresenceConnectionContext()) {
    return apiClient.post(ep.offline, { connection_id: context?.connectionId })
  },

  adminSnapshot() {
    return apiClient.get(ep.adminSnapshot)
  },
}

export function sendPresenceOfflineBeacon(context = getPresenceConnectionContext(), reason = 'disconnect') {
  const token = context?.token || tokenService.getAccess()
  if (!token) {
    return
  }

  const url = `${resolveApiClientBaseUrl()}${ep.offline}`
  try {
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ connection_id: context?.connectionId, reason }),
      keepalive: true,
    })
  } catch {
    // best effort при закрытии вкладки
  }
}
