<template>
  <div class="source-run-actions">
    <p
      v-if="notice"
      class="source-run-actions__note"
      :class="noticeOk === true ? 'source-run-actions__note--ok' : noticeOk === false ? 'source-run-actions__note--bad' : ''"
    >
      {{ notice }}
    </p>
    <div class="source-run-actions__row">
      <slot name="extra" />
      <button
        type="button"
        class="ui-btn ui-btn--primary"
        :disabled="pending !== '' || status === 'running' || canStart === false"
        @click="$emit('start')"
      >
        {{ pending === 'start' ? startingText : startText }}
      </button>
      <button
        type="button"
        class="ui-btn ui-btn--secondary"
        :disabled="pending !== '' || (status !== 'running' && status !== 'paused')"
        @click="$emit('stop')"
      >
        {{ pending === 'stop' ? stoppingText : stopText }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const props = defineProps({
  status: { type: String, default: 'idle' },
  canStart: { type: Boolean, default: true },
  pending: { type: String, default: '' },
  notice: { type: String, default: '' },
  noticeOk: { default: null },
  /** Префикс ключей i18n модуля, например <name>.monitor */
  labelPrefix: { type: String, default: 'sourceMonitor' },
  startLabel: { type: String, default: '' },
  stopLabel: { type: String, default: '' },
  startingLabel: { type: String, default: '' },
  stoppingLabel: { type: String, default: '' },
})

defineEmits(['start', 'stop'])

const { t, te } = useAppI18n()

function label(key, override) {
  if (override) {
    return override
  }
  const full = `${props.labelPrefix}.${key}`
  if (typeof te === 'function' && te(full)) {
    return t(full)
  }
  const core = `sourceMonitor.${key}`
  if (typeof te === 'function' && te(core)) {
    return t(core)
  }
  return t(full)
}

const startText = computed(() => label('start', props.startLabel))
const stopText = computed(() => label('stop', props.stopLabel))
const startingText = computed(() => label('starting', props.startingLabel))
const stoppingText = computed(() => label('stopping', props.stoppingLabel))
</script>

<style scoped>
.source-run-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  width: 100%;
  min-width: 0;
}

.source-run-actions__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
  margin-left: auto;
}

.source-run-actions__note {
  flex: 1 1 12rem;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ui-text-muted);
}

.source-run-actions__note--ok {
  color: var(--ui-success);
}

.source-run-actions__note--bad {
  color: var(--ui-danger);
}
</style>
