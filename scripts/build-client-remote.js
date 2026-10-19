/**
 * Vite-сборка federated remote для modules/<name>/client.
 * Usage: node scripts/build-client-remote.js --module=<name>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { createRequire, isBuiltin } from 'node:module'
import { loadClientModularityConfig, clientProjectRoot } from './lib/parse-disabled-modules.js'
import {
  ensureFederationEntry,
  removeGeneratedFederationEntry,
} from './lib/generate-federation-entry.js'

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

const moduleClientRoot = path.resolve(projectRoot, 'modules', moduleName, 'client')
if (!fs.existsSync(moduleClientRoot)) {
  console.error(`[ERROR] Нет каталога клиента: ${moduleClientRoot}`)
  process.exit(1)
}
const entryFile = ensureFederationEntry(moduleName, moduleClientRoot)

const { federationShared } = loadClientModularityConfig()
const sharedList = [...new Set([
  ...(federationShared.length ? federationShared : ['vue', 'vue-router', 'pinia']),
  'vue-i18n',
])]

const HOST_SHARED = [
  'ergo-shared/module-bridge',
  'ergo-shared/i18n',
  'ergo-shared/i18n-use',
  'ergo-shared/api',
  'ergo-shared/endpoints',
  'ergo-shared/client-env',
  'ergo-shared/access-control',
  'ergo-shared/token-storage',
  'ergo-shared/lucide-icons',
]

const vue = requireFromNpm('@vitejs/plugin-vue')
const AutoImport = requireFromNpm('unplugin-auto-import/vite')
const { build, defineConfig, esmExternalRequirePlugin } = requireFromNpm('vite')

const outDir = path.resolve(projectRoot, 'virtual_env/client-remotes', moduleName)

function warnLucideVueNextImportPlugin() {
  const warned = new Set()
  return {
    name: 'warn-lucide-vue-next',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id !== 'lucide-vue-next' && !id.startsWith('lucide-vue-next/')) {
        return null
      }
      const key = importer || id
      if (!warned.has(key)) {
        warned.add(key)
        const where = importer
          ? path.relative(projectRoot, importer).replaceAll('\\', '/')
          : id
        this.warn(`Импорт lucide-vue-next устарел (${where}). Замените на @lucide/vue.`)
      }
      return null
    },
  }
}

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
        isBuiltin(id) ||
        id === 'vue' ||
        id === 'vue-router' ||
        id === 'pinia' ||
        id === 'vue-i18n' ||
        id.startsWith('ergo-shared/')
      ) {
        return null
      }
      const bare = id.startsWith('@')
        ? id.split('/').slice(0, 2).join('/')
        : id.split('/')[0]
      if (!bare || !fs.existsSync(path.join(npmModules, bare))) {
        return null
      }
      return this.resolve(id, npmImporter, { ...options, skipSelf: true })
    },
  }
}

const config = defineConfig({
  root: moduleClientRoot,
  plugins: [
    warnLucideVueNextImportPlugin(),
    resolveFromNpmRootPlugin(),
    vue(),
    // Оболочка подставляет logError сама. Сборка remote — отдельный Vite, без этого
    // вызов в .vue остаётся голым идентификатором и падает в браузере.
    AutoImport({
      imports: [
        {
          '@/js/utils/logError.js': ['logError', 'logWarn', 'sanitizeError'],
        },
      ],
      exclude: [
        /[\\/]src[\\/]js[\\/](theme-manager|color-theme|boot-locale-prefetch|bootstrap-early|bootFailure)\.js$/,
      ],
      dts: false,
      eslintrc: { enabled: false },
    }),
    // require('vue') из CJS/UMD → import; top-level external иначе оставляет require в браузере.
    esmExternalRequirePlugin({ external: [...sharedList] }),
  ],
  resolve: {
    // Точные find раньше `@`, иначе `@/i18n` превращается в абсолютный путь и external не срабатывает.
    alias: [
      { find: '@/integrations/ModuleBridge.js', replacement: 'ergo-shared/module-bridge' },
      { find: '@/integrations/ModuleBridge', replacement: 'ergo-shared/module-bridge' },
      { find: '@/i18n/useAppI18n.js', replacement: 'ergo-shared/i18n-use' },
      { find: '@/i18n/useAppI18n', replacement: 'ergo-shared/i18n-use' },
      { find: '@/i18n/index.js', replacement: 'ergo-shared/i18n' },
      { find: '@/i18n/index', replacement: 'ergo-shared/i18n' },
      { find: '@/js/api/manager.js', replacement: 'ergo-shared/api' },
      { find: '@/js/api/manager', replacement: 'ergo-shared/api' },
      { find: '@/js/api/endpoints.js', replacement: 'ergo-shared/endpoints' },
      { find: '@/js/api/endpoints', replacement: 'ergo-shared/endpoints' },
      { find: '@/js/clientEnv.js', replacement: 'ergo-shared/client-env' },
      { find: '@/js/clientEnv', replacement: 'ergo-shared/client-env' },
      { find: '@/core/cms/adp/js/accessControl.js', replacement: 'ergo-shared/access-control' },
      { find: '@/core/cms/adp/js/accessControl', replacement: 'ergo-shared/access-control' },
      { find: '@/core/cms/js/tokenStorage.js', replacement: 'ergo-shared/token-storage' },
      { find: '@/core/cms/js/tokenStorage', replacement: 'ergo-shared/token-storage' },
      { find: '@/js/lucideIconLoader.js', replacement: 'ergo-shared/lucide-icons' },
      { find: '@/js/lucideIconLoader', replacement: 'ergo-shared/lucide-icons' },
      {
        find: '@/modules/core/sharedGlobs.generated.js',
        replacement: path.resolve(__dirname, 'lib/empty-module.js'),
      },
      {
        find: '@/modules/core/ModuleLoader.js',
        replacement: path.resolve(__dirname, 'lib/empty-module.js'),
      },
      {
        find: `@/modules/${moduleName}`,
        replacement: path.resolve(projectRoot, 'modules', moduleName),
      },
      { find: '@modules', replacement: path.resolve(projectRoot, 'modules') },
      { find: '@', replacement: path.resolve(clientRoot, 'src') },
      {
        find: 'vue-toastification',
        replacement: path.resolve(clientRoot, 'src/js/utils/vueToastificationCompat.js'),
      },
      // lucide-vue-next больше не ставится. Предупреждение — warnLucideVueNextImportPlugin.
      { find: 'lucide-vue-next', replacement: path.join(npmModules, '@lucide/vue') },
      {
        find: /^vue-slicksort$/,
        replacement: path.join(npmModules, 'vue-slicksort/dist/vue-slicksort.esm.js'),
      },
    ],
    dedupe: sharedList,
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
  build: {
    outDir,
    emptyOutDir: true,
    lib: {
      entry: entryFile,
      name: `ErgoRemote_${moduleName}`,
      formats: ['es'],
      fileName: () => 'remoteEntry.js',
    },
    rolldownOptions: {
      // sharedList — у esmExternalRequirePlugin; HOST_SHARED остаётся top-level.
      external: [...HOST_SHARED],
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'chunks/[name]-[hash].js',
        paths: {
          vue: 'vue',
          'vue-router': 'vue-router',
          pinia: 'pinia',
          'vue-i18n': 'vue-i18n',
          'ergo-shared/module-bridge': 'ergo-shared/module-bridge',
          'ergo-shared/i18n': 'ergo-shared/i18n',
          'ergo-shared/i18n-use': 'ergo-shared/i18n-use',
          'ergo-shared/api': 'ergo-shared/api',
          'ergo-shared/endpoints': 'ergo-shared/endpoints',
          'ergo-shared/client-env': 'ergo-shared/client-env',
          'ergo-shared/access-control': 'ergo-shared/access-control',
          'ergo-shared/token-storage': 'ergo-shared/token-storage',
          'ergo-shared/lucide-icons': 'ergo-shared/lucide-icons',
        },
      },
    },
    target: 'esnext',
    minify: true,
    cssCodeSplit: false,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})

function writeRemoteStylesIndex(dir) {
  const files = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (entry.name.endsWith('.css')) {
        files.push(path.relative(dir, abs).replace(/\\/g, '/'))
      }
    }
  }
  walk(dir)
  fs.writeFileSync(path.join(dir, 'styles.json'), `${JSON.stringify(files)}\n`)
}

try {
  await build(config)
  writeRemoteStylesIndex(outDir)
} finally {
  if (path.basename(entryFile) === '.federation-entry.generated.js') {
    removeGeneratedFederationEntry(moduleClientRoot)
  }
}
console.log(`[OK] Federated remote собран: ${outDir}/remoteEntry.js`)
console.log(
  `[INFO] CLIENT_MODULE_REMOTES=${moduleName}=/remotes/${moduleName}/remoteEntry.js`,
)
