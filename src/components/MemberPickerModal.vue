<!--
  MemberPickerModal — универсальная UI-оболочка multi-select выбора пользователей.
  Загрузка данных — через prop fetchUsers (доменная логика в модулях).
  Это универсальный picker ядра, а не доменная форма добавления участника из модуля.
-->
<template>
  <ModalCenter standalone :visible="show" :modal-id="modalId" :title="resolvedTitle" :dialog-class="'modal-md'" @close="close">
    <div class="member-picker-modal-content">
      <div class="pb-2 search-container">
        <SearchInput v-model="searchQuery" :placeholder="t('components.memberPicker.search')" :show-icon="true" @update:model-value="handleSearch"/>
      </div>

      <div v-if="resolvedTabs.length > 1" class="px-3 pb-2 border-bottom tabs-container">
        <div class="d-flex gap-2 tabs-scroll">
          <button v-for="tab in resolvedTabs" :key="tab.key" type="button" class="btn btn-sm border-0 px-3 py-1 filter-tab text-nowrap" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="users-list-container">
        <LoadingContentArea :loading="isLoading" :reset-key="show ? listResetKey ?? activeTab : null" min-height="10rem" :loading-text="t('components.memberPicker.loading')">
          <div v-if="filteredUsers.length === 0" class="empty-state">
            <div class="text-muted">{{ t('components.memberPicker.empty') }}</div>
          </div>

          <div v-else class="users-list">
          <div v-for="user in filteredUsers" :key="userIdentity(user)" class="user-item"
            :class="{
              'user-item-assigned': isAssigned(user),
              'user-item-selected': isSelected(user)
            }"
            @click="selectUser(user)"
          >
            <div class="d-flex align-items-center gap-3 p-3">
              <div class="avatar-wrapper">
                <UserAvatar :user-ref="user.public_id" :size="48" :title="user.full_name || user.username" :avatar-url="user.avatar_url" :first-name="user.first_name" :last-name="user.last_name" />
                <div v-if="isSelected(user) || isAssigned(user)" class="check-badge" :class="{ 'check-badge-assigned': isAssigned(user) && !isSelected(user) }">
                  <Check :size="12" stroke-width="3" />
                </div>
              </div>
              <div class="flex-grow-1 min-width-0">
                <div class="fw-semibold text-truncate" :class="{ 'text-primary': isSelected(user), 'text-success': isAssigned(user) && !isSelected(user) }">
                  {{ user.full_name || user.username }}
                </div>
                <div v-if="user.role_group_name" class="text-muted small text-truncate">{{ user.role_group_name }}</div>
                <div v-else-if="user.position" class="text-muted small text-truncate">{{ user.position }}</div>
                <div v-if="user.department_name" class="text-muted small text-truncate fst-italic">{{ user.department_name }}</div>
              </div>
            </div>
          </div>
        </div>
        </LoadingContentArea>
      </div>

      <div class="px-3 pt-2 border-top d-flex justify-content-end align-items-center buttons-container">
        <button type="button" class="btn btn-link text-primary text-decoration-none cancel-btn" @click="close">{{ t('common.cancel') }}</button>
        <button v-if="hasChanges" type="button" class="btn btn-primary" @click="assignSelected">
          {{ buttonText }}
        </button>
      </div>
    </div>
  </ModalCenter>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Check } from '@lucide/vue'
import ModalCenter from '@/components/ModalCenter.vue'
import SearchInput from '@/components/SearchInput.vue'
import LoadingContentArea from '@/components/LoadingContentArea.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useToast } from '@/js/utils/toast.js'
import { logError, logWarn } from '@/js/utils/logError.js'
import { seedUserPublicInfoCache } from '@/js/userAvatar'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const { t } = useAppI18n()

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  tabs: {
    type: Array,
    default: () => [],
  },
  includeAllTab: {
    type: Boolean,
    default: true,
  },
  assignedUserIds: {
    type: Array,
    default: () => [],
  },
  excludedUserIds: {
    type: Array,
    default: () => [],
  },
  listResetKey: {
    type: [String, Number],
    default: null,
  },
  fetchUsers: {
    type: Function,
    required: true,
  },
  autoCloseOnAssign: {
    type: Boolean,
    default: true,
  },
  assignLabel: {
    type: String,
    default: '',
  },
  modalId: {
    type: String,
    default: 'memberPickerModal',
  },
})

const emit = defineEmits(['close', 'selected', 'selectedMultiple', 'deselected'])

const toast = useToast()

const searchQuery = ref('')
const activeTab = ref('all')
const isLoading = ref(false)
const users = ref([])
const selectedUsers = ref([])
const deselectedAssignedIds = ref(new Set())

