<template>
  <div class="tab-bar">
    <nav ref="navRef" class="tab-bar__nav" :class="{ 'tab-bar__nav--scroll': isScrollOverflow }" role="tablist" :aria-label="resolvedAriaLabel">
      <div v-if="isMenuOverflow" ref="measureRef" class="tab-bar__measure" aria-hidden="true">
        <span v-for="tab in normalizedTabs" :key="`measure-${tab.id}`" class="tab-bar__tab">
          <component :is="tab.icon" v-if="tab.icon" :size="16" class="tab-bar__icon" />
          <span class="tab-bar__text">{{ tab.name }}</span>
          <span v-if="tab.count" class="tab-bar__badge">{{ tab.count }}</span>
        </span>
        <span class="tab-bar__tab tab-bar__more-trigger">
          <span class="tab-bar__text">{{ moreLabel }}</span>
          <ChevronDown :size="14" class="tab-bar__icon" />
        </span>
      </div>

      <button v-if="showScrollControls" type="button" class="tab-bar__shift tab-bar__shift--left" :disabled="!canShiftBackward" :aria-label="previousLabel" @click="scrollTabs('left')">
        <ChevronLeft :size="16" aria-hidden="true" />
      </button>
      <div ref="listRef" class="tab-bar__list" @scroll="updateShiftState">
        <button v-for="tab in displayedTabs" :key="tab.id" type="button" role="tab" class="tab-bar__tab" :class="{ 'tab-bar__tab--active': modelValue === tab.id }" :aria-selected="modelValue === tab.id" @click="selectTab(tab.id)">
          <component :is="tab.icon" v-if="tab.icon" :size="16" class="tab-bar__icon" />
          <span class="tab-bar__text">{{ tab.name }}</span>
          <span v-if="tab.count" class="tab-bar__badge">{{ tab.count }}</span>
        </button>

        <DropDown v-if="overflowTabs.length" ref="moreDropdownRef" class="tab-bar__more" compact dropdown-menu-class="dropdown-menu-end" :menu-min-width="180">
          <template #main>
            <span class="tab-bar__tab tab-bar__more-trigger">
              <span class="tab-bar__text">{{ moreLabel }}</span>
              <ChevronDown :size="14" class="tab-bar__icon" aria-hidden="true" />
            </span>
          </template>
          <template #list>
            <li v-for="tab in overflowTabs" :key="tab.id">
              <a class="dropdown-item" href="#" role="menuitem" @click.prevent="selectTab(tab.id)">
                <component :is="tab.icon" v-if="tab.icon" :size="16" class="tab-bar__icon" />
                <span class="tab-bar__text">{{ tab.name }}</span>
                <span v-if="tab.count" class="tab-bar__badge">{{ tab.count }}</span>
              </a>
            </li>
          </template>
        </DropDown>
      </div>
      <button v-if="showScrollControls" type="button" class="tab-bar__shift tab-bar__shift--right" :disabled="!canShiftForward" :aria-label="nextLabel" @click="scrollTabs('right')">
        <ChevronRight :size="16" aria-hidden="true" />
      </button>
    </nav>
    <div v-if="$slots.default" class="tab-bar__content">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'
import { getReducedMotionActive } from '@/composables/useUiModes.js'
import DropDown from '@/components/DropDown.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  tabs: {
    type: Array,
    default: () => [],
  },
  overflow: {
    type: String,
    default: 'scroll',
    validator: (value) => value === 'scroll' || value === 'menu',
  },
  ariaLabel: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useAppI18n()
const navRef = ref(null)
const listRef = ref(null)
const measureRef = ref(null)
const moreDropdownRef = ref(null)
const fitCount = ref(0)
const canShiftBackward = ref(false)
const canShiftForward = ref(false)
let resizeObserver = null

const normalizedTabs = computed(() => (
  Array.isArray(props.tabs)
    ? props.tabs.filter((tab) => tab && tab.id != null)
    : []
))

const isScrollOverflow = computed(() => props.overflow !== 'menu')
const isMenuOverflow = computed(() => props.overflow === 'menu')

const moreLabel = computed(() => t('components.tabBar.more'))
const previousLabel = computed(() => t('components.tabBar.previous'))
const nextLabel = computed(() => t('components.tabBar.next'))
const showScrollControls = computed(() => (
  isScrollOverflow.value && (canShiftBackward.value || canShiftForward.value)
))
const resolvedAriaLabel = computed(() => (
  props.ariaLabel || t('components.tabBar.ariaLabel')
))

const splitTabs = computed(() => {
  const all = normalizedTabs.value
  if (!isMenuOverflow.value || fitCount.value >= all.length) {
    return { displayed: all, overflow: [] }
  }

  const visibleLimit = Math.max(1, Math.min(fitCount.value, all.length - 1))
  let displayed = all.slice(0, visibleLimit)
  let overflow = all.slice(visibleLimit)
  const activeId = props.modelValue
  const activeIndex = overflow.findIndex((tab) => tab.id === activeId)
  if (activeIndex >= 0) {
    const [activeTab] = overflow.splice(activeIndex, 1)
    const displaced = displayed[displayed.length - 1]
    displayed = [...displayed.slice(0, -1), activeTab]
    overflow = [displaced, ...overflow]
  }
  return { displayed, overflow }
})

const displayedTabs = computed(() => splitTabs.value.displayed)
const overflowTabs = computed(() => splitTabs.value.overflow)

function selectTab(tabId) {
  emit('update:modelValue', tabId)
  moreDropdownRef.value?.closeDropdown()
}

