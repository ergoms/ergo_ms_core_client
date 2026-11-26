/**
 * Сборка standalone SPA модуля из монорепо (CI-паритет).
 * Usage: node scripts/build-client-standalone.js --module=<name>
 *
 * Берёт шаблон core/client/standalone-template и манифест модуля,
 * собирает в virtual_env/client-standalone/<module>/.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { createRequire, isBuiltin } from 'node:module'
import { clientProjectRoot } from './lib/parse-disabled-modules.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientRoot = path.resolve(__dirname, '..')
const projectRoot = clientProjectRoot
const npmModules = path.resolve(projectRoot, 'virtual_env/npm/node_modules')
const npmRoot = path.resolve(projectRoot, 'virtual_env/npm')
const requireFromNpm = createRequire(path.join(npmModules, '_ergo_resolve.js'))

const moduleArg = process.argv.find((a) => a.startsWith('--module='))
const moduleName = moduleArg ? moduleArg.slice('--module='.length).trim() : ''
if (!moduleName) {
  console.error('[ERROR] Укажите --module=<name>')
  process.exit(1)
}

const federationEntry = path.resolve(projectRoot, 'modules', moduleName, 'client', 'federation-entry.js')
if (!fs.existsSync(federationEntry)) {
  console.error(`[ERROR] Нет federation-entry.js у модуля ${moduleName}`)
  process.exit(1)
}

const vue = requireFromNpm('@vitejs/plugin-vue')
const { build, defineConfig } = requireFromNpm('vite')
const { loadProjectEnv } = await import('./lib/module-env.js')
const requireLocal = createRequire(import.meta.url)
const { applyNginxClientEnv } = requireLocal(
  path.join(projectRoot, 'core/deployment/nginx/nginx-env.cjs'),
)

const env = applyNginxClientEnv({ ...loadProjectEnv(projectRoot), ...process.env })
const outDir = path.resolve(projectRoot, 'virtual_env/client-standalone', moduleName)
const templateRoot = path.resolve(clientRoot, 'standalone-template')

function resolveFromNpmRootPlugin() {
  const npmImporter = path.join(npmRoot, 'package.json')
  return {
    name: 'resolve-from-npm-root',
    enforce: 'pre',
    async resolveId(id, _importer, options) {
      if (
        !id ||
        id.startsWith('\0') ||
        id.startsWith('.') ||
        id.startsWith('/') ||
        id.startsWith('@/') ||
        path.isAbsolute(id) ||
        isBuiltin(id)
      ) {
        return null
      }
      const bare = id.startsWith('@')
        ? id.split('/').slice(0, 2).join('/')
        : id.split('/')[0]
      if (!bare || !fs.existsSync(path.join(npmModules, bare))) {
        return null
      }
      const resolved = await this.resolve(id, npmImporter, { ...options, skipSelf: true })
      if (resolved) {
        return resolved
      }
      try {
        const abs = requireFromNpm.resolve(id)
        if (abs && abs !== id && !isBuiltin(abs) && fs.existsSync(abs)) {
          return abs
        }
      } catch {
        /* ignore */
      }
      return null
    },
  }
}

const config = defineConfig({
  configFile: false,
  root: templateRoot,
  plugins: [resolveFromNpmRootPlugin(), vue()],
  resolve: {
    alias: {
      '@': path.resolve(clientRoot, 'src'),
      '@modules': path.resolve(projectRoot, 'modules'),
      '@ergo-ms/core-client/shell': path.resolve(clientRoot, 'src/shell/index.js'),
      '@ergo-ms/client-shell': path.resolve(clientRoot, 'src/shell/index.js'),
      '@standalone-module-manifest': federationEntry,
      vue: path.join(npmModules, 'vue/dist/vue.esm-bundler.js'),
    },
    dedupe: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
    modules: [npmModules, 'node_modules'],
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/scss/_inject.scss"as *;\n`,
        loadPaths: [npmModules],
        quietDeps: true,
        silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
      },
    },
  },
  define: Object.fromEntries(
    Object.entries({
      CLIENT_API_HOST: env.API_HOST || '127.0.0.1',
      CLIENT_API_PORT: env.API_PORT || '8000',
      CLIENT_USE_RELATIVE_API: env.CLIENT_USE_RELATIVE_API || 'false',
      CLIENT_MODULARITY: 'standalone',
      CLIENT_MODULES: moduleName,
      CLIENT_MODULE_REMOTES: '',
      CLIENT_DEFAULT_LANGUAGE: env.DEFAULT_LANGUAGE || 'ru',
      CLIENT_TIME_ZONE: env.TIME_ZONE || 'UTC',
      CLIENT_DISABLED_MODULES: env.DISABLED_MODULES || '',
      CLIENT_SYSTEM_VERSION: env.VERSION || '3.0.0',
    }).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(String(v))]),
  ),
  build: {
    outDir,
    emptyOutDir: true,
    target: 'esnext',
  },
})

await build(config)
console.log(`[OK] Standalone SPA собран: ${outDir}`)
