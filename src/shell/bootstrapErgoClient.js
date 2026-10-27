/**
 * Публичный API shell для standalone SPA-репозиториев модулей.
 *
 *   import { bootstrapErgoClient } from '@ergo-ms/client-shell'
 *   await bootstrapErgoClient({
 *     modules: [() => import('./module/manifest.js')],
 *     clientEnv: { }, // optional overrides
 *   })
 */

import '@/js/utils/logger.js'
import 'medeo-font/sans.css'
import 'medeo-font/mono.css'
import '@/scss/styles.scss'

import { initUiPreferences } from '@/js/uiPreferences.js'
import { normalizeClientModuleManifest } from '@/modules/core/clientModuleManifest.js'
import { runClientBoot } from '@/shell/runClientBoot.js'

/**
 * @typedef {object} BootstrapErgoClientOptions
 * @property {Array<(() => Promise<unknown>)|object>} [modules] — манифесты или loaders
 * @property {Record<string, string|boolean|number>} [clientEnv] — перекрытия (документация)
 * @property {HTMLElement|string} [mount] — селектор или элемент (#app)
 */

/**
 * @param {BootstrapErgoClientOptions} [options]
 * @returns {Promise<{ app: import('vue').App, router: import('vue-router').Router }>}
 */
export async function bootstrapErgoClient(options = {}) {
  initUiPreferences()

  const loaders = Array.isArray(options.modules) ? options.modules : []

  return runClientBoot({
    mount: options.mount || '#app',
    enableIdlePostBoot: true,
    beforeMount: async () => {
      const { moduleManager } = await import('@/modules/index.js')

      for (const item of loaders) {
        const raw = typeof item === 'function' ? await item() : item
        const payload = raw?.default && typeof raw.default === 'object' ? raw.default : raw
        const manifest = normalizeClientModuleManifest(payload)
        if (manifest) {
          await moduleManager.registerModule(manifest, `standalone:${manifest.moduleKey}`)
        }
      }
    },
  })
}

export { normalizeClientModuleManifest } from '@/modules/core/clientModuleManifest.js'
export { registerClientModule } from '@/modules/core/registerClientModule.js'
