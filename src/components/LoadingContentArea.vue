<script setup>
import { ref, watch, computed } from 'vue'
import SpinnerLoading from '@/components/SpinnerLoading.vue'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  resetKey: {
    type: [String, Number, Boolean, null],
    default: undefined,
  },
  minHeight: {
    type: String,
    default: '12rem',
  },
  spinnerColor: {
    type: String,
    default: 'primary',
  },
  loadingText: {
    type: String,
    default: '',
  },
  dimContent: {
    type: Boolean,
    default: true,
  },
})

const hasLoadedOnce = ref(!props.loading)

watch(
  () => props.loading,
  (loading, wasLoading) => {
    if (wasLoading && !loading) {
      hasLoadedOnce.value = true
    }
  },
)

watch(
  () => props.resetKey,
  () => {
    hasLoadedOnce.value = false
  },
)

const showInitialSpinner = computed(() => props.loading && !hasLoadedOnce.value)
const isRefreshing = computed(() => props.loading && hasLoadedOnce.value)
</script>

<template>
  <div v-if="showInitialSpinner" class="loading-content-area loading-content-area--initial">
    <SpinnerLoading :color="spinnerColor" :loading-text="loadingText" />
  </div>

  <div v-else class="loading-content-area loading-content-area--content" :class="{ 'loading-content-area--refreshing': isRefreshing }">
    <div v-if="isRefreshing" class="loading-content-area__overlay" aria-hidden="true">
      <SpinnerLoading :color="spinnerColor" :loading-text="loadingText" />
    </div>

    <div class="loading-content-area__slot" :class="{ 'loading-content-area__slot--dimmed': isRefreshing && dimContent }">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.loading-content-area {
  &--initial {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: v-bind(minHeight);
    padding: 2rem 0;
  }

  &--content {
    position: relative;
  }

  &--refreshing {
    pointer-events: none;
  }

  &__overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  &__slot--dimmed {
    opacity: 0.55;
    transition: opacity 0.15s ease;
  }
}
</style>
