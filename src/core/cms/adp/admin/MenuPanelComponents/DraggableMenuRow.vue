<template>
  <div class="menu-row-wrapper" :class="{ 'menu-row-wrapper--nested': level > 0, 'menu-row-wrapper--dragging': isDragging }">
    <div class="menu-row" :class="{ 'menu-row--nested': level > 0, 'menu-row--expanded': isExpanded && hasChildren, 'menu-row--inactive': !item.is_active }">
      <div v-handle class="menu-row__handle">
        <GripVertical :size="16" class="text-muted" />
      </div>
      
      <div v-if="hasChildren" class="menu-row__expand" @click="toggleExpand">
        <ChevronRight :size="16" class="expand-icon" :class="{ 'expand-icon--rotated': isExpanded }"/>
      </div>
      
      <div class="menu-row__type">
        <span class="badge" :class="itemTypeBadgeClass">
          {{ itemTypeLabel }}
        </span>
      </div>
      
      <div v-if="item.icon" class="menu-row__icon">
        <LucideIcon :name="item.icon" :size="18" icon-class="text-muted" />
      </div>
      
      <div class="menu-row__name">
        {{ item.name }}
        <small v-if="item.route_name" class="text-muted ms-2">
          ({{ item.route_name }})
        </small>
        <small v-if="item.item_type === 'external' && item.external_url" class="text-muted ms-2">
          ({{ item.external_url }})
        </small>
      </div>
      
      <ActionButtonsGroup :active="item.is_active" :visibility-text="item.is_active ? t('admin.menu.hideItem') : t('admin.menu.showItem')" :add-text="t('admin.menu.addChildItem')" :add-aria-label="t('admin.menu.addChildItemAria')" :edit-text="t('admin.menu.editItem')" :edit-aria-label="t('admin.menu.editItemAria')" :delete-text="t('admin.menu.deleteItem')" :delete-aria-label="t('admin.menu.deleteItemAria')" @toggle-visibility="toggleVisibility" @add="$emit('add', item)" @edit="$emit('edit', item)" @delete="$emit('delete', item)"/>
    </div>
    
    <div v-if="hasChildren" class="menu-row__collapse" :class="{ 'menu-row__collapse--open': isExpanded, 'menu-row__collapse--settling': settling }" @transitionend="onCollapseEnd">
      <div class="menu-row__collapse-inner">
        <div class="menu-row__children">
          <SlickList v-model:list="localChildren" axis="y" lockAxis="y" :useDragHandle="true" @sort-start="onSortStart" @sort-end="onChildrenReorder" class="children-list">
            <SlickItem v-for="(child, childIndex) in localChildren" :key="child.id" :index="childIndex" class="child-item">
              <DraggableMenuRow :item="child" :level="level + 1" :index="childIndex" :expand-all-groups="expandAllGroups" @edit="$emit('edit', $event)" @delete="$emit('delete', $event)" @add="$emit('add', $event)" @reorder-children="$emit('reorder-children', $event)" @toggle-visibility="$emit('toggle-visibility', $event)" @child-drag-start="$emit('child-drag-start')" @child-drag-end="$emit('child-drag-end')"/>
            </SlickItem>
          </SlickList>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { SlickList, SlickItem, HandleDirective as vHandle } from 'vue-slicksort'
import { GripVertical, ChevronRight } from '@lucide/vue'
import LucideIcon from '@/components/LucideIcon.vue'
import ActionButtonsGroup from './components/ActionButtonsGroup.vue'

const { t } = useAppI18n()


const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  level: {
    type: Number,
    default: 0
  },
  index: {
    type: Number,
    default: 0
  },
  expandAllGroups: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['edit', 'delete', 'add', 'reorder-children', 'toggle-visibility', 'child-drag-start', 'child-drag-end'])

const isDragging = ref(false)

const localChildren = ref([])

const hasChildren = computed(() => {
  return props.item.children && props.item.children.length > 0
})

const isExpanded = ref(false)
const settling = ref(false)
let settleTimer = null
let mounted = false

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.dataset.ergoMotion === 'reduce'
}

function finishSettle() {
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
  settling.value = false
}

function setExpanded(next) {
  if (next === isExpanded.value) return
  if (prefersReducedMotion()) {
    isExpanded.value = next
    finishSettle()
    return
  }
  settling.value = true
  isExpanded.value = next
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(finishSettle, 320)
}

