<template>
  <div ref="rootEl" class="filter-menu">
    <label v-if="label" class="form-label mb-1" :for="triggerId">{{ label }}</label>
    <button :id="triggerId" type="button" class="btn w-100 d-flex align-items-center justify-content-between filter-menu__trigger" :class="{ 'filter-menu__trigger--open': isMainOpen }" :disabled="disabled" :aria-label="label || triggerText" :aria-expanded="isMainOpen" :aria-controls="panelId" aria-haspopup="menu" @click="toggleMain">
      <span class="filter-menu__trigger-label">{{ triggerText }}</span>
      <ChevronDown class="filter-menu__trigger-chevron" :class="{ 'filter-menu__trigger-chevron--open': isMainOpen }" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <div v-if="isMainOpen" :id="panelId" ref="mainPanelEl" class="filter-menu__panel dropdown-menu show fixed-menu" role="menu" v-csp-style="mainPanelStyle" data-filter-menu-panel @mousedown.stop>
        <ul class="filter-menu__list">
          <template v-for="field in fields" :key="fieldKey(field)">
            <li v-if="field.type === 'heading'" class="filter-menu__heading">
              {{ field.label }}
            </li>
            <li v-else-if="isInteractiveField(field)">
              <button type="button" class="filter-menu__row" :class="{ 'filter-menu__row--active': activeFlyoutKey === field.key }" :data-field-key="field.key" @mouseenter="onRowEnter(field.key, $event.currentTarget)" @mouseleave="onRowLeave" @click.stop="onRowClick(field, $event)">
                <span class="filter-menu__row-label" @mouseenter="onTruncatedLabelEnter($event, field.label)" @mouseleave="onTruncatedLabelLeave">{{ field.label }}</span>
                <span class="filter-menu__row-value text-muted">
                  <span v-if="field.showOptionAvatars && getOptionAvatarProps(getSelectedOption(field))" class="filter-menu__row-value-with-avatar">
                    <UserAvatar v-bind="getOptionAvatarProps(getSelectedOption(field))" :size="18"/>
                    <span class="filter-menu__row-value-text" @mouseenter="onTruncatedLabelEnter($event, getFieldDisplayValue(field))" @mouseleave="onTruncatedLabelLeave">{{ getFieldDisplayValue(field) }}</span>
                  </span>
                  <span v-else class="filter-menu__row-value-text" @mouseenter="onTruncatedLabelEnter($event, getFieldDisplayValue(field))" @mouseleave="onTruncatedLabelLeave">{{ getFieldDisplayValue(field) }}</span>
                </span>
                <ChevronRight class="filter-menu__row-chevron" :size="16" />
              </button>
            </li>
          </template>
        </ul>

        <div class="filter-menu__footer">
          <button type="button" class="btn btn-sm btn-outline-secondary w-100" :disabled="!hasActiveValues" @click="handleReset">
            {{ t('components.filterMenu.reset') }}
          </button>
        </div>
      </div>

      <div v-if="isMainOpen && activeFlyoutKey && activeField" ref="flyoutPanelEl" class="filter-menu__flyout dropdown-menu show fixed-menu" v-csp-style="flyoutPanelStyle" data-filter-menu-flyout @mousedown.stop @mouseenter="onFlyoutEnter" @mouseleave="onFlyoutLeave">
        <template v-if="activeField.type === 'select'">
          <input v-if="activeField.searchable" ref="flyoutSearchEl" v-model="flyoutSearchQuery" type="text" class="filter-menu__search select-box-search" :placeholder="t('components.searchInput.placeholder')" autocomplete="off" @mousedown.stop/>
          <ul class="dropdown-menu-list">
            <li v-if="!activeField.multiple && activeField.includeAllOption !== false && !flyoutSearchActive">
              <a href="#" class="dropdown-item" :class="{ active: isEmptyValue(activeField.key) }" @click.prevent="chooseSelectValue(activeField, null)">
                {{ activeField.allLabel || t('components.selectBox.all') }}
              </a>
            </li>
            <li v-for="opt in filteredFlyoutOptions" :key="opt.key">
              <a href="#" class="dropdown-item" :class="{ active: isSelectValueActive(activeField, opt.value), 'filter-menu__option--multiple': activeField.multiple, 'filter-menu__option-with-avatar': activeField.showOptionAvatars && getOptionAvatarProps(opt) }" @click.prevent="chooseSelectValue(activeField, opt.value)">
                <input v-if="activeField.multiple && activeField.showCheckboxesWhenMultiple !== false" type="checkbox" class="form-check-input filter-menu__option-checkbox" :checked="isSelectValueActive(activeField, opt.value)" tabindex="-1" @click.prevent/>
                <UserAvatar v-if="activeField.showOptionAvatars && getOptionAvatarProps(opt)" v-bind="getOptionAvatarProps(opt)" :size="24"/>
                <span class="filter-menu__option-label" @mouseenter="onTruncatedLabelEnter($event, opt.label)" @mouseleave="onTruncatedLabelLeave">{{ opt.label }}</span>
              </a>
            </li>
          </ul>
        </template>

        <template v-else-if="activeField.type === 'date'">
          <div class="filter-menu__date-body">
            <label :for="`filter-menu-date-${activeField.key}`" class="form-label mb-1">
              {{ activeField.label }}
            </label>
            <DatePicker
              :id="`filter-menu-date-${activeField.key}`"
              :model-value="getFieldRawValue(activeField.key)"
              @update:model-value="onDateChange(activeField, $event)"
              @focusin="pinActiveFlyout"
            />
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch, nextTick, onBeforeUnmount, useId } from 'vue'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import UserAvatar from '@/components/UserAvatar.vue'

