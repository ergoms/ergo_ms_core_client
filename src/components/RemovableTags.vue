<script setup>
import { X } from '@lucide/vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  removeLabel: {
    type: [String, Function],
    required: true,
  },
  accent: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['remove'])

function labelFor(item) {
  return typeof props.removeLabel === 'function' ? props.removeLabel(item) : props.removeLabel
}
</script>

<template>
  <ul v-if="items.length" class="removable-tags" :class="{ 'removable-tags--accent': accent }">
    <li v-for="item in items" :key="item" class="removable-tags__item">
      <span>{{ item }}</span>
      <button type="button" class="removable-tags__remove" :aria-label="labelFor(item)" :disabled="disabled" @click="emit('remove', item)">
        <X :size="14" aria-hidden="true" />
      </button>
    </li>
  </ul>
</template>

<style scoped lang="scss">
@use '@/scss/ui/mixins' as *;

.removable-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  max-width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.removable-tags__item {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  max-width: 100%;
  min-width: 0;
  min-height: 1.85rem;
  padding: 0.15rem 0.2rem 0.15rem 0.7rem;
  border-radius: var(--ui-pill);
  background: var(--ui-neutral-soft);
  color: var(--ui-text);
  font-size: 0.8125rem;
  line-height: 1.3;
}

.removable-tags__item span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.removable-tags__remove {
  @include ui-a11y-focus;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: var(--ui-pill);
  background: transparent;
  color: var(--ui-text-muted);
}

.removable-tags__remove:hover:not(:disabled) {
  color: var(--ui-text);
}

.removable-tags__remove:disabled {
  cursor: default;
}

.removable-tags--accent .removable-tags__item {
  background: var(--ui-accent);
  color: var(--ui-accent-text);
}

.removable-tags--accent .removable-tags__remove,
.removable-tags--accent .removable-tags__remove:hover:not(:disabled) {
  color: var(--ui-accent-text);
}
</style>