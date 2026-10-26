<template>
  <section class="live-rate-chart">
    <h2 class="live-rate-chart__title">{{ title }}</h2>
    <TabBar
      v-model="rangeModel"
      :tabs="rangeTabs"
      :aria-label="title"
    />
    <div class="live-rate-chart__plot">
      <p v-if="empty" class="live-rate-chart__note live-rate-chart__note--empty">{{ emptyLabel }}</p>
      <VChart
        v-show="!empty"
        class="live-rate-chart__canvas"
        :option="chartOption"
        :update-options="chartUpdateOptions"
        autoresize
      />
      <ul v-show="!empty" class="live-rate-chart__legend">
        <li v-for="item in legendItems" :key="item.name">
          <button
            type="button"
            class="live-rate-chart__legend-item"
            :class="{ 'live-rate-chart__legend-item--off': hiddenNames.has(item.name) }"
            :aria-pressed="!hiddenNames.has(item.name)"
            @click="toggleSeries(item.name)"
          >
            <svg class="live-rate-chart__swatch" width="10" height="10" aria-hidden="true">
              <rect width="10" height="10" rx="2" :fill="item.color" />
            </svg>
            <span>{{ item.name }}</span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TabBar from '@/components/TabBar.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { THEME_CHANGE_EVENT } from '@/js/theme-manager.js'
import {
  buildMonitorChartOption,
  foldMonitorPoints,
  monitorPalette,
} from '@/js/sourceMonitor/liveRateChart.js'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps({
  points: { default: null },
  sourceId: { type: String, default: '' },
  modelValue: { type: String, default: '1h' },
  title: { type: String, default: '' },
  emptyHourLabel: { type: String, default: '' },
  emptyRangeLabel: { type: String, default: '' },
  cardsSeriesName: { type: String, default: '' },
  errorsSeriesName: { type: String, default: '' },
  rangeLabels: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

const { locale } = useAppI18n()
const ranges = ['1h', '24h', '7d']
const rangeTabs = computed(() => ranges.map((id) => ({
  id,
  name: props.rangeLabels[id] || id,
})))
const rangeModel = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
const chartUpdateOptions = {
  notMerge: false,
  lazyUpdate: true,
  replaceMerge: ['series', 'xAxis', 'yAxis'],
}
const language = computed(() => (typeof locale === 'string' ? locale : locale?.value) || 'ru')
const themeTick = ref(0)
const hiddenNames = ref(new Set())

const drawn = ref({ sourceId: '', range: '1h', points: [] })

watch(
  () => [props.sourceId, props.modelValue, props.points],
  ([sourceId, rangeKey, points]) => {
    if (points == null) {
      if (drawn.value.sourceId !== sourceId) {
        drawn.value = { sourceId, range: rangeKey, points: [] }
      }
      return
    }
    drawn.value = { sourceId, range: rangeKey, points }
  },
  { immediate: true },
)

const folded = computed(() => foldMonitorPoints(drawn.value.points, drawn.value.range))
const empty = computed(() => !folded.value.some((point) => Number(point?.cards) || Number(point?.errors)))
const emptyLabel = computed(() => (
  props.modelValue === '1h' ? props.emptyHourLabel : props.emptyRangeLabel
))

const chartOption = computed(() => {
  void themeTick.value
  const palette = monitorPalette()
  const option = buildMonitorChartOption({
    points: folded.value,
    range: drawn.value.range,
    cardsName: props.cardsSeriesName,
    errorsName: props.errorsSeriesName,
    palette,
    language: language.value,
  })
  const selected = {}
  for (const name of option.legend.data) {
    selected[name] = !hiddenNames.value.has(name)
  }
  return { ...option, legend: { ...option.legend, selected } }
})

const legendItems = computed(() => {
  const names = chartOption.value.legend?.data || []
  const colors = chartOption.value.color || []
  return names.map((name, index) => ({ name, color: colors[index] }))
})
const legendKey = computed(() => legendItems.value.map((item) => item.name).join('\0'))

watch(legendKey, () => {
  hiddenNames.value = new Set()
})

function toggleSeries(name) {
  const next = new Set(hiddenNames.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  hiddenNames.value = next
}

const onThemeChange = () => { themeTick.value += 1 }
let observer = null

onMounted(() => {
  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange)
  if (typeof MutationObserver === 'undefined') return
  observer = new MutationObserver(onThemeChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] })
})

onBeforeUnmount(() => {
  window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
  observer?.disconnect()
})
</script>

<style scoped>
.live-rate-chart {
  min-width: 0;
}

.live-rate-chart__title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
}

.live-rate-chart__note {
  margin: 0.75rem 0 0;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
}

.live-rate-chart__plot {
  margin-top: 0.5rem;
  min-height: 320px;
}

.live-rate-chart__note--empty {
  display: flex;
  align-items: center;
  min-height: 320px;
  margin: 0;
}

.live-rate-chart__canvas {
  display: block;
  width: 100%;
  height: 320px;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.live-rate-chart__canvas :deep(> div) {
  width: 100% !important;
  height: 100% !important;
}

.live-rate-chart__canvas :deep(canvas) {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
  width: 100% !important;
  height: 100% !important;
}

.live-rate-chart__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--ui-text);
}

.live-rate-chart__legend-item {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}

.live-rate-chart__legend-item:hover span,
.live-rate-chart__legend-item:focus-visible span {
  text-decoration: underline;
}

.live-rate-chart__legend-item--off {
  opacity: 0.45;
}

.live-rate-chart__legend-item--off span {
  text-decoration: line-through;
}

.live-rate-chart__swatch {
  flex: 0 0 auto;
  display: block;
  margin-top: 0.28em;
}
</style>
