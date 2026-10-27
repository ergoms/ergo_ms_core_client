import '@/js/utils/logger.js'

import 'medeo-font/sans.css'
import 'medeo-font/mono.css'
import '@/scss/styles.scss'

import { initUiPreferences } from '@/js/uiPreferences.js'
import { runClientBoot } from '@/shell/runClientBoot.js'

// initTheme — в color-theme.js (head), до main.
initUiPreferences()

/**
 * Без top-level await / без sync logError: иначе на Vite dev + Slow 3G
 * client_monitor/api занимают HTTP/1.1 слоты раньше App (см. localhost.har).
 *
 * 0) boot-locale-prefetch.js в head
 * 1) runClientBoot (locales → App → module locales → endpoints/router → mount)
 * 2) session / monitor / themes — idle
 */
runClientBoot({ enableIdlePostBoot: true }).catch((error) => {
  void import('@/js/bootFailure.js').then(({ showBootFailure }) => showBootFailure(error))
})
