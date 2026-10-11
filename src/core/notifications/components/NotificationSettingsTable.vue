<script setup>
import { computed } from 'vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const props = defineProps({
  events: { type: Array, required: true },
  sourceModule: { type: String, required: true },
  globalSwitches: { type: Object, required: true },
})

const emit = defineEmits(['toggle'])
const { t } = useAppI18n()

const CHANNELS = computed(() => [
  { key: 'email', label: t('settings.notifications.channelEmail') },
  { key: 'in_app', label: t('settings.notifications.channelInApp') },
])

function isChannelMuted(channelKey) {
  return props.globalSwitches?.[channelKey] === false
}

function isChannelLocked(event, channelKey) {
  return Boolean(event.channels?.[channelKey]?.locked)
}

function channelTitle(event, channelKey) {
  if (isChannelLocked(event, channelKey)) return t('settings.notifications.channelLocked')
  if (isChannelMuted(channelKey)) return t('settings.notifications.channelMuted')
  return ''
}

function onToggle(event, channelKey, checked) {
  if (isChannelLocked(event, channelKey)) return
  emit('toggle', {
    sourceModule: props.sourceModule,
    eventKey: event.event_key,
    channel: channelKey,
    enabled: checked,
  })
}
</script>

<template>
  <div class="notif-table-wrap">
    <table class="notif-table" :aria-label="t('settings.notifications.tableAria')">
      <thead>
        <tr>
          <th scope="col" class="notif-table__th notif-table__th--label">{{ t('settings.notifications.receiveAbout') }}</th>
          <th
            v-for="channel in CHANNELS"
            :key="channel.key"
            scope="col"
            class="notif-table__th notif-table__th--channel"
          >
            {{ channel.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="event in events" :key="event.event_key" class="notif-table__tr">
          <td class="notif-table__td notif-table__td--label">{{ event.label }}</td>
          <td
            v-for="channel in CHANNELS"
            :key="channel.key"
            class="notif-table__td notif-table__td--channel"
          >
            <input
              v-if="event.channels?.[channel.key]?.available"
              type="checkbox"
              class="form-check-input notif-table__checkbox"
              :class="{ 'notif-table__checkbox--locked': isChannelLocked(event, channel.key) }"
              :checked="isChannelLocked(event, channel.key) || event.channels[channel.key].enabled"
              :disabled="isChannelMuted(channel.key) || isChannelLocked(event, channel.key)"
              :title="channelTitle(event, channel.key)"
              :aria-label="`${event.label} — ${channel.label}`"
              @change="onToggle(event, channel.key, $event.target.checked)"
            />
            <span
              v-else
              class="notif-table__unavailable"
              :title="t('settings.notifications.unavailable')"
            >—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
.notif-table-wrap {
  overflow-x: auto;
}

.notif-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.notif-table__th {
  font-weight: 500;
  font-size: 0.75rem;
  color: var(--color-secondary-text);
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--color-border);
  text-align: left;

  &--channel {
    text-align: center;
    width: 8.5rem;
    white-space: nowrap;
  }
}

.notif-table__tr {
  &:not(:last-child) .notif-table__td {
    border-bottom: 1px solid var(--color-border);
  }
}

.notif-table__td {
  padding: 0.625rem 1rem;
  vertical-align: middle;
  color: var(--color-primary-text);

  &--channel {
    text-align: center;
  }
}

.notif-table__checkbox {
  cursor: pointer;
  margin: 0;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  &--locked:disabled {
    opacity: 1;
  }
}

.notif-table__unavailable {
  color: var(--color-secondary-text);
  opacity: 0.5;
}
</style>
