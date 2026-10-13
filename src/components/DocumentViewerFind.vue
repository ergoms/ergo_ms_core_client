<template>
  <div class="document-viewer-find">
    <SearchInput
      :model-value="modelValue"
      layout="fixed"
      show-icon
      :placeholder="t('components.documentViewer.searchPlaceholder')"
      @update:model-value="emit('update:modelValue', $event)"
      @keydown="onKeydown"
    />
    <span v-if="queryText" class="document-viewer-find__count" aria-live="polite">{{ countLabel }}</span>
    <HoverTooltip :text="t('components.documentViewer.searchPrev')" wrap>
      <button type="button" class="document-viewer-find__btn" :disabled="!total" :aria-label="t('components.documentViewer.searchPrev')" @click="emit('prev')">
        <ChevronUp :size="18" aria-hidden="true" />
      </button>
    </HoverTooltip>
    <HoverTooltip :text="t('components.documentViewer.searchNext')" wrap>
      <button type="button" class="document-viewer-find__btn" :disabled="!total" :aria-label="t('components.documentViewer.searchNext')" @click="emit('next')">
        <ChevronDown :size="18" aria-hidden="true" />
      </button>
    </HoverTooltip>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ChevronDown, ChevronUp } from '@lucide/vue'
import HoverTooltip from '@/components/HoverTooltip.vue'
import SearchInput from '@/components/SearchInput.vue'
import { ensureDocumentViewerI18n } from '@/components/documentViewerI18n.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'

ensureDocumentViewerI18n()

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  current: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['update:modelValue', 'next', 'prev'])
const { t } = useAppI18n()
const queryText = computed(() => String(props.modelValue || '').trim())
const countLabel = computed(() => {
  if (!props.total) {
    return t('components.documentViewer.searchEmpty')
  }
  return t('components.documentViewer.searchCount', {
    current: props.current + 1,
    total: props.total,
  })
})

function onKeydown(event) {
  if (event.key !== 'Enter' || event.isComposing) {
    return
  }
  event.preventDefault()
  emit(event.shiftKey ? 'prev' : 'next')
}
</script>

<style scoped lang="scss">
@use '@/scss/ui/mixins' as *;

.document-viewer-find {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;

  :deep(.search-input) {
    flex: 1 1 auto;
    min-width: 0;
  }

  :deep(.hover-tooltip) {
    display: contents;
  }
}

.document-viewer-find__count {
  flex: 0 0 auto;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.document-viewer-find__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm, 0.375rem);
  background: transparent;
  color: var(--ui-text);
  @include ui-a11y-focus;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ui-accent) 10%, var(--ui-surface));
  }

  &:disabled {
    opacity: 0.4;
  }
}
</style>
