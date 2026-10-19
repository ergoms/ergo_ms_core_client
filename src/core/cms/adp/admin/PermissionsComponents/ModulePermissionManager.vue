<script setup>
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { ref, computed, watch, onMounted } from 'vue'
import { Trash2 } from '@lucide/vue'
import SelectBox from '@/components/SelectBox.vue'
import {
  getModulePermissions,
  createModulePermission,
  deleteModulePermission,
  getModuleCatalog,
} from '@/core/cms/adp/admin/js/adminAccessApi.js'
import {
  mapRoleGroupSelectOptions,
  mapModuleCatalogSelectOptions,
  mapModulePermissionSelectOptions,
} from '@/core/cms/js/adminSelectOptions.js'

const { t } = useAppI18n()

const props = defineProps({
  roleGroups: { type: Array, required: true }
})

const permissions = ref([])
const moduleCatalog = ref([])
const selectedRoleGroup = ref(null)

const form = ref({
  module_name: '',
  permission_key: '',
  permission_name: '',
  role_group: null,
  is_granted: true,
  description: ''
})

const roleGroupSelectOptions = computed(() =>
  mapRoleGroupSelectOptions(props.roleGroups, { withParent: false }),
)

const moduleSelectOptions = computed(() =>
  mapModuleCatalogSelectOptions(moduleCatalog.value),
)

const selectedModuleEntry = computed(() =>
  moduleCatalog.value.find((item) => item.module_name === form.value.module_name) || null,
)

const permissionSelectOptions = computed(() => {
  const permissionsMap = selectedModuleEntry.value?.permissions || {}
  return mapModulePermissionSelectOptions(permissionsMap)
})

const useCustomPermissionKey = ref(false)

const canPickPermissionFromCatalog = computed(
  () => permissionSelectOptions.value.length > 0 && !useCustomPermissionKey.value,
)

const showErrors = ref({
  module_name: false,
  permission_key: false,
  permission_name: false,
  role_group: false
})

const loadModuleCatalog = async () => {
  const data = await getModuleCatalog()
  moduleCatalog.value = Array.isArray(data?.modules) ? data.modules : []
}

const loadPermissions = async () => {
  const roleGroupId = selectedRoleGroup.value || null
  const data = await getModulePermissions(roleGroupId)
  permissions.value = Array.isArray(data) ? data : (data.results || [])
}

watch(selectedRoleGroup, async () => {
  await loadPermissions()
})

watch(
  () => form.value.module_name,
  () => {
    form.value.permission_key = ''
    form.value.permission_name = ''
    useCustomPermissionKey.value = false
  },
)

watch(
  () => form.value.permission_key,
  (key) => {
    const permissionsMap = selectedModuleEntry.value?.permissions || {}
    if (key && permissionsMap[key]) {
      form.value.permission_name = permissionsMap[key]
    }
  },
)

const submitForm = async () => {
  showErrors.value = {
    module_name: !form.value.module_name.trim(),
    permission_key: !form.value.permission_key.trim(),
    permission_name: !form.value.permission_name.trim(),
    role_group: !form.value.role_group
  }

  if (
    showErrors.value.module_name ||
    showErrors.value.permission_key ||
    showErrors.value.permission_name ||
    showErrors.value.role_group
  ) {
    return
  }

  await createModulePermission({
    module_name: form.value.module_name.trim(),
    permission_key: form.value.permission_key.trim(),
    permission_name: form.value.permission_name.trim(),
    description: form.value.description,
    role_group: form.value.role_group,
    is_granted: form.value.is_granted
  })

  await Promise.all([loadPermissions(), loadModuleCatalog()])
  form.value = {
    module_name: '',
    permission_key: '',
    permission_name: '',
    role_group: null,
    is_granted: true,
    description: ''
  }
}

const deletePermission = async permissionId => {
  await deleteModulePermission(permissionId)
  await loadPermissions()
}

const filteredPermissions = computed(() => permissions.value)

onMounted(async () => {
  await Promise.all([loadModuleCatalog(), loadPermissions()])
})
</script>

