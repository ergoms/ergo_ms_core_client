import { apiClient } from '@/js/api/manager.js'
import { cmsEndpoints as endpoints } from '@/core/cms/js/endpoints.js'
import tokenService from '@/core/cms/js/tokenService'
import { clearPostLoginReturnPath } from '@/core/cms/js/postLoginReturn.js'
import { isExpired } from '@/core/cms/js/tokenStorage.js'
import { isTransientNetworkError } from '@/core/cms/js/isTransientNetworkError.js'
import { useUserStore } from '@/core/cms/js/userStore.js'
import {
  performServerLogout,
  restoreSession,
  invalidateSessionRestoreCache,
  resetServerLogoutGate,
  ensureAccessToken,
  isServerLogoutFinalized,
  canAttemptTokenRefresh,
  wasLastRefreshTransient,
  storePendingSessionBootstrap,
} from '@/core/cms/js/tokenRefresh.js'
import {
  isRateLimitActive,
  showRateLimitNotice,
} from '@/composables/useRateLimitNotice.js'
import { resetPresenceConnection } from '@/core/cms/adp/js/presence/usePresenceConnection.js'
import { resetPresenceStore } from '@/core/cms/adp/js/presence/presenceStore.js'
import { resetNotificationsInbox } from '@/core/notifications/js/useNotificationsInbox.js'
import { showBootstrapMask } from '@/js/bootstrapMask.js'

const TOKEN_CHECK_TTL_MS = 60 * 1000
let tokenCheckCache = { at: 0, result: false }

function resetTokenCheckCache() {
  tokenCheckCache = { at: 0, result: false }
}

export const authService = {
    async login(username, password, rememberMe = false) {
        const response = await apiClient.post(endpoints.auth.login, {
            username,
            password,
            remember_me: rememberMe,
        }, false);
        
        if (response.success && response.data?.access) {
            tokenService.setTokens(response.data.access)
            storePendingSessionBootstrap(
              response.data.session_bootstrap ?? response.data.data?.session_bootstrap
            )
            resetServerLogoutGate()
        }
        
        return response;
    },
    
    async validateRegistration(firstName, lastName, middleName, username, email, password) {
        return await apiClient.post(endpoints.auth.validateRegistration, {
            first_name: firstName,
            last_name: lastName || '',
            middle_name: middleName || '',
            username,
            email,
            password
        }, false);
    },
    
    async sendConfirmationCode(email, purpose = '') {
        const payload = { email }
        if (purpose) {
            payload.purpose = purpose
        }
        return await apiClient.post(endpoints.auth.sendCode, payload, false);
    },
    
    async verifyConfirmationCode(email, code) {
        return await apiClient.post(endpoints.auth.verifyCode, { email, code }, false);
    },
    
    async resetPassword(email, code, newPassword, confirmPassword) {
        return await apiClient.post(endpoints.auth.resetPassword, {
            email,
            code,
            new_password: newPassword,
            confirm_password: confirmPassword
        }, false);
    },
    
    async registration(firstName, lastName, middleName, username, email, password, invitationToken = '') {
        return await apiClient.post(endpoints.auth.registration, {
            first_name: firstName,
            last_name: lastName || '',
            middle_name: middleName || '',
            username,
            email,
            password,
            invitation_token: invitationToken || '',
        }, false);
    },
    
    async checkToken({ force = false } = {}) {
        if (isServerLogoutFinalized()) {
            return false
        }
        const access = tokenService.getAccess()
        if (access && !isExpired(access)) {
            if (!force) {
                try {
                    const userStore = useUserStore()
                    if (userStore.isInitialized && userStore.isAuthenticated) {
                        const now = Date.now()
                        if (now - tokenCheckCache.at < TOKEN_CHECK_TTL_MS) {
                            return tokenCheckCache.result
                        }
                    }
                } catch (_) {
                    /* store ещё не готов */
                }
            }

            try {
                const userStore = useUserStore()
                // F5: наполняем session-bootstrap (access_to_panel), не только «токен жив».
                if (!userStore.isInitialized) {
                    const ok = Boolean(await userStore.loadSessionBootstrap())
                    tokenCheckCache = { at: Date.now(), result: ok }
                    return ok
                }
                const response = await apiClient.get(endpoints.auth.sessionBootstrap)
                tokenCheckCache = { at: Date.now(), result: response.success }
                return response.success
            } catch (error) {
                // Не auth.logout() (redirect): иначе 401 → /login → restore → AppHome → 401…
                // Серверный logout делает интерцептор apiClient / guard.
                if (error.response?.status === 401) {
                    const recovered = await ensureAccessToken()
                    if (recovered) {
                        try {
                            const retry = await apiClient.get(endpoints.auth.sessionBootstrap)
                            tokenCheckCache = { at: Date.now(), result: retry.success }
                            return retry.success
                        } catch (retryError) {
                            if (isTransientNetworkError(retryError)) {
                                resetTokenCheckCache()
                                return true
                            }
                            if (retryError.response?.status !== 401) {
                                resetTokenCheckCache()
                                return false
                            }
                        }
                    }
                    // Refresh упёрся в 429/5xx — сессию не трогаем.
                    if (wasLastRefreshTransient() || canAttemptTokenRefresh()) {
                        resetTokenCheckCache()
                        return Boolean(access && !isExpired(access))
                    }
                    resetTokenCheckCache()
                    tokenService.clear()
                    invalidateSessionRestoreCache()
                    await performServerLogout('checkToken-401')
                    return false
                }
                // API мигнул (reload / refused): локальный JWT ещё валиден — не сбрасываем сессию
                if (isTransientNetworkError(error) && access && !isExpired(access)) {
                    resetTokenCheckCache()
                    return true
                }
                resetTokenCheckCache()
                return false
            }
        }

        try {
            const restored = await restoreSession()
            if (restored) {
                tokenCheckCache = { at: Date.now(), result: true }
            }
            return restored
        } catch {
            resetTokenCheckCache()
            return false
        }
    },
    
    async logout(reason = 'authService.logout') {
        const isManualLogout = reason === 'authService.logout'
        // Авто-logout при лимите — оверлей 429, не страница логина.
        // Ручной выход из меню пропускаем дальше.
        if (!isManualLogout && (isRateLimitActive() || wasLastRefreshTransient())) {
            if (!isRateLimitActive()) {
                showRateLimitNotice(0)
            }
            return
        }
        // Явный выход — не возвращать на старую страницу после следующего входа.
        // При forceLogout путь уже сохранён; cookie не трогаем.
        if (reason !== 'authGuard.forceLogout') {
            clearPostLoginReturnPath()
        }
        resetTokenCheckCache()
        showBootstrapMask()
        resetPresenceConnection()
        resetPresenceStore()
        resetNotificationsInbox()
        await performServerLogout(reason)
        invalidateSessionRestoreCache()
        tokenService.clear()
        try {
            useUserStore().finalizeSession()
        } catch {
            /* store ещё не готов */
        }
        window.location.href = '/login'
    }
};
