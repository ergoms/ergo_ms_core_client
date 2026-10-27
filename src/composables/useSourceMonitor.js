import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { apiClient } from '@/js/api/manager'
import { logError } from '@/js/utils/logError.js'
import { tGlobal } from '@/i18n/index.js'
import { getRealtimeClient } from '@/js/realtime/RealtimeClient.js'

const EVENT = 'parser_monitor_snapshot'
const FALLBACK_MS = 20000
const CONFIRM_MS = 45000

/**
 * Общий каркас экрана мониторинга источников.
 *
 * @param {object} options
 * @param {string} options.snapshotUrl
 * @param {string} options.controlUrl
 * @param {string} [options.historyUrl]
 * @param {string} options.topic — тема RealtimeHub модуля
 * @param {string} [options.i18nPrefix] — префикс ключей модуля (…monitor.start)
 * @param {string} [options.errorContext]
 * @param {(error: unknown) => string} [options.mapLoadError]
 * @param {string[]} [options.extraActions] — действия кроме start/stop (например snapshot)
 */
export function useSourceMonitor(options) {
  const {
    snapshotUrl,
    controlUrl,
    historyUrl = '',
    topic,
    i18nPrefix = 'sourceMonitor',
    errorContext = 'source_monitor',
    mapLoadError = null,
    extraActions = [],
  } = options

  const { t, te, locale } = useAppI18n()

  function monitorText(key) {
    const full = `${i18nPrefix}.${key}`
    if (typeof te === 'function' && te(full)) {
      return t(full)
    }
    const core = `sourceMonitor.${key}`
    if (typeof te === 'function' && te(core)) {
      return t(core)
    }
    return t(full)
  }
  const loading = ref(true)
  const loadError = ref('')
  const busyIds = ref({})
  const notices = ref({})
  const snapshot = ref(null)
  const history = ref({})
  const range = ref('1h')
  let timer = 0
  let offEvent = null
  let confirmTimers = {}
  let lastPushAt = 0

  const sources = computed(() => snapshot.value?.sources || [])
  const language = computed(() => (typeof locale === 'string' ? locale : locale?.value) || 'ru')

  function applySnapshot(payload) {
    if (!payload || !Array.isArray(payload.sources)) {
      return
    }
    snapshot.value = payload
    resolvePendingFromSnapshot(payload)
  }

  function clearConfirm(sourceId) {
    if (confirmTimers[sourceId]) {
      window.clearTimeout(confirmTimers[sourceId])
      delete confirmTimers[sourceId]
    }
  }

  function finishPending(sourceId) {
    clearConfirm(sourceId)
    if (!busyIds.value[sourceId]) {
      return
    }
    const next = { ...busyIds.value }
    delete next[sourceId]
    busyIds.value = next
  }

  function resolvePendingFromSnapshot(payload) {
    const pending = busyIds.value
    const keys = Object.keys(pending)
    if (!keys.length) {
      return
    }
    const byId = Object.fromEntries(
      (payload.sources || []).map((row) => [row.id, row]),
    )
    for (const sourceId of keys) {
      const action = pending[sourceId]
      const row = byId[sourceId]
      if (!row) {
        continue
      }
      if (action === 'start' && (row.status === 'running' || row.status === 'paused')) {
        finishPending(sourceId)
      } else if (action === 'stop' && row.status !== 'running' && row.status !== 'paused') {
        finishPending(sourceId)
      } else if (extraActions.includes(action)) {
        finishPending(sourceId)
      }
    }
  }

  async function loadSnapshot() {
    const response = await apiClient.get(snapshotUrl)
    applySnapshot(response?.data)
  }

  async function loadHistory(sourceId) {
    if (!historyUrl || !sourceId || range.value === '1h') {
      return
    }
    const response = await apiClient.get(historyUrl, {
      source: sourceId,
      range: range.value,
    })
    const body = response?.data
    if (body && body.source) {
      history.value = { ...history.value, [body.source]: body }
    }
  }

  function reportError(context, error) {
    if (mapLoadError) {
      const text = mapLoadError(error)
      if (text) {
        loadError.value = text
        return
      }
    }
    logError(context, error)
    loadError.value = tGlobal('sourceMonitor.loadFailed')
  }

  async function refresh() {
    try {
      await loadSnapshot()
      loadError.value = ''
    } catch (error) {
      reportError(errorContext, error)
    } finally {
      loading.value = false
    }
  }

  function putNotice(sourceId, text, ok) {
    notices.value = { ...notices.value, [sourceId]: { text, ok } }
  }

  async function control(sourceId, action) {
    if (busyIds.value[sourceId]) {
      return
    }
    busyIds.value = { ...busyIds.value, [sourceId]: action }
    const pendingText = action === 'stop'
      ? monitorText('stopping')
      : action === 'start'
        ? monitorText('starting')
        : monitorText('working')
    putNotice(sourceId, pendingText, null)
    clearConfirm(sourceId)
    confirmTimers[sourceId] = window.setTimeout(() => {
      finishPending(sourceId)
    }, CONFIRM_MS)
    try {
      const response = await apiClient.post(controlUrl, {
        source: sourceId,
        action,
      })
      const ok = response?.data?.ok !== false
      const message = response?.data?.message || monitorText('controlFailed')
      putNotice(sourceId, message, ok)
      if (!ok) {
        finishPending(sourceId)
      }
      loadSnapshot().catch((error) => reportError(errorContext, error))
    } catch (error) {
      reportError(`${errorContext}.control`, error)
      putNotice(sourceId, monitorText('controlFailed'), false)
      finishPending(sourceId)
    }
  }

  function watchHistory(activeId) {
    watch([activeId, range], () => {
      const id = activeId?.value
      if (id && range.value !== '1h') {
        loadHistory(id).catch((error) => reportError(errorContext, error))
      }
    })
  }

  function seriesFor(source) {
    if (range.value === '1h') {
      return source?.series || []
    }
    const stored = history.value[source?.id]
    if (stored && stored.range === range.value) {
      return stored.points || []
    }
    return null
  }

  onMounted(async () => {
    const client = getRealtimeClient()
    client.ensureConnected()
    // Событие слушаем на всякий случай, но POST /realtime/subscriptions/
    // на оболочке сайта часто отвечает 403: тема модуля там не зарегистрирована.
    // Карточки обновляет опрос. subscribe здесь не вызываем — иначе apiClient
    // оболочки (общий чанк) пишет API Error в консоль.
    void topic
    offEvent = client.on(EVENT, (_event, envelope) => {
      applySnapshot(envelope?.payload)
      loading.value = false
      lastPushAt = Date.now()
    })
    await refresh()
    timer = window.setInterval(() => {
      if (lastPushAt && Date.now() - lastPushAt < FALLBACK_MS) {
        return
      }
      refresh()
    }, FALLBACK_MS)
  })

  onUnmounted(() => {
    if (timer) {
      window.clearInterval(timer)
    }
    for (const sourceId of Object.keys(confirmTimers)) {
      clearConfirm(sourceId)
    }
    offEvent?.()
  })

  return {
    t,
    language,
    loading,
    loadError,
    busyIds,
    notices,
    sources,
    range,
    refresh,
    loadHistory,
    watchHistory,
    control,
    seriesFor,
  }
}
