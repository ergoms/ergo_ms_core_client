<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, ArchiveRestore, EyeOff, } from '@lucide/vue'
import { resolveNotificationIconName } from '@/core/notifications/js/icon-resolver.js'
import NotificationActions from '@/core/notifications/components/NotificationActions.vue'
import HoverTooltip from '@/components/HoverTooltip.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { formatDateTime, formatDateWeekdayTime } from '@/js/utils/timeUtils.js'
import { useToast } from '@/js/utils/toast.js'
import { enterNotificationScope } from '@/core/notifications/js/enterNotificationScope.js'
import { expandedNotificationId } from '@/core/notifications/js/expandedNotification.js'

const { t } = useAppI18n()

const props = defineProps({
  notification: {
    type: Object,
    required: true,
  },
  /** compact — колокольчик; default — страница истории */
  compact: {
    type: Boolean,
    default: false,
  },
  highlighted: {
    type: Boolean,
    default: false,
  },
  showSidebarHide: {
    type: Boolean,
    default: false,
  },
  archivedView: {
    type: Boolean,
    default: false,
  },
  /**
   * Как показывать дату в списке:
   * time — только ЧЧ:ММ (группы «Сегодня» / «Вчера»);
   * weekday — день недели + время;
   * full — полная дата (по умолчанию).
   */
  dateStyle: {
    type: String,
    default: 'full',
    validator: (v) => ['time', 'weekday', 'full'].includes(v),
  },
})

const emit = defineEmits([
  'activate',
  'mark-read',
  'archive',
  'unarchive',
  'hide-sidebar',
  'hover-start',
  'hover-end',
])

const router = useRouter()

const expanded = computed(() => expandedNotificationId.value === props.notification.id)

const levelClass = computed(() => {
  switch (props.notification.level) {
    case 'success': return 'level--success'
    case 'warning': return 'level--warning'
    case 'error': return 'level--error'
    default: return 'level--info'
  }
})

const iconName = computed(() => resolveNotificationIconName(props.notification))

const hasTarget = computed(() => {
  const item = props.notification
  if (item?.actions_state === 'pending' && Array.isArray(item?.actions) && item.actions.length) {
    return false
  }
  return Boolean(item?.route?.name) || Boolean(item?.link_url)
})

const sourceLabel = computed(() => {
  const item = props.notification
  const scope = String(item?.scope_label || '').trim()
  if (scope) return scope
  const event = String(item?.event_label || item?.category_label || '').trim()
  if (event) return event
  if (!item?.source_module) return ''
  return item.module_label || item.source_module
})

function formatTimeOnly(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return ''
  }
}

function formatWeekdayTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return ''
  }
}

const formattedDate = computed(() => {
  if (props.dateStyle === 'time') {
    return formatTimeOnly(props.notification.created_at)
  }
  if (props.dateStyle === 'weekday') {
    return formatWeekdayTime(props.notification.created_at)
  }
  const formatted = formatDateTime(props.notification.created_at)
  return formatted === '—' ? '' : formatted
})

const dateTooltip = computed(() => formatDateWeekdayTime(props.notification.created_at))

async function onBodyClick() {
  if (!props.notification.body) return
  if (!expanded.value) {
    expandedNotificationId.value = props.notification.id
    return
  }
  if (hasTarget.value) {
    await navigate()
    return
  }
  expandedNotificationId.value = null
}

async function navigate() {
  const item = props.notification
  const entered = await enterNotificationScope(item.scope_ref)
  if (!entered.success) {
    try {
      useToast().error(entered.error || 'Не удалось открыть компанию из уведомления')
    } catch {
      /* тост — best effort */
    }
    return
  }

  emit('activate', item)
  emit('mark-read', item.id)

  if (item.route?.name) {
    await router.push({
      name: item.route.name,
      params: item.route.params || {},
      query: item.route.query || {},
    })
    return
  }
  if (item.link_url) {
    if (/^https?:\/\//i.test(item.link_url)) {
      window.open(item.link_url, '_blank', 'noopener')
    } else {
      await router.push(item.link_url)
    }
  }
}

async function onItemClick() {
  if (hasTarget.value) {
    await navigate()
    return
  }
  if (!props.notification.is_read) {
    emit('mark-read', props.notification.id)
  }
}

function onItemKeydown(event) {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onItemClick()
}

function onArchive() {
  emit('archive', props.notification.id)
}

function onUnarchive() {
  emit('unarchive', props.notification.id)
}

function onHideSidebar() {
  emit('hide-sidebar', props.notification.id)
}
</script>

