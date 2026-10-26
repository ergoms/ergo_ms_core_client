import { formatDateTime, formatTime } from '@/js/utils/timeUtils.js'
import { formatCount } from '@/js/utils/formatCount.js'

function readCssColor(name, fallback) {
  if (typeof window === 'undefined' || !window.getComputedStyle) return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function monitorPalette() {
  return {
    info: readCssColor('--ui-info', '#0aa2c0'),
    danger: readCssColor('--bs-danger', '#dc3545'),
    label: readCssColor('--ui-text', '#14151a'),
    muted: readCssColor('--ui-text-muted', '#5b616e'),
    border: readCssColor('--bs-border-color', '#e9ecef'),
    surface: readCssColor('--ui-surface', '#ffffff'),
    text: readCssColor('--ui-text', '#343a40'),
  }
}

export function foldMonitorPoints(points, range) {
  const rows = Array.isArray(points) ? points : []
  if (range === '1h') return rows
  const buckets = new Map()
  for (const point of rows) {
    const date = new Date(point?.t)
    if (Number.isNaN(date.getTime())) continue
    date.setMinutes(0, 0, 0)
    const key = date.toISOString()
    const slot = buckets.get(key) || { t: key, cards: 0, errors: 0 }
    slot.cards += Number(point.cards) || 0
    slot.errors += Number(point.errors) || 0
    buckets.set(key, slot)
  }
  return [...buckets.values()]
}

function axisText(iso, range) {
  if (range === '7d') {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' }).format(date)
  }
  if (range === '24h') {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    const day = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' }).format(date)
    return `${day} ${formatTime(date)}`
  }
  return formatTime(iso)
}

function escapeRich(text) {
  return String(text ?? '')
    .replace(/\{/g, '{{')
    .replace(/\}/g, '}}')
    .replace(/\|/g, '¦')
}

function tooltipBox(palette, colors) {
  const markers = Object.fromEntries(colors.map((color, idx) => [`m${idx}`, {
    backgroundColor: color,
    width: 8,
    height: 8,
    borderRadius: 2,
  }]))
  return {
    trigger: 'axis',
    renderMode: 'richText',
    confine: true,
    padding: [10, 14],
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    textStyle: {
      color: palette.text,
      fontSize: 12,
      width: 280,
      rich: {
        ...markers,
        t: { fontWeight: 600, fontSize: 13, padding: [0, 0, 2, 0] },
        s: { padding: [3, 0] },
      },
    },
  }
}

export function buildMonitorChartOption({
  points, range, cardsName, errorsName, palette, language,
}) {
  const labels = points.map((point) => axisText(point.t, range))
  const titles = points.map((point) => formatDateTime(point.t))
  const cards = points.map((point) => Number(point.cards) || 0)
  const errors = points.map((point) => Number(point.errors) || 0)
  const showErrors = errors.some((value) => value > 0)
  const names = showErrors ? [cardsName, errorsName] : [cardsName]
  const colors = showErrors ? [palette.info, palette.danger] : [palette.info]
  const step = labels.length > 120 ? 23 : labels.length > 36 ? 5 : labels.length > 16 ? 2 : 0
  const series = [{
    name: cardsName,
    type: 'line',
    smooth: false,
    showSymbol: false,
    symbol: 'none',
    connectNulls: false,
    lineStyle: { width: 2.5, color: palette.info },
    itemStyle: { color: palette.info },
    areaStyle: { color: palette.info, opacity: 0.14 },
    data: cards,
  }]
  if (showErrors) {
    series.push({
      name: errorsName,
      type: 'line',
      smooth: false,
      showSymbol: false,
      symbol: 'none',
      lineStyle: { width: 2.5, color: palette.danger },
      itemStyle: { color: palette.danger },
      data: errors,
    })
  }
  return {
    color: colors,
    animation: false,
    animationDurationUpdate: 0,
    textStyle: { fontFamily: 'inherit', color: palette.label },
    tooltip: {
      ...tooltipBox(palette, colors),
      formatter: (params) => {
        const rows = Array.isArray(params) ? params : [params]
        const title = titles[rows[0]?.dataIndex] || ''
        const lines = [`{t|${escapeRich(title)}}`]
        for (const row of rows) {
          const value = formatCount(row.value, language)
          lines.push(`{m${row.seriesIndex}|} {s|${escapeRich(`${row.seriesName} — ${value}`)}}`)
        }
        return lines.join('\n')
      },
    },
    legend: { show: false, selectedMode: true, data: names },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: palette.muted,
        fontSize: 12,
        hideOverlap: true,
        margin: 10,
        interval: step,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      minInterval: 1,
      axisLabel: {
        color: palette.label,
        fontSize: 12,
        formatter: (value) => formatCount(value, language),
      },
      splitLine: { lineStyle: { color: palette.border, type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series,
  }
}