function onCollapseEnd(event) {
  if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return
  finishSettle()
}

watch(
  [() => props.expandAllGroups, hasChildren],
  ([expandAll, children]) => {
    if (!children) {
      isExpanded.value = false
      finishSettle()
      return
    }
    if (!mounted) {
      isExpanded.value = expandAll
      return
    }
    setExpanded(expandAll)
  },
  { immediate: true }
)

onMounted(() => {
  mounted = true
})

onBeforeUnmount(() => {
  if (settleTimer) clearTimeout(settleTimer)
})

watch(
  () => props.item.children,
  (newChildren) => {
    if (!isDragging.value && newChildren) {
      localChildren.value = [...newChildren]
    }
  },
  { immediate: true, deep: true }
)

const itemTypeLabel = computed(() => {
  const labels = {
    route: t('admin.menu.typeRoute'),
    offcanvas: t('admin.menu.typePanelShort'),
    external: t('admin.menu.typeExternalShort'),
  }
  return labels[props.item.item_type] || (props.item.item_type === 'group' ? t('admin.menu.typeRoute') : props.item.item_type)
})

const itemTypeBadgeClass = computed(() => {
  const classes = {
    route: 'bg-info',
    offcanvas: 'bg-warning text-dark',
    external: 'bg-secondary'
  }
  return classes[props.item.item_type] || (props.item.item_type === 'group' ? 'bg-primary' : 'bg-light text-dark')
})

// Переключение раскрытия
function toggleExpand() {
  if (hasChildren.value) {
    setExpanded(!isExpanded.value)
  }
}

function onSortStart() {
  isDragging.value = true
  emit('child-drag-start')
}

function onChildrenReorder() {
  nextTick(() => {
    const reorderedItems = localChildren.value.map((child, index) => ({
      id: child.id,
      order: index * 10,
      parent_id: props.item.id
    }))
    
    emit('reorder-children', reorderedItems)
    emit('child-drag-end')
    isDragging.value = false
  })
}

// Переключение видимости элемента
function toggleVisibility() {
  emit('toggle-visibility', {
    id: props.item.id,
    is_active: !props.item.is_active
  })
}
</script>

<style lang="scss" scoped>
.menu-row-wrapper {
  width: 100%;

  &--nested {
    padding-left: 2rem;
  }

  &--dragging {
    user-select: none;
  }
}

.menu-row {
  display: flex;
  align-items: center;
  padding: 0.75rem 0.5rem;
  background: var(--color-primary-background);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  gap: 0.5rem;
  transition: background-color 0.15s ease, border-radius 0.28s ease;

  @include ui-reduced-motion;
  
  &:hover {
    background-color: var(--color-hover-background);
  }
  
  &--nested {
    background: var(--color-secondary-background);
  }
  
  &--expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  
  &__handle {
    cursor: grab;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    user-select: none;
    
    &:active {
      cursor: grabbing;
    }
  }
  
  &__order {
    min-width: 40px;
    text-align: center;
  }
  
  &__expand {
    width: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
  }
  
  &__name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  &__type {
    display: flex;
    align-items: center;
  }
  
  &__children {
    border: 1px solid var(--color-border);
    border-top: none;
    border-radius: 0 0 4px 4px;
    padding: 0.5rem;
    background: var(--color-secondary-background);
  }

  &--inactive {
    position: relative;

    .menu-row__handle svg,
    .menu-row__type .badge,
    .menu-row__icon svg,
    .menu-row__name {
      opacity: 0.5;
      filter: grayscale(50%);
    }

    .menu-row__expand {
      opacity: 1 !important;
      filter: none !important;

      svg {
        opacity: 1 !important;
        filter: none !important;
        color: var(--color-primary-text) !important;
      }
    }
  }
}

.menu-row__collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.28s ease;

  @include ui-reduced-motion;

  &--open {
    grid-template-rows: 1fr;
  }
}

.menu-row__collapse-inner {
  min-height: 0;
  overflow: hidden;
}

.menu-row__collapse--open:not(.menu-row__collapse--settling) .menu-row__collapse-inner {
  overflow: visible;
}

.expand-icon {
  transition: transform 0.2s ease;

  @include ui-reduced-motion;
  
  &--rotated {
    transform: rotate(90deg);
  }
}

.children-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.child-item {
  margin-bottom: 4px;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  &.SortableHelper {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    z-index: 1000;
  }
}
</style>