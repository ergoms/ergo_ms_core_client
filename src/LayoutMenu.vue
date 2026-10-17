<!--
  ОСНОВНОЙ LAYOUT КОМПОНЕНТ С БОКОВЫМ МЕНЮ
  
  Данный компонент представляет собой основную структуру приложения ERGO MS,
  включающую боковое меню, шапку и основную область контента.
  
  Функциональность:
  - Адаптивное боковое меню с возможностью сворачивания/разворачивания
  - Автоматическое скрытие меню на мобильных устройствах (<1200px)
  - Overlay для закрытия меню на мобильных устройствах
  - Динамическое изменение отступов основного контента в зависимости от состояния меню
  - Интеграция с системой маршрутизации Vue Router
  
  Состояния меню:
  - isMenuVisible: видимость меню (учитывает размер экрана и ручное управление)
  - isMenuToggledManually: флаг ручного управления меню пользователем
  - isOverlayVisible: показ затемняющего overlay на мобильных устройствах
  - leftPadding: динамический отступ для основного контента
-->

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import {
  closeOffcanvasSidebar,
} from '@/js/useOffcanvasSidebarStore.js'
import { useUserStore } from '@/core/cms/js/userStore.js'
import { ensurePresenceConnected } from '@/core/cms/adp/js/presence/usePresenceConnection.js'
import { useAppBootstrap } from '@/composables/useAppBootstrap.js'
import { useBreakpoint, SHELL_DESKTOP_MIN } from '@/composables/useBreakpoint.js'
import { getSessionBootstrapCache } from '@/core/cms/js/sessionBootstrapCache.js'
import {
  layoutPluginsRef,
  scheduleLayoutPluginsFromBootstrap,
} from '@/js/layoutPlugins.js'
import MenuList from '@/components/menu/MenuList.vue'
import { COLLAPSED_MENU_WIDTH } from '@/components/menu/composables/menuLayoutPadding.js'
import { readMenuCollapsedPreference } from '@/components/menu/composables/useMenuCollapsedPreference.js'
import LayoutBackdrop from '@/components/LayoutBackdrop.vue'
import AccessDenied from '@/components/AccessDenied.vue'
import NotFound from '@/components/NotFound.vue'
import SpinnerLoading from '@/components/SpinnerLoading.vue'
import SkipLink from '@/components/SkipLink.vue'
import FloatingWidgetsHost from '@/components/FloatingWidgetsHost.vue'
import DevToolsWidget from '@/core/cms/adp/devTools/DevToolsWidget.vue'
import { accessDeniedState } from './js/accessDeniedState'
import LucideIcon from '@/components/LucideIcon.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'

import SiteWordmark from '@/components/SiteWordmark.vue'
import RouteViewAnimated from '@/components/RouteViewAnimated.vue'
import { resolveSidebarBrand } from '@/integrations/sidebarBrand.js'

const { t } = useAppI18n()
const userStore = useUserStore()
const route = useRoute()
// AccessDenied поверх RouteView (v-show), без v-else:
// иначе краткий accessDeniedState.active размонтирует страницу,
// onMounted снова дергает checkAccess → ложный /access-denied.
// notFoundIfDenied — v-if: служебный экран не монтируется и не ходит в API.
const showNotFoundDenied = computed(
  () => accessDeniedState.active && accessDeniedState.variant === 'notFound',
)
const showAccessDenied = computed(
  () => accessDeniedState.active && accessDeniedState.variant !== 'notFound',
)
const { bootstrapping: sessionBootstrapping, whenSessionReady } = useAppBootstrap()
const { isShellDesktop, width: viewportWidth } = useBreakpoint()

const activeSidebarBrand = computed(() =>
  resolveSidebarBrand({
    route,
    compact: false,
  }),
)

const sidebarBrandTo = computed(() =>
  activeSidebarBrand.value?.to ?? { name: 'AppHome' },
)

let resizeTimeout = null

const initialMenuCollapsed = readMenuCollapsedPreference()
const leftPadding = ref(
  initialMenuCollapsed ? `${COLLAPSED_MENU_WIDTH}px` : '260px',
)
// До первого emit MenuList — иначе мини-чат после F5 прыгает с 260px на край свёрнутого меню
const menuRightEdge = ref(
  initialMenuCollapsed ? `${COLLAPSED_MENU_WIDTH}px` : '260px',
)
const isMenuVisible = ref(viewportWidth.value >= SHELL_DESKTOP_MIN)
const isMenuToggledManually = ref(false)
const isOverlayVisible = ref(false)
const isMenuCollapsed = ref(initialMenuCollapsed)
const menuWidth = ref(260)
const isMenuLayoutTransitioning = ref(false)

