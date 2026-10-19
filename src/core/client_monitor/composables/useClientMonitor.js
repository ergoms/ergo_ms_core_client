import { ref, computed, watch } from 'vue'
import {
  useRouteQueryState,
  filtersObjectFromState,
  filtersObjectToPatch,
} from '@/composables/useRouteQueryState.js'
import { apiClient } from '@/js/api/manager.js'
import { logError } from '@/js/utils/logError.js'
import { useToast } from '@/js/utils/toast.js'
import { copyTextToClipboard } from '@/js/utils/clipboard.js'
import { tGlobal } from '@/i18n/index.js'
import { clientMonitorEndpoints as ep } from '@/core/client_monitor/js/endpoints.js'

export const CLIENT_MONITOR_FILTER_MAP = {
  has_errors: 'hasErrors',
  date_from: 'dateFrom',
  date_to: 'dateTo',
}

export function getClientMonitorColumns() {
  return [
    {
      key: 'last_event_at',
      label: tGlobal('admin.clientMonitor.lastEvent'),
      headerStyle: { whiteSpace: 'nowrap' },
    },
    { key: 'user_label', label: tGlobal('admin.clientMonitor.user') },
    {
      key: 'has_errors',
      label: tGlobal('admin.clientMonitor.errors'),
      headerStyle: { textAlign: 'center' },
      cellStyle: { textAlign: 'center' },
      hideBelow: 'md',
    },
    {
      key: 'event_count',
      label: tGlobal('admin.clientMonitor.events'),
      hideBelow: 'md',
    },
    {
      key: 'client_version',
      label: tGlobal('admin.clientMonitor.version'),
      hideBelow: 'lg',
    },
    {
      key: 'actions',
      label: '',
      headerStyle: { textAlign: 'right' },
      cellStyle: { textAlign: 'right' },
    },
  ]
}

function resolveFilterDisplayValue(field, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return ''
  if (field.type === 'date') return String(rawValue)
  if (field.type === 'select') {
    const valueKey = field.valueKey || 'value'
    const labelKey = field.labelKey || 'label'
    const found = (field.options || []).find((opt) => {
      const value = typeof opt === 'object' && opt !== null ? opt[valueKey] : opt
      return String(value) === String(rawValue)
    })
    if (found && typeof found === 'object') return found[labelKey] ?? String(rawValue)
    if (found != null) return String(found)
    return String(rawValue)
  }
  return String(rawValue)
}

/**
 * @param {object} [options]
 * @param {boolean} [options.syncRouteQuery=true]
 */
