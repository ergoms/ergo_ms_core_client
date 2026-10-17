import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useToast } from '@/js/utils/toast.js'
import { apiClient } from '@/js/api/manager.js'
import { mediaApiClient } from '@/js/api/media-api-client.js'
import { buildMediaUploadOptions } from '@/js/mediaUploadLimits.js'
import { cmsEndpoints as endpoints } from '@/core/cms/js/endpoints.js'
import { profileService } from '@/core/cms/js/profileService.js'
import { applyMenuBootstrap } from '@/core/cms/js/menuService.js'
import {
  applyPermissionsBootstrap,
  invalidatePermissionsSnapshot,
  resolveDisplayRoleName,
  DEFAULT_ROLE_NAME,
} from '@/core/cms/adp/js/accessControl.js'
import {
  clearSessionBootstrapCache,
  setSessionBootstrapCache,
} from '@/core/cms/js/sessionBootstrapCache.js'
import { takePendingSessionBootstrap } from '@/core/cms/js/tokenRefresh.js'
import tokenService from '@/core/cms/js/tokenService.js'
import { invalidateAdminAccessCache } from '@/core/cms/adp/admin/js/adminAccessCache.js'
import { applyRealtimeConfigFromApi } from '@/js/realtime/config.js'
import {
  ensureAvatarDisplaySrc,
  invalidateAvatar,
  clearAvatarCache,
  avatarCacheKey,
} from '@/js/avatarCache.js'
import { logError } from '@/js/utils/logError.js'
import { applyLanguageFromProfile } from '@/core/cms/js/uiSettings.js'
import { tGlobal } from '@/i18n/index.js'

