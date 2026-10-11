<template>
  <nav class="breadcrumbs" :aria-label="t('components.breadcrumbs.ariaLabel')">
    <ol class="breadcrumb-list" :class="{ 'breadcrumb-list--single-line': hasTruncatedItem }">
      <template v-for="(item, index) in breadcrumbs" :key="index">
        <li class="breadcrumb-item" :class="{ active: index === breadcrumbs.length - 1, 'breadcrumb-item--truncate': item.truncate }" :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined">
          <template v-if="index < breadcrumbs.length - 1">
            <router-link v-if="item.to" :to="item.to" class="breadcrumb-link" @mouseenter="prefetchItem(item)" @focusin="prefetchItem(item)">
              <component v-if="item.icon" :is="item.icon" class="lucide breadcrumb-leading-icon" :size="18"/>
              {{ item.label }}
            </router-link>
            <span v-else class="breadcrumb-text">
              <component v-if="item.icon" :is="item.icon" class="lucide breadcrumb-leading-icon" :size="18"/>
              {{ item.label }}
            </span>
          </template>
          <template v-else>
            <HoverTooltip v-if="item.truncate" :text="item.label" only-when-truncated wrap class="breadcrumb-truncate">
              <span class="breadcrumb-current breadcrumb-current--truncate">
                <component v-if="item.icon" :is="item.icon" class="lucide breadcrumb-leading-icon" :size="18"/>
                <span class="breadcrumb-label">{{ item.label }}</span>
              </span>
            </HoverTooltip>
            <span v-else class="breadcrumb-current">
              <component v-if="item.icon" :is="item.icon" class="lucide breadcrumb-leading-icon" :size="18"/>
              {{ item.label }}
            </span>
          </template>
        </li>
        <li v-if="index < breadcrumbs.length - 1" class="breadcrumb-separator" aria-hidden="true">
          {{ separator }}
        </li>
      </template>
      <li v-if="trailingSeparator" class="breadcrumb-separator" aria-hidden="true">
        {{ separator }}
      </li>
    </ol>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import HoverTooltip from '@/components/HoverTooltip.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { prefetchRouteByName } from '@/js/utils/prefetchRoute.js'

const { t } = useAppI18n()
const router = useRouter()

const props = defineProps({
  items: {
    type: Array,
    required: true,
    validator: (items) =>
      items.every(
        (item) => typeof item === 'object' && typeof item.label === 'string',
      ),
  },
  separator: {
    type: String,
    default: '/',
  },
  trailingSeparator: {
    type: Boolean,
    default: false,
  },
})

const breadcrumbs = computed(() =>
  props.items.map((item) => ({
    label: item.label,
    to: item.to || null,
    icon: item.icon || null,
    truncate: Boolean(item.truncate),
  })),
)

const hasTruncatedItem = computed(() => breadcrumbs.value.some((item) => item.truncate))

function prefetchItem(item) {
  const name = item?.to?.name
  if (typeof name === 'string') {
    prefetchRouteByName(router, name)
  }
}
</script>

<style scoped lang="scss">
.breadcrumbs {
  margin-bottom: 0.5rem;
  min-width: 0;
  max-width: 100%;
}

.breadcrumb-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.875rem;
  color: var(--color-secondary-text, #6b7280);
}

.breadcrumb-list--single-line {
  flex-wrap: nowrap;
  min-width: 0;
  max-width: 100%;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.breadcrumb-item--truncate {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  justify-content: flex-start;
}

.breadcrumb-link {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
  text-decoration: none;
  transition: color 0.15s ease;

  &:hover {
    color: color-mix(in srgb, var(--color-accent) 85%, var(--color-primary-text));
    text-decoration: underline;
  }
}

.breadcrumb-text {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-secondary-text, #6b7280);
  text-decoration: none;
}

.breadcrumb-current {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary-text, #2d2d2d);
  font-weight: 500;
}

.breadcrumb-truncate {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.breadcrumb-current--truncate {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  justify-content: flex-start;
}

.breadcrumb-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breadcrumb-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 0.5rem;
  color: var(--color-secondary-text, #6b7280);
  user-select: none;
}

.lucide {
  display: flex;
  align-items: center;
  justify-content: center;
}

.breadcrumb-leading-icon {
  margin-inline-end: 0.25rem;
}

.breadcrumb-item.active {
  .breadcrumb-current {
    color: var(--color-primary-text, #2d2d2d);
    font-weight: 500;
  }
}
</style>