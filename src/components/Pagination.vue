<template>
  <div
    v-if="showControls"
    class="ergo-pagination"
    :class="[
      `ergo-pagination--${layout}`,
      `ergo-pagination--${variant}`,
      { 'ergo-pagination--disabled': disabled },
    ]"
  >
    <p v-if="showRangeInfo && rangeText" class="ergo-pagination__info text-muted small">
      {{ rangeText }}
      <span v-if="showPagePosition && totalPages > 1" class="ergo-pagination__position">
        ({{ t('components.pagination.pagePosition', { page: modelValue, total: totalPages }) }})
      </span>
    </p>

    <nav class="ergo-pagination__nav" :aria-label="t('components.pagination.navLabel')">
      <ul class="ergo-pagination__list">
        <li v-if="showFirstLast" class="ergo-pagination__item" :class="{ 'is-disabled': isFirstDisabled }">
          <button
            type="button"
            class="ergo-pagination__button ergo-pagination__button--icon"
            :aria-label="t('components.pagination.first')"
            :disabled="isFirstDisabled"
            @click="goToPage(1)"
          >
            <LucideIcon name="ChevronsLeft" :size="16" />
          </button>
        </li>

        <li class="ergo-pagination__item" :class="{ 'is-disabled': isPrevDisabled }">
          <button
            type="button"
            class="ergo-pagination__button ergo-pagination__button--icon"
            :aria-label="t('components.pagination.previous')"
            :disabled="isPrevDisabled"
            @click="goToPage(modelValue - 1)"
          >
            <LucideIcon name="ChevronLeft" :size="16" />
          </button>
        </li>

        <template v-if="variant === 'full'">
          <li
            v-for="(page, index) in visiblePages"
            :key="`${page}-${index}`"
            class="ergo-pagination__item"
            :class="{
              'is-active': page === modelValue,
              'is-disabled': page === '...',
            }"
          >
            <button
              v-if="page !== '...'"
              type="button"
              class="ergo-pagination__button ergo-pagination__button--number"
              :aria-current="page === modelValue ? 'page' : undefined"
              @click="goToPage(page)"
            >
              {{ page }}
            </button>
            <span v-else class="ergo-pagination__button ergo-pagination__button--ellipsis" aria-hidden="true">…</span>
          </li>
        </template>

        <li v-else class="ergo-pagination__item is-active" aria-current="page">
          <span class="ergo-pagination__button ergo-pagination__button--number">
            {{ modelValue }} / {{ totalPages }}
          </span>
        </li>

        <li class="ergo-pagination__item" :class="{ 'is-disabled': isNextDisabled }">
          <button
            type="button"
            class="ergo-pagination__button ergo-pagination__button--icon"
            :aria-label="t('components.pagination.next')"
            :disabled="isNextDisabled"
            @click="goToPage(modelValue + 1)"
          >
            <LucideIcon name="ChevronRight" :size="16" />
          </button>
        </li>

        <li v-if="showFirstLast" class="ergo-pagination__item" :class="{ 'is-disabled': isLastDisabled }">
          <button
            type="button"
            class="ergo-pagination__button ergo-pagination__button--icon"
            :aria-label="t('components.pagination.last')"
            :disabled="isLastDisabled"
            @click="goToPage(totalPages)"
          >
            <LucideIcon name="ChevronsRight" :size="16" />
          </button>
        </li>
      </ul>
      <PaginationJump
        v-if="!usesServerFlags || totalItems !== null"
        :current-page="modelValue"
        :total-pages="totalPages"
        :disabled="disabled"
        @change="goToPage"
      />
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import PaginationJump from '@/components/PaginationJump.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const { t } = useAppI18n()