const resolvedTitle = computed(() => props.title || t('components.memberPicker.assign'))

const allTab = computed(() => ({ key: 'all', label: t('components.memberPicker.all') }))

const resolvedTabs = computed(() => {
  const raw = Array.isArray(props.tabs) ? props.tabs : []
  if (!props.includeAllTab) {
    return raw.length > 0 ? raw : [allTab.value]
  }
  const hasAll = raw.some((tab) => (tab?.key || '') === 'all')
  return hasAll ? raw : [allTab.value, ...raw]
})

function getDefaultTabKey() {
  if (props.includeAllTab) {
    return 'all'
  }
  return resolvedTabs.value[0]?.key || 'all'
}

const activeRoleGroupId = computed(() => {
  if (activeTab.value === 'all') return null
  const tab = resolvedTabs.value.find((t) => t?.key === activeTab.value)
  return tab?.roleGroupId ?? tab?.role_group_id ?? tab?.role_group ?? null
})

function userIdentity(user) {
  if (user == null) return ''
  if (typeof user !== 'object') {
    const value = String(user).trim()
    return value
  }
  const ref = user.public_id ?? user.user_ref ?? user.id
  if (ref == null || ref === '') return ''
  return String(ref)
}

function identitySet(ids) {
  const list = Array.isArray(ids) ? ids : []
  return new Set(list.map((id) => String(id).trim()).filter(Boolean))
}

const assignedUserIdsSet = computed(() => identitySet(props.assignedUserIds))

function isAssigned(user) {
  const key = userIdentity(user)
  if (!key) return false
  if (deselectedAssignedIds.value.has(key)) return false
  return assignedUserIdsSet.value.has(key)
}

function isSelected(user) {
  const key = userIdentity(user)
  if (!key) return false
  return selectedUsers.value.some((item) => userIdentity(item) === key)
}

const hasChanges = computed(() => {
  return selectedUsers.value.length > 0 || deselectedAssignedIds.value.size > 0
})

const buttonText = computed(() => {
  const selectedCount = selectedUsers.value.length
  const deselectedCount = deselectedAssignedIds.value.size

  if (deselectedCount > 0 && selectedCount === 0) {
    return t('components.memberPicker.changeCount', { count: deselectedCount })
  }
  if (deselectedCount > 0 && selectedCount > 0) {
    return t('components.memberPicker.changeMixed', {
      selected: selectedCount,
      deselected: deselectedCount,
    })
  }
  if (props.assignLabel) {
    return `${props.assignLabel} (${selectedCount})`
  }
  return t('components.memberPicker.assignCount', { count: selectedCount })
})

const excludedUserIdsSet = computed(() => identitySet(props.excludedUserIds))

const filteredUsers = computed(() => {
  if (excludedUserIdsSet.value.size === 0) {
    return users.value
  }
  return users.value.filter((user) => {
    const key = userIdentity(user)
    return !key || !excludedUserIdsSet.value.has(key)
  })
})

