<script setup>
import { onMounted, onBeforeUnmount, provide, ref, watch, nextTick, computed } from 'vue'
import { ChevronLeft, Minus } from '@lucide/vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/core/cms/js/userStore.js'
import { useToast } from '@/js/utils/toast.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { resolveMenuSeparatorTitle } from '@/i18n/resolveMenuItemTitle.js'

import SiteWordmark from '@/components/SiteWordmark.vue'
import { resolveSidebarBrand } from '@/integrations/sidebarBrand.js'

import {
  getUserMenu,
  peekCachedMenu,
  isMenuCacheFresh,
  transformMenuData,
  filterMenuSectionsForSessionScope,
  transformSeparators,
  shouldShowSeparatorAt,
  getSeparatorTextAt
} from '@/core/cms/js/menuService.js'

import MenuGroup from '@/components/menu/MenuGroup.vue'
import MenuToolbar from '@/components/menu/MenuToolbar.vue'
import MenuPeekLabel from '@/components/menu/MenuPeekLabel.vue'

import { useMenuWidth } from './composables/useMenuWidth'
import { useMenuNavigation } from './composables/useMenuNavigation'
import { useMenuIconSizes, MENU_ICON_SIZES_KEY } from './composables/useMenuIconSizes'
import { MENU_PEEK_STATE_KEY } from './composables/useMenuPeekState.js'
import { safeNavigateByName } from './composables/safeMenuNavigate.js'
import {
  getContentLayoutPadding,
  getMenuRightEdgeTarget,
  measureMenuRightEdge,
} from './composables/menuLayoutMeasure.js'
import {
  readMenuCollapsedPreference,
  writeMenuCollapsedPreference,
} from './composables/useMenuCollapsedPreference.js'
import { isOffcanvasSidebarOpen, openOffcanvasSidebar } from '@/js/useOffcanvasSidebarStore.js'
import { SHELL_DESKTOP_MIN } from '@/composables/useBreakpoint.js'
import tokenService from '@/core/cms/js/tokenService.js'
import { whenSessionReady } from '@/js/sessionReady.js'

const props = defineProps({
  isVisible: Boolean,
})

const emit = defineEmits(['left-padding', 'menu-right-edge', 'menu-state-change', 'layout-sync-transition'])

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const toast = useToast()
const { t, locale } = useAppI18n()

// Состояние меню
const isCollapsed = ref(readMenuCollapsedPreference())
const isHovering = ref(!isCollapsed.value)
const showMenuLabels = computed(() => !isCollapsed.value || isHovering.value)
// Подписи скрываем сразу при сворачивании (без peek-текста во время анимации ширины)
const isCollapsedLabelsHidden = computed(() =>
  isCollapsed.value && !isHovering.value,
)
// Центрирование иконок — только после окончания анимации ширины
const isCollapsedSettled = computed(() =>
  isCollapsed.value && !isHovering.value && !isLayoutTransitionActive.value,
)
const showCompactWordmark = computed(() => {
  if (isWordmarkHiding.value) {
    return false
  }
  return isCollapsed.value && !showMenuLabels.value
})

const activeSidebarBrand = computed(() =>
  resolveSidebarBrand({
    route,
    compact: showCompactWordmark.value,
  }),
)

const sidebarBrandTo = computed(() =>
  activeSidebarBrand.value?.to ?? { name: 'AppHome' },
)

const sidebarBrandMeasureText = computed(() =>
  activeSidebarBrand.value?.measureText || null,
)

const isToolbarDropdownActive = ref(false)
const menuSections = ref([])
let emptyMenuWarned = false
const isMenuReady = ref(false)
const allowMenuTransitions = ref(false)
const isLayoutTransitionActive = ref(false)
const isVisibilityTransitionActive = ref(false)
const isWordmarkHiding = ref(false)
const menuRef = ref(null)
const menuScrollRef = ref(null)
const isMenuScrolled = ref(false)

function onMenuScroll() {
  const el = menuScrollRef.value
  isMenuScrolled.value = Boolean(el && el.scrollTop > 0)
}

function syncMenuScrollShadow() {
  onMenuScroll()
}

function onWindowResize() {
  updateWidth()
  scheduleLayoutOffsetSync()
}

let layoutSyncFrame = null
let layoutSyncTimeout = null
let layoutTransitionTimer = null
let pendingAfterLayoutTransition = null
let lastContentPadding = null

const MENU_TRANSITION_MS = 300
const MENU_LAYOUT_SYNC_DELAY_MS = MENU_TRANSITION_MS + 20
const WORDMARK_ANIMATION_MS = MENU_TRANSITION_MS

