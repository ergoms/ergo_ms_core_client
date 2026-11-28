<script setup>
import { computed } from 'vue'
import { ChevronRight } from '@lucide/vue'
import SelectBox from '@/components/SelectBox.vue'
import HoverTooltip from '@/components/HoverTooltip.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import LucideMotionIcon from '@/components/LucideMotionIcon.vue'
import { CORE_ICON } from '@/config/coreIconNames.js'
import { useDropdown } from '@/composables/useDropdown.js'
import { useUiSettings } from '@/core/cms/js/uiSettings.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const props = defineProps({
  iconSize: {
    type: Number,
    default: 20,
  },
})

const { t } = useAppI18n()
const emit = defineEmits(['dropdown-toggle', 'openUserSettings'])
const { dropdownRef, isOpen, toggleDropdown, closeDropdown } = useDropdown(emit)

defineExpose({
  closeDropdown,
})

const { theme, language, THEME_OPTIONS, LANGUAGE_OPTIONS } = useUiSettings()

const quickSettings = computed(() => [
  {
    key: 'theme',
    model: theme,
    options: THEME_OPTIONS.value,
    icon: CORE_ICON.themeContrast,
    label: t('menu.toolbar.theme'),
  },
  {
    key: 'language',
    model: language,
    options: LANGUAGE_OPTIONS.value,
    icon: CORE_ICON.language,
    label: t('menu.toolbar.language'),
  },
])

function openUserSettings() {
  closeDropdown()
  emit('openUserSettings')
}
</script>

<template>
  <div ref="dropdownRef" class="settings-menu-wrapper">
    <HoverTooltip :text="t('menu.toolbar.settings')">
      <button type="button" class="header-btn settings-menu-btn" :class="{ 'settings-menu-btn--open': isOpen }" :aria-label="t('menu.toolbar.settings')" :aria-expanded="isOpen" aria-haspopup="true" @click.stop="toggleDropdown">
        <LucideMotionIcon :name="CORE_ICON.settings" :size="props.iconSize" animate-on-hover trigger-target="closest:button" aria-hidden="true" />
      </button>
    </HoverTooltip>
    <Transition name="dropdown">
      <ul v-if="isOpen" class="settings-dropdown-menu">
        <li>
          <button type="button" class="dropdown-item header-dropdown-item settings-menu__item-row settings-menu__item-row--settings w-100 text-start" @click.stop="openUserSettings">
            <span class="icon-flex settings-menu__item-icon">
              <LucideIcon :name="CORE_ICON.settings" :size="18" />
            </span>
            <span class="settings-menu__main-text">{{ t('menu.toolbar.settings') }}</span>
          </button>
        </li>
        <li v-for="item in quickSettings" :key="item.key" class="settings-menu__quick">
          <SelectBox v-model="item.model.value" :options="item.options" :include-all-option="false" open-on-hover placement="right" :placement-gap="0" placement-align="center" hide-chevron class="settings-menu__quick-select">
            <template #selected="{ label }">
              <span class="settings-menu__quick-trigger">
                <span class="icon-flex settings-menu__item-icon">
                  <LucideIcon :name="item.icon" :size="18" />
                </span>
                <span class="settings-menu__main-text settings-menu__quick-label text-truncate">{{ item.label }}</span>
                <span class="settings-menu__quick-value text-muted text-truncate">{{ label }}</span>
                <ChevronRight class="settings-menu__quick-chevron flex-shrink-0" :size="16" />
              </span>
            </template>
            <template #option="{ option, label }">
              <span class="settings-menu__option">
                <LucideIcon v-if="option?.icon" :name="option.icon" :size="15" icon-class="settings-menu__option-icon"/>
                <span class="settings-menu__option-label">{{ label }}</span>
              </span>
            </template>
          </SelectBox>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.settings-menu-wrapper {
  position: relative;
  display: inline-block;
}

.settings-menu-btn {
  border: none;
  background-color: transparent;
  color: inherit;

  &:hover,
  &--open {
    background-color: var(--color-hover-background);
  }
}

.settings-dropdown-menu {
  @include dropdown-menu-base;
  @include toolbar-dropdown-centered;
  min-width: min(220px, calc(100vw - 1rem));
  max-width: min(280px, calc(100vw - 1rem));
  // Рамка, фон и отступы как у бокового списка SelectBox, чтобы меню и подменю выглядели одинаково.
  padding: 0;
  overflow: hidden;
  background-color: var(--color-primary-background, var(--bs-body-bg));
  border: 1px solid var(--bs-border-color, var(--color-border));
}

.settings-dropdown-menu .settings-menu__item-row,
.settings-menu__quick-select :deep(.select-trigger) {
  padding: 0.375rem 0.75rem;
}

.settings-dropdown-menu .settings-menu__item-row.header-dropdown-item:hover,
.settings-menu__quick-select :deep(.select-trigger:hover),
.settings-menu__quick-select :deep(.select-trigger--open) {
  background-color: var(--color-hover-background);
}

.settings-menu__main-text {
  font-size: 0.9375rem;
  line-height: 1.5;
}

.settings-menu__item-icon {
  display: inline-flex;
  width: 18px;
  flex-shrink: 0;
  justify-content: center;
  align-items: center;
}

.settings-menu__item-row--settings {
  display: grid !important;
  grid-template-columns: 18px 1fr;
  align-items: center;
  column-gap: 12px;
}

.settings-menu__quick {
  list-style: none;
}

.settings-menu__quick-select {
  width: 100%;
  --select-box-font-size: 0.9375rem;
}

.settings-menu__quick-select :deep(.select-trigger) {
  background-color: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  min-height: 0;
  color: inherit;
}

.settings-menu__quick-select :deep(.select-trigger:active:not(:disabled)) {
  transform: none;
}

.settings-menu__quick-trigger {
  display: grid;
  grid-template-columns: 18px 1fr auto auto;
  align-items: center;
  column-gap: 12px;
  width: 100%;
  min-width: 0;
}

.settings-menu__quick-label {
  min-width: 0;
}

.settings-menu__quick-value {
  font-size: 0.8125rem;
  max-width: 5.5rem;
}

.settings-menu__quick-chevron {
  opacity: 0.75;
  // Штрих ChevronRight занимает середину рамки 16px; сдвиг выравнивает видимый отступ справа с иконкой слева.
  margin-right: -4px;
}

.settings-menu__option {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.settings-menu__option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
