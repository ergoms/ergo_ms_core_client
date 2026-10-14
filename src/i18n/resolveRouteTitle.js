import { tGlobal, teGlobal } from '@/i18n/index.js'

/**
 * Резолвит заголовок маршрута: meta.titleKey → i18n, иначе meta.title / fallback.
 * Имя маршрута из кода не подставляется: меню тогда показывает идентификатор
 * вместо подписи из базы.
 * @param {{ meta?: { titleKey?: string, title?: string }, name?: string }|null|undefined} route
 * @param {string} [fallback='']
 * @returns {string}
 */
export function resolveRouteTitle(route, fallback = '') {
  const titleKey = route?.meta?.titleKey
  if (typeof titleKey === 'string' && titleKey && teGlobal(titleKey)) {
    return tGlobal(titleKey)
  }
  const title = route?.meta?.title
  if (typeof title === 'string' && title) {
    if (teGlobal(title)) {
      return tGlobal(title)
    }
    return title
  }
  return fallback
}