let wordmarkHideTimer = null

function clearWordmarkHideTimer() {
  if (wordmarkHideTimer) {
    clearTimeout(wordmarkHideTimer)
    wordmarkHideTimer = null
  }
}

function cancelWordmarkHide() {
  clearWordmarkHideTimer()
  isWordmarkHiding.value = false
}

function startWordmarkHide() {
  clearWordmarkHideTimer()
  isWordmarkHiding.value = true
  wordmarkHideTimer = setTimeout(() => {
    isWordmarkHiding.value = false
    wordmarkHideTimer = null
  }, WORDMARK_ANIMATION_MS)
}

function resolveContentLayoutPadding() {
  return getContentLayoutPadding(isCollapsed.value, menuWidth.value)
}

function resolveMenuRightEdgeTarget() {
  return getMenuRightEdgeTarget(isCollapsed.value, isHovering.value, menuWidth.value)
}

function emitLeftPadding(value) {
  if (value === lastContentPadding) {
    return
  }
  lastContentPadding = value
  emit('left-padding', value)
}

function emitLayoutTargets() {
  emitLeftPadding(resolveContentLayoutPadding())
  emit('menu-right-edge', resolveMenuRightEdgeTarget())
}

function clearLayoutTransitionTimer() {
  if (layoutTransitionTimer) {
    clearTimeout(layoutTransitionTimer)
    layoutTransitionTimer = null
  }
}

function finishLayoutTransition() {
  if (!isLayoutTransitionActive.value) {
    return
  }

  isLayoutTransitionActive.value = false
  isVisibilityTransitionActive.value = false
  emit('layout-sync-transition', false)
  clearLayoutTransitionTimer()

  const callback = pendingAfterLayoutTransition
  pendingAfterLayoutTransition = null

  syncLayoutOffset()
  callback?.()
}

function beginLayoutTransition({ visibility = false, afterComplete = null } = {}) {
  isLayoutTransitionActive.value = true
  emit('layout-sync-transition', true)
  if (visibility) {
    isVisibilityTransitionActive.value = true
  }
  if (afterComplete) {
    pendingAfterLayoutTransition = afterComplete
  }

  clearLayoutTransitionTimer()
  emitLayoutTargets()
  layoutTransitionTimer = setTimeout(finishLayoutTransition, MENU_LAYOUT_SYNC_DELAY_MS)
}

function onMenuTransitionEnd(event) {
  if (event.target !== menuRef.value) {
    return
  }

  const { propertyName } = event
  if (propertyName !== 'transform' && propertyName !== 'inline-size' && propertyName !== 'width') {
    return
  }

  finishLayoutTransition()
}

function syncLayoutOffset() {
  if (layoutSyncFrame) {
    cancelAnimationFrame(layoutSyncFrame)
  }

  layoutSyncFrame = requestAnimationFrame(() => {
    layoutSyncFrame = null

    const contentPadding = resolveContentLayoutPadding()
    const menuRight = measureMenuRightEdge(menuRef.value)
    emit('menu-right-edge', menuRight ?? resolveMenuRightEdgeTarget())
    emitLeftPadding(contentPadding)
  })
}

function scheduleLayoutOffsetSync(delay = 0) {
  if (isLayoutTransitionActive.value && delay === 0) {
    return
  }

  if (layoutSyncTimeout) {
    clearTimeout(layoutSyncTimeout)
    layoutSyncTimeout = null
  }

  if (delay > 0) {
    layoutSyncTimeout = setTimeout(syncLayoutOffset, delay)
    return
  }

  syncLayoutOffset()
}

async function syncMenuRightEdgeWithTransition({ updateContentPadding = false } = {}) {
  await nextTick()

  if (isCollapsed.value && !updateContentPadding) {
    emit('menu-right-edge', resolveMenuRightEdgeTarget())
    return
  }

  beginLayoutTransition()
}

function handleMenuMetricsChange(collapsed, width) {
  emit('menu-state-change', collapsed, width)
  if (isCollapsed.value || isLayoutTransitionActive.value) {
    return
  }
  scheduleLayoutOffsetSync()
}

// Конфигурация разделителей из API
const separatorsConfig = ref({ byOrderIndex: {} })

const getSeparator = (index) => {
  void locale.value
  return resolveMenuSeparatorTitle(getSeparatorTextAt(index, separatorsConfig.value))
}
const shouldShowSeparator = (index) => shouldShowSeparatorAt(index, separatorsConfig.value)

// Composables
const {
  menuWidth,
  updateMenuWidth,
  initializeMenuWidth,
  setupWidthTracking
} = useMenuWidth()

