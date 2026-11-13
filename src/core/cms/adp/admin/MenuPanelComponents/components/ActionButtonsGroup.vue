<template>
  <div ref="root" class="menu-action-group" :class="{ 'menu-action-group--overlay': overlay, 'is-open': open }">
    <ActionButton class="menu-action-group__visibility" :class="{ 'is-persistent': !active }" :text="visibilityText" :icon="active ? 'Eye' : 'EyeOff'" :tone="active ? 'hide' : 'show'" @click="emit('toggle-visibility')"/>
    <span v-if="addText" class="menu-action-group__tool">
      <ActionButton :text="addText" :aria-label="addAriaLabel" icon="LayersPlus" tone="primary" @click="emit('add')"/>
    </span>
    <span class="menu-action-group__tool">
      <ActionButton :text="editText" :aria-label="editAriaLabel" icon="Settings" tone="primary" @click="emit('edit')"/>
    </span>
    <span class="menu-action-group__tool">
      <ActionButton :text="deleteText" :aria-label="deleteAriaLabel" icon="Trash" tone="danger" @click="emit('delete')"/>
    </span>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ActionButton from './ActionButton.vue'

defineProps({
  active: { type: Boolean, default: true },
  /** Кнопки поверх строки справа. Так стоит группа у разделителя. */
  overlay: { type: Boolean, default: false },
  visibilityText: { type: String, required: true },
  addText: { type: String, default: '' },
  addAriaLabel: { type: String, default: '' },
  editText: { type: String, required: true },
  editAriaLabel: { type: String, default: '' },
  deleteText: { type: String, required: true },
  deleteAriaLabel: { type: String, default: '' },
})

const emit = defineEmits(['toggle-visibility', 'add', 'edit', 'delete'])

const root = ref(null)
const open = ref(false)
let row = null

function onEnter() {
  open.value = true
}

function onLeave() {
  open.value = false
}

onMounted(() => {
  row = root.value?.closest('.menu-row, .separator-row-inline')
  row?.addEventListener('mouseenter', onEnter)
  row?.addEventListener('mouseleave', onLeave)
  open.value = !!row?.matches(':hover')
})

onBeforeUnmount(() => {
  row?.removeEventListener('mouseenter', onEnter)
  row?.removeEventListener('mouseleave', onLeave)
})
</script>

<style scoped lang="scss">
.menu-action-group {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.25rem;
  overflow: hidden;

  &--overlay {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
  }
}

.menu-action-group__visibility {
  padding: 0.25rem;
  opacity: 0;
  transition: opacity 0.3s ease, color 0.3s ease;
}

.menu-action-group.is-open .menu-action-group__visibility,
.menu-action-group__visibility.is-persistent {
  opacity: 1;
}

.menu-action-group__tool {
  display: flex;
  width: 0;
  overflow: hidden;
  transition: width 0.3s ease;

  :deep(.menu-action-btn) {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
  }
}

.menu-action-group.is-open .menu-action-group__tool {
  width: 28px;
}

@media (hover: none) {
  .menu-action-group__visibility {
    opacity: 1;
  }

  .menu-action-group__tool {
    width: 28px;
  }
}
</style>