function wholePositiveInt(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

function normalizeModalUser(raw) {
  const fullName = raw.full_name || raw.fullName || raw.name || ''
  const fallbackName = fullName || raw.username || ''
  // Только поля с API — разбор full_name делает UserAvatar.
  const firstName = (raw.first_name || raw.firstName || '').trim()
  const lastName = (raw.last_name || raw.lastName || '').trim()
  const publicId = raw.public_id ?? raw.publicId ?? raw.user_ref ?? null
  const identity = publicId ?? raw.id ?? null
  // Ключ выбора — public_id. Целый id нужен формам, которые ещё шлют pk в теле запроса.
  const userId = wholePositiveInt(raw.user_id ?? raw.userId) ?? wholePositiveInt(raw.id)

  return {
    id: identity,
    user_id: userId,
    public_id: publicId,
    user_ref: raw.user_ref ?? publicId,
    username: raw.username || '',
    full_name: fallbackName,
    first_name: firstName || null,
    last_name: lastName || null,
    position: raw.position || '',
    role_group_name: raw.role_group_name || '',
    avatar_url: raw.avatar_url ?? null,
    department_name: raw.department_name || null,
  }
}

function applyLoadedUsers(list) {
  const normalized = (Array.isArray(list) ? list : []).map(normalizeModalUser)
  users.value = normalized
  seedUserPublicInfoCache(normalized)
}

async function loadCandidates() {
  if (typeof props.fetchUsers !== 'function') {
    logWarn('MemberPickerModal: fetchUsers не передан')
    users.value = []
    return
  }
  try {
    isLoading.value = true
    const query = searchQuery.value || ''
    const list = await props.fetchUsers({
      q: query,
      search: query,
      activeTab: activeTab.value,
      roleGroupId: activeRoleGroupId.value,
    })
    applyLoadedUsers(list)
  } catch (e) {
    logError('Ошибка загрузки пользователей:', e)
    const msg = e.response?.data?.error || e.message || t('components.memberPicker.loadError')
    toast.error(msg)
    users.value = []
  } finally {
    isLoading.value = false
  }
}

function handleSearch() {
  loadCandidates()
}

function selectUser(user) {
  const key = userIdentity(user)
  if (!key) return

  const isCurrentlyAssigned = assignedUserIdsSet.value.has(key)
  const isDeselected = deselectedAssignedIds.value.has(key)

  if (isCurrentlyAssigned) {
    if (isDeselected) {
      deselectedAssignedIds.value.delete(key)
    } else {
      deselectedAssignedIds.value.add(key)
    }
    return
  }

  const index = selectedUsers.value.findIndex((item) => userIdentity(item) === key)

  if (index >= 0) {
    selectedUsers.value.splice(index, 1)
  } else {
    selectedUsers.value.push(user)
  }
}

function resetPickerState() {
  searchQuery.value = ''
  activeTab.value = getDefaultTabKey()
  selectedUsers.value = []
  deselectedAssignedIds.value = new Set()
}

function assignSelected() {
  if (!hasChanges.value) return

  if (deselectedAssignedIds.value.size > 0) {
    emit('deselected', Array.from(deselectedAssignedIds.value))
  }

  if (selectedUsers.value.length > 0) {
    if (selectedUsers.value.length === 1) {
      emit('selected', selectedUsers.value[0])
    } else {
      emit('selectedMultiple', selectedUsers.value)
    }
  }

  if (props.autoCloseOnAssign) {
    close()
  }
}

function close() {
  emit('close')
  resetPickerState()
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    activeTab.value = getDefaultTabKey()
    loadCandidates()
  } else {
    resetPickerState()
  }
}, { immediate: true })

watch(activeTab, () => {
  if (props.show) {
    loadCandidates()
  }
})

watch(resolvedTabs, () => {
  if (!resolvedTabs.value.some((t) => t?.key === activeTab.value)) {
    activeTab.value = getDefaultTabKey()
  }
})

watch(
  () => [...identitySet(props.assignedUserIds)].sort().join(','),
  () => {
    if (!props.show) return
    deselectedAssignedIds.value = new Set()
    selectedUsers.value = []
  },
)
</script>

<style lang="scss" scoped>
.member-picker-modal-content {
  display: flex;
  flex-direction: column;
  height: 70vh;
  min-height: 600px;
  max-height: 700px;
}

.users-list-container {
  flex: 1;
  overflow-y: auto;
  height: 0;
  display: flex;
  flex-direction: column;

  .loading-state,
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
}

.users-list {
  .user-item {
    cursor: pointer;
    transition: background-color 0.15s ease-in-out;

    &:hover {
      background-color: var(--color-hover-background);
    }

    .avatar-wrapper {
      position: relative;
      flex-shrink: 0;

      .check-badge {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 18px;
        height: 18px;
        background-color: var(--color-accent);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid var(--bs-body-bg, #fff);
        color: #fff;

        &.check-badge-assigned {
          background-color: var(--bs-success, #198754);
        }
      }
    }

    .min-width-0 {
      min-width: 0;
    }

    .text-truncate {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.tabs-container {
  .tabs-scroll {
    overflow-x: auto;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      height: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--bs-gray-400, #ced4da);
      border-radius: 2px;
    }
  }
}

.filter-tab {
  background: transparent;
  color: var(--bs-body-color, #212529);
  position: relative;
  transition: color 0.15s ease-in-out;
  flex-shrink: 0;

  &:hover {
    color: var(--color-accent);
    background: transparent;
  }

  &.active {
    color: var(--color-accent);
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background-color: var(--color-accent);
    }
  }
}

.search-container {
  :deep(.search-input) {
    --search-input-border-radius: 0;
    --search-input-height: 38px;
  }
}

.buttons-container {
  gap: 10px;
}

.cancel-btn {
  font-weight: 600;
  transition: background-color 0.15s ease-in-out;

  &:hover {
    background-color: var(--color-secondary-background);
    text-decoration: none;
  }
}

@media (width < $ui-bp-md) {
  .member-picker-modal-content {
    height: min(80vh, 100dvh - 4rem);
    min-height: min(320px, 50dvh);
    max-height: min(600px, 85dvh);
  }
}
</style>
