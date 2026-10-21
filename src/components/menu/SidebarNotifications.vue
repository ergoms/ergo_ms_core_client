<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import LucideIcon from '@/components/LucideIcon.vue'
import { CORE_ICON } from '@/config/coreIconNames.js'
import { useDropdown } from '@/composables/useDropdown.js'
import { useNotificationsInbox } from '@/core/notifications/js/useNotificationsInbox.js'
import { expandedNotificationId } from '@/core/notifications/js/expandedNotification.js'
import NotificationItem from '@/core/notifications/components/NotificationItem.vue'
import LoadingContentArea from '@/components/LoadingContentArea.vue'
import HoverTooltip from '@/components/HoverTooltip.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const HOVER_READ_DELAY_MS = 500
const PANEL_ID = 'sidebar-notifications-panel'

const props = defineProps({
  iconSize: {
    type: Number,
    default: 20,
  },
})

const { t } = useAppI18n()
const emit = defineEmits(['dropdown-toggle'])
const router = useRouter()
const { dropdownRef, isOpen, toggleDropdown, closeDropdown } = useDropdown(emit)

const triggerBtnRef = ref(null)
const panelRef = ref(null)
const listRef = ref(null)

const {
  sidebarItems,
  unreadCount,
  sidebarLoading,
  hasUnread,
  ensureInitialized,
  loadSidebar,
  markRead,
  markAllRead,
  hideFromSidebar,
} = useNotificationsInbox()

const hoverReadTimers = new Map()

function itemDateStyle(item) {
  if (!item?.created_at) return 'weekday'
  const created = new Date(item.created_at)
  if (Number.isNaN(created.getTime())) return 'weekday'
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  if (created >= yesterdayStart) return 'time'
  return 'weekday'
}

const badgeLabel = computed(() => {
  const count = unreadCount.value
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
})

defineExpose({ closeDropdown })

function getItemElements() {
  return [...(listRef.value?.querySelectorAll('[data-notification-id]') || [])]
}

function focusTrigger() {
  triggerBtnRef.value?.focus?.()
}

function focusItemAt(index) {
  const items = getItemElements()
  if (!items.length) return
  const next = Math.max(0, Math.min(items.length - 1, index))
  items.forEach((el, i) => {
    el.tabIndex = i === next ? 0 : -1
  })
  const target = items[next]
  target.focus()
  target.scrollIntoView({ block: 'nearest' })
}

function onPanelKeydown(event) {
  if (!isOpen.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (expandedNotificationId.value != null) {
      expandedNotificationId.value = null
      return
    }
    closeDropdown()
    nextTick(() => focusTrigger())
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
  if (!dropdownRef.value?.contains(event.target)) return

  const items = getItemElements()
  if (!items.length) return

  event.preventDefault()
  const active = document.activeElement
  let index = items.findIndex((el) => el === active || el.contains(active))

  if (event.key === 'Home') {
    focusItemAt(0)
    return
  }
  if (event.key === 'End') {
    focusItemAt(items.length - 1)
    return
  }
  if (event.key === 'ArrowDown') {
    focusItemAt(index < 0 ? 0 : index + 1)
    return
  }
  focusItemAt(index < 0 ? items.length - 1 : index - 1)
}

function bindPanelKeys() {
  document.addEventListener('keydown', onPanelKeydown, true)
}

function unbindPanelKeys() {
  document.removeEventListener('keydown', onPanelKeydown, true)
}

onMounted(() => {
  // Не грузим полную историю inbox на mount toolbar — только unread + socket.
  ensureInitialized({ skipLoad: true })
})

onUnmounted(() => {
  unbindPanelKeys()
  clearAllHoverTimers()
  expandedNotificationId.value = null
})

watch(isOpen, async (open) => {
  if (!open) {
    unbindPanelKeys()
    clearAllHoverTimers()
    expandedNotificationId.value = null
    return
  }

  bindPanelKeys()
  await loadSidebar()
  await nextTick()
  panelRef.value?.focus?.()
})

function clearAllHoverTimers() {
  hoverReadTimers.forEach((timerId) => clearTimeout(timerId))
  hoverReadTimers.clear()
}

function clearHoverTimer(id) {
  const timerId = hoverReadTimers.get(id)
  if (timerId !== undefined) {
    clearTimeout(timerId)
    hoverReadTimers.delete(id)
  }
}

function onItemHoverStart(item) {
  if (item.is_read) return
  clearHoverTimer(item.id)
  hoverReadTimers.set(
    item.id,
    setTimeout(() => {
      hoverReadTimers.delete(item.id)
      markRead(item.id)
    }, HOVER_READ_DELAY_MS),
  )
}

function onItemHoverEnd(item) {
  clearHoverTimer(item.id)
}

function handleToggle() {
  toggleDropdown()
  if (isOpen.value) {
    loadSidebar()
  }
}

function goToFullList() {
  closeDropdown()
  nextTick(() => focusTrigger())
  router.push({ name: 'UserNotifications' })
}

function onActivate() {
  closeDropdown()
  nextTick(() => focusTrigger())
}

async function onHideSidebar(id) {
  await hideFromSidebar(id)
}
</script>

<template>
  <div ref="dropdownRef" class="tools__notifications-wrapper">
    <HoverTooltip :text="t('menu.notifications.title')">
      <button ref="triggerBtnRef" type="button" class="header-btn notifications-btn" :class="{ 'has-unread': hasUnread }" :aria-expanded="isOpen" :aria-controls="PANEL_ID" aria-haspopup="dialog" :aria-label="t('menu.notifications.title')" @click.stop="handleToggle">
        <LucideIcon :name="CORE_ICON.notifications" :size="props.iconSize" aria-hidden="true" />
        <span v-if="hasUnread" class="notifications-badge" aria-live="polite">{{ badgeLabel }}</span>
      </button>
    </HoverTooltip>

    <Transition name="dropdown">
      <div v-if="isOpen" :id="PANEL_ID" ref="panelRef" class="notifications-dropdown" role="dialog" aria-modal="true" tabindex="-1" :aria-label="t('menu.notifications.title')">
        <div class="notifications-dropdown__header">
          <button type="button" class="notifications-dropdown__title-link" :aria-label="t('menu.notifications.openPage')" :title="t('menu.notifications.openPage')" @click="goToFullList">
            <span>{{ t('menu.notifications.title') }}</span>
          </button>
          <button v-if="hasUnread" class="notifications-dropdown__action" type="button" :aria-label="t('menu.notifications.markAllRead')" :title="t('settings.notifications.markAllRead')" @click="markAllRead()">
            <LucideIcon name="CheckCheck" :size="16" aria-hidden="true" />
            <span>{{ t('menu.notifications.markAllRead') }}</span>
          </button>
        </div>

        <div class="notifications-dropdown__body">
          <LoadingContentArea :loading="sidebarLoading" min-height="6rem">
            <div v-if="sidebarItems.length === 0" class="notifications-dropdown__state">
              <LucideIcon :name="CORE_ICON.notificationsOff" :size="28" icon-class="notifications-dropdown__empty-icon" aria-hidden="true"/>
              <p>{{ t('menu.notifications.empty') }}</p>
            </div>

            <div v-else class="notifications-dropdown__scroll">
              <ul ref="listRef" class="notifications-list" :aria-label="t('menu.notifications.listAria')">
                <NotificationItem v-for="item in sidebarItems" :key="item.id" :notification="item" compact show-sidebar-hide :date-style="itemDateStyle(item)" @activate="onActivate" @mark-read="markRead" @hide-sidebar="onHideSidebar" @hover-start="onItemHoverStart" @hover-end="onItemHoverEnd"/>
              </ul>
            </div>
          </LoadingContentArea>
        </div>

        <div class="notifications-dropdown__footer">
          <button type="button" class="notifications-dropdown__footer-link" @click="goToFullList">
            <LucideIcon :name="CORE_ICON.notifications" :size="14" aria-hidden="true" />
            {{ t('menu.notifications.viewAll') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.tools__notifications-wrapper {
  position: relative;
  display: inline-block;
  padding-top: 4px;
  padding-right: 4px;
  margin-top: -4px;
  margin-right: -4px;
}

.notifications-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background-color: transparent;
  cursor: pointer;
  color: inherit;
  border-radius: 6px;
  transition: background-color 0.2s ease;

  &:hover,
  &[aria-expanded='true'] {
    background-color: var(--color-hover-background);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent, var(--bs-primary));
    outline-offset: 2px;
  }
}

.notifications-badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--bs-danger);
  color: var(--bs-white, #fff);
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  pointer-events: none;
}

