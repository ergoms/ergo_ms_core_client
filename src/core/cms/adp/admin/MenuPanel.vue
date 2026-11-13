<template>
  <div class="menu-panel">
    <div class="menu-panel__header mb-4">
      <div class="menu-panel__title-row">
        <h1 class="menu-panel__title">{{ t('admin.menu.pageTitle') }}</h1>
        <HoverTooltip :text="t('admin.menu.pageSettings')" wrap>
          <button type="button" class="btn-action" :aria-label="t('admin.menu.pageSettings')" @click="showSettingsModal = true">
            <Settings :size="20" aria-hidden="true" />
          </button>
        </HoverTooltip>
      </div>
      <p class="text-muted mb-0">{{ t('admin.menu.pageSubtitle') }}</p>
    </div>

    <div class="menu-panel__actions d-flex gap-3 mb-4 flex-wrap">
      <button type="button" class="ui-btn ui-btn--secondary" :disabled="isSaving || isRestoring" @click="showAddModal()">
        <LayersPlus :size="16" aria-hidden="true" />
        <span>{{ t('admin.menu.addItem') }}</span>
      </button>
      <button type="button" class="ui-btn ui-btn--secondary" :disabled="isSaving || isRestoring" @click="showAddSeparatorModal">
        <SeparatorHorizontal :size="16" aria-hidden="true" />
        <span>{{ t('admin.menu.addSeparator') }}</span>
      </button>
      <button type="button" class="ui-btn ui-btn--secondary" :disabled="isSaving || isRestoring" @click="handleRestoreMenu">
        <span v-if="isRestoring" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        <RotateCcw v-else :size="16" aria-hidden="true" />
        <span>{{ isRestoring ? t('admin.menu.restoring') : t('admin.menu.restoreFromMigrations') }}</span>
      </button>
    </div>

    <UnsavedChangesToast :visible="hasUnsavedChanges" :saving="isSaving" :title="t('admin.menu.unsavedOrderTitle')" :description="t('admin.menu.unsavedOrderDesc')" :cancel-label="t('admin.menu.discard')" @save="saveAllChanges" @cancel="cancelChanges"/>
    <UnsavedChangesToast :visible="showDeleteSeparatorToast" :saving="isDeletingSeparator" :title="deleteSeparatorToastTitle" :description="deleteSeparatorToastDescription" :cancel-label="t('admin.menu.cancel')" :save-label="t('admin.menu.delete')" :saving-label="t('admin.menu.deleting')" @save="executeDeleteSeparators" @cancel="cancelDeleteSeparators"/>  
    <UnsavedChangesToast :visible="showDeleteItemToast" :saving="isDeletingItem" :title="t('admin.menu.deleteItemTitle')" :description="t('admin.menu.deleteItemConfirm')" :cancel-label="t('admin.menu.cancel')" :save-label="t('admin.menu.delete')" :saving-label="t('admin.menu.deleting')" @save="executeDeleteItem" @cancel="cancelDeleteItem"/>

    <div class="menu-panel__items">
      <LoadingContentArea :loading="isLoading" :loading-text="t('admin.menu.loading')">
        <div v-if="menuItems.length === 0" class="alert alert-info d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <span>{{ t('admin.menu.empty') }}</span>
          <button type="button" class="ui-btn ui-btn--primary" :disabled="isRestoring" @click="handleRestoreMenu">
            <span v-if="isRestoring" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <RotateCcw v-else :size="16" aria-hidden="true" />
            <span>{{ isRestoring ? t('admin.menu.restoring') : t('admin.menu.restoreFromMigrations') }}</span>
          </button>
        </div>
        <div v-else>
          <DraggableMenuList :items="visibleMenuItems" :separators="visibleSeparators" :expand-all-groups="expandAllGroups" @edit="editItem" @delete="confirmDeleteItem" @add="addChildItem" @reorder="handleMenuReorder" @reorder-separators="handleSeparatorReorderFromList" @toggle-visibility="handleToggleVisibility" @edit-separator="editSeparator" @delete-separator="confirmDeleteSeparator" @toggle-visibility-separator="handleToggleSeparatorVisibility"/>
        </div>
      </LoadingContentArea>
    </div>
    <MenuItemModal v-if="showItemModal" :item="currentItem" :initial-parent="initialParent" :parent-options="parentOptions" :roles="roles" :role-groups="roleGroups" @save="saveItem" @close="closeItemModal"/>
    <MenuSeparatorModal v-if="showSeparatorModal" :separator="currentSeparator" :roles="roles" :role-groups="roleGroups" @save="saveSeparator" @close="closeSeparatorModal"/>
    <MenuSettingsModal v-if="showSettingsModal" :show="showSettingsModal" @close="showSettingsModal = false" @save="handleSettingsSave"/>
  </div>
