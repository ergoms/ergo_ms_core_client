<template>
  <HoverTooltip :text="text" :wrap="wrap">
    <button type="button" class="btn icon-action-btn" :class="[`icon-action-btn--${size}`, `icon-action-btn--${variant}`]" :aria-label="resolvedAriaLabel" :disabled="disabled || loading" :aria-busy="loading || undefined" @click="onClick">
      <Loader2 v-if="loading" :size="iconSize" class="icon-action-btn__spinner" aria-hidden="true"/>
      <component :is="icon" v-else :size="iconSize" aria-hidden="true"/>
    </button>
  </HoverTooltip>
</template>

<script setup>
import { computed } from 'vue'
import { Loader2 } from '@lucide/vue'
import HoverTooltip from '@/components/HoverTooltip.vue'

const props = defineProps({
  /** Текст HoverTooltip и aria-label по умолчанию */
  text: { type: String, required: true },
  /** Lucide-компонент иконки */
  icon: { type: [Object, Function], required: true },
  /** aria-label; по умолчанию = text */
  ariaLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  /** Перенос длинного текста в tooltip */
  wrap: { type: Boolean, default: false },
  /** md — toolbar 36px; sm — строка списка 32px; lg — футер модалки 44px */
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  /** default — нейтральный hover; danger — красный (удаление) */
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'danger'].includes(value),
  },
  iconSize: { type: Number, default: 18 },
  stopPropagation: { type: Boolean, default: true },
})

const emit = defineEmits(['click'])

const resolvedAriaLabel = computed(() => props.ariaLabel || props.text)

function onClick(event) {
  if (props.stopPropagation) {
    event.stopPropagation()
  }
  if (props.disabled || props.loading) {
    return
  }
  emit('click', event)
}
</script>

<style scoped lang="scss">
.icon-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  border: none;
  border-radius: 1.5rem;
  padding: 0;
  color: inherit;

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  &--md {
    width: 36px;
    height: 36px;
  }

  &--sm {
    width: 32px;
    height: 32px;
  }

  &--lg {
    width: 44px;
    height: 44px;
  }

  &--default:hover:not(:disabled) {
    background-color: var(--ui-hover, var(--color-hover-background));
  }

  &--danger:hover:not(:disabled) {
    color: var(--ui-danger, var(--bs-danger, #dc3545));
    background-color: color-mix(in srgb, var(--ui-danger, var(--bs-danger, #dc3545)) 15%, transparent);
  }
}

.icon-action-btn__spinner {
  animation: icon-action-btn-spin 0.9s linear infinite;
}

@keyframes icon-action-btn-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon-action-btn__spinner {
    animation: none;
  }
}
</style>