const { menuIconSizes } = useMenuIconSizes()
provide(MENU_ICON_SIZES_KEY, menuIconSizes)

const menuPeekState = computed(() => ({
  collapsed: isCollapsed.value,
  peekActive: isCollapsed.value && isHovering.value,
  layoutSync: isLayoutTransitionActive.value,
}))
provide(MENU_PEEK_STATE_KEY, menuPeekState)

// Helper функция для вызова updateMenuWidth с текущими параметрами
const updateWidth = () => {
  if (!allowMenuTransitions.value) {
    return
  }

  updateMenuWidth(
    menuSections.value,
    userStore,
    getSeparator,
    shouldShowSeparator,
    handleMenuMetricsChange,
    isCollapsed.value,
    sidebarBrandMeasureText.value,
  )
}

function applyInitialMenuLayout() {
  initializeMenuWidth(
    menuSections.value,
    userStore,
    getSeparator,
    shouldShowSeparator,
    handleMenuMetricsChange,
    isCollapsed.value,
    sidebarBrandMeasureText.value,
  )
}

async function finishMenuBootstrap() {
  await nextTick()
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
  allowMenuTransitions.value = true
  updateWidth()
}

// Ссылка на уже применённые данные меню. getUserMenu возвращает один и тот же
// объект из in-memory кеша, поэтому повторный вызов не пересобирает список и не
// перерисовывает иконки (важно для отсутствия мигания при гидратации + onMounted).
let appliedMenuData = null

function resolveRouteMetaForMenu(routeName) {
  if (!routeName) {
    return null
  }

  try {
    const resolved = router.resolve({ name: routeName })
    if (!resolved?.matched?.length) {
      return null
    }
    // Склеиваем meta всех matched — у redirect/parent флаги могут быть только у листа
    return resolved.matched.reduce(
      (acc, record) => ({ ...acc, ...(record.meta || {}) }),
      {},
    )
  } catch {
    return null
  }
}

function buildMenuSections(menuData) {
  const sections = transformMenuData(menuData)
  return filterMenuSectionsForSessionScope(sections, resolveRouteMetaForMenu)
}

function applyMenuData(menuData, { force = false } = {}) {
  if (!menuData?.menu_items?.length) {
    return false
  }

  if (!force && menuData === appliedMenuData && menuSections.value.length > 0) {
    menuSections.value = buildMenuSections(menuData)
    return true
  }

  menuSections.value = buildMenuSections(menuData)
  separatorsConfig.value = transformSeparators(menuData.separators || [], menuData.menu_items)
  appliedMenuData = menuData
  return true
}

function hydrateMenuFromCache() {
  const cached = peekCachedMenu()
  return cached ? applyMenuData(cached) : false
}

if (hydrateMenuFromCache()) {
  isMenuReady.value = true
  applyInitialMenuLayout()
}

const {
  getMenuGroupKey,
  openGroupKey,
  nestedOpenStates,
  toggleGroup,
  toggleNestedGroup
} = useMenuNavigation(menuSections)

// Watch для видимости меню
watch(
  () => props.isVisible,
  (newValue) => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= SHELL_DESKTOP_MIN

    beginLayoutTransition({
      visibility: true,
      afterComplete: () => {
        if (newValue) {
          applyInitialMenuLayout()
          updateWidth()
        }
      },
    })

    if (!newValue) {
      if (isDesktop) {
        isHovering.value = true
      }
      return
    }

    if (isCollapsed.value && isDesktop) {
      isHovering.value = false
    }
  },
)

// Переключение меню
const toggleMenu = () => {
  const expanding = isCollapsed.value
  if (expanding) {
    cancelWordmarkHide()
  } else {
    startWordmarkHide()
  }

  beginLayoutTransition()
  isCollapsed.value = !isCollapsed.value
  writeMenuCollapsedPreference(isCollapsed.value)
  isHovering.value = !isCollapsed.value
  emit('menu-state-change', isCollapsed.value, menuWidth.value)
  syncMenuRightEdgeWithTransition({ updateContentPadding: true })
}

// Peek только с body: шапка (wordmark / кнопка) не должна раскрывать свёрнутое меню
const handleMouseEnter = () => {
  if (isCollapsed.value) {
    cancelWordmarkHide()
    isHovering.value = true
    syncMenuRightEdgeWithTransition()
  }
}

const handleMouseLeave = () => {
  if (isCollapsed.value && !isToolbarDropdownActive.value) {
    if (isHovering.value) {
      startWordmarkHide()
      beginLayoutTransition()
    }
    isHovering.value = false
    syncMenuRightEdgeWithTransition()
  }
}

