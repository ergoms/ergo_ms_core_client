import { ref, computed } from 'vue'
import { useToast } from '@/js/utils/toast.js'
import { logError } from '@/js/utils/logError.js'
import tokenService from '@/core/cms/js/tokenService'
import { connectNotificationsTransport } from '@/js/realtime/notificationsTransport.js'
import { isHttpPollingMode, isSseMode } from '@/js/realtime/config.js'
import { resetSyncNotificationCursor, setSyncLastNotificationId } from '@/js/realtime/syncPollingHub.js'
import { isRealtimeEnvelope } from '@/js/realtime/envelope.js'
import { playNotificationSound } from './notificationSound.js'
import { notificationsApi } from './notifications-api'

const HISTORY_PAGE_SIZE = 10
const SIDEBAR_PAGE_SIZE = 20
const SIDEBAR_ACTIVITY_DAYS_MIN = 1
const SIDEBAR_ACTIVITY_DAYS_MAX = 7
const SIDEBAR_ACTIVITY_DAYS_DEFAULT = 3
const MS_PER_DAY = 24 * 60 * 60 * 1000
const SIDEBAR_READ_GRACE_MS = 60 * 60 * 1000

const items = ref([])
const sidebarItems = ref([])
const unreadCount = ref(0)
const loading = ref(false)
const sidebarLoading = ref(false)
const listTotal = ref(0)
const sourceModules = ref([])
const listArchived = ref(false)
/** Окно прочитанных в колокольчике (дни), синхронизируется с preferences */
const sidebarActivityDays = ref(SIDEBAR_ACTIVITY_DAYS_DEFAULT)

let wsConnection = null
let intentionalClose = false
let initialized = false
let activityDaysLoaded = false
let listFilters = { is_read: null, source_module: '', q: '' }

const inboxListeners = new Set()

export function onInboxNotification(handler) {
  if (typeof handler !== 'function') return () => {}
  inboxListeners.add(handler)
  return () => inboxListeners.delete(handler)
}

function emitInboxNotification(notification) {
  if (!notification) return
  for (const handler of inboxListeners) {
    try {
      handler(notification)
    } catch {
      /* слушатель страницы не должен ломать inbox */
    }
  }
}

function clampSidebarActivityDays(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return SIDEBAR_ACTIVITY_DAYS_DEFAULT
  return Math.min(
    SIDEBAR_ACTIVITY_DAYS_MAX,
    Math.max(SIDEBAR_ACTIVITY_DAYS_MIN, Math.round(n)),
  )
}

function matchesSidebarFilter(notification) {
  if (notification?.sidebar_hidden_at) return false
  if (notification?.archived_at || notification?.deleted_at) return false
  if (!notification?.is_read) return true

  const readAt = notification.read_at ? new Date(notification.read_at).getTime() : NaN
  if (Number.isFinite(readAt) && Date.now() - readAt <= SIDEBAR_READ_GRACE_MS) return true

  const createdAt = notification.created_at ? new Date(notification.created_at).getTime() : NaN
  if (!Number.isFinite(createdAt)) return false
  const windowMs = clampSidebarActivityDays(sidebarActivityDays.value) * MS_PER_DAY
  return Date.now() - createdAt <= windowMs
}

/**
 * Обновить окно колокольчика; при reload=true перезагрузить список sidebar.
 */
export function setSidebarActivityDays(days, { reload = false } = {}) {
  sidebarActivityDays.value = clampSidebarActivityDays(days)
  activityDaysLoaded = true
  if (reload) {
    return loadSidebar()
  }
  return Promise.resolve()
}

function applyReadState(notification, readAt) {
  notification.is_read = true
  notification.read_at = readAt
}

function findNotification(id) {
  return items.value.find((n) => n.id === id) || sidebarItems.value.find((n) => n.id === id)
}

function syncUnreadFromResponse(data) {
  if (typeof data?.unread_count === 'number') {
    unreadCount.value = data.unread_count
  }
}

function removeFromLists(id) {
  items.value = items.value.filter((n) => n.id !== id)
  sidebarItems.value = sidebarItems.value.filter((n) => n.id !== id)
}

function maxKnownNotificationId() {
  const fromItems = items.value.reduce((max, item) => Math.max(max, item?.id ?? 0), 0)
  const fromSidebar = sidebarItems.value.reduce((max, item) => Math.max(max, item?.id ?? 0), 0)
  return Math.max(fromItems, fromSidebar)
}

