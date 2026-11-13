<template>
  <div class="draggable-menu-list" :class="{ 'draggable-menu-list--dragging': isDragging || isChildDragging, 'draggable-menu-list--child-dragging': isChildDragging }">
    <SlickList v-model:list="combinedList" axis="y" lockAxis="y" :useDragHandle="true" @sort-start="onSortStart" @sort-end="onSortEnd" class="slick-list">
      <SlickItem v-for="(item, index) in combinedList" :key="item._uniqueKey" :index="index" :class="item._type === 'separator' ? 'slick-item-separator' : 'slick-item'">
        <div v-if="item._type === 'separator'" class="separator-row-inline" :class="{ 'separator-row-inline--inactive': !item.is_active }">
          <div v-handle class="separator-row-inline__handle">
            <GripVertical :size="14" class="text-muted" />
          </div>
          <div class="separator-row-inline__line"></div>
          <span class="separator-row-inline__label" @click.stop="$emit('edit-separator', getOriginalSeparator(item))">
            <Minus :size="14" />{{ item.name }}
          </span>
          <div class="separator-row-inline__line"></div>
          <ActionButtonsGroup overlay :active="item.is_active" :visibility-text="item.is_active ? t('admin.menu.hideSeparator') : t('admin.menu.showSeparator')" :edit-text="t('admin.menu.editItem')" :edit-aria-label="t('admin.menu.editSeparator')" :delete-text="t('admin.menu.deleteItem')" :delete-aria-label="t('admin.menu.deleteSeparator')" @toggle-visibility="$emit('toggle-visibility-separator', getOriginalSeparator(item))" @edit="$emit('edit-separator', getOriginalSeparator(item))" @delete="$emit('delete-separator', getOriginalSeparator(item))"/>
        </div>
        
        <DraggableMenuRow v-else :item="item" :level="0" :index="index" :expand-all-groups="expandAllGroups" @edit="$emit('edit', $event)" @delete="$emit('delete', $event)" @add="$emit('add', $event)" @reorder-children="$emit('reorder', $event)" @toggle-visibility="$emit('toggle-visibility', $event)" @child-drag-start="onChildDragStart" @child-drag-end="onChildDragEnd"/>
      </SlickItem>
    </SlickList>
  </div>
</template>

<script setup>
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { ref, watch, nextTick } from 'vue'
import { SlickList, SlickItem, HandleDirective as vHandle } from 'vue-slicksort'
import { Minus, GripVertical } from '@lucide/vue'
import ActionButtonsGroup from './components/ActionButtonsGroup.vue'
import DraggableMenuRow from './DraggableMenuRow.vue'

const { t } = useAppI18n()

