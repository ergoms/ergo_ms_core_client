<template>
  <button ref="root" type="button" class="menu-action-btn" :class="`menu-action-btn--${tone}`" :aria-label="resolvedAriaLabel" @click.stop="emit('click')" @pointerenter="syncHover" @pointerleave="syncHover">
    <HoverTooltip :text="text">
      <LucideMotionIcon :name="icon" :animate="hovered" :size="size" aria-hidden="true"/>
    </HoverTooltip>
  </button>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import HoverTooltip from '@/components/HoverTooltip.vue'
import LucideMotionIcon from '@/components/LucideMotionIcon.vue'

const props = defineProps({
  text: { type: String, required: true },
  ariaLabel: { type: String, default: '' },
  icon: { type: String, required: true },
  size: { type: Number, default: 20 },
  /**
   * hide — обычный цвет, наведение красное (скрыть).
   * show — красный, наведение цветом текста (показать).
   * primary / danger — цвет наведения у шестерёнки и корзины.
   */
  tone: {
    type: String,
    default: 'neutral',
    validator: (value) => ['neutral', 'hide', 'show', 'primary', 'danger'].includes(value),
  },
})

const emit = defineEmits(['click'])

const root = ref(null)
const hovered = ref(false)
const resolvedAriaLabel = computed(() => props.ariaLabel || props.text)

let row = null

function syncHover() {
  hovered.value = !!root.value?.matches(':hover')
}

onMounted(() => {
  row = root.value?.closest('.menu-row, .separator-row-inline')
  row?.addEventListener('mousemove', syncHover)
  row?.addEventListener('mouseleave', syncHover)
})

onBeforeUnmount(() => {
  row?.removeEventListener('mousemove', syncHover)
  row?.removeEventListener('mouseleave', syncHover)
})
</script>

<style scoped lang="scss">
.menu-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary-text);
  flex-shrink: 0;

  &--hide:hover,
  &--danger:hover {
    color: var(--bs-danger);
  }

  &--show {
    color: var(--bs-danger);

    &:hover {
      color: var(--color-primary-text);
    }
  }

  &--primary:hover {
    color: var(--bs-primary);
  }
}
</style>