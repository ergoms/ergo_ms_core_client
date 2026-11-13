<template>
  <ModalCenter standalone :visible="true" modal-id="menuItemModal" :title="isEditing ? t('admin.menu.editItemTitle') : t('admin.menu.addItemTitle')" dialog-class="modal-lg" @closemodal="$emit('close')">
    <form @submit.prevent="handleSubmit">
      <div class="mb-3">
        <label class="form-label">{{ t('admin.menu.name') }} <span class="text-danger">*</span></label>
        <input v-model="form.name" type="text" class="form-control" required :placeholder="t('admin.menu.namePlaceholder')" style="background-color: var(--var-primary-background)"/>
      </div>

      <div class="mb-3">
        <label class="form-label">{{ t('admin.menu.itemType') }} <span class="text-danger">*</span></label>
        <SelectBox :model-value="form.item_type" :options="itemTypeOptions" value-key="id" label-key="name" :include-all-option="false" @update:model-value="v => form.item_type = v"/>
      </div>

      <div v-if="form.item_type === 'route'" class="mb-3">
        <label class="form-label">{{ t('admin.menu.routeName') }}</label>
        <SelectBox v-if="!useManualRouteInput" :model-value="form.route_name || null" :options="routeOptions" value-key="id" label-key="name" :include-all-option="true" :all-label="t('admin.menu.routeHintManual')" searchable :search-placeholder="t('admin.menu.searchRoute')" @update:model-value="v => form.route_name = v ?? ''"/>
        <input v-else v-model="form.route_name" type="text" class="form-control" :placeholder="t('admin.menu.routePlaceholder')" style="background-color: var(--var-primary-background)"/>
        <div class="form-text" v-if="!useManualRouteInput"><span v-html="t('admin.menu.routeHintCyrillicHtml')"></span></div>
        <div class="form-text" v-else><span v-html="t('admin.menu.routeHintManualHtml')"></span></div>
        <div class="form-check mt-2">
          <input v-model="useManualRouteInput" type="checkbox" class="form-check-input" id="useManualRouteInput"/>
          <label class="form-check-label" for="useManualRouteInput">{{ t('admin.menu.manualRoute') }}</label>
        </div>
      </div>

      <div v-if="form.item_type === 'offcanvas'" class="mb-3">
        <label class="form-label">{{ t('admin.menu.pageId') }} <span class="text-danger">*</span></label>
        <input v-model="form.page" type="text" class="form-control" required :placeholder="t('admin.menu.pageIdPlaceholder')" style="background-color: var(--var-primary-background)"/>
      </div>

      <div v-if="form.item_type === 'external'" class="mb-3">
        <label class="form-label">URL <span class="text-danger">*</span></label>
        <input v-model="form.external_url" type="url" class="form-control" style="background-color: var(--var-primary-background)" required placeholder="https://ergoms.com"/>
      </div>

      <div class="mb-3">
        <label class="form-label">{{ t('admin.menu.icon') }}</label>
        <SelectBox :model-value="form.icon || null" :options="lucideIconOptions" searchable :search-placeholder="t('admin.menu.searchIcons')" :include-all-option="true" :all-label="t('admin.menu.noIcon')" :virtualized="true" :item-height="36" :overscan="8" @update:model-value="v => form.icon = v ?? ''">
          <template #option="{ value, label }">
            <span class="d-inline-flex align-items-center gap-2">
              <LucideIcon v-if="value" :name="value" :size="18"/>
              <span>{{ label }}</span>
            </span>
          </template>
          <template #selected="{ label }">
            <span class="d-inline-flex align-items-center gap-2">
              <LucideIcon v-if="form.icon" :name="form.icon" :size="20"/>
              <span>{{ label }}</span>
            </span>
          </template>
        </SelectBox>
        <div class="form-text">{{ t('admin.menu.iconHelp') }} <a href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer" class="text-decoration-none">Lucide</a></div>
      </div>

      <div class="mb-3">
        <label class="form-label">{{ t('admin.menu.parent') }}</label>
        <SelectBox :model-value="form.parent" :options="filteredParentOptions" value-key="id" label-key="name" depth-key="depth" :option-indent-per-level="0" :include-all-option="false" :all-label="t('admin.menu.noParent')" @update:model-value="v => form.parent = v"/>
      </div>

      <div class="mb-3">
        <div class="form-check">
          <input v-model="form.is_active" type="checkbox" class="form-check-input" id="isActive"/>
          <label class="form-check-label" for="isActive">{{ t('admin.menu.active') }}</label>
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label">{{ t('admin.menu.allowedRoles') }}</label>
        <SelectBox
          v-model="form.allowed_roles"
          :options="roleSelectOptions"
          value-key="id"
          label-key="name"
          :include-all-option="false"
          multiple
          show-checkboxes-when-multiple
          multiple-label-format="count"
          cast-to-number
        />
        <div class="form-text">{{ t('admin.menu.rolesHelpAlt') }}</div>
      </div>

      <div class="mb-3">
        <label class="form-label">{{ t('admin.menu.allowedRoleGroups') }}</label>
        <SelectBox
          v-model="form.allowed_role_groups"
          :options="roleGroupSelectOptions"
          value-key="id"
          label-key="name"
          :include-all-option="false"
          multiple
          show-checkboxes-when-multiple
          multiple-label-format="count"
          cast-to-number
        />
      </div>
    </form>

    <div class="d-flex justify-content-end gap-2 mt-3 pt-3 border-top">
      <button type="button" class="ui-btn ui-btn--secondary" @click="$emit('close')">{{ t('admin.menu.cancel') }}</button>
      <button type="button" class="ui-btn ui-btn--primary" @click="handleSubmit" :disabled="!isFormValid">
        {{ isEditing ? t('admin.menu.save') : t('admin.menu.create') }}
      </button>
    </div>
  </ModalCenter>