function syncPollingCursorFromItems() {
  if (!(isHttpPollingMode() || isSseMode())) {
    return
  }
  const maxId = maxKnownNotificationId()
  if (maxId > 0) {
    setSyncLastNotificationId(maxId)
  }
}

function openSocket() {
  if (!tokenService.getAccess()) return

  if (wsConnection && !intentionalClose) return

  intentionalClose = false
  wsConnection?.close()

  wsConnection = connectNotificationsTransport({
    onAuthenticated: () => {
      syncPollingCursorFromItems()
    },
    onMessage: handleSocketMessage,
    onPollMeta: ({ unreadCount: polledCount }) => {
      if (typeof polledCount === 'number') {
        unreadCount.value = polledCount
      }
    },
    onClose: (_event, wasIntentional) => {
      if (wasIntentional || intentionalClose) {
        wsConnection = null
      }
    },
  })
}

function parseListResponse(listResp) {
  const payload = listResp?.data
  if (Array.isArray(payload)) {
    return { list: payload, total: payload.length, next: null }
  }
  const list = payload?.results ?? []
  return {
    list: Array.isArray(list) ? list : [],
    total: Number(payload?.count ?? list.length),
    next: payload?.next || null,
  }
}

function buildListParams(page = 1) {
  const pageNum = Math.max(1, Number(page) || 1)
  const offset = (pageNum - 1) * HISTORY_PAGE_SIZE
  const params = {
    limit: HISTORY_PAGE_SIZE,
    offset,
  }
  if (listFilters.is_read === false) params.is_read = 'false'
  if (listFilters.source_module) params.source_module = listFilters.source_module
  if (listFilters.q) params.q = listFilters.q
  if (listArchived.value) params.archived = '1'
  return { params, pageNum }
}

async function loadPage(page = 1, filters = {}) {
  if (loading.value) return
  loading.value = true
  listFilters = {
    is_read: filters.is_read ?? listFilters.is_read ?? null,
    source_module: filters.source_module ?? listFilters.source_module ?? '',
    q: Object.prototype.hasOwnProperty.call(filters, 'q')
      ? String(filters.q || '').trim()
      : (listFilters.q || ''),
  }
  if (Object.prototype.hasOwnProperty.call(filters, 'archived')) {
    listArchived.value = Boolean(filters.archived)
  }
  const { params, pageNum } = buildListParams(page)
  try {
    const [listResp, countResp, modulesResp] = await Promise.all([
      notificationsApi.list(params),
      notificationsApi.unreadCount(),
      notificationsApi.sourceModules().catch(() => null),
    ])
    const { list, total } = parseListResponse(listResp)
    items.value = list
    listTotal.value = total
    unreadCount.value = Number(countResp?.data?.count ?? 0)
    if (modulesResp?.data?.results) {
      sourceModules.value = modulesResp.data.results
    }
    syncPollingCursorFromItems()
    return pageNum
  } catch {
    items.value = []
    listTotal.value = 0
    unreadCount.value = 0
    return pageNum
  } finally {
    loading.value = false
  }
}

async function loadSidebarActivityDays({ force = false } = {}) {
  if (activityDaysLoaded && !force) return
  try {
    const response = await notificationsApi.getPreferences()
    const days = clampSidebarActivityDays(
      response?.data?.sidebar_activity_days ?? SIDEBAR_ACTIVITY_DAYS_DEFAULT,
    )
    sidebarActivityDays.value = days
    activityDaysLoaded = true
  } catch {
    /* оставляем текущее / default */
  }
}

async function loadSidebar() {
  if (sidebarLoading.value) return
  sidebarLoading.value = true
  try {
    const [, listResp] = await Promise.all([
      loadSidebarActivityDays(),
      notificationsApi.list({
        limit: SIDEBAR_PAGE_SIZE,
        offset: 0,
        inbox: 'sidebar',
      }),
    ])
    const { list } = parseListResponse(listResp)
    sidebarItems.value = list
    syncPollingCursorFromItems()
  } catch {
    sidebarItems.value = []
  } finally {
    sidebarLoading.value = false
  }
}

function applyNotificationUpdate(notification) {
  if (!notification?.id) return
  const inItems = items.value.find((n) => n.id === notification.id)
  const inSidebar = sidebarItems.value.find((n) => n.id === notification.id)
  if (inItems) Object.assign(inItems, notification)
  if (inSidebar) Object.assign(inSidebar, notification)
}

