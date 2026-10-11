import { getSessionClaim } from '@/core/cms/js/tokenStorage.js'
import { getSessionScopeGatingClaims } from '@/integrations/sessionScopeGating.js'
import { SESSION_ENTER_SCOPE } from '@/integrations/moduleContracts.js'
import bridge from '@/integrations/ModuleBridge.js'

export function notificationMatchesCurrentScope(scopeRef) {
  if (!scopeRef) {
    return true
  }
  const claims = getSessionScopeGatingClaims()
  if (!claims.length) {
    return true
  }
  return claims.some((name) => {
    const value = getSessionClaim(name)
    return value != null && String(value) === String(scopeRef)
  })
}

export async function enterNotificationScope(scopeRef) {
  if (notificationMatchesCurrentScope(scopeRef)) {
    return { success: true }
  }
  const result = await bridge.call(
    SESSION_ENTER_SCOPE,
    { scope_ref: String(scopeRef) },
    { default: { success: true } },
  )
  if (result && result.success === false) {
    return {
      success: false,
      error: result.error || 'Не удалось открыть компанию из уведомления',
    }
  }
  return { success: true }
}