</template>

<script setup>
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { ref, onMounted, onUnmounted, computed, nextTick, defineAsyncComponent } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { LayersPlus, SeparatorHorizontal, Settings, RotateCcw } from '@lucide/vue'
import { useToast } from '@/js/utils/toast.js'
import { confirmAction } from '@/js/utils/confirm.js'
import LoadingContentArea from '@/components/LoadingContentArea.vue'
import UnsavedChangesToast from '@/components/UnsavedChangesToast.vue'
import HoverTooltip from '@/components/HoverTooltip.vue'
import { tGlobal } from '@/i18n/index.js'
import { logError } from '@/js/utils/logError.js'
import { getMenuItems, createMenuItem, updateMenuItem, deleteMenuItem, getMenuSeparators, createMenuSeparator, updateMenuSeparator, deleteMenuSeparator, clearMenuCache, reorderMenuItems, } from '@/core/cms/js/menuService.js'
import { runRestoreMenuFromMigrations } from './MenuPanelComponents/menuRestoreActions.js'
import { apiClient } from '@/js/api/manager'
import { endpoints, initEndpoints } from '@/js/api/endpoints'
import { loadExpandAllGroups } from './MenuPanelComponents/expandAllGroupsStorage.js'

const { t } = useAppI18n()

const MenuItemModal = defineAsyncComponent(() => import('./MenuPanelComponents/MenuItemModal.vue'))
const MenuSeparatorModal = defineAsyncComponent(() =>
  import('./MenuPanelComponents/MenuSeparatorModal.vue'),
)
const MenuSettingsModal = defineAsyncComponent(() =>
  import('./MenuPanelComponents/MenuSettingsModal.vue'),
)
const DraggableMenuList = defineAsyncComponent(() =>
  import('./MenuPanelComponents/DraggableMenuList.vue'),
)

const toast = useToast()

const expandAllGroups = ref(false)

const isLoading = ref(false)
const isSaving = ref(false)
const isRestoring = ref(false)
const isDeletingSeparator = ref(false)
const isDeletingItem = ref(false)
const menuItems = ref([])
const separators = ref([])
const roles = ref([])
const roleGroups = ref([])

const separatorsToDelete = ref([])

const separatorsToDeleteIds = computed(() => new Set(separatorsToDelete.value.map(sep => sep.id)))

const showDeleteSeparatorToast = computed(() => separatorsToDelete.value.length > 0)

const deleteSeparatorToastTitle = computed(() =>
  separatorsToDelete.value.length === 1 ? tGlobal('admin.menu.deleteSeparatorTitle') : tGlobal('admin.menu.deleteSeparatorsTitle')
)

const deleteSeparatorToastDescription = computed(() => {
  const count = separatorsToDelete.value.length
  if (count === 1) {
    return tGlobal('admin.menu.deleteSeparatorConfirm')
  }
  return tGlobal('admin.menu.deleteSeparatorsConfirm', { count })
})

const showDeleteItemToast = ref(false)
const itemToDelete = ref(null)

const pendingMenuReorder = ref([])
const pendingSeparatorReorder = ref([])

const initialCombinedOrder = ref([])

function findInTree(items, itemId) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.id === itemId) return { item, items, index: i }
    if (item.children?.length) {
      const found = findInTree(item.children, itemId)
      if (found) return found
    }
  }
  return null
}