const DatePicker = defineAsyncComponent(() => import('@/components/DatePicker.vue'))
import { hideHoverTooltipForOwner, showHoverTooltip, } from '@/js/utils/hoverTooltipLayer.js'
import { useFilterMenuFlyout } from '@/composables/useFilterMenuFlyout.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const { t } = useAppI18n()

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({}),
  },
  fields: {
    type: Array,
    default: () => [],
  },
  label: {
    type: String,
    default: '',
  },
  triggerLabel: {
    type: String,
    default: undefined,
  },
  applyOnChange: {
    type: Boolean,
    default: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'apply', 'reset'])

const triggerId = useId()
const panelId = computed(() => `${triggerId}-panel`)

const {
  rootEl,
  mainPanelEl,
  flyoutPanelEl,
  isMainOpen,
  activeFlyoutKey,
  mainPanelStyle,
  flyoutPanelStyle,
  toggleMain,
  openFlyout,
  closeFlyout,
  pinActiveFlyout,
  onRowEnter,
  onRowLeave,
  onFlyoutEnter,
  onFlyoutLeave,
  updateFlyoutPosition,
} = useFilterMenuFlyout()

const flyoutSearchQuery = ref('')
const flyoutSearchEl = ref(null)

const activeField = computed(() =>
  props.fields.find((field) => field.type !== 'heading' && field.key === activeFlyoutKey.value) || null,
)

const activeCount = computed(() =>
  props.fields.filter((field) => isCountableActiveField(field)).length,
)

const hasActiveValues = computed(() => activeCount.value > 0)

const resolvedTriggerLabel = computed(
  () => props.triggerLabel ?? t('components.filterMenu.trigger'),
)

const triggerText = computed(() => {
  if (activeCount.value > 0) {
    if (props.triggerLabel == null) {
      return t('components.filterMenu.triggerActive', { count: activeCount.value })
    }
    return `${props.triggerLabel} (${activeCount.value})`
  }
  return resolvedTriggerLabel.value
})

const flyoutSearchActive = computed(() =>
  Boolean(activeField.value?.searchable && flyoutSearchQuery.value.trim()),
)

const filteredFlyoutOptions = computed(() => {
  const field = activeField.value
  if (!field || field.type !== 'select') return []
  const options = normalizeSelectOptions(field)
  const query = flyoutSearchQuery.value.trim().toLowerCase()
  if (!query) return options
  return options.filter((opt) => {
    const raw = opt.raw
    const haystack = String(
      (typeof raw === 'object' && raw !== null && raw.searchLabel) || opt.label || '',
    ).toLowerCase()
    return haystack.includes(query)
  })
})

watch(activeFlyoutKey, (key) => {
  flyoutSearchQuery.value = ''
  if (!key) return
  nextTick(() => {
    if (activeField.value?.searchable) {
      flyoutSearchEl.value?.focus()
    }
  })
})