const showMenuSkeleton = computed(
  () => sessionBootstrapping.value && !userStore.isInitialized,
)

// Полноэкранный режим (без меню и ограничений контейнера)
const isFullPage = computed(() => route.meta?.fullPage === true)

watch(
  isFullPage,
  (fullPage) => {
    if (fullPage) {
      closeOffcanvasSidebar()
    }
  },
  { immediate: true, flush: 'sync' },
)

// Декоративный фон с «кругляшками» — только на стандартных shell-страницах (home, 404 и т.п.)
const showShellBackdrop = computed(() =>
  route.matched.some((record) => record.meta?.shellBackdrop === true),
)

function updateMenuVisibilityImmediate() {
  if (isShellDesktop.value) {
    isMenuVisible.value = true
    isOverlayVisible.value = false
    isMenuToggledManually.value = false
  } else if (!isMenuToggledManually.value) {
    isMenuVisible.value = false
    isOverlayVisible.value = false
  }
}

// Debounced версия для resize event (избегаем лишних вычислений при ресайзе)
function updateMenuVisibility() {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
  resizeTimeout = setTimeout(updateMenuVisibilityImmediate, 150)
}

function toggleMenu(isVisible) {
  isMenuToggledManually.value = true
  isMenuVisible.value = isVisible
  isOverlayVisible.value = isVisible && !isShellDesktop.value
}

function closeMenu() {
  isMenuVisible.value = false
  isOverlayVisible.value = false
  isMenuToggledManually.value = false
}

function leftToggle(val) {
  leftPadding.value = val
}

function handleMenuRightEdge(val) {
  menuRightEdge.value = val
}

function handleMenuStateChange(collapsed, width) {
  isMenuCollapsed.value = collapsed
  menuWidth.value = width
}

function handleMenuLayoutSyncTransition(active) {
  isMenuLayoutTransitioning.value = active
}

function onHamburgerClick() {
  toggleMenu(!isMenuVisible.value)
}

function runWhenIdle(fn) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => fn(), { timeout: 4000 })
    return
  }
  setTimeout(fn, 1)
}

watch(
  () => userStore.isInitialized,
  (initialized) => {
    if (initialized) {
      runWhenIdle(() => {
        scheduleLayoutPluginsFromBootstrap(getSessionBootstrapCache())
      })
    }
  },
)

