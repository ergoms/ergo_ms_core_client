/**
 * Утилиты для работы с временем (локаль из vue-i18n).
 */

import { getCurrentBcp47, tGlobal } from '@/i18n/index.js'

/**
 * Возвращает название месяца по номеру (1–12) на текущем языке.
 * @param {number} month
 * @returns {string}
 */
export function getMonthNameByNumber(month) {
    if (!month || month < 1 || month > 12) {
        return tGlobal('time.months.all')
    }
    return tGlobal(`time.months.${month}`)
}

/**
 * Парсит дату и возвращает валидный объект Date или null
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {Date|null} Валидный объект Date или null
 */
function parseDate(date) {
    if (!date) return null
    const d = new Date(date)
    return isNaN(d.getTime()) ? null : d
}

function resolveNow(nowInput) {
    if (nowInput == null) {
        return new Date()
    }
    if (typeof nowInput === 'number' && Number.isFinite(nowInput)) {
        return new Date(nowInput)
    }
    return parseDate(nowInput) || new Date()
}

/**
 * Форматирует дату в относительное время
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Относительное время
 */
export function getRelativeTime(date, nowInput) {
    const targetDate = parseDate(date)
    if (!targetDate) return ''

    const now = resolveNow(nowInput)
    const diffInSeconds = Math.floor((now - targetDate) / 1000)

    if (diffInSeconds < 0) return tGlobal('time.relative.future')
    if (diffInSeconds < 60) return tGlobal('time.relative.justNow')

    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) {
        return tGlobal('time.relative.minutesAgo', diffInMinutes)
    }

    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
        return tGlobal('time.relative.hoursAgo', diffInHours)
    }

    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) {
        return tGlobal('time.relative.daysAgo', diffInDays)
    }

    const diffInWeeks = Math.floor(diffInDays / 7)
    const diffInMonths = Math.floor(diffInDays / 30)

    if (diffInWeeks < 4 || diffInMonths === 0) {
        return tGlobal('time.relative.weeksAgo', diffInWeeks)
    }

    if (diffInMonths < 12) {
        return tGlobal('time.relative.monthsAgo', diffInMonths)
    }

    const diffInYears = Math.floor(diffInDays / 365)
    return tGlobal('time.relative.yearsAgo', diffInYears)
}

/**
 * Компактное время для списка чатов: сегодня — часы, вчера — слово, этот год — дата без года.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatChatListTime(date) {
    const targetDate = parseDate(date)
    if (!targetDate) return ''

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const startOfTarget = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
    )

    try {
        const locale = getCurrentBcp47()
        if (startOfTarget.getTime() === startOfToday.getTime()) {
            return formatTime(targetDate)
        }
        if (startOfTarget.getTime() === startOfYesterday.getTime()) {
            return tGlobal('time.chatList.yesterday')
        }
        if (targetDate.getFullYear() === now.getFullYear()) {
            return new Intl.DateTimeFormat(locale, {
                day: '2-digit',
                month: '2-digit',
            }).format(targetDate)
        }
        return new Intl.DateTimeFormat(locale, {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
        }).format(targetDate)
    } catch {
        return ''
    }
}

/**
 * Форматирует время: «09:15».
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Время или пустая строка при ошибке
 */
export function formatTime(date) {
    const targetDate = parseDate(date)
    if (!targetDate) return ''

    try {
        return new Intl.DateTimeFormat(getCurrentBcp47(), {
            hour: '2-digit',
            minute: '2-digit',
        }).format(targetDate)
    } catch {
        return ''
    }
}

/**
 * Форматирует дату с временем в формат "dd.mm.yyyy, hh:mm"
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Отформатированная дата с временем или "—" при ошибке
 */