async function executeAction(id, actionId) {
  try {
    const resp = await notificationsApi.executeAction(id, actionId)
    const data = resp?.data ?? resp
    const envelope = data?.envelope
    if (data?.success && isRealtimeEnvelope(envelope)) {
      applyNotificationUpdate(envelope.payload)
      syncUnreadFromResponse(data)
    }
    return data
  } catch (e) {
    logError('executeAction:', e)
    return { success: false }
  }
}

export async function executeNotificationAction(id, actionId) {
  return executeAction(id, actionId)
}

async function markRead(id) {
  const target = findNotification(id)
  if (!target || target.is_read) return
  try {
    const resp = await notificationsApi.markRead(id)
    const data = resp?.data ?? resp
    if (data?.success || resp?.success) {
      const readAt = new Date().toISOString()
      const inItems = items.value.find((n) => n.id === id)
      const inSidebar = sidebarItems.value.find((n) => n.id === id)
      if (inItems) applyReadState(inItems, readAt)
      if (inSidebar) applyReadState(inSidebar, readAt)
      if (typeof data?.unread_count === 'number') {
        unreadCount.value = data.unread_count
      } else if (unreadCount.value > 0) {
        unreadCount.value -= 1
      }
    }
  } catch { /* отображение ошибки — на стороне UI при необходимости */ }
}

async function markAllRead(options = {}) {
  try {
    const payload = {}
    if (options.source_module) payload.source_module = options.source_module
    const resp = await notificationsApi.markAllRead(payload)
    const data = resp?.data ?? resp
    if (data?.success || resp?.success) {
      const now = new Date().toISOString()
      const source = options.source_module || ''
      const markList = (list) => {
        list.forEach((n) => {
          if (n.is_read) return
          if (source && n.source_module !== source) return
          applyReadState(n, now)
        })
      }
      markList(items.value)
      markList(sidebarItems.value)
      if (typeof data?.unread_count === 'number') {
        unreadCount.value = data.unread_count
      } else if (!source) {
        unreadCount.value = 0
      }
    }
  } catch { /* игнор */ }
}

async function archive(id) {
  try {
    const resp = await notificationsApi.archive(id)
    const data = resp?.data ?? resp
    if (data?.success || resp?.success) {
      syncUnreadFromResponse(data)
      if (!listArchived.value) {
        removeFromLists(id)
      } else if (data.notification) {
        applyNotificationUpdate(data.notification)
      }
      return true
    }
  } catch (e) {
    logError('archive notification:', e)
  }
  return false
}

function reinsertIntoInbox(notification) {
  if (!notification?.id) return
  const inItems = items.value.find((n) => n.id === notification.id)
  if (inItems) {
    Object.assign(inItems, notification)
  } else {
    items.value.unshift(notification)
  }

  const inSidebar = sidebarItems.value.find((n) => n.id === notification.id)
  if (matchesSidebarFilter(notification)) {
    if (inSidebar) {
      Object.assign(inSidebar, notification)
    } else {
      sidebarItems.value.unshift(notification)
      if (sidebarItems.value.length > SIDEBAR_PAGE_SIZE) {
        sidebarItems.value = sidebarItems.value.slice(0, SIDEBAR_PAGE_SIZE)
      }
    }
  } else if (inSidebar) {
    sidebarItems.value = sidebarItems.value.filter((n) => n.id !== notification.id)
  }
}

async function unarchive(id) {
  try {
    const resp = await notificationsApi.unarchive(id)
    const data = resp?.data ?? resp
    if (data?.success || resp?.success) {
      syncUnreadFromResponse(data)
      if (listArchived.value) {
        removeFromLists(id)
      } else if (data.notification) {
        reinsertIntoInbox(data.notification)
      }
      return true
    }
  } catch (e) {
    logError('unarchive notification:', e)
  }
  return false
}

async function hideFromSidebar(id) {
  try {
    const resp = await notificationsApi.hideFromSidebar(id)
    const data = resp?.data ?? resp
    if (data?.success || resp?.success) {
      syncUnreadFromResponse(data)
      sidebarItems.value = sidebarItems.value.filter((n) => n.id !== id)
      if (data.notification) applyNotificationUpdate(data.notification)
      return true
    }
  } catch (e) {
    logError('hideFromSidebar:', e)
  }
  return false
}

const TOAST_METHOD_BY_LEVEL = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
}