<template>
  <div class="module-permission-manager">
    <div class="module-permission-manager__header">
      <div>
        <h5 class="mb-0">{{ t('admin.modulePermissions.title') }}</h5>
        <small class="text-secondary-custom">{{ t('admin.modulePermissions.subtitle') }}</small>
      </div>
      <SelectBox
        v-model="selectedRoleGroup"
        :options="roleGroupSelectOptions"
        value-key="id"
        label-key="name"
        :all-label="t('admin.modulePermissions.allGroups')"
        cast-to-number :full-width="false"
      />
    </div>

    <div class="module-permission-manager__body">
      <form class="mpm-form" @submit.prevent="submitForm">
        <div class="mpm-form__grid">
          <div class="mpm-form__field">
            <SelectBox
              v-model="form.module_name"
              :options="moduleSelectOptions"
              value-key="id"
              label-key="name"
              :all-label="t('admin.modulePermissions.module')"
              searchable
              :include-all-option="false"
              :class="{ 'is-invalid': showErrors.module_name }"
            />
            <div v-if="showErrors.module_name" class="invalid-feedback d-block">{{ t('admin.modulePermissions.selectModuleRequired') }}</div>
          </div>

          <div class="mpm-form__field">
            <SelectBox
              v-if="canPickPermissionFromCatalog"
              v-model="form.permission_key"
              :options="permissionSelectOptions"
              value-key="id"
              label-key="name"
              :all-label="t('admin.modulePermissions.permissionKey')"
              searchable
              :include-all-option="false"
              :class="{ 'is-invalid': showErrors.permission_key }"
            />
            <input
              v-else
              type="text"
              class="form-control"
              v-model="form.permission_key"
              :class="{ 'is-invalid': showErrors.permission_key }"
              :placeholder="t('admin.modulePermissions.keyPlaceholder')"
            />
            <div v-if="showErrors.permission_key" class="invalid-feedback d-block">{{ t('admin.modulePermissions.keyRequiredShort') }}</div>
            <button
              v-if="permissionSelectOptions.length > 0"
              type="button"
              class="mpm-form__toggle-key"
              @click="useCustomPermissionKey = !useCustomPermissionKey"
            >
              {{ useCustomPermissionKey ? t('admin.modulePermissions.chooseFromList') : t('admin.modulePermissions.enterNewKey') }}
            </button>
          </div>

          <div class="mpm-form__field">
            <input
              type="text"
              class="form-control"
              v-model="form.permission_name"
              :class="{ 'is-invalid': showErrors.permission_name }"
              :placeholder="t('admin.modulePermissions.namePlaceholder')"
              :readonly="canPickPermissionFromCatalog && !!form.permission_key"
            />
            <div v-if="showErrors.permission_name" class="invalid-feedback d-block">{{ t('admin.modulePermissions.nameRequiredShort') }}</div>
          </div>

          <div class="mpm-form__field">
            <SelectBox
              v-model="form.role_group"
              :options="roleGroupSelectOptions"
              value-key="id"
              label-key="name"
              :all-label="t('admin.modulePermissions.group')"
              cast-to-number
            />
            <div v-if="showErrors.role_group" class="invalid-feedback d-block">{{ t('admin.modulePermissions.selectGroupRequired') }}</div>
          </div>

          <div class="mpm-form__field mpm-form__field--wide">
            <input
              type="text"
              class="form-control"
              v-model="form.description"
              :placeholder="t('admin.modulePermissions.description')"
            />
          </div>
        </div>

        <div class="mpm-form__actions">
          <div class="form-check form-switch m-0">
            <input
              id="grantedSwitch"
              v-model="form.is_granted"
              class="form-check-input"
              type="checkbox"
              role="switch"
            />
            <label class="form-check-label" for="grantedSwitch">{{ t('admin.modulePermissions.granted') }}</label>
          </div>
          <button type="submit" class="ui-btn ui-btn--primary">
            {{ t('admin.modulePermissions.save') }}
          </button>
        </div>
      </form>

      <div class="table-responsive mt-3">
        <table class="module-permission-table">
          <thead>
            <tr>
              <th>{{ t('admin.modulePermissions.headersModule') }}</th>
              <th>{{ t('admin.modulePermissions.headersKey') }}</th>
              <th>{{ t('admin.modulePermissions.headersName') }}</th>
              <th>{{ t('admin.modulePermissions.headersGroup') }}</th>
              <th>{{ t('admin.modulePermissions.headersDesc') }}</th>
              <th>{{ t('admin.modulePermissions.headersStatus') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="permission in filteredPermissions" :key="permission.id">
              <td class="fw-medium">{{ permission.module_name }}</td>
              <td class="text-monospace">{{ permission.permission_key }}</td>
              <td>{{ permission.permission_name }}</td>
              <td>{{ permission.role_group_name }}</td>
              <td class="text-secondary-custom">{{ permission.description || '—' }}</td>
              <td>
                <span
                  :class="[
                    'status-badge',
                    permission.is_granted ? 'status-badge--granted' : 'status-badge--denied',
                  ]"
                >
                  {{ permission.is_granted ? t('admin.modulePermissions.granted') : t('admin.modulePermissions.denied') }}
                </span>
              </td>
              <td class="text-end">
                <button
                  type="button"
                  class="btn-action btn-action--delete"
                  @click="deletePermission(permission.id)"
                  :title="t('admin.modulePermissions.delete')"
                  :aria-label="t('admin.modulePermissions.delete')"
                >
                  <Trash2 :size="15" aria-hidden="true" />
                </button>
              </td>
            </tr>
            <tr v-if="filteredPermissions.length === 0">
              <td colspan="7" class="text-center text-muted py-4">{{ t('admin.modulePermissions.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import '../admin-page.scss';

.module-permission-manager {
  background-color: var(--color-primary-background);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.module-permission-manager__header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);

  h5 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-primary-text);
  }
}

.module-permission-manager__body {
  padding: 1.25rem;
}

.mpm-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.mpm-form__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  align-items: start;
}

.mpm-form__field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  &--wide {
    grid-column: 1 / -1;
  }
}

.mpm-form__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.mpm-form__toggle-key {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

@media (width < $ui-bp-lg) {
  .mpm-form__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width < $ui-bp-md) {
  .mpm-form__grid {
    grid-template-columns: 1fr;
  }

  .mpm-form__actions {
    flex-direction: column;
    align-items: stretch;

    .ui-btn {
      width: 100%;
    }
  }
}

.module-permission-table {
  width: 100%;
  border-collapse: collapse;

  th {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-secondary-text);
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
    color: var(--color-primary-text);
    font-size: 0.875rem;
  }

  tbody tr {
    transition: background-color 0.15s ease;

    &:hover {
      background-color: var(--color-hover-background);
    }
  }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.625rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 500;

  &--granted {
    background-color: rgba(var(--bs-success-rgb, 25, 135, 84), 0.1);
    color: var(--bs-success, #198754);
  }

  &--denied {
    background-color: rgba(var(--bs-danger-rgb, 220, 53, 69), 0.1);
    color: var(--bs-danger, #dc3545);
  }
}

.text-secondary-custom {
  color: var(--color-secondary-text);
}

.text-monospace {
  font-family: var(--font-family-mono);
  font-size: 0.8125rem;
}
</style>
