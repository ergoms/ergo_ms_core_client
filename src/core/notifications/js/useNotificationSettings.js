/**
 * Композабл панели настроек уведомлений.
 *
 * Загружает секции каталога (модули -> категории -> события, 2 канала),
 * хранит локальное состояние чекбоксов и сохраняет изменения
 * с debounce-батчингом (optimistic UI, откат при ошибке).
 */

import { computed, ref } from 'vue'
import { notificationsApi } from './notifications-api'
import { setSidebarActivityDays as applyInboxSidebarActivityDays } from './useNotificationsInbox.js'

const SAVE_DEBOUNCE_MS = 400
const SIDEBAR_ACTIVITY_DAYS_MIN = 1
const SIDEBAR_ACTIVITY_DAYS_MAX = 7
const SIDEBAR_ACTIVITY_DAYS_DEFAULT = 3
const AUTO_ARCHIVE_DAYS_PRESETS = [7, 14, 30, 60, 90]
const AUTO_ARCHIVE_DAYS_DEFAULT = 14

function clampSidebarActivityDays(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return SIDEBAR_ACTIVITY_DAYS_DEFAULT
  return Math.min(
    SIDEBAR_ACTIVITY_DAYS_MAX,
    Math.max(SIDEBAR_ACTIVITY_DAYS_MIN, Math.round(n)),
  )
}

function clampAutoArchiveDays(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return AUTO_ARCHIVE_DAYS_DEFAULT
  if (AUTO_ARCHIVE_DAYS_PRESETS.includes(n)) return n
  return AUTO_ARCHIVE_DAYS_PRESETS.reduce((best, preset) => (
    Math.abs(preset - n) < Math.abs(best - n) ? preset : best
  ))
}

export function useNotificationSettings() {
  const loading = ref(true)
  const saving = ref(false)
  const loadError = ref(false)
  const globalSwitches = ref({ in_app: true, email: true })
  const sections = ref([])
  const sidebarActivityDays = ref(SIDEBAR_ACTIVITY_DAYS_DEFAULT)
  const autoArchiveDays = ref(AUTO_ARCHIVE_DAYS_DEFAULT)

  let pendingItems = new Map()
  let pendingGlobal = {}
  let pendingSidebarActivityDays = null
  let pendingAutoArchiveDays = null
  let saveTimer = null
  let onSaveError = null

  const hasSections = computed(() => sections.value.length > 0)

  async function load() {
    loading.value = true
    loadError.value = false
    try {
      const response = await notificationsApi.getPreferences()
      const data = response?.data ?? {}
      globalSwitches.value = { in_app: true, email: true, ...(data.global || {}) }
      sections.value = Array.isArray(data.sections) ? data.sections : []
      const days = clampSidebarActivityDays(
        data.sidebar_activity_days ?? SIDEBAR_ACTIVITY_DAYS_DEFAULT,
      )
      sidebarActivityDays.value = days
      applyInboxSidebarActivityDays(days, { reload: false })
      autoArchiveDays.value = clampAutoArchiveDays(
        data.auto_archive_days ?? AUTO_ARCHIVE_DAYS_DEFAULT,
      )
    } catch {
      loadError.value = true
      sections.value = []
    } finally {
      loading.value = false
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }

  async function flush() {
    saveTimer = null
    const hasSidebarDays = pendingSidebarActivityDays != null
    const hasArchiveDays = pendingAutoArchiveDays != null
    if (
      !pendingItems.size
      && !Object.keys(pendingGlobal).length
      && !hasSidebarDays
      && !hasArchiveDays
    ) {
      return
    }

    const payload = {}
    if (Object.keys(pendingGlobal).length) payload.global = { ...pendingGlobal }
    if (pendingItems.size) payload.items = Array.from(pendingItems.values())
    if (hasSidebarDays) payload.sidebar_activity_days = pendingSidebarActivityDays
    if (hasArchiveDays) payload.auto_archive_days = pendingAutoArchiveDays

    const savedSidebarDays = pendingSidebarActivityDays
    const savedArchiveDays = pendingAutoArchiveDays
    pendingItems = new Map()
    pendingGlobal = {}
    pendingSidebarActivityDays = null
    pendingAutoArchiveDays = null

    saving.value = true
    try {
      const resp = await notificationsApi.patchPreferences(payload)
      if (savedSidebarDays != null) {
        const days = clampSidebarActivityDays(
          resp?.data?.sidebar_activity_days ?? savedSidebarDays,
        )
        sidebarActivityDays.value = days
        applyInboxSidebarActivityDays(days, { reload: true })
      }
      if (savedArchiveDays != null) {
        autoArchiveDays.value = clampAutoArchiveDays(
          resp?.data?.auto_archive_days ?? savedArchiveDays,
        )
      }
    } catch {
      if (typeof onSaveError === 'function') onSaveError()
      await load()
    } finally {
      saving.value = false
    }
  }

  function applyLocalEventState(sourceModule, eventKey, channel, enabled) {
    const section = sections.value.find((s) => s.module === sourceModule)
    if (!section) return
    for (const category of section.categories || []) {
      const event = (category.events || []).find((e) => e.event_key === eventKey)
      if (event?.channels?.[channel]) {
        event.channels[channel].enabled = enabled
        return
      }
    }
  }

  function toggleEvent(sourceModule, eventKey, channel, enabled) {
    const section = sections.value.find((item) => item.module === sourceModule)
    const locked = (section?.categories || []).some((category) => (
      (category.events || []).some((event) => (
        event.event_key === eventKey && event.channels?.[channel]?.locked
      ))
    ))
    if (locked) return
    applyLocalEventState(sourceModule, eventKey, channel, enabled)
    pendingItems.set(`${sourceModule}|${eventKey}|${channel}`, {
      source_module: sourceModule,
      event_key: eventKey,
      channel,
      enabled,
    })
    scheduleSave()
  }

  function toggleGlobal(channel, enabled) {
    globalSwitches.value = { ...globalSwitches.value, [channel]: enabled }
    pendingGlobal[channel] = enabled
    scheduleSave()
  }

  function setSidebarActivityDays(value) {
    const days = clampSidebarActivityDays(value)
    if (days === sidebarActivityDays.value && pendingSidebarActivityDays == null) return
    sidebarActivityDays.value = days
    pendingSidebarActivityDays = days
    scheduleSave()
  }

  function setAutoArchiveDays(value) {
    const days = clampAutoArchiveDays(value)
    if (days === autoArchiveDays.value && pendingAutoArchiveDays == null) return
    autoArchiveDays.value = days
    pendingAutoArchiveDays = days
    scheduleSave()
  }

  function setSaveErrorHandler(handler) {
    onSaveError = handler
  }

  return {
    loading,
    saving,
    loadError,
    globalSwitches,
    sections,
    sidebarActivityDays,
    autoArchiveDays,
    hasSections,
    load,
    toggleEvent,
    toggleGlobal,
    setSidebarActivityDays,
    setAutoArchiveDays,
    setSaveErrorHandler,
  }
}