function measureOverflow() {
  if (!isMenuOverflow.value) {
    fitCount.value = normalizedTabs.value.length
    return
  }
  const nav = navRef.value
  const measure = measureRef.value
  if (!nav || !measure) return

  const styles = getComputedStyle(nav)
  const available = nav.clientWidth
    - Number.parseFloat(styles.paddingLeft || '0')
    - Number.parseFloat(styles.paddingRight || '0')
  const items = [...measure.children]
  if (!items.length) {
    fitCount.value = 0
    return
  }

  const moreWidth = items[items.length - 1]?.offsetWidth || 0
  const tabWidths = items.slice(0, -1).map((el) => el.offsetWidth)
  const total = tabWidths.reduce((sum, width) => sum + width, 0)
  if (total <= available) {
    fitCount.value = tabWidths.length
    return
  }

  const room = Math.max(0, available - moreWidth)
  let used = 0
  let count = 0
  for (const width of tabWidths) {
    if (used + width > room) break
    used += width
    count += 1
  }
  fitCount.value = count
}

function updateShiftState() {
  const el = listRef.value
  if (!el || !isScrollOverflow.value) {
    canShiftBackward.value = false
    canShiftForward.value = false
    return
  }
  const maxScrollLeft = el.scrollWidth - el.clientWidth
  const overflowing = el.scrollWidth > el.clientWidth + 1
  if (!overflowing) {
    canShiftBackward.value = false
    canShiftForward.value = false
    return
  }
  canShiftBackward.value = el.scrollLeft > 0
  canShiftForward.value = el.scrollLeft < maxScrollLeft - 1
}

function scrollTabs(direction) {
  const el = listRef.value
  if (!el) return
  const amount = Math.max(200, Math.floor(el.clientWidth * 0.75))
  const delta = direction === 'left' ? -amount : amount
  el.scrollBy({
    left: delta,
    behavior: getReducedMotionActive() ? 'auto' : 'smooth',
  })
}

function scheduleMeasure() {
  nextTick(() => {
    requestAnimationFrame(() => {
      measureOverflow()
      updateShiftState()
    })
  })
}

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(scheduleMeasure)
    if (navRef.value) resizeObserver.observe(navRef.value)
  } else {
    window.addEventListener('resize', scheduleMeasure)
  }
  scheduleMeasure()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleMeasure)
})

watch(
  () => [props.overflow, normalizedTabs.value.map((tab) => [tab.id, tab.name, tab.count])],
  scheduleMeasure,
  { flush: 'post' },
)

watch(showScrollControls, (visible) => {
  if (visible) scheduleMeasure()
})
</script>

<style scoped lang="scss">
@use '@/scss/ui/mixins' as *;

.tab-bar {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.tab-bar__nav {
  position: relative;
  min-width: 0;
  max-width: 100%;
  border-bottom: 1.5px solid var(--ui-border, var(--color-border));
  border-radius: 6px 6px 0 0;

  &--scroll {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
  }
}

.tab-bar__list,
.tab-bar__measure {
  display: flex;
  align-items: stretch;
  padding: 0 0.5rem;
}

.tab-bar__list {
  min-width: 0;
}

.tab-bar__nav--scroll .tab-bar__list {
  grid-column: 2;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.tab-bar__shift {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 0.375rem;
  background: transparent;
  color: var(--ui-text, var(--color-primary-text));
  cursor: pointer;

  @include ui-reduced-motion;
  @include ui-a11y-focus;

  &:hover:not(:disabled) {
    color: var(--ui-accent, var(--color-accent));
    border-color: var(--ui-accent, var(--color-accent));
    background: color-mix(in srgb, var(--ui-accent, var(--color-accent)) 8%, transparent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  &--left {
    grid-column: 1;
  }

  &--right {
    grid-column: 3;
  }
}

.tab-bar__nav:not(.tab-bar__nav--scroll) .tab-bar__list {
  overflow: hidden;
}

.tab-bar__measure {
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  visibility: hidden;
  pointer-events: none;
}

.tab-bar__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
  padding: 0.75rem 1rem;
  border: none;
  background: none;
  color: var(--ui-text-muted, var(--color-secondary-text));
  font-size: 0.875rem;
  font-weight: var(--u-font-weight-normal);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
  position: relative;

  @include ui-reduced-motion;
  @include ui-a11y-focus;

  &:hover {
    color: var(--ui-accent, var(--color-accent));
    background-color: color-mix(in srgb, var(--ui-accent, var(--color-accent)) 5%, transparent);
  }

  &--active {
    color: var(--ui-accent, var(--color-accent));
    border-bottom-color: var(--ui-accent, var(--color-accent));
    background-color: transparent;
  }
}

.tab-bar__icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tab-bar__text {
  white-space: nowrap;
}

.tab-bar__badge {
  background-color: var(--ui-text-muted, var(--color-secondary-text));
  color: var(--ui-surface, var(--color-primary-background));
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 10px;
  min-width: 1.25rem;
  text-align: center;
  line-height: 1.25;
}

.tab-bar__tab--active .tab-bar__badge {
  background-color: var(--ui-accent, var(--color-accent));
}

.tab-bar__more {
  display: inline-flex;
  align-self: stretch;
  flex: 0 0 auto;

  :deep(.dropdown-button) {
    display: inline-flex;
    align-items: stretch;
    height: 100%;
  }
}

.tab-bar__more-trigger {
  height: 100%;
}

.tab-bar__content {
  margin-top: 1rem;
}
</style>