export const useUserStore = defineStore('userStore', () => {
  const toast = useToast()

  // ==== STATES ====
  const user = ref(null)
  const profile = ref(null)
  const avatarUrl = ref(null) // null означает использование стандартного аватара
  const roleName = ref(DEFAULT_ROLE_NAME)
  const isLoading = ref(false)
  const isInitialized = ref(false)
  const accessToPanel = ref(false)
  let bootstrapPromise = null
  let loadProfilePromise = null // Промис текущей загрузки профиля для предотвращения гонки условий


  const isAuthenticated = computed(() => !!user.value)
  const fullName = computed(() => {
    if (!user.value) return tGlobal('components.profileCard.guest')
    
    // Сначала проверяем полное имя из профиля (собирается из отдельных полей)
    if (profile.value?.fullName && profile.value.fullName !== user.value.username) {
      return profile.value.fullName
    }
    
    // Собираем полное имя из отдельных полей пользователя
    const firstName = user.value.first_name?.trim() || ''
    const middleName = user.value.middle_name?.trim() || ''
    const lastName = user.value.last_name?.trim() || ''
    
    const nameParts = [lastName, firstName, middleName].filter(part => part && part.trim())
    const fullNameValue = nameParts.join(' ')

    // Если нет ни имени, ни фамилии, возвращаем username или «Гость»
    if (!fullNameValue) {
      return user.value.username || tGlobal('components.profileCard.guest')
    }
    
    return fullNameValue
  })
  
  const displayName = computed(() => {
    if (!user.value) return tGlobal('components.profileCard.guest')

    const name = fullName.value
    const guestLabel = tGlobal('components.profileCard.guest')
    if (name === guestLabel) return name
    
    // Если имя длинное, сокращаем до «Фамилия И.»
    const parts = name.split(' ')
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0]} ${parts[1].charAt(0)}.`
    }
    return name
  })

  const greetingName = computed(() => {
    if (!user.value) return tGlobal('settings.profile.userFallback')

    const firstName =
      user.value.first_name?.trim() || profile.value?.firstName?.trim() || ''
    const middleName =
      user.value.middle_name?.trim() || profile.value?.middleName?.trim() || ''

    if (firstName && middleName) return `${firstName} ${middleName}`
    if (firstName) return firstName
    return user.value.username || tGlobal('settings.profile.userFallback')
  })

  const menuUserName = computed(() => {
    if (!user.value) return tGlobal('components.profileCard.guest')

    if (user.value.initials_name?.trim()) {
      return user.value.initials_name
    }
    if (user.value.full_name?.trim()) {
      return user.value.full_name
    }
    return fullName.value
  })

  const menuUserNameTruncated = computed(() => {
    const name = menuUserName.value
    if (name.length > 30) {
      return `${name.substring(0, 30)}...`
    }
    return name
  })

  const userEmail = computed(() => user.value?.email || tGlobal('common.emailNotSpecified'))
  const userRole = computed(() => roleName.value || DEFAULT_ROLE_NAME)
  const hasCustomAvatar = computed(() => !!avatarUrl.value)

  // ==== ACTIONS ====
  
  // Сброс состояния пользователя
  const resetUserState = () => {
    user.value = null
    profile.value = null
    avatarUrl.value = null
    roleName.value = DEFAULT_ROLE_NAME
    accessToPanel.value = false
    clearSessionBootstrapCache()
    invalidateAdminAccessCache()
    invalidatePermissionsSnapshot()
  }

  // Обновление базовой информации пользователя
  const updateUserData = (data) => {
    if (data) {
      user.value = {
        ...user.value,
        ...data
      }
    }
  }

  const warmupAvatar = () => {
    if (!avatarUrl.value) {
      return
    }
    ensureAvatarDisplaySrc(avatarUrl.value).catch(() => {})
  }

  /** Применяет payload session-bootstrap (из GET или из token-refresh). */
  const applySessionBootstrapData = async (data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Не удалось загрузить данные сессии')
    }

    setSessionBootstrapCache(data)

    if (data.user) {
      updateUserData(data.user)
    }
    if (data.profile) {
      profile.value = profileService.formatProfileData(data.profile)
      if (profile.value?.language) {
        applyLanguageFromProfile(profile.value.language)
      }
    }
    if (data.avatar_url) {
      avatarUrl.value = data.avatar_url
    } else {
      avatarUrl.value = null
    }
    if (data.menu) {
      await applyMenuBootstrap(data.menu)
    }
    if (data.site_theme) {
      const { applySiteThemePair } = await import('@/js/theme-service.js')
      applySiteThemePair(data.site_theme)
    }
    if (data.realtime) {
      applyRealtimeConfigFromApi(data.realtime)
    }
    if (data.permissions) {
      applyPermissionsBootstrap(data.permissions)
      roleName.value = resolveDisplayRoleName(data.permissions)
    } else {
      roleName.value = DEFAULT_ROLE_NAME
    }
    accessToPanel.value = Boolean(data.access_to_panel)

    isInitialized.value = true
    warmupAvatar()
    return true
  }

  // Агрегированная загрузка сессии (session-bootstrap)
  const loadSessionBootstrap = async () => {
    if (isInitialized.value) {
      return true
    }
    if (bootstrapPromise) {
      return bootstrapPromise
    }

    bootstrapPromise = (async () => {
      try {
        isLoading.value = true
        let data = takePendingSessionBootstrap()
        if (!data) {
          if (!tokenService.getAccess()) {
            return false
          }
          const response = await apiClient.get(endpoints.auth.sessionBootstrap)
          if (!response?.success) {
            throw new Error('Не удалось загрузить данные сессии')
          }
          data = response.data || response
        }
        await applySessionBootstrapData(data)
        return true
      } catch (error) {
        logError('Ошибка загрузки session-bootstrap:', error)
        resetUserState()
        return false
      } finally {
        isLoading.value = false
        bootstrapPromise = null
      }
    })()

    return bootstrapPromise
  }

  // Загрузка полного профиля пользователя
  const loadProfile = async (force = false) => {
    // Если профиль уже загружается, ждем завершения
    if (loadProfilePromise) {
      return await loadProfilePromise
    }
    
    // Если профиль уже загружен, не делаем повторный запрос
    if (profile.value && !force) {
      return profile.value
    }

    // Создаем новый промис загрузки профиля
    loadProfilePromise = (async () => {
      try {
        const profileData = await profileService.getProfile()
        profile.value = profileService.formatProfileData(profileData)
        updateUserData(profileData)
        return profile.value
      } catch (error) {
        logError('Ошибка загрузки профиля:', error)
        // Не показываем ошибку пользователю, профиль может быть пустым
        return null
      } finally {
        loadProfilePromise = null // Очищаем промис после завершения
      }
    })()

    return await loadProfilePromise
  }

  // Загрузка аватара пользователя
  const loadAvatar = async () => {
    try {
      const response = await apiClient.get(endpoints.userAvatars.list)
      if (response.data?.length && response.data[0].image) {
        const newUrl = response.data[0].image
        const prevUrl = avatarUrl.value
        if (prevUrl && avatarCacheKey(prevUrl) === avatarCacheKey(newUrl)) {
          return
        }
        avatarUrl.value = newUrl
      }
    } catch (error) {
      logError('Ошибка загрузки аватара:', error)
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && user.value) {
        loadAvatar()
      }
    })
  }

  // Обновление профиля
  const updateProfile = async (profileData) => {
    try {
      isLoading.value = true
      await profileService.updateProfile(profileData)
      await loadProfile(true)
      toast.success(tGlobal('settings.profile.updated'))
      return profile.value

    } catch (error) {
      logError('Ошибка обновления профиля:', error)
      toast.error(tGlobal('settings.profile.saveError'))
      throw error
    } finally {
      isLoading.value = false
    }
  }

  // Обновление аватара
  const updateAvatar = async (file) => {
    try {
      if (!file || !file.type.startsWith('image/')) {
        toast.error(tGlobal('settings.profile.selectImage'))
        return false
      }

      const uploadResult = await mediaApiClient.upload(
        file,
        buildMediaUploadOptions({
          targetDir: 'avatars/',
          allowedTypes: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
          feature: 'avatar',
        }),
      )

      await apiClient.post(endpoints.userAvatars.create, {
        image_path: uploadResult.path,
      })

      // Сбрасываем кеш старой аватарки, затем перезагружаем новую
      invalidateAvatar(avatarUrl.value)
      await loadAvatar()
      toast.success(tGlobal('settings.profile.avatarUpdated'))
      return true

    } catch (error) {
      logError('Ошибка обновления аватара:', error)
      toast.error(tGlobal('settings.profile.avatarUploadError'))
      return false
    }
  }

  // Сброс аватара
  const resetAvatar = async () => {
    try {
      await apiClient.delete(endpoints.userAvatars.deleteCurrent)
      invalidateAvatar(avatarUrl.value)
      avatarUrl.value = null // Используем стандартный аватар
      toast.success(tGlobal('settings.profile.avatarReset'))
      return true

    } catch (error) {
      logError('Ошибка сброса аватара:', error)
      toast.error(tGlobal('settings.profile.avatarResetError'))
      return false
    }
  }

  const finalizeSession = () => {
    clearAvatarCache()
    resetUserState()
    isInitialized.value = false
  }

  const logout = async () => {
    const { clearPostLoginReturnPath } = await import('@/core/cms/js/postLoginReturn.js')
    clearPostLoginReturnPath()
    const { authService } = await import('@/core/cms/adp/js/auth.js')
    await authService.logout()
  }

  const ensureUserReady = async () => loadSessionBootstrap()

  // Принудительная перезагрузка данных пользователя
  const refreshUserData = async () => {
    isInitialized.value = false
    takePendingSessionBootstrap()
    clearSessionBootstrapCache()
    return loadSessionBootstrap()
  }

  // Перечитать session-bootstrap, не снимая готовность оболочки (меню/аватар не мигают).
  const reloadSessionBootstrap = async () => {
    takePendingSessionBootstrap()
    clearSessionBootstrapCache()
    if (!tokenService.getAccess()) {
      return false
    }
    try {
      isLoading.value = true
      const response = await apiClient.get(endpoints.auth.sessionBootstrap)
      if (!response?.success) {
        throw new Error('Не удалось загрузить данные сессии')
      }
      await applySessionBootstrapData(response.data || response)
      return true
    } catch (error) {
      logError('Ошибка загрузки session-bootstrap:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Обновление всех данных (профиль + аватар) для реактивности компонентов
  const refreshAllData = async () => {
    try {
      isLoading.value = true
      await Promise.all([
        loadProfile(true),
        loadAvatar()
      ])
      return true
    } catch (error) {
      logError('Ошибка обновления данных:', error)
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    // States
    user,
    profile,
    avatarUrl,
    isLoading,
    isInitialized,
    accessToPanel,
    
    // Getters
    isAuthenticated,
    fullName,
    displayName,
    greetingName,
    menuUserName,
    menuUserNameTruncated,
    userEmail,
    userRole,
    hasCustomAvatar,
    
    // Actions
    loadSessionBootstrap,
    loadProfile,
    loadAvatar,
    updateProfile,
    updateAvatar,
    resetAvatar,
    logout,
    finalizeSession,
    ensureUserReady,
    refreshUserData,
    reloadSessionBootstrap,
    refreshAllData,
    warmupAvatar,
  }
}) 