import { apiClient } from '../../../js/api/manager'
import { cmsEndpoints as endpoints } from '@/core/cms/js/endpoints.js'
import { formatDateTime, getRelativeTime } from '@/js/utils/timeUtils.js'
import { tGlobal } from '@/i18n/index.js'
import { getDefaultLocale } from '@/i18n/supportedLocales.js'

const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function validateBirthDate(value) {
  const match = BIRTH_DATE_PATTERN.exec(String(value).trim())
  if (!match) {
    return tGlobal('settings.profile.birthDateInvalid')
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  const isRealDay = parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
  if (!isRealDay) {
    return tGlobal('settings.profile.birthDateInvalid')
  }
  if (year < 1900) {
    return tGlobal('settings.profile.birthDateTooEarly')
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (parsed > today) {
    return tGlobal('settings.profile.birthDateFuture')
  }
  return ''
}

export const profileService = {
  // Получить полный профиль пользователя
  async getProfile() {
    try {
      const response = await apiClient.get(endpoints.auth.profile)
      return response.data
    } catch (error) {
      logError('Ошибка получения профиля:', error)
      throw error
    }
  },

  // Обновить профиль пользователя
  async updateProfile(profileData) {
    try {
      const response = await apiClient.put(endpoints.auth.profile, profileData)
      return response.data
    } catch (error) {
      logError('Ошибка обновления профиля:', error)
      throw error
    }
  },

  // Смена пароля
  async changePassword(passwordData) {
    try {
      const response = await apiClient.post(endpoints.auth.changePassword, passwordData)
      return response.data
    } catch (error) {
      logError('Ошибка смены пароля:', error)
      throw error
    }
  },

  // Получить список устройств пользователя
  async getDevices() {
    try {
      const response = await apiClient.get(endpoints.auth.devices)
      return response.data
    } catch (error) {
      logError('Ошибка получения списка устройств:', error)
      throw error
    }
  },

  // Удалить устройство (завершить сессию на устройстве)
  async deleteDevice(deviceId) {
    try {
      const response = await apiClient.delete(endpoints.auth.deleteDevice(deviceId))
      return response.data
    } catch (error) {
      logError('Ошибка удаления устройства:', error)
      throw error
    }
  },

  // Форматирование данных профиля для отображения
  formatProfileData(profileData) {
    if (!profileData) return null

    const user = profileData
    const profile = profileData.adp_profile || {}

    return {
      // Основная информация
      // id не включаем, так как он доступен через userStore.user.id (загружается через меню)
      username: user.username,
      email: user.email,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      middleName: user.middle_name || '',
      fullName: (() => {
        // Собираем полное имя из отдельных полей («Фамилия Имя Отчество»)
        const firstName = user.first_name?.trim() || ''
        const middleName = user.middle_name?.trim() || ''
        const lastName = user.last_name?.trim() || ''
        const nameParts = [lastName, firstName, middleName].filter(part => part && part.trim())
        return nameParts.length > 0 ? nameParts.join(' ') : user.username
      })(),
      isActive: user.is_active,
      dateJoined: user.date_joined,

      // Профиль пользователя
      phone: profile.phone || '',
      birth_date: profile.birth_date || '',
      bio: profile.bio || '',
      language: profile.language || getDefaultLocale(),
      timezone: profile.timezone || 'Europe/Moscow',

      // Метаданные
      createdAt: profile.created_at
    }
  },

  // Форматирование данных устройства
  formatDeviceData(device) {
    if (!device) return null

    const location = device.location || ''
    const browser = device.browser || 'Неизвестно'
    const os = device.os || 'Неизвестно'
    const deviceTypeDisplay = device.device_type_display || device.device_name || 'Устройство'

    return {
      id: device.id,
      deviceType: device.device_type,
      deviceTypeDisplay,
      deviceName: device.device_name,
      browser,
      os,
      ipAddress: device.ip_address,
      city: device.city || '',
      country: device.country || '',
      location,
      isActive: device.is_active,
      isCurrent: Boolean(device.is_current),
      lastActivity: device.last_activity,
      createdAt: device.created_at,
      deviceIcon: this.getDeviceIcon(device.device_type),
      formattedLastActivity: getRelativeTime(device.last_activity) || '—',
      formattedCreatedAt: formatDateTime(device.created_at) || '—',
      subtitle: [deviceTypeDisplay, browser, os !== 'Неизвестно' ? os : null]
        .filter(Boolean)
        .join(' · '),
      locationLine: location || null,
    }
  },

  // Получить иконку для типа устройства
  getDeviceIcon(deviceType) {
    const iconMap = {
      'desktop': 'Monitor',
      'laptop': 'Laptop',
      'mobile': 'Smartphone',
      'tablet': 'Tablet'
    }
    return iconMap[deviceType] || 'Monitor'
  },

  // Валидация данных профиля
  validateProfileData(profileData) {
    const errors = {}

    // Проверка email
    if (profileData.email && !/\S+@\S+\.\S+/.test(profileData.email)) {
      errors.email = 'Некорректный формат email'
    }

    // Проверка телефона
    if (profileData.phone && !/^[+]?[\d\s().-]{7,20}$/.test(String(profileData.phone).replace(/\s/g, ''))) {
      errors.phone = 'Некорректный формат телефона'
    }

    // Проверка био
    if (profileData.bio && profileData.bio.length > 500) {
      errors.bio = 'Описание не должно превышать 500 символов'
    }

    if (profileData.birth_date) {
      const birthDateError = validateBirthDate(profileData.birth_date)
      if (birthDateError) {
        errors.birth_date = birthDateError
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    }
  }
}

// Композиция для использования в Vue компонентах
export function useProfile() {
  return {
    profileService,
    getProfile: () => profileService.getProfile(),
    updateProfile: (data) => profileService.updateProfile(data),
    changePassword: (data) => profileService.changePassword(data),
    getDevices: () => profileService.getDevices(),
    deleteDevice: (id) => profileService.deleteDevice(id),
    formatProfileData: (data) => profileService.formatProfileData(data),
    formatDeviceData: (data) => profileService.formatDeviceData(data),
    validateProfileData: (data) => profileService.validateProfileData(data)
  }
} 