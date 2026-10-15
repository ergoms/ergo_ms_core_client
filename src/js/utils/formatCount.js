/** Целые с разрядами: 3423550 → «3 423 550». Группировка не зависит от длины числа. */

const GROUPED_COUNT = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
  useGrouping: true,
})

export function formatCount(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return '0'
  }
  return GROUPED_COUNT.format(Math.trunc(number))
}