watch(filteredFlyoutOptions, () => {
  if (!activeFlyoutKey.value) return
  nextTick(() => {
    const activeRow = mainPanelEl.value?.querySelector('.filter-menu__row--active')
    if (activeRow) {
      updateFlyoutPosition(activeRow)
    }
  })
})

function fieldKey(field) {
  if (field.type === 'heading') return `heading-${field.label}`
  return field.key
}

function isInteractiveField(field) {
  return field.type === 'select' || field.type === 'date'
}

function getFieldByKey(key) {
  return props.fields.find((field) => field.key === key) || null
}

function isFieldMultiple(field) {
  return Boolean(field?.type === 'select' && field.multiple)
}

function normalizeStoredSelectValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  if (field?.castToNumber) {
    const num = Number(value)
    return Number.isNaN(num) ? value : num
  }
  return value
}

function isEmptyValue(key) {
  const value = props.modelValue?.[key]
  const field = getFieldByKey(key)
  if (isFieldMultiple(field)) {
    return !Array.isArray(value) || value.length === 0
  }
  return value === null || value === undefined || value === ''
}

function isCountableActiveField(field) {
  if (!field || field.type === 'heading') return false
  if (isEmptyValue(field.key)) return false
  if (field.defaultValue === undefined) return true
  return !valuesAreEqual(props.modelValue?.[field.key], field.defaultValue)
}

function getFieldRawValue(key) {
  const value = props.modelValue?.[key]
  if (value === null || value === undefined) return ''
  return String(value)
}

function toOptionKey(value) {
  if (value === null || value === undefined) return 'null'
  return `${typeof value}:${String(value)}`
}

function normalizeSelectOptions(field) {
  const valueKey = field.valueKey || 'value'
  const labelKey = field.labelKey || 'label'
  return (field.options || []).map((raw) => {
    const isObject = typeof raw === 'object' && raw !== null
    const value = isObject ? raw[valueKey] : raw
    const label = isObject ? (raw[labelKey] ?? String(value ?? '')) : String(raw ?? '')
    return { key: toOptionKey(value), value, label, raw }
  })
}

function getSelectedOption(field) {
  if (!field || field.type !== 'select' || isEmptyValue(field.key)) return null
  const value = props.modelValue[field.key]
  return normalizeSelectOptions(field).find((opt) => valuesAreEqual(opt.value, value)) || null
}

function getOptionAvatarProps(opt) {
  const raw = opt?.raw
  if (!raw || typeof raw !== 'object') return null
  const userRef = raw.userRef ?? null
  const firstName = raw.firstName || ''
  const lastName = raw.lastName || ''
  if (!userRef && !firstName && !lastName) return null
  return {
    userRef,
    firstName,
    lastName,
    title: raw.searchLabel || raw.label || opt.label || '',
  }
}

function getFieldDisplayValue(field) {
  if (isEmptyValue(field.key)) {
    if (field.type === 'select' && field.includeAllOption !== false) {
      return field.allLabel || t('components.selectBox.all')
    }
    return field.emptyLabel || '—'
  }

  if (field.type === 'date') {
    return getFieldRawValue(field.key)
  }

  if (field.type === 'select') {
    const value = props.modelValue[field.key]
    if (isFieldMultiple(field)) {
      if (!Array.isArray(value) || value.length === 0) {
        return field.allLabel || t('components.selectBox.all')
      }
      if (field.multipleLabelFormat === 'count') {
        return t('components.selectBox.selectedCount', { count: value.length })
      }
      const labels = value.map((item) => {
        const found = normalizeSelectOptions(field).find((opt) => valuesAreEqual(opt.value, item))
        return found?.label || String(item)
      })
      return labels.join(', ')
    }
    const found = normalizeSelectOptions(field).find((opt) => valuesAreEqual(opt.value, value))
    return found?.label || String(value)
  }

  return String(props.modelValue[field.key])
}

function valuesAreEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return false
  return String(a) === String(b)
}

function isSelectValueActive(field, value) {
  if (value === null || value === undefined) {
    return isEmptyValue(field.key)
  }
  if (isFieldMultiple(field)) {
    const current = props.modelValue[field.key]
    if (!Array.isArray(current)) return false
    return current.some((item) => valuesAreEqual(item, value))
  }
  return valuesAreEqual(props.modelValue[field.key], value)
}