</template>

<script setup>
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { ref, computed, watch, onMounted } from 'vue'
import { getAvailableRouteOptions } from '@/modules/index.js'
import { getLucideIconNames } from '@/js/lucideIconLoader.js'
import LucideIcon from '@/components/LucideIcon.vue'
import ModalCenter from '@/components/ModalCenter.vue'
import SelectBox from '@/components/SelectBox.vue'

const { t } = useAppI18n()

const lucideIconOptions = ref([])

onMounted(async () => {
  const [names, opts] = await Promise.all([
    getLucideIconNames(),
    getAvailableRouteOptions(),
  ])
  lucideIconOptions.value = names.map((name) => ({ id: name, name }))
  routeOptions.value = opts
})

const itemTypeOptions = [
  { id: 'route', name: t('admin.menu.typeRoute') },
  { id: 'offcanvas', name: t('admin.menu.typeOffcanvas') },
  { id: 'external', name: t('admin.menu.typeExternal') }
]

const props = defineProps({
  item: {
    type: Object,
    default: null
  },
  parentOptions: {
    type: Array,
    default: () => []
  },
  roles: {
    type: Array,
    default: () => []
  },
  roleGroups: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['save', 'close'])

const routeOptions = ref([])
const useManualRouteInput = ref(false)

const isEditing = computed(() => !!props.item?.id)

const form = ref({
  name: '',
  route_name: '',
  icon: '',
  item_type: 'route',
  page: '',
  external_url: '',
  parent: null,
  order: 0,
  is_active: true,
  allowed_roles: [],
  allowed_role_groups: []
})

watch(() => props.item, (newItem) => {
  if (newItem) {
    form.value = {
      id: newItem.id,
      name: newItem.name || '',
      route_name: newItem.route_name || '',
      icon: newItem.icon || '',
      item_type: (newItem.item_type === 'group' ? 'route' : newItem.item_type) || 'route',
      page: newItem.page || '',
      external_url: newItem.external_url || '',
      parent: newItem.parent || null,
      order: newItem.order || 0,
      is_active: newItem.is_active !== false,
      allowed_roles: newItem.allowed_roles || [],
      allowed_role_groups: newItem.allowed_role_groups || []
    }
  } else {
    form.value = {
      name: '',
      route_name: '',
      icon: '',
      item_type: 'route',
      page: '',
      external_url: '',
      parent: null,
      order: 0,
      is_active: true,
      allowed_roles: [],
      allowed_role_groups: []
    }
  }
}, { immediate: true })

const filteredParentOptions = computed(() => {
  if (!props.item?.id) {
    return props.parentOptions
  }
  return props.parentOptions.filter(opt => opt.id !== props.item.id)
})

const roleSelectOptions = computed(() =>
  props.roles.map((role) => ({ id: role.id, name: role.name })),
)

const roleGroupSelectOptions = computed(() =>
  props.roleGroups.map((group) => ({
    id: group.id,
    name: `${group.name} (${group.parent_role_name})`,
  })),
)

const isFormValid = computed(() => {
  if (!form.value.name) return false
  
  if (form.value.item_type === 'offcanvas' && !form.value.page) {
    return false
  }
  
  if (form.value.item_type === 'external' && !form.value.external_url) {
    return false
  }
  
  return true
})

function handleSubmit() {
  if (!isFormValid.value) return
  
  emit('save', { ...form.value })
}
</script>