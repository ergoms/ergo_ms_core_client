import { tGlobal } from '@/i18n/index.js'
import { systemDayStamp, systemParts } from '@/js/utils/timeUtils.js'

/**
 * Группировка уведомлений по дате системы: Сегодня / Вчера / На этой неделе / Ранее.
 */

const DAY_MS = 86400000

/**
 * @param {Array<{ id: number|string, created_at?: string }>} items
 * @returns {Array<{ key: string, label: string, items: typeof items }>}
 */
export function groupNotificationsByDate(items) {
  if (!Array.isArray(items) || items.length === 0) return []

  const now = new Date()
  const todayStart = systemDayStamp(now)
  const yesterdayStart = todayStart - DAY_MS
  const weekStart = todayStart - systemParts(now).weekdayMon0 * DAY_MS

  const buckets = {
    today: { key: 'today', label: tGlobal('settings.inbox.today'), items: [] },
    yesterday: { key: 'yesterday', label: tGlobal('settings.inbox.yesterday'), items: [] },
    week: { key: 'week', label: tGlobal('settings.inbox.thisWeek'), items: [] },
    earlier: { key: 'earlier', label: tGlobal('settings.inbox.earlier'), items: [] },
  }

  for (const item of items) {
    const created = item?.created_at ? new Date(item.created_at) : null
    if (!created || Number.isNaN(created.getTime())) {
      buckets.earlier.items.push(item)
      continue
    }
    const createdDay = systemDayStamp(created)
    if (createdDay >= todayStart) {
      buckets.today.items.push(item)
    } else if (createdDay >= yesterdayStart) {
      buckets.yesterday.items.push(item)
    } else if (createdDay >= weekStart) {
      buckets.week.items.push(item)
    } else {
      buckets.earlier.items.push(item)
    }
  }

  return Object.values(buckets).filter((group) => group.items.length > 0)
}
