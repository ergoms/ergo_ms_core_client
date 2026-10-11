import { decodePayload, getAccess } from '@/core/cms/js/tokenStorage.js'
import { getSessionScopeGatingClaims } from '@/integrations/sessionScopeGating.js'

let context = null

export function presenceIdentity(payload, claims) {
  return JSON.stringify([payload?.user_id, payload?.device_id, ...claims.map(key => [key, payload?.[key] ?? null])])
}

export function getPresenceConnectionContext() {
  const token = getAccess()
  if (!token) return null
  const signature = presenceIdentity(decodePayload(token), getSessionScopeGatingClaims())
  if (!context || signature !== context.signature) {
    context = { connectionId: crypto.randomUUID(), token, signature }
  } else {
    context.token = token
  }
  return context
}
