<template>
  <ul class="legend">
    <li>
      <span class="swatch swatch--current" aria-hidden="true" />
      <span>{{ currentLabel }}</span>
    </li>
    <li>
      <span class="swatch swatch--other" aria-hidden="true" />
      <span>{{ otherLabel }}</span>
    </li>
  </ul>
</template>

<script setup>
defineProps({
  currentLabel: { type: String, default: '' },
  otherLabel: { type: String, default: '' },
})
</script>

<style scoped lang="scss">
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.25rem;
  margin: 0;
  padding: 0.45rem 0.85rem;
  list-style: none;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface);
  font-size: 0.85rem;
}

li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.swatch {
  flex: none;
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 0.2rem;
  border: 1px solid color-mix(in srgb, var(--ui-text, #222) 18%, transparent);
  background-color: #fff;
}

.swatch--current {
  background-image: linear-gradient(rgb(255 140 0 / 0.7), rgb(255 140 0 / 0.7));
}

.swatch--other {
  background-image: linear-gradient(rgb(255 214 0 / 0.45), rgb(255 214 0 / 0.45));
}
</style>