function sortTreeByOrder(items) {
  items.sort((a, b) => a.order - b.order)
  items.forEach(item => {
    if (item.children?.length) sortTreeByOrder(item.children)
  })
}

function notifyMenuUpdated() {
  clearMenuCache()
  window.dispatchEvent(new CustomEvent('menu-updated'))
}

function buildCombinedOrder(rootItems, sepList) {
  function flattenMenuItems(items, parentId = null) {
    const result = []
    for (const item of items) {
      result.push({ type: 'menu_item', id: item.id, parentId, _sortOrder: item.order })
      if (item.children && item.children.length > 0) {
        result.push(...flattenMenuItems(item.children, item.id))
      }
    }
    return result
  }
  
  const menuEntries = flattenMenuItems(rootItems)
  const sepEntries = sepList.map(sep => ({ type: 'separator', id: sep.id, parentId: null, _sortOrder: sep.before_order }))
  const combined = [...menuEntries, ...sepEntries]
  combined.sort((a, b) => {
    if (a.parentId !== b.parentId) {
      const left = a.parentId == null ? '' : String(a.parentId)
      const right = b.parentId == null ? '' : String(b.parentId)
      return left.localeCompare(right)
    }
    if (a._sortOrder !== b._sortOrder) return a._sortOrder - b._sortOrder
    if (a.type === 'separator' && b.type !== 'separator') return -1
    if (a.type !== 'separator' && b.type === 'separator') return 1
    return 0
  })
  return combined.map(({ type, id, parentId }) => ({ type, id, parentId }))
}

function combinedOrderEquals(a, b) {
  if (a.length !== b.length) return false
  return a.every((entry, i) => entry.type === b[i].type && entry.id === b[i].id && entry.parentId === b[i].parentId)
}

const currentCombinedOrderForUnsaved = computed(() => {
  const roots = itemToDelete.value ? menuItems.value : visibleMenuItems.value
  const seps = separatorsToDelete.value.length > 0 ? separators.value : visibleSeparators.value
  return buildCombinedOrder(roots, seps)
})

const hasUnsavedChanges = computed(() =>
  !isLoading.value &&
  !isRestoring.value &&
  initialCombinedOrder.value.length > 0 &&
  !combinedOrderEquals(initialCombinedOrder.value, currentCombinedOrderForUnsaved.value)
)

function syncInitialCombinedOrder() {
  initialCombinedOrder.value = buildCombinedOrder(menuItems.value, separators.value)
}

