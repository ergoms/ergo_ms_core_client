<template>
  <div class="data-table-details" :class="{ 'data-table-details--open': open }" :aria-hidden="!open">
    <div class="data-table-details__inner">
      <div class="data-table-details__body">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false,
  },
})
</script>

<style lang="scss" scoped>
.data-table-details {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.25s ease, opacity 0.2s ease;

  @include ui-reduced-motion;

  &--open {
    grid-template-rows: 1fr;
    opacity: 1;
  }
}

.data-table-details__inner {
  min-height: 0;
  overflow: hidden;
}

.data-table-details__body {
  padding: 0.75rem 1rem 1rem;
}
</style>