const props = defineProps({
  modelValue: {
    type: Number,
    required: true,
  },
  totalPages: {
    type: Number,
    required: true,
  },
  totalItems: {
    type: Number,
    default: null,
  },
  pageSize: {
    type: Number,
    default: 10,
  },
  visibleCount: {
    type: Number,
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  variant: {
    type: String,
    default: 'full',
    validator: (value) => ['full', 'simple'].includes(value),
  },
  layout: {
    type: String,
    default: 'stacked',
    validator: (value) => ['toolbar', 'stacked', 'nav-only'].includes(value),
  },
  showRangeInfo: {
    type: Boolean,
    default: true,
  },
  showPagePosition: {
    type: Boolean,
    default: false,
  },
  showFirstLast: {
    type: Boolean,
    default: null,
  },
  hasNextPage: {
    type: Boolean,
    default: null,
  },
  hasPreviousPage: {
    type: Boolean,
    default: null,
  },
})

const emit = defineEmits(['update:modelValue', 'page-change'])

const usesServerFlags = computed(
  () => props.hasNextPage !== null || props.hasPreviousPage !== null,
)

const showFirstLast = computed(() => {
  if (props.showFirstLast !== null) {
    return props.showFirstLast
  }
  return props.variant === 'full' && !usesServerFlags.value
})

const showControls = computed(() => {
  if (props.totalPages > 1) {
    return true
  }
  if (usesServerFlags.value) {
    return props.hasNextPage || props.hasPreviousPage || props.modelValue > 1
  }
  return false
})

const isFirstDisabled = computed(() => props.disabled || props.modelValue <= 1)

const isLastDisabled = computed(() => props.disabled || props.modelValue >= props.totalPages)

const isPrevDisabled = computed(() => {
  if (props.disabled) return true
  if (props.hasPreviousPage !== null) {
    return !props.hasPreviousPage
  }
  return props.modelValue <= 1
})

const isNextDisabled = computed(() => {
  if (props.disabled) return true
  if (props.hasNextPage !== null) {
    return !props.hasNextPage
  }
  return props.modelValue >= props.totalPages
})

const startIndex = computed(() => (props.modelValue - 1) * props.pageSize)

const endIndex = computed(() => {
  if (props.totalItems === null) {
    if (props.visibleCount !== null) {
      return startIndex.value + props.visibleCount
    }
    return startIndex.value + props.pageSize
  }
  if (props.visibleCount !== null) {
    return Math.min(props.totalItems, startIndex.value + props.visibleCount)
  }
  return Math.min(props.totalItems, props.modelValue * props.pageSize)
})

const rangeText = computed(() => {
  if (props.totalItems === null) {
    if (props.visibleCount && props.visibleCount > 0) {
      return t('components.pagination.shownRangeNoTotal', {
        from: startIndex.value + 1,
        to: endIndex.value,
      })
    }
    return props.modelValue > 0
      ? t('components.pagination.pageOnly', { page: props.modelValue })
      : ''
  }
  if (props.totalItems === 0) {
    return t('components.pagination.noRecords')
  }
  return t('components.pagination.shownRange', {
    from: startIndex.value + 1,
    to: endIndex.value,
    total: props.totalItems,
  })
})

const visiblePages = computed(() => {
  const pages = []
  const total = Math.max(1, props.totalPages)
  const current = props.modelValue

  if (total <= 7) {
    for (let i = 1; i <= total; i += 1) {
      pages.push(i)
    }
    return pages
  }

  if (current <= 4) {
    for (let i = 1; i <= 5; i += 1) pages.push(i)
    pages.push('...')
    pages.push(total)
    return pages
  }

  if (current >= total - 3) {
    pages.push(1)
    pages.push('...')
    for (let i = total - 4; i <= total; i += 1) pages.push(i)
    return pages
  }

  pages.push(1)
  pages.push('...')
  for (let i = current - 1; i <= current + 1; i += 1) pages.push(i)
  pages.push('...')
  pages.push(total)
  return pages
})

function goToPage(page) {
  const target = Number(page)
  if (!Number.isFinite(target)) return
  if (target < 1) return
  if (target === props.modelValue) return
  if (props.disabled) return

  // Без известного total серверные флаги разрешают шаг ±1 за пределы totalPages.
  if (target > props.totalPages) {
    const canStepNext = props.hasNextPage === true && target === props.modelValue + 1
    if (!canStepNext) return
  }

  emit('update:modelValue', target)
  emit('page-change', target)
}
</script>

<style scoped lang="scss">
.ergo-pagination {
  min-width: 0;

  &--toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  &--stacked {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }

  &--nav-only {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
  }

  &--disabled {
    opacity: 0.85;
  }

  &__info {
    margin: 0;
  }

  &__position {
    margin-left: 0.25rem;
  }

  &__nav {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.65rem;
    min-width: 0;
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  &__item {
    display: flex;
    align-items: center;
    margin: 0;
    padding: 0;
    list-style: none;

    &::marker {
      content: none;
    }
  }

  &__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid var(--color-border, var(--bs-border-color));
    border-radius: 0.375rem;
    background-color: var(--color-primary-background, var(--ui-surface));
    color: var(--color-primary-text, var(--ui-text));
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1;
    box-shadow: none;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease;

    &--number {
      width: auto;
      padding: 0 0.5rem;
    }

    &--ellipsis {
      min-width: 1.5rem;
      border-color: transparent;
      background-color: transparent;
      cursor: default;
      padding: 0 0.125rem;
    }
  }

  button.ergo-pagination__button {
    cursor: pointer;

    &:hover:not(:disabled) {
      background-color: var(--color-hover-background, var(--ui-surface-2));
      border-color: var(--color-border, var(--bs-border-color));
      color: var(--color-primary-text, var(--ui-text));
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__item.is-active .ergo-pagination__button {
    background-color: var(--color-accent, var(--bs-primary));
    border-color: var(--color-accent, var(--bs-primary));
    color: var(--color-primary-background, #fff);
    font-weight: 600;
  }

  &__item.is-disabled .ergo-pagination__button {
    color: var(--color-secondary-text, var(--bs-secondary-color));
    opacity: 0.5;
    pointer-events: none;
  }
}
</style>