export function formatDateTime(date) {
    if (!date) return '—'
    const targetDate = parseDate(date)
    if (!targetDate) return '—'

    try {
        return new Intl.DateTimeFormat(getCurrentBcp47(), {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(targetDate)
    } catch {
        return '—'
    }
}

/**
 * Форматирует дату с временем: «20 августа 2026, 09:15»
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Отформатированная дата с месяцем словами и временем или «—» при ошибке
 */
export function formatDateTimeLong(date) {
    if (!date) return '—'
    const targetDate = parseDate(date)
    if (!targetDate) return '—'

    try {
        const datePart = formatDate(date)
        if (!datePart) return '—'
        const time = formatTime(targetDate)
        if (!time) return '—'
        return `${datePart}, ${time}`
    } catch {
        return '—'
    }
}

/**
 * Форматирует дату: «03 августа 2026 (понедельник), 15:35»
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Отформатированная дата со днём недели и временем
 */
export function formatDateWeekdayTime(date) {
    const targetDate = parseDate(date)
    if (!targetDate) return ''

    try {
        const locale = getCurrentBcp47()
        const datePart = formatDate(date)
        if (!datePart) return ''
        const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' })
            .format(targetDate)
            .toLowerCase()
        const time = formatTime(targetDate)
        if (!time) return ''
        return `${datePart} (${weekday}), ${time}`
    } catch {
        return ''
    }
}

/**
 * Форматирует дату в полный формат с относительным временем
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Полный формат даты с относительным временем
 */
export function getFormattedDateWithRelative(date) {
    const targetDate = parseDate(date)
    if (!targetDate) return ''

    const relativeTime = getRelativeTime(date)
    const fullDate = formatDateTime(date)

    return `${relativeTime} (${fullDate})`
}

/**
 * Форматирует дату в полный формат с днём недели и секундами
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Полный формат даты с днём недели, датой, временем и секундами
 */
export function getFullDateTime(date) {
    const targetDate = parseDate(date)
    if (!targetDate) return ''

    return new Intl.DateTimeFormat(getCurrentBcp47(), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'long',
    }).format(targetDate)
}

/**
 * Форматирует дату в формат "dd месяц yyyy"
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Отформатированная дата или исходная строка при ошибке
 */
export function formatDate(date) {
    if (!date) return ''
    const d = parseDate(date)
    if (!d) return String(date)

    const dd = String(d.getDate()).padStart(2, '0')
    const monthName = tGlobal(`time.monthsGenitive.${d.getMonth() + 1}`)
    const yyyy = d.getFullYear()
    return `${dd} ${monthName} ${yyyy}`
}

/**
 * Форматирует дату в короткий формат "dd.mm.yyyy"
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Отформатированная дата в формате dd.mm.yyyy
 */
export function formatDateShort(date) {
    const d = parseDate(date)
    if (!d) return ''

    return d.toLocaleDateString(getCurrentBcp47(), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
}

/**
 * Форматирует дату в формат YYYY-MM-DD для API (локальный часовой пояс)
 * @param {string|Date} date - Дата в ISO формате или объект Date
 * @returns {string} Отформатированная дата в формате YYYY-MM-DD
 */
export function formatDateLocal(date) {
    const d = parseDate(date)
    if (!d) return ''
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * Вспомогательная функция для форматирования диапазона дат
 * @param {string|Date} startDate - Дата начала
 * @param {string|Date} endDate - Дата окончания
 * @param {Function} formatter - Функция форматирования одной даты
 * @returns {string} Отформатированный диапазон дат
 */
function formatDateRangeHelper(startDate, endDate, formatter) {
    if (!startDate || !endDate) return ''
    const start = parseDate(startDate)
    const end = parseDate(endDate)
    if (!start || !end) return ''

    return `${formatter(startDate)} — ${formatter(endDate)}`
}

/**
 * Форматирует диапазон дат в формат "дд месяц год — дд месяц год"
 */
export function formatDateRange(startDate, endDate) {
    return formatDateRangeHelper(startDate, endDate, formatDate)
}

/**
 * Форматирует диапазон дат в короткий формат "dd.mm.yyyy — dd.mm.yyyy"
 */
export function formatDateRangeShort(startDate, endDate) {
    return formatDateRangeHelper(startDate, endDate, formatDateShort)
}

/**
 * Склоняет длительность в днях: «21 день», «22 дня», «25 дней».
 * @param {number} days
 * @returns {string}
 */
export function formatDurationDays(days) {
    const n = Math.abs(Math.trunc(Number(days)))
    if (!Number.isFinite(n)) return ''
    return tGlobal('time.duration.days', n)
}

/**
 * Форматирует диапазон дат в формат месяца/месяцев
 */
export function formatMonthRange(startDate, endDate) {
    if (!startDate || !endDate) return ''
    const start = parseDate(startDate)
    const end = parseDate(endDate)
    if (!start || !end) return ''

    const locale = getCurrentBcp47()
    const startMonth = start.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    const endMonth = end.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

    return startMonth === endMonth ? startMonth : `${startMonth} — ${endMonth}`
}

/**
 * Форматирует ключ периода YYYY-MM для отображения
 * @param {string} monthKey - Строка вида YYYY-MM
 * @returns {string} Подпись месяца и года или «—»
 */
export function formatYearMonthKeyRu(monthKey) {
    if (!monthKey || typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return '—'
    const [yearStr, monthStr] = monthKey.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return '—'

    return formatMonthYear(new Date(year, month - 1, 1)) || '—'
}

/**
 * Месяц и год: «Сентябрь 2026 г.» (локаль интерфейса).
 * @param {string|Date} date
 * @returns {string}
 */
export function formatMonthYear(date) {
    const d = parseDate(date)
    if (!d) return ''

    const label = d.toLocaleDateString(getCurrentBcp47(), { month: 'long', year: 'numeric' })
    if (!label) return ''
    return capitalizeFirst(label)
}

/**
 * Название дня недели для даты: «Понедельник» / «Пн».
 * @param {string|Date} date
 * @param {'long'|'short'|'narrow'} [style='long']
 * @returns {string}
 */
export function formatWeekday(date, style = 'long') {
    const d = parseDate(date)
    if (!d) return ''
    if (!['long', 'short', 'narrow'].includes(style)) {
        return ''
    }

    try {
        const raw = new Intl.DateTimeFormat(getCurrentBcp47(), { weekday: style }).format(d)
        return capitalizeFirst(raw)
    } catch {
        return ''
    }
}

/**
 * Дни недели с понедельника на языке интерфейса.
 * @param {'long'|'short'|'narrow'} [style='long']
 * @returns {string[]}
 */
export function getWeekdayNames(style = 'long') {
    if (!['long', 'short', 'narrow'].includes(style)) {
        return []
    }

    const names = []
    for (let i = 0; i < 7; i++) {
        names.push(formatWeekday(new Date(2024, 0, 1 + i), style))
    }
    return names
}

function capitalizeFirst(value) {
    if (!value) return ''
    return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Нормализует значение к строке YYYY-MM-DD (ISO date).
 */
export function toISODate(value) {
    if (!value) return ''
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
        const parsed = parseDate(value)
        return parsed ? formatDateLocal(parsed) : ''
    }
    if (value instanceof Date && !isNaN(value)) return formatDateLocal(value)
    if (typeof value === 'object' && value.day != null && value.month != null && value.year != null) {
        return convertDateObjectToString(value)
    }
    return ''
}

/**
 * Нормализует значение к локальной строке YYYY-MM-DDTHH:mm.
 */
export function toISODateTime(value) {
    if (!value) return ''
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return value.slice(0, 16)
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`
        const parsed = parseDate(value)
        return parsed ? formatDateTimeLocal(parsed) : ''
    }
    if (value instanceof Date && !isNaN(value)) return formatDateTimeLocal(value)
    return ''
}

function formatDateTimeLocal(date) {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${formatDateLocal(date)}T${hours}:${minutes}`
}

function convertDateObjectToString(dateObj) {
    if (!dateObj || typeof dateObj !== 'object') return ''
    const { day, month, year } = dateObj
    if (!day || !month || !year) return ''
    const date = new Date(year, month - 1, day)
    return formatDateLocal(date)
}

export function getDefaultStartDate() {
    const today = new Date()
    const nextMonth = today.getMonth() + 1
    const nextYear = nextMonth > 11 ? today.getFullYear() + 1 : today.getFullYear()
    const actualNextMonth = nextMonth > 11 ? 0 : nextMonth

    const firstDayOfNextMonth = new Date(nextYear, actualNextMonth, 1)
    return formatDateLocal(firstDayOfNextMonth)
}

export function getDefaultEndDate(startDate = null) {
    let targetYear

    if (startDate) {
        const startDateObj = parseDate(startDate)
        targetYear = startDateObj ? startDateObj.getFullYear() : new Date().getFullYear()
    } else {
        targetYear = new Date().getFullYear()
    }

    const endOfYear = new Date(targetYear, 11, 31)
    return formatDateLocal(endOfYear)
}

export function formatWeekdayDate(date = new Date()) {
    const targetDate = parseDate(date)
    if (!targetDate) return ''

    try {
        const locale = getCurrentBcp47()
        const weekdayRaw = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(targetDate)
        const weekday = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1)
        const dayMonth = new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'long',
        }).format(targetDate)
        const dayMonthNormalized = dayMonth.replace(
            /(\d+\s+)(.+)/,
            (_, prefix, month) => `${prefix}${month.toLowerCase()}`,
        )
        return `${weekday}, ${dayMonthNormalized}`
    } catch {
        return ''
    }
}

export function formatMonthYearGenitive(date) {
    const d = parseDate(date)
    if (!d) return ''

    const monthName = tGlobal(`time.monthsGenitive.${d.getMonth() + 1}`)
    return `${monthName} ${d.getFullYear()}`
}