.notifications-dropdown {
  @include dropdown-menu-base;
  left: 50%;
  transform: translate(-50%, -8px);
  width: 360px;
  max-width: min(360px, 90vw);
  max-height: min(70dvh, calc(100dvh - 7rem));
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent, var(--bs-primary));
    outline-offset: 2px;
  }
}

.notifications-dropdown__header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-secondary-background);
}

.notifications-dropdown__title-link {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  padding: 4px 6px;
  margin-left: -6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--color-primary-text);
  cursor: pointer;
  text-align: left;

  &:hover {
    color: var(--color-accent, var(--bs-primary));
    background-color: var(--color-hover-background);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent, var(--bs-primary));
    outline-offset: 2px;
  }
}

.notifications-dropdown__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--color-accent, var(--bs-primary));
  font-size: 0.8rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  min-height: 32px;

  &:hover {
    background-color: var(--color-hover-background);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent, var(--bs-primary));
    outline-offset: 2px;
  }
}

.notifications-dropdown__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  :deep(.loading-content-area--content),
  :deep(.loading-content-area__slot) {
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }

  :deep(.loading-content-area__slot) {
    overflow: hidden;
  }
}

.notifications-dropdown__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.notifications-dropdown__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-secondary-text);

  p {
    margin: 0.5rem 0 0;
  }
}

.notifications-dropdown__empty-icon {
  opacity: 0.5;
  color: var(--color-secondary-text);
}

.notifications-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.notifications-dropdown__footer {
  flex: 0 0 auto;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-secondary-background);
  padding: 0.5rem;
}

.notifications-dropdown__footer-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  min-height: 36px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-accent, var(--bs-primary));
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background-color: var(--color-hover-background);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent, var(--bs-primary));
    outline-offset: 2px;
  }
}
</style>

<style lang="scss">
.notifications-dropdown.dropdown-enter-active,
.notifications-dropdown.dropdown-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

@media (prefers-reduced-motion: reduce) {
  .notifications-dropdown.dropdown-enter-active,
  .notifications-dropdown.dropdown-leave-active {
    transition: none;
  }
}

.notifications-dropdown.dropdown-enter-from {
  opacity: 0;
  transform: translate(-50%, -16px) !important;
}
.notifications-dropdown.dropdown-enter-to {
  opacity: 1;
  transform: translate(-50%, -8px) !important;
}
.notifications-dropdown.dropdown-leave-from {
  opacity: 1;
  transform: translate(-50%, -8px) !important;
}
.notifications-dropdown.dropdown-leave-to {
  opacity: 0;
  transform: translate(-50%, -16px) !important;
}
</style>