const props = defineProps({
  items: {
    type: Array,
    required: true
  },
  separators: {
    type: Array,
    default: () => []
  },
  expandAllGroups: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['edit', 'delete', 'add', 'reorder', 'reorder-separators', 'toggle-visibility', 'edit-separator', 'delete-separator', 'toggle-visibility-separator'])

const isDragging = ref(false)
const isChildDragging = ref(false)
const combinedList = ref([])

function buildCombinedList(items, separators) {
  const result = []
  
  const menuItems = items.map(item => ({
    ...item,
    _type: 'menu_item',
    _uniqueKey: 'menu_' + item.id,
    _sortOrder: item.order
  }))
  
  const sepItems = separators
    .map(sep => ({
      ...sep,
      _type: 'separator',
      _uniqueKey: 'sep_' + sep.id,
      _sortOrder: sep.before_order
    }))
  
  result.push(...menuItems, ...sepItems)
  result.sort((a, b) => {
    if (a._sortOrder !== b._sortOrder) {
      return a._sortOrder - b._sortOrder
    }
    if (a._type === 'separator' && b._type !== 'separator') return -1
    if (a._type !== 'separator' && b._type === 'separator') return 1
    return 0
  })
  
  return result
}

watch(
  [() => props.items, () => props.separators],
  ([newItems, newSeparators]) => {
    if (!isDragging.value) {
      combinedList.value = buildCombinedList(newItems, newSeparators)
    }
  },
  { immediate: true, deep: true }
)

function getOriginalSeparator(item) {
  return props.separators.find(sep => sep.id === item.id)
}

function onSortStart() {
  isDragging.value = true
}

function onSortEnd() {
  nextTick(() => {
    const reorderedMenuItems = []
    const reorderedSeparators = []
    
    combinedList.value.forEach((item, index) => {
      const newOrder = index * 10
      
      if (item._type === 'menu_item') {
        reorderedMenuItems.push({
          id: item.id,
          order: newOrder
        })
      } else if (item._type === 'separator') {
        // Якорь — следующий пункт меню в списке (или null, если разделитель в конце)
        let beforeCatalogKey = null
        for (let i = index + 1; i < combinedList.value.length; i++) {
          const next = combinedList.value[i]
          if (next._type === 'menu_item' && next.catalog_key) {
            beforeCatalogKey = next.catalog_key
            break
          }
        }
        reorderedSeparators.push({
          id: item.id,
          before_order: newOrder,
          before_catalog_key: beforeCatalogKey
        })
      }
    })
    
    if (reorderedMenuItems.length > 0) {
      emit('reorder', reorderedMenuItems)
    }
    if (reorderedSeparators.length > 0) {
      emit('reorder-separators', reorderedSeparators)
    }
    
    isDragging.value = false
  })
}

function onChildDragStart() {
  isChildDragging.value = true
}

function onChildDragEnd() {
  isChildDragging.value = false
}
</script>

<style lang="scss" scoped>
.draggable-menu-list {
  width: 100%;

  &.draggable-menu-list--dragging {
    user-select: none;
  }

  &.draggable-menu-list--child-dragging {
    > .slick-list > .slick-item,
    > .slick-list > .slick-item-separator {
      transform: none !important;
      transition: none !important;
    }
  }
}

.slick-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.slick-item {
  background: var(--color-primary-background);
  margin-bottom: 2px;
  
  &.SortableHelper {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    z-index: 1000;
  }
}

.slick-item-separator {
  margin-bottom: 2px;
  
  &.SortableHelper {
    box-shadow: 0 4px 12px rgba(23, 162, 184, 0.25);
    border-radius: 4px;
    z-index: 1000;
    background: var(--color-primary-background);
  }
}

.separator-row-inline {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.75rem 0.5rem;
  transition: background-color 0.15s ease;
  border-radius: 4px;
  background: var(--color-primary-background);
  border: 1px dashed var(--bs-info);
  min-height: 48px;
  
  &:hover {
    background-color: var(--color-hover-background);
  }
  
  &__handle {
    cursor: grab;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    margin-right: 0.25rem;
    user-select: none;
    
    &:active {
      cursor: grabbing;
    }
  }
  
  &__line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--bs-info) 20%, var(--bs-info) 80%, transparent);
  }
  
  &__label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    color: var(--bs-info);
    background: var(--bs-info-bg-subtle);
    border-radius: 4px;
    white-space: nowrap;
    cursor: pointer;
    
    &:hover {
      background: var(--bs-info-border-subtle);
    }
    
    svg {
      flex-shrink: 0;
    }
  }
  
  &--inactive {
    position: relative;
    
    .separator-row-inline__handle svg,
    .separator-row-inline__line,
    .separator-row-inline__label {
      opacity: 0.5;
      filter: grayscale(50%);
    }
    
    .separator-row-inline__label {
      color: var(--color-secondary-text);
      background: var(--color-secondary-background);
    }
    
    .separator-row-inline__line {
      background: linear-gradient(90deg, transparent, var(--color-secondary-text) 20%, var(--color-secondary-text) 80%, transparent);
    }
    
  }
}
</style>