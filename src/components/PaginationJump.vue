<template>
  <div v-if="totalPages > 1" class="ergo-pagination-jump">
    <label :for="inputId">{{ t('components.pagination.jumpLabel') }}</label>
    <input
      :id="inputId"
      v-model="pageInput"
      class="ergo-pagination-jump__input"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="off"
      :disabled="disabled"
      :aria-invalid="showError"
      :aria-describedby="showError ? `${inputId}-total ${inputId}-error` : `${inputId}-total`"
      @keydown.enter.stop.prevent="submit"
    />
    <span :id="`${inputId}-total`">{{ t('components.pagination.ofTotal', { total: totalPages }) }}</span>
    <button
      type="button"
      class="ergo-pagination-jump__button"
      :disabled="disabled || !isValid || targetPage === currentPage"
      @click="submit"
    >
      {{ t('components.pagination.jumpAction') }}
    </button>
    <span v-if="showError" :id="`${inputId}-error`" class="ergo-pagination-jump__error" role="status">
      {{ t('components.pagination.jumpError', { total: totalPages }) }}
    </span>
  </div>
</template>

<script setup>
import { computed, ref, useId, watch } from 'vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const props = defineProps({
  currentPage: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['change'])
const { t } = useAppI18n()
const inputId = useId()
const pageInput = ref(String(props.currentPage))
const targetPage = computed(() => Number(pageInput.value.trim()))
const isValid = computed(() => (
  /^\d+$/.test(pageInput.value.trim())
  && Number.isSafeInteger(targetPage.value)
  && targetPage.value >= 1
  && targetPage.value <= props.totalPages
))
const showError = computed(() => pageInput.value.trim() !== '' && !isValid.value)

watch(
  () => [props.currentPage, props.totalPages],
  () => { pageInput.value = String(props.currentPage) },
)

function submit() {
  if (props.disabled || !isValid.value || targetPage.value === props.currentPage) return
  emit('change', targetPage.value)
}
</script>

<style scoped lang="scss">
.ergo-pagination-jump {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-width: 0;
  color: var(--ui-text-muted);
  font-size: 0.8125rem;

  label { margin: 0; }

  &__input,
  &__button {
    min-height: 2rem;
    border: 1px solid var(--ui-border);
    border-radius: 0.45rem;
    background: var(--ui-surface);
    color: var(--ui-text);
    font: inherit;

    &:focus-visible {
      outline: 2px solid var(--ui-accent);
      outline-offset: 1px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }

  &__input {
    width: 4.5rem;
    padding: 0.2rem 0.4rem;
    text-align: center;

    &[aria-invalid='true'] { border-color: var(--ui-danger); }
  }

  &__button {
    padding: 0.2rem 0.65rem;
    cursor: pointer;

    &:hover:not(:disabled) { background: var(--ui-surface-2); }
  }

  &__error {
    flex-basis: 100%;
    color: var(--ui-danger);
    text-align: center;
  }
}
</style>