function patchModelValue(key, value) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value,
  })
}

function emitApplyIfNeeded() {
  if (props.applyOnChange) {
    emit('apply')
  }
}

function chooseSelectValue(field, value) {
  if (isFieldMultiple(field)) {
    if (value === null || value === undefined) {
      patchModelValue(field.key, [])
      emitApplyIfNeeded()
      return
    }

    const current = Array.isArray(props.modelValue[field.key])
      ? [...props.modelValue[field.key]]
      : []
    const normalized = normalizeStoredSelectValue(field, value)
    const existingIndex = current.findIndex((item) => valuesAreEqual(item, normalized))

    if (existingIndex >= 0) {
      current.splice(existingIndex, 1)
    } else if (normalized !== null) {
      current.push(normalized)
    }

    patchModelValue(field.key, current)
    emitApplyIfNeeded()
    return
  }

  const nextValue = value === null || value === undefined ? '' : value
  patchModelValue(field.key, nextValue)
  closeFlyout()
  emitApplyIfNeeded()
}

function onDateChange(field, value) {
  patchModelValue(field.key, value || '')
  emitApplyIfNeeded()
}

function onRowClick(field, event) {
  if (!isInteractiveField(field)) return
  openFlyout(field.key, event.currentTarget, { pin: true })
}

function handleReset() {
  const cleared = { ...props.modelValue }
  for (const field of props.fields) {
    if (field.type === 'heading') continue
    if (field.defaultValue !== undefined) {
      cleared[field.key] = field.defaultValue
    } else {
      cleared[field.key] = isFieldMultiple(field) ? [] : ''
    }
  }
  emit('update:modelValue', cleared)
  emit('reset')
  if (props.applyOnChange) {
    emit('apply')
  }
}

function hideTruncatedLabelTooltip() {
  hideHoverTooltipForOwner(hideTruncatedLabelTooltip)
}

function isLabelTruncated(el) {
  return el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1
}

function onTruncatedLabelEnter(event, text) {
  const el = event.currentTarget
  if (!isLabelTruncated(el)) {
    hideTruncatedLabelTooltip()
    return
  }
  showHoverTooltip({
    ownerHide: hideTruncatedLabelTooltip,
    text,
    variant: 'default',
    wrap: false,
    triggerRect: el.getBoundingClientRect(),
  })
}

function onTruncatedLabelLeave() {
  hideTruncatedLabelTooltip()
}

onBeforeUnmount(() => {
  hideTruncatedLabelTooltip()
})
</script>

<style scoped lang="scss">
.filter-menu {
  --filter-menu-trigger-font-size: 1rem;
  --select-box-font-size: 0.875rem;
  --select-box-item-padding-y: 0.375rem;
  --select-box-item-padding-x: 0.75rem;
  --select-box-trigger-min-height: 38px;
  position: relative;
  min-width: 170px;
  line-height: 1.5;

  @media (width < $ui-bp-md) {
    min-width: 0;
    flex: 1 1 auto;
    max-width: 100%;
  }
}

.filter-menu__trigger {
  min-height: var(--select-box-trigger-min-height);
  padding: var(--select-box-item-padding-y) var(--select-box-item-padding-x);
  border: 1px solid var(--color-border);
  background-color: var(--color-primary-background);
  color: var(--color-primary-text);
  font-size: var(--filter-menu-trigger-font-size);
  line-height: 1.5;
  text-shadow: none;
  box-shadow: none;
  --bs-btn-box-shadow: none;
  --bs-btn-focus-box-shadow: none;
  --bs-btn-font-size: var(--filter-menu-trigger-font-size);
  --bs-btn-line-height: 1.5;
  --bs-btn-padding-y: var(--select-box-item-padding-y);
  --bs-btn-padding-x: var(--select-box-item-padding-x);
  white-space: nowrap;
  text-align: left;
  flex-shrink: 0;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease;

  &:hover:not(:disabled),
  &.filter-menu__trigger--open {
    background-color: var(--color-hover-background);
    box-shadow: none;
  }

  &:focus,
  &:focus-visible,
  &:active,
  &.show {
    box-shadow: none;
  }
}

.filter-menu__trigger-label {
  flex: 1 0 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: inherit;
  line-height: inherit;
}

