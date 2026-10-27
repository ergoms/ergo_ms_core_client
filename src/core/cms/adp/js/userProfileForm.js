import { profileService } from '@/core/cms/js/profileService.js'

export const USER_PROFILE_MAIN_FIELDS = ['email', 'last_name', 'first_name', 'middle_name']
export const USER_PROFILE_FIO_FIELDS = ['last_name', 'first_name', 'middle_name']
export const USER_PROFILE_IDENTITY_FIELDS = [...USER_PROFILE_MAIN_FIELDS, 'phone']
export const USER_PROFILE_ADDITIONAL_FIELDS = ['phone', 'birth_date', 'gender', 'bio']
export const USER_PROFILE_SELF_EDITABLE_ADDITIONAL_FIELDS = ['birth_date', 'gender', 'bio']
export const USER_PROFILE_ALL_FIELDS = [
  ...USER_PROFILE_MAIN_FIELDS,
  ...USER_PROFILE_ADDITIONAL_FIELDS,
]

export const BIO_MAX_LENGTH = 500

export function normalizeEmptyString(value) {
  return value === ' ' ? '' : (value ?? '')
}

export function mapUserProfileToFormData(source) {
  if (!source) return {}

  const profile = source.adp_profile || {}

  return {
    email: source.email || '',
    first_name: normalizeEmptyString(source.first_name ?? source.firstName),
    last_name: normalizeEmptyString(source.last_name ?? source.lastName),
    middle_name: normalizeEmptyString(source.middle_name ?? source.middleName),
    phone: normalizeEmptyString(profile.phone ?? source.phone),
    birth_date: profile.birth_date || source.birth_date || '',
    gender: profile.gender || source.gender || '',
    bio: profile.bio ?? source.bio ?? '',
  }
}

export function buildUserProfilePayload(formData, fields = USER_PROFILE_ALL_FIELDS) {
  return Object.fromEntries(
    fields.map((field) => {
      const raw = formData?.[field]
      if (typeof raw === 'string') {
        return [field, raw.trim()]
      }
      return [field, raw ?? '']
    }),
  )
}

export function validateUserProfileData(data) {
  return profileService.validateProfileData(data)
}

export function applyProfileApiErrors(error, errorsRef) {
  const payload = error?.response?.data ?? error?.errors
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    errorsRef.value = payload
    return true
  }
  return false
}