// Управление состоянием тулбара
const setToolbarDropdownActive = (active) => {
  isToolbarDropdownActive.value = active
  if (active && isCollapsed.value) {
    isHovering.value = true
    syncMenuRightEdgeWithTransition()
  }
}

const handleNavigate = (item) => {
  const externalUrl = item.externalUrl
  if (item.item_type === 'external' && externalUrl) {
    window.open(externalUrl, '_blank', 'noopener,noreferrer')
    return
  }

  if (item.isOffcanvas && item.page) {
    openOffcanvasSidebar(item.page)
    return
  }

  if (item.routeName) {
    safeNavigateByName(router, item.routeName)
  }
}

// Следим за изменениями в меню — только после завершения bootstrap
watch(menuSections, () => {
  if (allowMenuTransitions.value) {
    updateWidth()
  }
  nextTick(syncMenuScrollShadow)
})

watch(sidebarBrandMeasureText, () => {
  if (allowMenuTransitions.value) {
    updateWidth()
  }
})

// Следим за изменениями имени пользователя (только имя, не весь объект)
watch(() => userStore.fullName, (newName, oldName) => {
  if (allowMenuTransitions.value && oldName !== newName && newName) {
    updateWidth()
  }
})

// Загрузка меню из API
const loadMenu = async (forceRefresh = false) => {
  const resetMenu = () => {
    menuSections.value = []
    separatorsConfig.value = { byOrderIndex: {} }
    appliedMenuData = null
  }

  try {
    const menuData = await getUserMenu(forceRefresh)

    if (menuData?.menu_items?.length > 0) {
      emptyMenuWarned = false
      const applied = applyMenuData(menuData, { force: forceRefresh })
      if (applied && forceRefresh) {
        applyInitialMenuLayout()
      }
      return
    }

    if (forceRefresh && menuSections.value.length) {
      return
    }

    resetMenu()
    if (tokenService.getAccess() && !emptyMenuWarned) {
      emptyMenuWarned = true
      toast.warning(t('menu.sidebar.notConfigured'))
    }
  } catch (error) {
    if (!menuSections.value.length) {
      resetMenu()
    }
    toast.error(t('menu.sidebar.loadFailed'))
    logError('Ошибка загрузки меню:', error)
  }
}

// Слушаем событие обновления меню
const handleMenuUpdate = (event) => {
  if (event?.detail?.fromCache) {
    const cached = peekCachedMenu()
    if (cached?.menu_items?.length) {
      applyMenuData(cached, { force: true })
      applyInitialMenuLayout()
    } else {
      menuSections.value = []
      separatorsConfig.value = { byOrderIndex: {} }
      appliedMenuData = null
    }
    return
  }
  loadMenu(true)
}

function handleSessionScopeChange() {
  // Сразу перефильтровать уже загруженное меню по JWT,
  // затем подтянуть дерево с API под новый session-scope.
  if (appliedMenuData) {
    menuSections.value = buildMenuSections(appliedMenuData)
    applyInitialMenuLayout()
    scheduleLayoutOffsetSync()
  }
  loadMenu(true)
}

// Инициализация при монтировании
onMounted(async () => {
  window.addEventListener('menu-updated', handleMenuUpdate)
  window.addEventListener('session-scope-changed', handleSessionScopeChange)

  await whenSessionReady()
  if (!userStore.isInitialized) {
    await userStore.ensureUserReady()
  }

  if (!tokenService.getAccess()) {
    isMenuReady.value = true
    await finishMenuBootstrap()
    scheduleLayoutOffsetSync()
    setupWidthTracking(onWindowResize)
    menuRef.value?.addEventListener('transitionend', onMenuTransitionEnd)
    await nextTick()
    syncMenuScrollShadow()
    menuScrollRef.value?.addEventListener('scroll', onMenuScroll, { passive: true })
    return
  }

  if (isMenuReady.value && isMenuCacheFresh()) {
    await finishMenuBootstrap()
    scheduleLayoutOffsetSync()
    if (isCollapsed.value) {
      isHovering.value = false
    }
    setupWidthTracking(onWindowResize)
    menuRef.value?.addEventListener('transitionend', onMenuTransitionEnd)
    await nextTick()
    syncMenuScrollShadow()
    menuScrollRef.value?.addEventListener('scroll', onMenuScroll, { passive: true })
    return
  }

  if (!isMenuReady.value) {
    await loadMenu()
    isMenuReady.value = true
    applyInitialMenuLayout()
  } else {
    await loadMenu()
  }

  scheduleLayoutOffsetSync()

  if (isCollapsed.value) {
    isHovering.value = false
  }

  setupWidthTracking(onWindowResize)

  await finishMenuBootstrap()

  menuRef.value?.addEventListener('transitionend', onMenuTransitionEnd)
  await nextTick()
  syncMenuScrollShadow()
  menuScrollRef.value?.addEventListener('scroll', onMenuScroll, { passive: true })
})