function showIncomingToast(notification) {
  try {
    const toast = useToast()
    const method = TOAST_METHOD_BY_LEVEL[notification.level] || 'info'
    toast[method](notification.title, {
      timeout: 6000,
      id: `inbox:${notification.id}`,
    })
    playNotificationSound()
  } catch { /* toast — best effort, инбокс уже обновлён */ }
}

function handleSocketMessage(_event, data) {
  if (!isRealtimeEnvelope(data)) {
    return
  }
  if (data.type === 'workspace_signal') {
    emitInboxNotification(data.payload || {})
    return
  }
  if (data.type === 'notification_revoked') {
    const id = data.payload?.id
    if (id != null) {
      const wasUnread = Boolean(
        items.value.find((n) => n.id === id && !n.is_read)
        || sidebarItems.value.find((n) => n.id === id && !n.is_read),
      )
      removeFromLists(id)
      if (wasUnread && unreadCount.value > 0) {
        unreadCount.value -= 1
      }
    }
    return
  }
  if (data.type === 'notification_new' || data.type === 'notification_updated') {
    applyIncomingNotification(data.payload)
  }
}

function applyIncomingNotification(notification) {
  if (!notification?.id) {
    return
  }
  if (notification.deleted_at) {
    removeFromLists(notification.id)
    return
  }
  const existsInItems = items.value.find((n) => n.id === notification.id)
  if (existsInItems) {
    const wasUnread = !existsInItems.is_read
    Object.assign(existsInItems, notification)
    if (wasUnread && notification.is_read && unreadCount.value > 0) {
      unreadCount.value -= 1
    }
    if (notification.archived_at && !listArchived.value) {
      items.value = items.value.filter((n) => n.id !== notification.id)
    }
  } else if (!notification.archived_at && !listArchived.value) {
    items.value.unshift(notification)
    if (!notification.is_read) unreadCount.value += 1
    showIncomingToast(notification)
    emitInboxNotification(notification)
  } else if (notification.archived_at && listArchived.value) {
    items.value.unshift(notification)
  }

  const existsInSidebar = sidebarItems.value.find((n) => n.id === notification.id)
  if (existsInSidebar) {
    if (!matchesSidebarFilter(notification)) {
      sidebarItems.value = sidebarItems.value.filter((n) => n.id !== notification.id)
    } else {
      Object.assign(existsInSidebar, notification)
    }
  } else if (matchesSidebarFilter(notification)) {
    sidebarItems.value.unshift(notification)
    if (sidebarItems.value.length > SIDEBAR_PAGE_SIZE) {
      sidebarItems.value = sidebarItems.value.slice(0, SIDEBAR_PAGE_SIZE)
    }
  }
  wsConnection?.setLastNotificationId?.(notification.id)
}

function disconnect() {
  intentionalClose = true
  wsConnection?.close()
  wsConnection = null
}

async function ensureInitialized(options = {}) {
  if (initialized) return
  if (!tokenService.getAccess()) {
    return
  }
  initialized = true
  if (!options.skipLoad) {
    await loadPage(1)
  } else {
    try {
      const countResp = await notificationsApi.unreadCount()
      unreadCount.value = Number(countResp?.data?.count ?? 0)
    } catch {
      unreadCount.value = 0
    }
  }
  openSocket()
}

/** Сброс inbox и транспорта (logout / смена сессии). */
export function resetNotificationsInbox() {
  disconnect()
  resetSyncNotificationCursor()
  items.value = []
  sidebarItems.value = []
  unreadCount.value = 0
  listTotal.value = 0
  sourceModules.value = []
  listArchived.value = false
  listFilters = { is_read: null, source_module: '', q: '' }
  sidebarActivityDays.value = SIDEBAR_ACTIVITY_DAYS_DEFAULT
  activityDaysLoaded = false
  initialized = false
  loading.value = false
  sidebarLoading.value = false
}

export function useNotificationsInbox() {
  return {
    items,
    sidebarItems,
    unreadCount,
    loading,
    sidebarLoading,
    listTotal,
    sourceModules,
    listArchived,
    sidebarActivityDays,
    hasUnread: computed(() => unreadCount.value > 0),
    listPageSize: HISTORY_PAGE_SIZE,
    ensureInitialized,
    loadPage,
    loadSidebar,
    setSidebarActivityDays,
    markRead,
    markAllRead,
    archive,
    unarchive,
    hideFromSidebar,
  }
}