.filter-menu__trigger-chevron {
  width: var(--select-box-icon-size, 1.125em);
  height: var(--select-box-icon-size, 1.125em);
  flex-shrink: 0;
  transition: transform 0.2s ease;

  &--open {
    transform: rotate(180deg);
  }
}

.filter-menu__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.filter-menu__heading {
  padding: 0.375rem 0.75rem 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--color-secondary-text);
  user-select: none;
}

.filter-menu__footer {
  padding: 0.5rem 0.75rem 0.625rem;
  border-top: 1px solid var(--color-border);
}

.filter-menu__date-body {
  padding: 0.625rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>

<style lang="scss">
.filter-menu__panel.fixed-menu.dropdown-menu,
.filter-menu__flyout.fixed-menu.dropdown-menu {
  position: fixed;
  margin-top: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  box-shadow: var(--ui-shadow-lg);
  overflow: visible;
  box-sizing: border-box;
  font-size: var(--select-box-font-size, 0.875rem);
  line-height: 1.5;
  background-color: var(--color-primary-background, var(--bs-body-bg));
  color: var(--color-primary-text, var(--bs-body-color));
}

.filter-menu__panel .filter-menu__row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  margin: 0;
  padding: var(--select-box-item-padding-y, 0.375rem) var(--select-box-item-padding-x, 0.75rem);
  border: 0;
  background-color: transparent;
  color: var(--color-primary-text);
  font-size: 1em;
  line-height: 1.5;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.3s ease, color 0.3s ease;

  &:hover,
  &.filter-menu__row--active {
    background-color: var(--color-hover-background);
    color: var(--color-primary-text);
  }
}

.filter-menu__panel .filter-menu__row-label {
  flex: 1 1 0;
  min-width: 0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-menu__panel .filter-menu__row-value {
  flex: 0 1 auto;
  max-width: 45%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 0.8125rem;
}

.filter-menu__panel .filter-menu__row-chevron {
  flex: 0 0 auto;
  width: 1em;
  height: 1em;
  opacity: 0.75;
}

.filter-menu__flyout .dropdown-menu-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: none;
  height: auto;
  max-height: min(260px, 70vh);
  min-height: auto;
  overflow-y: auto;
  overflow-x: hidden;
}

.filter-menu__flyout .dropdown-item {
  color: var(--color-primary-text);
  background-color: transparent;
  font-size: 1em;
  line-height: 1.5;
  padding: var(--select-box-item-padding-y, 0.375rem) var(--select-box-item-padding-x, 0.75rem);
  display: block;
  width: 100%;
  text-align: left;
  text-decoration: none;
  border: 0;
  cursor: pointer;
  white-space: normal;
  overflow-wrap: break-word;

  &:hover {
    background-color: var(--color-hover-background);
  }

  &.active {
    background-color: color-mix(in srgb, var(--color-accent, #0d6efd) 12%, transparent);
    color: var(--color-accent, #0d6efd);
  }

  &.filter-menu__option-with-avatar,
  &.filter-menu__option--multiple {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
}

.filter-menu__row-value-text {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-menu__option-label {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  white-space: normal;
  overflow-wrap: break-word;
}

.filter-menu__option-checkbox {
  flex: 0 0 auto;
  width: 1em;
  height: 1em;
  min-width: 1em;
  margin: 0;
  pointer-events: none;
  cursor: pointer;
  border-color: var(--color-border, var(--bs-border-color));
  background-color: var(--color-primary-background, var(--bs-body-bg));

  &:checked {
    background-color: var(--color-accent, var(--bs-primary));
    border-color: var(--color-accent, var(--bs-primary));
  }

  &:focus {
    box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--color-accent, var(--bs-primary)) 25%, transparent);
  }
}

.filter-menu__row-value-with-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.375rem;
  max-width: 100%;
  min-width: 0;
}

.filter-menu__search.select-box-search {
  flex-shrink: 0;
  padding: var(--select-box-item-padding-y, 0.375rem) var(--select-box-item-padding-x, 0.75rem);
  border: none;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  background-color: var(--color-primary-background);
  color: var(--color-primary-text);
  font-size: 1em;
  line-height: 1.5;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.filter-menu__search.select-box-search::placeholder {
  color: var(--color-secondary-text);
}
</style>