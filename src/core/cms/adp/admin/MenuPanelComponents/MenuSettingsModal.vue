<script setup>
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { ref, watch, onMounted } from 'vue'
import { Settings } from '@lucide/vue'
import ModalCenter from '@/components/ModalCenter.vue'
import { loadExpandAllGroups, saveExpandAllGroups } from './expandAllGroupsStorage.js'

const { t } = useAppI18n()


const props = defineProps({
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'save'])

const expandAllGroups = ref(false)

function loadSetting() {
  expandAllGroups.value = loadExpandAllGroups()
}

watch(() => props.show, (isOpen) => {
  if (isOpen) {
    loadSetting()
  }
})

onMounted(() => {
  loadSetting()
})

function handleSave() {
  saveExpandAllGroups(expandAllGroups.value)
  emit('save', expandAllGroups.value)
  emit('close')
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <ModalCenter standalone :visible="show" modal-id="menuSettingsModal" :title="t('admin.menu.pageSettings')" @closemodal="handleClose">
      <template #title>
        <Settings :size="24" class="text-primary" /><span>{{ t('admin.menu.pageSettings') }}</span>
      </template>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="expandAllGroups" v-model="expandAllGroups"/>
        <label class="form-check-label" for="expandAllGroups">{{ t('admin.menu.expandAllGroups') }}</label>
      </div>
      <div class="d-flex justify-content-end gap-2 mt-3 pt-3 border-top">
        <button type="button" class="ui-btn ui-btn--secondary" @click="handleClose">{{ t('common.cancel') }}</button>
        <button type="button" class="ui-btn ui-btn--primary" @click="handleSave">{{ t('common.save') }}</button>
      </div>
  </ModalCenter>
</template>

<style scoped>
.form-check {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  margin: 0;
}

.form-check-input {
  margin: 0;
  cursor: pointer;
  flex-shrink: 0;
  width: 1.25em;
  height: 1.25em;
  margin-top: 0.125em;
}

.form-check-label {
  cursor: pointer;
  user-select: none;
  margin: 0;
  line-height: 1.5;
  display: flex;
  align-items: center;
}

.btn {
  border-radius: 8px;
  font-weight: 500;
}
</style>