// Удаляем слушатель при размонтировании
onBeforeUnmount(() => {
  window.removeEventListener('menu-updated', handleMenuUpdate)
  window.removeEventListener('session-scope-changed', handleSessionScopeChange)
  window.removeEventListener('resize', onWindowResize)
  menuRef.value?.removeEventListener('transitionend', onMenuTransitionEnd)
  menuScrollRef.value?.removeEventListener('scroll', onMenuScroll)
  clearLayoutTransitionTimer()
  clearWordmarkHideTimer()
  if (layoutSyncFrame) {
    cancelAnimationFrame(layoutSyncFrame)
  }
  if (layoutSyncTimeout) {
    clearTimeout(layoutSyncTimeout)
  }
})
</script>

<template>
  <aside
    ref="menuRef"
    class="side-menu card p-0"
    role="navigation"
    :aria-label="t('menu.sidebar.ariaLabel')"
    :class="{ collapsed: isCollapsed, hovering: isHovering, 'side-menu--collapsed-settled': isCollapsedSettled, 'side-menu--labels-hidden': isCollapsedLabelsHidden, 'is-hidden': !isVisible, 'side-menu--bootstrapping': !allowMenuTransitions, 'side-menu--offcanvas-open': isOffcanvasSidebarOpen, 'side-menu--visibility-transition': isVisibilityTransitionActive, 'side-menu--layout-transition': isLayoutTransitionActive || isCollapsed, 'wordmark-hiding': isWordmarkHiding }"
    :style="{ '--menu-width': `${menuWidth}px`, '--menu-item-height': `${menuIconSizes.item + 16}px`, '--menu-icon-inset': `calc((100% - ${menuIconSizes.item}px) / 2)`, '--menu-avatar-inset': 'calc((100% - 40px) / 2)' }"
    @mouseleave="handleMouseLeave"
  >
    <div class="side-menu__header side-header">
      <div class="side-header__brand-row">
        <RouterLink :to="sidebarBrandTo" class="side-menu__logo">
          <div class="side-header__title text-smooth-animation">
            <component
              v-if="activeSidebarBrand"
              :is="activeSidebarBrand.component"
              :compact="showCompactWordmark"
              :compact-icon-size="menuIconSizes.item"
            />
            <SiteWordmark
              v-else
              :compact="showCompactWordmark"
              :compact-icon-size="menuIconSizes.item"
              class="site-wordmark--menu"
            />
          </div>
        </RouterLink>
        <div class="side-menu__toggle">
          <button @click="toggleMenu" class="btn btn-primary">
            <ChevronLeft :class="{ rotated: isCollapsed }" :size="menuIconSizes.toggle" class="menu-group__chevron"/>
          </button>
        </div>
      </div>
    </div>
    <div class="side-menu__body" @mouseenter="handleMouseEnter">
      <div
        class="side-header__shadow"
        :class="{ 'side-header__shadow--visible': isMenuScrolled }"
        aria-hidden="true"
      ></div>
      <div ref="menuScrollRef" class="side-menu__scroll">
        <ul v-show="isMenuReady" class="side-menu__list p-2" :class="{ short: isCollapsed && !isHovering }">
        <li v-for="(section, index) in menuSections" :key="section.id ?? section.routeName ?? index">
          <div v-if="shouldShowSeparator(index)" class="side-divider py-2">
            <div class="side-divider__icon"><Minus :size="menuIconSizes.divider" /></div>
            <MenuPeekLabel
              :text="getSeparator(index)"
              :visible="showMenuLabels"
              class="side-divider__name"
            />
          </div>
          
          <MenuGroup :is-hovering="showMenuLabels" :is-collapsed="!isCollapsed" :is-open="openGroupKey === getMenuGroupKey(section)" :data="section" :nested-open-states="nestedOpenStates" @toggle="toggleGroup(getMenuGroupKey(section))" @navigate="handleNavigate" @toggle-nested="toggleNestedGroup"/>
        </li>
        </ul>
      </div>
      <MenuToolbar
        :is-collapsed="isCollapsed"
        :is-hovering="showMenuLabels"
        :is-layout-sync="isLayoutTransitionActive"
        @dropdown-state-change="setToolbarDropdownActive"
      />
    </div>
  </aside>
</template>

<style scoped lang="scss">
@import "./MenuList.scoped.scss";
</style>