function onBeforeUnload(e) {
  if (hasUnsavedChanges.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onBeforeRouteLeave(async () => {
  if (!hasUnsavedChanges.value) {
    return true
  }

  return confirmAction({
    title: tGlobal('admin.menu.unsavedLeaveTitle'),
    message: tGlobal('admin.menu.unsavedLeaveMessage'),
    confirmText: tGlobal('admin.menu.leave'),
    variant: 'danger',
  })
})

const visibleSeparators = computed(() =>
  separators.value.filter(sep => !separatorsToDeleteIds.value.has(sep.id))
)

const visibleMenuItems = computed(() => {
  if (!itemToDelete.value) return menuItems.value
  const treeCopy = JSON.parse(JSON.stringify(menuItems.value))
  const found = findInTree(treeCopy, itemToDelete.value.id)
  if (found) found.items.splice(found.index, 1)
  return treeCopy
})

const showItemModal = ref(false)
const showSeparatorModal = ref(false)
const showSettingsModal = ref(false)
const currentItem = ref(null)
const initialParent = ref(null)
const currentSeparator = ref(null)

const parentOptions = computed(() => {
  const options = [{ id: null, name: tGlobal('admin.menu.noParent'), depth: 0 }]

  function addItems(items, depth = 0) {
    for (const item of items) {
      options.push({
        id: item.id,
        name: item.name,
        depth,
      })
      if (item.children && item.children.length > 0) {
        addItems(item.children, depth + 1)
      }
    }
  }

  addItems(menuItems.value)
  return options
})

async function loadMenuItems() {
  isLoading.value = true
  try {
    const items = await getMenuItems({ includeInactive: true })
    menuItems.value = buildTree(items)
  } catch (error) {
    logError('[MenuPanel] Load error:', error)
    toast.error(tGlobal('admin.menu.loadError') + error.message)
  } finally {
    isLoading.value = false
  }
}

async function reloadMenuPanel() {
  notifyMenuUpdated()
  pendingMenuReorder.value = []
  pendingSeparatorReorder.value = []
  initialCombinedOrder.value = []
  await Promise.all([loadMenuItems(), loadSeparators()])
  syncInitialCombinedOrder()
}

function handleRestoreMenu() {
  return runRestoreMenuFromMigrations({
    isRestoring,
    reloadMenuPanel,
    toast,
  })
}

function buildTree(items) {
  const map = {}
  const roots = []
  
  items.forEach(item => {
    map[item.id] = { ...item, children: [] }
  })
  
  items.forEach(item => {
    if (item.parent && map[item.parent]) {
      map[item.parent].children.push(map[item.id])
    } else {
      roots.push(map[item.id])
    }
  })
  sortTreeByOrder(roots)
  return roots
}

async function loadSeparators() {
  try {
    separators.value = await getMenuSeparators()
  } catch (error) {
    toast.error(tGlobal('admin.menu.separatorsLoadError') + error.message)
  }
}

async function loadRoles() {
  try {
    const response = await apiClient.get(endpoints.cms.roles.list)
    if (response.success) {
      roles.value = response.data
    }
  } catch (error) {
    logError('Ошибка загрузки ролей:', error)
  }
}

async function loadRoleGroups() {
  try {
    const response = await apiClient.get(endpoints.cms.roleGroups.list)
    if (response.success) {
      roleGroups.value = response.data
    }
  } catch (error) {
    logError('Ошибка загрузки ролевых групп:', error)
  }
}

function handleMenuReorder(reorderedItems) {
  pendingMenuReorder.value = [...pendingMenuReorder.value, ...reorderedItems]
  nextTick(() => {
    const parentMap = new Map(reorderedItems.map(item => [item.id, item.parent_id]).filter(([, parentId]) => parentId !== undefined))
    for (const reorderedItem of reorderedItems) {
      const found = findInTree(menuItems.value, reorderedItem.id)
      if (!found) continue
      found.item.order = reorderedItem.order
      if (!parentMap.has(reorderedItem.id)) continue
      const newParentId = parentMap.get(reorderedItem.id)
      found.items.splice(found.index, 1)
      if (newParentId === null) {
        menuItems.value.push(found.item)
      } else {
        const newParentFound = findInTree(menuItems.value, newParentId)
        if (newParentFound) {
          if (!newParentFound.item.children) newParentFound.item.children = []
          newParentFound.item.children.push(found.item)
        }
      }
    }
    sortTreeByOrder(menuItems.value)
  })
}

function handleSeparatorReorderFromList(reorderedSeparators) {
  pendingSeparatorReorder.value = reorderedSeparators
  
  const orderMap = new Map(reorderedSeparators.map(sep => [sep.id, sep]))
  for (const sep of separators.value) {
    if (orderMap.has(sep.id)) {
      const next = orderMap.get(sep.id)
      sep.before_order = next.before_order
      if (next.before_catalog_key !== undefined) {
        sep.before_catalog_key = next.before_catalog_key
      }
    }
  }
  separators.value.sort((a, b) => a.before_order - b.before_order)
}

function hasPendingOrderChanges() {
  return hasUnsavedChanges.value
    || pendingMenuReorder.value.length > 0
    || pendingSeparatorReorder.value.length > 0
}

function collectAllMenuItemsForSave() {
  const menuOrderMap = new Map()
  const menuParentMap = new Map()
  for (const item of pendingMenuReorder.value) {
    menuOrderMap.set(item.id, item.order)
    if (item.parent_id !== undefined) {
      menuParentMap.set(item.id, item.parent_id)
    }
  }

  const allItemsToSave = []

  function collectItems(items, parentId = null) {
    items.forEach((item) => {
      allItemsToSave.push({
        id: item.id,
        order: menuOrderMap.get(item.id) ?? item.order,
        parent_id: menuParentMap.get(item.id) ?? parentId
      })
      if (item.children?.length) collectItems(item.children, item.id)
    })
  }

  collectItems(menuItems.value)
  return allItemsToSave
}

function getSeparatorsToSave() {
  if (pendingSeparatorReorder.value.length > 0) {
    return pendingSeparatorReorder.value
  }
  return separators.value.map(sep => ({
    id: sep.id,
    before_order: sep.before_order,
    before_catalog_key: sep.before_catalog_key ?? null,
  }))
}

async function saveAllChanges() {
  isSaving.value = true
  
  try {
    const shouldSaveMenu = pendingMenuReorder.value.length > 0 || hasUnsavedChanges.value
    const shouldSaveSep = pendingSeparatorReorder.value.length > 0 || hasUnsavedChanges.value

    if (shouldSaveMenu) {
      await reorderMenuItems(collectAllMenuItemsForSave())
    }
    
    if (shouldSaveSep) {
      for (const sep of getSeparatorsToSave()) {
        await updateMenuSeparator(sep.id, {
          before_order: sep.before_order,
          before_catalog_key: sep.before_catalog_key ?? null,
        })
      }
    }
    
    pendingMenuReorder.value = []
    pendingSeparatorReorder.value = []
    initialCombinedOrder.value = []

    toast.success(tGlobal('admin.menu.orderSaved'))
    notifyMenuUpdated()
    await Promise.all([
      loadMenuItems(),
      loadSeparators()
    ])
    syncInitialCombinedOrder()
  } catch (error) {
    logError('[MenuPanel] Save error:', error)
    toast.error(tGlobal('admin.menu.orderSaveError') + error.message)
  } finally {
    isSaving.value = false
  }
}

async function cancelChanges() {
  pendingMenuReorder.value = []
  pendingSeparatorReorder.value = []
  initialCombinedOrder.value = []
  await Promise.all([
    loadMenuItems(),
    loadSeparators()
  ])
  syncInitialCombinedOrder()
  toast.info(tGlobal('admin.menu.orderCancelled'))
}

async function ensureChangesSaved() {
  await nextTick()
  if (!hasPendingOrderChanges()) return true
  await saveAllChanges()
  await nextTick()
  return !hasPendingOrderChanges()
}

async function showAddModal(parentId = null) {
  if (!(await ensureChangesSaved())) return
  currentItem.value = null
  initialParent.value = parentId
  showItemModal.value = true
}

function addChildItem(item) {
  return showAddModal(item.id)
}

function editItem(item) {
  currentItem.value = { ...item }
  initialParent.value = null
  showItemModal.value = true
}

async function saveItem(itemData) {
  try {
    if (itemData.id) {
      await updateMenuItem(itemData.id, itemData)
      toast.success(tGlobal('admin.menu.itemUpdated'))
    } else {
      await createMenuItem(itemData)
      toast.success(tGlobal('admin.menu.itemCreated'))
    }
    closeItemModal()
    await loadMenuItems()
    syncInitialCombinedOrder()
    notifyMenuUpdated()
  } catch (error) {
    toast.error(tGlobal('admin.menu.saveError') + error.message)
  }
}

function confirmDeleteItem(item) {
  itemToDelete.value = item
  showDeleteItemToast.value = true
}

async function executeDeleteItem() {
  if (!itemToDelete.value) return

  isDeletingItem.value = true
  try {
    await deleteMenuItem(itemToDelete.value.id)
    toast.success(tGlobal('admin.menu.itemDeleted'))
    await loadMenuItems()
    syncInitialCombinedOrder()
    notifyMenuUpdated()
    cancelDeleteItem()
  } catch (error) {
    toast.error(tGlobal('admin.menu.deleteError') + error.message)
  } finally {
    isDeletingItem.value = false
  }
}

function cancelDeleteItem() {
  showDeleteItemToast.value = false
  itemToDelete.value = null
}

async function handleToggleVisibility(data) {
  try {
    await updateMenuItem(data.id, { is_active: data.is_active })
    const found = findInTree(menuItems.value, data.id)
    if (found) found.item.is_active = data.is_active
    notifyMenuUpdated()
  } catch (error) {
    toast.error(tGlobal('admin.menu.visibilityError') + error.message)
    await loadMenuItems()
  }
}

async function handleToggleSeparatorVisibility(separator) {
  try {
    await updateMenuSeparator(separator.id, { is_active: !separator.is_active })
    const sep = separators.value.find(s => s.id === separator.id)
    if (sep) sep.is_active = !separator.is_active
    notifyMenuUpdated()
  } catch (error) {
    toast.error(tGlobal('admin.menu.separatorVisibilityError') + error.message)
    await loadSeparators()
  }
}

function closeItemModal() {
  showItemModal.value = false
  currentItem.value = null
  initialParent.value = null
}

async function showAddSeparatorModal() {
  if (!(await ensureChangesSaved())) return
  currentSeparator.value = null
  showSeparatorModal.value = true
}

function editSeparator(separator) {
  currentSeparator.value = { ...separator }
  showSeparatorModal.value = true
}

async function saveSeparator(separatorData) {
  try {
    if (separatorData.id) {
      await updateMenuSeparator(separatorData.id, separatorData)
      toast.success(tGlobal('admin.menu.separatorUpdated'))
    } else {
      await createMenuSeparator(separatorData)
      toast.success(tGlobal('admin.menu.separatorCreated'))
    }
    closeSeparatorModal()
    await loadSeparators()
    syncInitialCombinedOrder()
    notifyMenuUpdated()
  } catch (error) {
    toast.error(tGlobal('admin.menu.saveError') + error.message)
  }
}

function confirmDeleteSeparator(separator) {
  if (separatorsToDeleteIds.value.has(separator.id)) return
  separatorsToDelete.value.push(separator)
}

async function executeDeleteSeparators() {
  const queue = [...separatorsToDelete.value]
  if (!queue.length) return

  isDeletingSeparator.value = true
  try {
    for (const sep of queue) {
      await deleteMenuSeparator(sep.id)
    }
    toast.success(
      queue.length === 1
        ? tGlobal('admin.menu.separatorDeleted')
        : tGlobal('admin.menu.separatorsDeleted', { count: queue.length })
    )
    await loadSeparators()
    syncInitialCombinedOrder()
    notifyMenuUpdated()
    cancelDeleteSeparators()
  } catch (error) {
    toast.error(tGlobal('admin.menu.deleteError') + error.message)
    await loadSeparators()
  } finally {
    isDeletingSeparator.value = false
  }
}

function cancelDeleteSeparators() {
  separatorsToDelete.value = []
}

function closeSeparatorModal() {
  showSeparatorModal.value = false
  currentSeparator.value = null
}

function handleSettingsSave(newValue) {
  expandAllGroups.value = newValue
  toast.success(tGlobal('admin.menu.settingsSaved'))
}

onMounted(async () => {
  expandAllGroups.value = loadExpandAllGroups()
  const listPrefetch = import('./MenuPanelComponents/DraggableMenuList.vue')
  await initEndpoints()
  await Promise.all([
    loadMenuItems(),
    loadSeparators(),
    loadRoles(),
    loadRoleGroups(),
    listPrefetch,
  ])
  syncInitialCombinedOrder()
  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<style lang="scss" scoped>
@import './admin-page.scss';

.menu-panel {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;

  &__title-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }

  &__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.25;
    color: var(--color-primary-text);
  }

  &__title-row :deep(.btn-action) {
    width: 2.25rem;
    height: 2.25rem;
    min-width: 2.25rem;
    min-height: 2.25rem;

    svg {
      display: block;
      width: 1.25rem;
      height: 1.25rem;
    }

    &:hover {
      color: var(--color-accent);
    }
  }

  &__items,
  &__separators {
    background: var(--color-secondary-background);
    border-radius: 8px;
  }
}

@media (width < $ui-bp-md) {
  .menu-panel {
    &__actions {
      flex-direction: column;
      
      .ui-btn {
        width: 100%;
      }
    }
  }
}
</style>