<template>
  <li class="notif-item" :class="[ levelClass, { 'is-unread': !notification.is_read, 'is-compact': compact, 'is-page': !compact, 'is-highlighted': highlighted, 'is-clickable': hasTarget || !notification.is_read, }, ]" :data-notification-id="notification.id" tabindex="-1" :aria-label="notification.is_read ? notification.title : `${notification.title}, ${t('settings.inbox.unreadSuffix')}`" @click="onItemClick" @keydown="onItemKeydown" @mouseenter="emit('hover-start', notification)" @mouseleave="emit('hover-end', notification)">
    <div class="notif-item__icon" :class="levelClass" aria-hidden="true">
      <LucideIcon :name="iconName" :size="compact ? 18 : 20" />
    </div>

    <div class="notif-item__body-col">
      <div class="notif-item__top">
        <HoverTooltip :text="notification.title" only-when-truncated class="notif-item__title-tip">
          <div class="notif-item__title">{{ notification.title }}</div>
        </HoverTooltip>
        <HoverTooltip :text="dateTooltip" class="notif-item__date-tip">
          <time class="notif-item__date" :datetime="notification.created_at">
            {{ formattedDate }}
          </time>
        </HoverTooltip>
      </div>

      <button v-if="notification.body" type="button" class="notif-item__text" :class="{ 'is-clamped': !expanded }" @click.stop="onBodyClick">
        {{ notification.body }}
      </button>

      <NotificationActions :notification="notification" @click.stop />

      <div class="notif-item__bottom" @click.stop>
        <HoverTooltip v-if="sourceLabel" :text="sourceLabel" only-when-truncated class="notif-item__source-tip">
          <span class="notif-item__source">{{ sourceLabel }}</span>
        </HoverTooltip>
        <span v-else class="notif-item__source-spacer" aria-hidden="true" />

        <div class="notif-item__actions">
          <HoverTooltip v-if="showSidebarHide" :text="t('settings.inbox.hideFromBell')">
            <button type="button" class="notif-item__action-btn" :aria-label="t('settings.inbox.hideFromBell')" @click="onHideSidebar">
              <EyeOff :size="14" aria-hidden="true" />
            </button>
          </HoverTooltip>
          <HoverTooltip v-if="!compact && archivedView" :text="t('settings.inbox.restoreFromArchive')">
            <button type="button" class="notif-item__action-btn" :aria-label="t('settings.inbox.restoreFromArchive')" @click="onUnarchive">
              <ArchiveRestore :size="14" aria-hidden="true" />
            </button>
          </HoverTooltip>
          <HoverTooltip v-else-if="!compact" :text="t('settings.inbox.toArchive')">
            <button type="button" class="notif-item__action-btn" :aria-label="t('settings.inbox.toArchive')" @click="onArchive">
              <Archive :size="14" aria-hidden="true" />
            </button>
          </HoverTooltip>
        </div>
      </div>
    </div>
  </li>
</template>

<style scoped lang="scss">
.notif-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 1rem;
  position: relative;
  background-color: var(--bs-card-bg);
  border-bottom: 1px solid var(--color-border);
  transition: background-color 0.15s ease;
  cursor: default;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  &:hover {
    background-color: var(--color-hover-background);
  }

  &.is-clickable {
    cursor: pointer;
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent, var(--bs-primary));
    outline-offset: -2px;
    z-index: 1;
  }

  &.is-compact {
    padding: 0.75rem 0.875rem;
    column-gap: 0.625rem;
  }

  &.is-unread {
    background-color: var(--color-secondary-background);

    .notif-item__title {
      font-weight: 600;
    }

    &::before {
      content: '';
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-accent, var(--bs-primary));
      z-index: 1;
    }
  }

  &.is-highlighted {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent, var(--bs-primary)) 35%, transparent);
    animation: notif-highlight-fade 4s ease forwards;
  }
}

@keyframes notif-highlight-fade {
  0%, 60% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent, var(--bs-primary)) 35%, transparent);
  }
  100% {
    box-shadow: 0 0 0 2px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notif-item.is-highlighted {
    animation: none;
  }
}

.notif-item__icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--color-secondary-background);
  border: 1px solid var(--color-border);
  color: var(--color-primary-text);

  &.level--success {
    color: var(--bs-success);
    border-color: var(--bs-success-border-subtle);
    background-color: var(--bs-success-bg-subtle);
  }
  &.level--warning {
    color: var(--bs-warning-text-emphasis);
    border-color: var(--bs-warning-border-subtle);
    background-color: var(--bs-warning-bg-subtle);
  }
  &.level--error {
    color: var(--bs-danger);
    border-color: var(--bs-danger-border-subtle);
    background-color: var(--bs-danger-bg-subtle);
  }
  &.level--info {
    color: var(--bs-primary);
    border-color: var(--bs-primary-border-subtle);
    background-color: var(--bs-primary-bg-subtle);
  }
}

.notif-item.is-page .notif-item__icon {
  width: 40px;
  height: 40px;
}

.notif-item__body-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.notif-item__top {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  min-width: 0;
}

.notif-item__title-tip {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.notif-item__title {
  display: -webkit-box;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 0.875rem;
  line-height: 1.35;
  color: var(--color-primary-text);
}

.notif-item.is-page .notif-item__title {
  font-size: 0.9375rem;
}

.notif-item__date-tip {
  flex: 0 0 auto;
  max-width: none;
}

.notif-item__date {
  flex: 0 0 auto;
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--color-secondary-text);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.notif-item.is-compact .notif-item__date {
  font-size: 0.7rem;
}

.notif-item__text {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--color-secondary-text);
  word-break: break-word;
  white-space: pre-wrap;
  cursor: pointer;

  &.is-clamped {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: normal;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent, var(--bs-primary));
    outline-offset: 2px;
    border-radius: 2px;
  }
}

.notif-item.is-page .notif-item__text {
  font-size: 0.875rem;
}

.notif-item__bottom {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 32px;
  margin-top: 0.1rem;
}

.notif-item__source-tip {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.notif-item__source {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  font-weight: 550;
  color: var(--color-secondary-text);
}

.notif-item__source-spacer {
  flex: 1 1 auto;
}

.notif-item__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.1rem;
  margin-left: auto;
}

.notif-item__action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-secondary-text);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background-color: var(--color-secondary-background);
    color: var(--color-primary-text);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent, var(--bs-primary));
    outline-offset: 1px;
  }

}

@media (width < $ui-bp-sm) {
  .notif-item__top {
    flex-wrap: wrap;
    gap: 0.2rem 0.75rem;
  }

  .notif-item__date {
    order: -1;
    width: 100%;
    text-align: left;
  }
}
</style>