onMounted(() => {
  updateMenuVisibilityImmediate()
  window.addEventListener('resize', updateMenuVisibility)

  void whenSessionReady().then(() => {
    runWhenIdle(() => {
      if (userStore.isAuthenticated) {
        ensurePresenceConnected()
      }
      if (userStore.isInitialized) {
        scheduleLayoutPluginsFromBootstrap(getSessionBootstrapCache())
      }
    })
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMenuVisibility)
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
})
</script>

<template>
  <SkipLink />
  <Teleport to="body">
    <header v-if="!isFullPage" class="mobile-header d-xl-none">
      <button class="btn btn-link d-flex align-items-center justify-content-center mobile-header__btn" type="button" :aria-label="isMenuVisible ? t('menu.sidebar.close') : t('menu.sidebar.open')" :title="isMenuVisible ? t('menu.sidebar.close') : t('menu.sidebar.open')" :aria-expanded="isMenuVisible" aria-controls="side-menu" @click="onHamburgerClick">
        <LucideIcon name="Menu" :size="24" aria-hidden="true" />
      </button>
      <RouterLink :to="sidebarBrandTo" class="mobile-header__brand text-decoration-none">
        <component v-if="activeSidebarBrand" :is="activeSidebarBrand.component" :compact="false" class="mobile-header__module-brand"/>
        <SiteWordmark v-else class="site-wordmark--mobile site-wordmark--centered"/>
      </RouterLink>
    </header>
  </Teleport>
  <div class="layout-container" :class="{ 'layout-container--full-page': isFullPage }">
    <aside v-if="!isFullPage && showMenuSkeleton" class="menu-skeleton side-menu" aria-hidden="true">
      <SpinnerLoading color="primary" />
    </aside>
    <MenuList v-if="!isFullPage" v-show="!showMenuSkeleton" id="side-menu" @left-padding="leftToggle" @menu-right-edge="handleMenuRightEdge" @layout-sync-transition="handleMenuLayoutSyncTransition" :is-visible="isMenuVisible" @menu-state-change="handleMenuStateChange"/>
    <div class="layout-page" :class="{ 'layout-page--full-page': isFullPage, 'layout-page--menu-sync-transition': isMenuLayoutTransitioning }">
      <LayoutBackdrop v-if="!isFullPage && showShellBackdrop" data-ergo-decorative-image />
      <main id="main-content" class="layout-page__content" tabindex="-1">
        <template v-if="route.meta?.fullPage">
          <NotFound v-if="showNotFoundDenied" />
          <template v-else>
            <AccessDenied v-show="showAccessDenied" bordered :title="accessDeniedState.title" :message="accessDeniedState.message"/>
            <RouteViewAnimated v-show="!accessDeniedState.active" />
          </template>
        </template>
        <div v-else :class=" route.meta?.flushContent && !accessDeniedState.active ? 'layout-content--flush' : 'layout-content-shell py-4' ">
          <NotFound v-if="showNotFoundDenied" />
          <template v-else>
            <AccessDenied v-show="showAccessDenied" bordered :title="accessDeniedState.title" :message="accessDeniedState.message"/>
            <RouteViewAnimated v-show="!accessDeniedState.active" />
          </template>
        </div>
      </main>
    </div>
  </div>

  <div @click="closeMenu" class="layout-overlay" :class="{ active: isOverlayVisible }" />
  <component v-for="(plugin, index) in layoutPluginsRef" :key="index" :is="plugin" :isMenuCollapsed="isMenuCollapsed" :menuWidth="menuWidth" :menuRightEdge="menuRightEdge"/>
  <FloatingWidgetsHost :menu-right-edge="menuRightEdge" />
  <DevToolsWidget />
</template>

<style scoped lang="scss">
.menu-skeleton {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1003;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 260px;
  height: 100dvh;
  background: var(--color-header-background);
  border-right: 1px solid var(--color-border);
}

.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--shell-mobile-header-offset);
  box-sizing: border-box;
  /* Ниже модалок (1055+) и drawer (1040/1050), выше меню (1005) и overlay (1004) */
  z-index: 1030;
  background: var(--color-header-background);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  padding: env(safe-area-inset-top, 0px) 12px 0;
  width: 100%;
  padding-left: max(12px, env(safe-area-inset-left, 0px));
  padding-right: max(12px, env(safe-area-inset-right, 0px));

  &__btn {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    margin-right: 8px;
    color: var(--color-accent);
  }

  &__brand {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    color: inherit;

    :deep(.site-wordmark--mobile) {
      font-size: 1.875rem;
    }
  }
}
.layout-page {
  position: relative;
  padding-inline-start: v-bind(leftPadding);
  overflow-x: clip;
  min-height: 100dvh;
  background: var(--color-background);

  &--menu-sync-transition {
    transition: padding-inline-start $transition;
  }

  &--full-page {
    padding-inline-start: 0 !important;
    height: 100dvh;
    min-height: 100dvh;
  }
}

.layout-page__content {
  position: relative;
  z-index: 1;
  min-height: inherit;
  overflow-x: clip;
  overflow-y: visible;
  outline: none;
}

.layout-container--full-page {
  height: 100dvh;
  overflow: hidden;

  .layout-page--full-page {
    height: 100dvh;
    overflow: auto;
  }
}

.layout-content--flush {
  padding: 0;
  max-width: none;
  overflow-x: clip;
  overflow-y: visible;
}

.layout-content-shell {
  width: var(--ui-page-width);
  max-width: 100%;
  box-sizing: border-box;
  margin-inline: auto;
  padding-inline: var(--ui-page-inline);

  @media (width < $ui-bp-sm) {
    padding-top: 1rem !important;
    padding-bottom: 1rem !important;
    padding-inline: 1rem;
  }
}

.layout-overlay {
  z-index: 1004;
}

:deep(.site-wordmark--menu) {
  font-size: 2.5rem;
}

@media (width < $ui-shell-desktop-min) {
  .menu-skeleton {
    display: none;
  }

  .layout-container {
    height: 100dvh;
    overflow: hidden;
  }
  .layout-page {
    box-sizing: border-box;
    padding-inline-start: 0;
    padding-top: 0;
    /* Фиксированный mobile-header — контент ниже шапки (с учётом safe-area).
       Базовый min-height: 100dvh вместе с margin-top выше шапки, а контейнер
       с overflow: hidden срезает низ: эта полоса не докручивается. */
    margin-top: var(--shell-mobile-header-offset);
    min-height: 0;
    height: calc(100dvh - var(--shell-mobile-header-offset));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    overflow: auto;
    overscroll-behavior: contain;

    /* Flush/full-height экраны сами учитывают safe-area (messenger и т.п.) */
    &:has(.layout-content--flush) {
      padding-bottom: 0;
    }

    &--full-page {
      margin-top: 0;
      height: 100dvh;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
  }

  .layout-page__content {
    min-height: 100%;
  }

  .layout-page__content:has(.layout-content--flush) {
    height: 100%;
    min-height: 0;
  }

  .layout-content--flush {
    height: 100%;
    min-height: 0;
  }
  :deep(.side-menu__toggle) {
    display: none !important;
  }
}
</style>