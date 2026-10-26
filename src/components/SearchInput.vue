<template>
  <div class="search-input" :class="[ `search-input--layout-${layout}`, { 'search-input--no-icon': !showIcon }, { 'search-input--clearable': showClearButton }, `search-input--bg-${background}`, `search-input--focus-${focusBorder}`, ]">
    <label v-if="label" :for="inputId" class="form-label mb-1">{{ label }}</label>
    <div class="search-input__wrap">
      <LucideIcon v-if="showIcon" name="Search" :size="iconSize" class="search-input__icon" icon-class="search-input__icon"/>
      <input :id="inputId" ref="inputEl" :value="modelValue" :type="inputType" class="form-control search-input__control" :placeholder="resolvedPlaceholder" :disabled="disabled" :aria-label="ariaLabel" autocomplete="off" @input="onInput" @focus="emit('focus', $event)" @blur="emit('blur', $event)"/>
      <button v-if="showClearButton" type="button" class="search-input__clear" :aria-label="t('components.searchInput.clear')" :disabled="disabled" @click="clear">
        <LucideIcon name="X" :size="iconSize" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, useId } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const { t } = useAppI18n()

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: undefined,
  },
  label: {
    type: String,
    default: '',
  },
  id: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  inputType: {
    type: String,
    default: 'search',
  },
  showIcon: {
    type: Boolean,
    default: false,
  },
  /** Крестик очистки поля; по умолчанию включён */
  clearable: {
    type: Boolean,
    default: true,
  },
  background: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary'].includes(value),
  },
  focusBorder: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'primary'].includes(value),
  },
  layout: {
    type: String,
    default: 'grow',
    validator: (value) => ['grow', 'fixed', 'fill'].includes(value),
  },
})

const emit = defineEmits(['update:modelValue', 'input', 'focus', 'blur', 'clear'])

const inputEl = ref(null)
const generatedId = useId()
const inputId = computed(() => props.id || generatedId)
const resolvedPlaceholder = computed(
  () => props.placeholder ?? t('components.searchInput.placeholder'),
)
const ariaLabel = computed(() => props.label || resolvedPlaceholder.value)
const iconSize = 16
const showClearButton = computed(
  () => props.clearable && !props.disabled && String(props.modelValue ?? '').length > 0,
)

function onInput(event) {
  const value = event?.target?.value ?? ''
  emit('update:modelValue', value)
  emit('input', value)
}

function clear() {
  if (props.disabled) return
  emit('update:modelValue', '')
  emit('input', '')
  emit('clear')
  inputEl.value?.focus()
}

function focus(options) {
  inputEl.value?.focus(options)
}

defineExpose({ focus })
</script>

<style scoped lang="scss">
.search-input {
  --search-input-height: 38px;
  --search-input-font-size: inherit;
  --search-input-icon-size: 16px;
  --search-input-border-radius: 6px;
  --search-input-padding-start: 40px;
  --search-input-padding-start-no-icon: 0.75rem;
  --search-input-padding-end: 0.75rem;
  --search-input-padding-end-clearable: 2.25rem;

  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;

  &--layout-grow {
    flex: 1 1 0;
    width: auto;
    min-width: 200px;

    @media (width < $ui-bp-md) {
      flex: 1 1 100%;
      min-width: 0;
      width: 100%;
    }
  }

  &--layout-fixed {
    flex: 0 1 280px;
    width: auto;
    min-width: 180px;

    @media (width < $ui-bp-md) {
      flex: 1 1 100%;
      min-width: 0;
      width: 100%;
      max-width: 100%;
    }
  }

  &--layout-fill {
    flex: none;
    width: 100%;
    min-width: 0;
  }

  &__wrap {
    position: relative;
    width: 100%;
  }

  &__icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--bs-secondary-color);
    pointer-events: none;
    z-index: 1;
  }

  &__clear {
    position: absolute;
    right: 0.35rem;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--bs-secondary-color);
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--color-primary-text);
      background: var(--color-hover-background, color-mix(in srgb, var(--color-primary-text) 8%, transparent));
    }

    &:focus-visible {
      outline: 2px solid var(--color-primary-text);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__control {
    width: 100%;
    box-sizing: border-box;
    height: var(--search-input-height);
    font-size: var(--search-input-font-size);
    border-radius: var(--search-input-border-radius);
    border: 1px solid var(--color-border);
    color: var(--color-primary-text);
    padding-right: var(--search-input-padding-end);

    &::placeholder {
      color: var(--color-secondary-text);
    }

    /* Скрываем нативный крестик type=search — используем свой */
    &::-webkit-search-cancel-button,
    &::-webkit-search-decoration {
      -webkit-appearance: none;
      appearance: none;
    }
  }

  &--clearable .search-input__control {
    padding-right: var(--search-input-padding-end-clearable);
  }

  &:not(.search-input--no-icon) .search-input__control {
    padding-left: var(--search-input-padding-start);
  }

  &--no-icon .search-input__control {
    padding-left: var(--search-input-padding-start-no-icon);
  }

  &--bg-primary .search-input__control {
    background-color: var(--color-primary-background);
  }

  &--bg-secondary .search-input__control {
    background-color: var(--color-secondary-background);
    font-size: 0.875rem;
  }

  &--focus-primary .search-input__control:focus,
  &--focus-primary .search-input__control:focus-visible {
    border-color: var(--color-primary-text);
    box-shadow: none;
  }
}
</style>