export function useClientMonitor(options = {}) {
  const toast = useToast()
  const syncRouteQuery = options.syncRouteQuery !== false

  const isLoading = ref(false)
  const isRefreshing = ref(false)
  const isQueryWatchReady = ref(false)
  const isReady = ref(false)

  const sessions = ref([])
  const totalSessions = ref(0)
  const pageSize = ref(50)

  const selectedSession = ref(null)
  const showDetailsModal = ref(false)
  const events = ref([])
  const intervals = ref([])
  const eventsLoading = ref(false)
  const eventsPage = ref(1)
  const eventsTotal = ref(0)
  const eventsHasNext = ref(false)
  const eventsPageSize = 100

  const routeQuery = syncRouteQuery
    ? useRouteQueryState({
      q: { default: '' },
      page: { default: 1, type: 'number' },
      has_errors: { default: '', enum: ['', '1'] },
      date_from: { default: '' },
      date_to: { default: '' },
    }, { debounceKeys: ['q'], preserveKeys: ['tab'] })
    : null

  const localState = ref({
    q: '',
    page: 1,
    has_errors: '',
    date_from: '',
    date_to: '',
  })

  const listState = routeQuery?.state ?? localState

  const patchState = routeQuery?.patchState ?? ((patch) => {
    localState.value = { ...localState.value, ...patch }
    return Promise.resolve()
  })

  const watchState = routeQuery?.watchState ?? ((callback) => {
    watch(
      () => [
        localState.value.q,
        localState.value.page,
        localState.value.has_errors,
        localState.value.date_from,
        localState.value.date_to,
      ],
      () => callback(localState.value),
    )
  })

  const searchQuery = computed(() => listState.value.q)
  const currentPage = computed(() => listState.value.page)

  const monitorFilters = computed({
    get: () => filtersObjectFromState(listState.value, CLIENT_MONITOR_FILTER_MAP),
    set: (filters) => {
      patchState(filtersObjectToPatch(filters, CLIENT_MONITOR_FILTER_MAP), { immediate: true })
    },
  })

  const monitorFilterFields = computed(() => [
    { type: 'heading', label: tGlobal('admin.clientMonitor.filtersHeading') },
    {
      type: 'select',
      key: 'hasErrors',
      label: tGlobal('admin.clientMonitor.errorsFilter'),
      options: [
        { id: '', name: tGlobal('admin.clientMonitor.allSessions') },
        { id: '1', name: tGlobal('admin.clientMonitor.withErrors') },
      ],
      valueKey: 'id',
      labelKey: 'name',
      includeAllOption: false,
    },
    { type: 'heading', label: tGlobal('admin.clientMonitor.period') },
    { type: 'date', key: 'dateFrom', label: tGlobal('admin.clientMonitor.dateFrom') },
    { type: 'date', key: 'dateTo', label: tGlobal('admin.clientMonitor.dateTo') },
  ])

  const monitorFiltersTooltip = computed(() => {
    const parts = []
    for (const field of monitorFilterFields.value) {
      if (field.type === 'heading') continue
      const display = resolveFilterDisplayValue(field, monitorFilters.value[field.key])
      if (display) parts.push(display)
    }
    return parts.join(', ')
  })

  const getItemKey = (item) => item.public_id

  function buildListParams() {
    const params = {
      page: currentPage.value,
      page_size: pageSize.value,
    }
    if (searchQuery.value.trim()) {
      params.q = searchQuery.value.trim()
    }
    if (listState.value.has_errors === '1') {
      params.has_errors = 'true'
    }
    if (listState.value.date_from) {
      params.date_from = `${listState.value.date_from}T00:00:00`
    }
    if (listState.value.date_to) {
      params.date_to = `${listState.value.date_to}T23:59:59`
    }
    return params
  }

  async function loadSessions({ spinRefresh = false } = {}) {
    if (spinRefresh) isRefreshing.value = true
    isLoading.value = true
    try {
      const response = await apiClient.get(ep.clientMonitor.sessions, buildListParams())
      const data = response.data || {}
      sessions.value = data.results || []
      totalSessions.value = data.count || 0

      if (sessions.value.length === 0 && listState.value.page > 1) {
        await patchState({ page: 1 }, { immediate: true, silent: true })
        await loadSessions({ spinRefresh })
      }
    } catch (error) {
      logError(tGlobal('admin.clientMonitor.loadError'), error)
      toast.error(tGlobal('admin.clientMonitor.loadError'))
    } finally {
      isLoading.value = false
      isRefreshing.value = false
    }
  }

  async function openSession(session) {
    if (!session?.public_id) return
    showDetailsModal.value = true
    selectedSession.value = session
    events.value = []
    intervals.value = []
    eventsPage.value = 1
    try {
      const [detailResult] = await Promise.all([
        apiClient.get(ep.clientMonitor.session(session.public_id)),
        loadEvents(true),
        loadIntervals(),
      ])
      if (detailResult?.data) {
        selectedSession.value = detailResult.data
      }
    } catch (error) {
      logError(tGlobal('admin.clientMonitor.detailsLoadError'), error)
      toast.error(tGlobal('admin.clientMonitor.detailsLoadError'))
      closeSession()
    }
  }

  function closeSession() {
    showDetailsModal.value = false
    selectedSession.value = null
    events.value = []
    intervals.value = []
    eventsPage.value = 1
    eventsTotal.value = 0
    eventsHasNext.value = false
  }

  async function loadEvents(reset = false) {
    if (!selectedSession.value) {
      return
    }
    if (reset) {
      eventsPage.value = 1
      events.value = []
    }
    eventsLoading.value = true
    try {
      const response = await apiClient.get(
        ep.clientMonitor.events(selectedSession.value.public_id),
        { page: eventsPage.value, page_size: eventsPageSize },
      )
      const data = response.data || {}
      events.value = data.results || []
      eventsTotal.value = data.count || 0
      eventsHasNext.value = Boolean(data.has_next)
    } catch (error) {
      logError(tGlobal('admin.clientMonitor.eventsLoadError'), error)
      toast.error(tGlobal('admin.clientMonitor.eventsLoadError'))
    } finally {
      eventsLoading.value = false
    }
  }

  async function handleEventsPageChange(page) {
    const nextPage = Number(page)
    if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === eventsPage.value) {
      return
    }
    eventsPage.value = nextPage
    await loadEvents(false)
  }

  async function loadIntervals() {
    if (!selectedSession.value) {
      return
    }
    try {
      const response = await apiClient.get(
        ep.clientMonitor.intervals(selectedSession.value.public_id),
      )
      intervals.value = response.data?.results || []
    } catch (error) {
      logError(tGlobal('admin.clientMonitor.intervalsLoadError'), error)
      toast.error(tGlobal('admin.clientMonitor.intervalsLoadError'))
    }
  }

  async function copyDebugPack(params = {}) {
    if (!selectedSession.value) {
      return
    }
    try {
      const response = await apiClient.get(
        ep.clientMonitor.debugPack(selectedSession.value.public_id),
        params,
      )
      const markdown = response.data?.markdown
      if (!markdown) {
        toast.error(tGlobal('admin.clientMonitor.copyEmpty'))
        return
      }
      await copyTextToClipboard(markdown)
      toast.success(tGlobal('admin.clientMonitor.copySuccess'))
    } catch (error) {
      logError(tGlobal('admin.clientMonitor.copyError'), error)
      toast.error(tGlobal('admin.clientMonitor.copyError'))
    }
  }

  function refreshSessions() {
    void loadSessions({ spinRefresh: true })
  }

  function handleSearchQuery(query) {
    patchState({ q: query })
  }

  function handlePageChange(page) {
    const nextPage = Number(page)
    if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === listState.value.page) {
      return
    }
    patchState({ page: nextPage }, { immediate: true })
  }

  async function initialize() {
    await loadSessions()
    isReady.value = true
    isQueryWatchReady.value = true
  }

  watchState(() => {
    if (!isQueryWatchReady.value || !isReady.value) {
      return
    }
    void loadSessions()
  })

  return {
    isLoading,
    isRefreshing,
    sessions,
    totalSessions,
    pageSize,
    searchQuery,
    currentPage,
    monitorFilters,
    monitorFilterFields,
    monitorFiltersTooltip,
    selectedSession,
    showDetailsModal,
    events,
    intervals,
    eventsLoading,
    eventsPage,
    eventsTotal,
    eventsHasNext,
    eventsPageSize,
    getItemKey,
    initialize,
    openSession,
    closeSession,
    handleEventsPageChange,
    copyDebugPack,
    refreshSessions,
    handleSearchQuery,
    handlePageChange,
  }
}
