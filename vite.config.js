import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import path from 'path'
import fs from 'fs'
import crypto from 'node:crypto'
import { createRequire, isBuiltin } from 'node:module'
import { loadProjectEnv, mergeModuleEnv } from './scripts/lib/module-env.js'
import {
  loadClientModularityConfig,
  listEnabledModuleNames,
  parseModuleRemotes,
} from './scripts/lib/parse-disabled-modules.js'

const require = createRequire(import.meta.url)
const { applyNginxClientEnv, nginxEnabled } = require('../deployment/nginx/nginx-env.cjs')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const analyzeBuild = process.env.ANALYZE === 'true'
const projectRoot = path.resolve(__dirname, '../..')
const npmModules = path.resolve(projectRoot, 'virtual_env/npm/node_modules')
const npmRoot = path.resolve(projectRoot, 'virtual_env/npm')
// Пакеты только в virtual_env/npm — ESM import из core/client их не находит (Node walk-up).
const requireFromNpm = createRequire(path.join(npmModules, '_ergo_resolve.js'))
const vue = requireFromNpm('@vitejs/plugin-vue')
const AutoImport = requireFromNpm('unplugin-auto-import/vite')
const { defineConfig, esmExternalRequirePlugin } = requireFromNpm('vite')

/** Shared через import map: external только у плагина, не в top-level (иначе require(vue) остаётся). */
const FEDERATION_SHARED_EXTERNALS = ['vue', 'vue-router', 'pinia', 'vue-i18n']

/**
 * Query на /shared/*.js: имена без хеша, браузер иначе держит старый module-bridge
 * на другой module_runtime после client-build. index.html — no-store, import map меняется.
 */
const FEDERATION_SHARED_CACHE_BUST = crypto
  .createHash('sha256')
  .update(`${Date.now()}:${process.pid}:${Math.random()}`)
  .digest('hex')
  .slice(0, 12)

/** ESM-only пакеты из virtual_env/npm (createRequire их не грузит). */
async function importNpmEsm(pkgName) {
  const dir = path.join(npmModules, pkgName)
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const exp = pkg.exports?.['.']
  const rel = (exp && typeof exp === 'object' ? exp.import : exp) || pkg.module || pkg.main
  if (!rel || typeof rel !== 'string') {
    throw new Error(`Нет ESM-точки входа у ${pkgName}`)
  }
  return import(pathToFileURL(path.join(dir, rel)).href)
}

const { visualizer } = analyzeBuild
  ? await importNpmEsm('rollup-plugin-visualizer')
  : { visualizer: null }

/** Пакеты лежат в virtual_env/npm/node_modules (не предок core/client). */
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
        id.startsWith('@modules/') ||
        path.isAbsolute(id) ||
        id === 'vue' ||
        (useFederationShared && (id === 'vue-router' || id === 'pinia' || id === 'vue-i18n')) ||
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
      // Vite resolve из npm-root — корректные package exports (browser)
      const resolved = await this.resolve(id, npmImporter, { ...options, skipSelf: true })
      if (resolved) {
        return resolved
      }
      // CSS/@import и прочие пути, которые default resolve не поднял
      try {
        const abs = requireFromNpm.resolve(id)
        if (abs && abs !== id && !isBuiltin(abs) && fs.existsSync(abs)) {
          return abs
        }
      } catch {
        /* пакет есть, но субпуть не резолвится через require */
      }
      return null
    },
  }
}

const modulesRoot = path.resolve(__dirname, '../../modules')
const clientModularity = loadClientModularityConfig()
const disabledModules = clientModularity.disabled
const enabledModuleNames = new Set(
  listEnabledModuleNames(modulesRoot, disabledModules, clientModularity.allowlist),
)
const isFederatedHost = clientModularity.modularity === 'federated'
const hasModuleRemotes = parseModuleRemotes(clientModularity.remotesRaw).length > 0
const useFederationShared = isFederatedHost || hasModuleRemotes

const externalModuleAliases = fs.existsSync(modulesRoot)
  ? fs.readdirSync(modulesRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => enabledModuleNames.has(d.name))
      .map((d) => ({
        find: `@/modules/${d.name}`,
        replacement: path.join(modulesRoot, d.name),
      }))
  : []

const projectEnv = loadProjectEnv(path.resolve(__dirname, '../..'))
if (Object.keys(projectEnv).length === 0) {
  console.warn('Файл .env / env/*.env не найдены в корне проекта')
} else {
  for (const [key, value] of Object.entries(projectEnv)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

const env = mergeModuleEnv(modulesRoot, process.env)
const runtimeEnv = applyNginxClientEnv(env)

/** Runtime-статус для SPA; gitignore — создаём OFF по умолчанию, чтобы не было 404. */
function ensureMaintenanceJson() {
  const filePath = path.resolve(__dirname, 'public/maintenance.json')
  if (fs.existsSync(filePath)) {
    return
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ maintenance: false, pollIntervalMs: 3000 }, null, 2)}\n`,
    'utf8',
  )
}

ensureMaintenanceJson()

/**
 * optimizeDeps.include резолвит пакеты от корня Vite (core/client), а не через плагин.
 * Пакеты лежат только в virtual_env/npm — без alias Vite пишет Failed to resolve dependency.
 */
const OPTIMIZE_DEPS_INCLUDE = [
  'vue',
  'vue-router',
  'pinia',
  'axios',
]

function npmPackageAliases(names) {
  return names.map((name) => ({
    find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    replacement: path.join(npmModules, name),
  }))
}

/** Bind-адреса сервера — браузер по ним не ходит (ERR_ADDRESS_INVALID). */
const BIND_ALL_HOSTS = new Set(['0.0.0.0', '*', '::', '[::]'])

function resolvePollIntervalMs(serverKey, defaultMs) {
  const serverValue = runtimeEnv[serverKey]
  if (serverValue !== undefined && serverValue !== '') {
    const seconds = Number.parseInt(String(serverValue), 10)
    if (Number.isFinite(seconds) && seconds > 0) {
      return String(seconds * 1000)
    }
  }
  return String(defaultMs)
}

/**
 * Хост API для запросов из браузера.
 * API_HOST=0.0.0.0 в Docker — только bind; для SPA нужен localhost / CLIENT_API_HOST.
 */
function resolveBrowserApiHost(envValues) {
  const explicit = String(envValues.CLIENT_API_HOST || '').trim()
  if (explicit && !BIND_ALL_HOSTS.has(explicit)) {
    return explicit
  }
  const host = String(envValues.API_HOST || 'localhost').trim() || 'localhost'
  if (BIND_ALL_HOSTS.has(host)) {
    return 'localhost'
  }
  return host
}

/**
 * Upstream для Vite proxy /api и /ws.
 * В Docker при bind 0.0.0.0 — имя сервиса compose; на хосте — loopback.
 */
function resolveApiProxyHost(envValues) {
  const host = String(envValues.API_HOST || 'localhost').trim() || 'localhost'
  if (!BIND_ALL_HOSTS.has(host)) {
    return host
  }
  if (envValues.DOCKER_ENABLED === 'true' || envValues.ERGO_DOCKER_SERVICE_API) {
    return String(
      envValues.ERGO_DOCKER_SERVICE_API
      || envValues.DOCKER_SERVICE_API
      || 'api',
    ).trim() || 'api'
  }
  return '127.0.0.1'
}

function resolveDeployType(envValues) {
  const raw = String(
    envValues.CLIENT_DEPLOY_TYPE || envValues.ERGO_ENV || 'development',
  ).toLowerCase()
  if (raw === 'prod' || raw === 'production') {
    return 'production'
  }
  return 'development'
}

function resolveUseRelativeApi(envValues) {
  const explicit = envValues.CLIENT_USE_RELATIVE_API
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
    return String(explicit).trim()
  }
  // ERGO_PROXY=nginx / NGINX_ENABLED — тот же origin, что SPA
  return nginxEnabled(envValues) ? 'true' : 'false'
}

function buildClientEnvDefines(envValues) {
  const useRelativeApi = resolveUseRelativeApi(envValues)
  const logLevel = envValues.CLIENT_LOG_LEVEL
    || (resolveDeployType(envValues) === 'production' ? 'critical' : 'debug')

  const coreValues = {
    CLIENT_API_HOST: resolveBrowserApiHost(envValues),
    CLIENT_API_PORT: envValues.API_PORT || '8000',
    CLIENT_USE_RELATIVE_API: useRelativeApi,
    CLIENT_DEFAULT_LANGUAGE:
      envValues.CLIENT_DEFAULT_LANGUAGE || envValues.DEFAULT_LANGUAGE || 'ru',
    CLIENT_LOG_LEVEL: logLevel,
    CLIENT_BROWSER_LOG_ENABLED: envValues.CLIENT_BROWSER_LOG_ENABLED ?? 'true',
    CLIENT_MONITORING_ENABLED: envValues.CLIENT_MONITORING_ENABLED ?? 'false',

    CLIENT_DISABLED_MODULES: envValues.DISABLED_MODULES || '',
    CLIENT_MODULARITY: (envValues.CLIENT_MODULARITY || 'bundled').toLowerCase(),
    CLIENT_MODULES: envValues.CLIENT_MODULES || '',
    CLIENT_MODULE_RUNTIME: (envValues.MODULE_RUNTIME || 'monolith').toLowerCase(),
    CLIENT_MICROSERVICE_MODULES: envValues.MICROSERVICE_MODULES || '',
    CLIENT_MODULE_REMOTES: envValues.CLIENT_MODULE_REMOTES || '',
    CLIENT_FEDERATION_SHARED: envValues.CLIENT_FEDERATION_SHARED || 'vue,vue-router,pinia',
    CLIENT_PASSWORD_MIN_LENGTH: envValues.API_PASSWORD_MIN_LENGTH || '8',
    CLIENT_PASSWORD_MAX_LENGTH: envValues.API_PASSWORD_MAX_LENGTH || '128',
    CLIENT_PASSWORD_REQUIRE_LOWERCASE: envValues.API_PASSWORD_REQUIRE_LOWERCASE ?? 'true',
    CLIENT_PASSWORD_REQUIRE_UPPERCASE: envValues.API_PASSWORD_REQUIRE_UPPERCASE ?? 'false',
    CLIENT_PASSWORD_REQUIRE_DIGIT: envValues.API_PASSWORD_REQUIRE_DIGIT ?? 'true',
    CLIENT_PASSWORD_REQUIRE_SPECIAL: envValues.API_PASSWORD_REQUIRE_SPECIAL ?? 'false',
    CLIENT_REALTIME_TRANSPORT:
      envValues.REALTIME_TRANSPORT || envValues.ERGO_REALTIME || 'websocket',
    CLIENT_REALTIME_POLL_PRESENCE_INTERVAL: resolvePollIntervalMs('REALTIME_POLL_PRESENCE_INTERVAL', 45000),
    CLIENT_REALTIME_POLL_NOTIFICATIONS_INTERVAL: resolvePollIntervalMs('REALTIME_POLL_NOTIFICATIONS_INTERVAL', 15000),
    CLIENT_REALTIME_POLL_ADMIN_PRESENCE_INTERVAL: resolvePollIntervalMs('REALTIME_POLL_ADMIN_PRESENCE_INTERVAL', 10000),
    CLIENT_REALTIME_POLL_MESSENGER_INTERVAL: resolvePollIntervalMs('REALTIME_POLL_MESSENGER_INTERVAL', 5000),
    CLIENT_SYSTEM_VERSION: envValues.VERSION || '3.0.0',
    CLIENT_DEV_TOOLS_ENABLED: envValues.CLIENT_DEV_TOOLS_ENABLED || envValues.ERGO_DEV_TOOLS || 'false',
    // Байты; те же ключи, что media_api (env/media.env)
    CLIENT_MEDIA_UPLOAD_MAX_SIZE: envValues.MEDIA_UPLOAD_MAX_SIZE || '524288000',
    CLIENT_MEDIA_UPLOAD_HARD_MAX_SIZE:
      envValues.MEDIA_UPLOAD_HARD_MAX_SIZE || String(5 * 1024 * 1024 * 1024),
  }

  const values = { ...coreValues }
  for (const [key, value] of Object.entries(envValues)) {
    if (!key.startsWith('CLIENT_') || key in coreValues) {
      continue
    }
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      values[key] = value
    }
  }

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      `import.meta.env.${key}`,
      JSON.stringify(String(value ?? '')),
    ]),
  )
}

const CORE_MODULE_SYSTEM = '/core/client/src/modules/'

/** Внешние модули без static import из других modules/* — отдельный чанк безопасен. */
function loadStandaloneModuleChunks(envValues) {
  const raw = String(envValues.CLIENT_STANDALONE_MODULE_CHUNKS || '').trim()
  if (!raw) {
    return new Set()
  }
  return new Set(
    raw
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  )
}

const STANDALONE_MODULE_CHUNKS = loadStandaloneModuleChunks(runtimeEnv)

function resolveManualChunk(id) {
  const normalizedId = id.replace(/\\/g, '/')

  if (!normalizedId.includes('node_modules')) {
    // Модульные endpoints.js и ядровой proxy — один чанк, иначе в production
    // module_* получают вторую копию endpoints без initEndpoints() (см. datasetService.js).
    if (
      /\/js\/endpoints\.js$/.test(normalizedId)
      || /\/js\/api\/endpoints\.js$/.test(normalizedId)
    ) {
      return 'module_endpoints'
    }

    // ModuleLoader, RouteManager и т.п. — не module_api / module_core (ложное совпадение пути).
    // Таблица Login/NotFound лежит в src/config/routes.js, не в src/modules/.
    // Иначе при includeDependenciesRecursively: false её выкидывает из module_runtime.
    if (/\/src\/config\/routes\.js$/.test(normalizedId)) {
      return 'module_runtime'
    }

    // Singleton моста: integrations.js грузится отдельным чанком. Если ModuleBridge
    // вклеить туда, AppsMenu и хост виджетов смотрят уже другую копию реестра.
    if (/\/src\/integrations\/ModuleBridge\.js$/.test(normalizedId)) {
      return 'module_runtime'
    }

    // Store модулей с module-level ref: обработчик AppsMenu и плавающая панель
    // живут в разных чанках — без общего чанка клик открывает «чужую» копию.
    if (/\/modules\/[^/]+\/client\/.*Store\.js$/.test(normalizedId)) {
      return 'module_stores'
    }

    if (normalizedId.includes(CORE_MODULE_SYSTEM)) {
      return 'module_runtime'
    }

    const moduleMatch = normalizedId.match(/\/modules\/([^/]+)\//)
    if (moduleMatch && /\.(vue|[mc]?js|tsx?)$/.test(normalizedId)) {
      const moduleName = moduleMatch[1]
      if (STANDALONE_MODULE_CHUNKS.has(moduleName)) {
        return `module_${moduleName.replace(/-/g, '_')}`
      }
      // Остальные модули с cross-import — без принудительного чанка
      return undefined
    }
    return undefined
  }

  if (
    normalizedId.includes('echarts')
    || normalizedId.includes('vue-echarts')
    || normalizedId.includes('zrender')
  ) {
    return 'vendor_echarts'
  }
  if (
    normalizedId.includes('apexcharts')
    || normalizedId.includes('vue3-apexcharts')
    || normalizedId.includes('chart.js')
    || normalizedId.includes('vue-chartjs')
  ) {
    return 'vendor_charts'
  }
  if (normalizedId.includes('codemirror') || normalizedId.includes('vue-codemirror')) {
    return 'vendor_editors'
  }
  if (normalizedId.includes('exceljs') || normalizedId.includes('pdfjs-dist')) {
    return 'vendor_heavy'
  }
  if (normalizedId.includes('foliate-js')) {
    return 'vendor_epub'
  }
  if (
    normalizedId.includes('@vuepic/vue-datepicker')
    || normalizedId.includes('/date-fns/')
  ) {
    return 'vendor_datepicker'
  }
  // lucide: не форсируем один vendor_lucide — иначе barrel+все named icons
  // склеиваются в ~900KB; menu грузит icons/*.mjs точечно через lucideIconLoader.
  if (normalizedId.includes('axios')) {
    return 'vendor_axios'
  }
  if (
    normalizedId.includes('/vue-router/')
    || normalizedId.includes('/pinia/')
    || (normalizedId.includes('/vue/') && !normalizedId.includes('@lucide/vue') && !normalizedId.includes('/lucide/vue/'))
    || normalizedId.includes('/@vue/')
  ) {
    return 'vendor_vue'
  }
  if (normalizedId.includes('bootstrap') || normalizedId.includes('vue-sonner')) {
    return 'vendor_ui'
  }

  return undefined
}

/**
 * Blocking classic script до module-бандла.
 * Build: raw asset с content-hash в /assets/ (immutable).
 * Dev: middleware на /js/bootstrap-early.js из src (без HMR-обёртки).
 */
/** Идентификатор сборки: в бандле (define) и в dist/client-build.json для staleClientGuard. */
const ERGO_CLIENT_BUILD_ID = crypto
  .createHash('sha256')
  .update(`${process.pid}-${Date.now()}-${Math.random()}`)
  .digest('hex')
  .slice(0, 20)

function clientBuildIdPlugin(buildId) {
  return {
    name: 'ergo-client-build-id',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(
        path.join(outDir, 'client-build.json'),
        `${JSON.stringify({ buildId })}\n`,
        'utf8',
      )
    },
  }
}

/**
 * Vite 8 минифицирует CSS через lightningcss до того, как Vue заменит :deep/:slotted/:global.
 * @vitejs/plugin-vue глушит только префикс [lightningcss], а minify пишет [lightningcss minify].
 */
function suppressVueDeepLightningcssMinifyWarnings() {
  return {
    name: 'suppress-vue-deep-lightningcss-minify',
    configResolved(config) {
      const warn = config.logger.warn.bind(config.logger)
      config.logger.warn = (...args) => {
        const msg = String(args[0] ?? '')
        if (
          /\[lightningcss minify\] '(deep|slotted|global)' is not recognized as a valid pseudo-/.test(msg)
        ) {
          return
        }
        warn(...args)
      }
    },
  }
}

function bootstrapEarlyAssetPlugin() {
  const earlySrc = path.resolve(__dirname, 'src/js/bootstrap-early.js')
  const devUrl = '/js/bootstrap-early.js'
  // Комментарий вместо <script>: Vite не ругается на classic script без type="module"
  const placeholderRe = /<!--\s*ergo-bootstrap-early\s*-->/
  let isBuild = false

  return {
    name: 'bootstrap-early-asset',
    configResolved(config) {
      // emitFile только в build; в serve Vite его не поддерживает
      isBuild = config.command === 'build'
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== devUrl) {
          next()
          return
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(fs.readFileSync(earlySrc, 'utf8'))
      })
    },
    buildStart() {
      if (!isBuild) {
        return
      }
      this.emitFile({
        type: 'asset',
        name: 'bootstrap-early.js',
        source: fs.readFileSync(earlySrc, 'utf8'),
      })
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!placeholderRe.test(html)) {
          throw new Error('bootstrap-early: в index.html нет <!-- ergo-bootstrap-early -->')
        }
        let src = devUrl
        if (!ctx.server) {
          const asset = ctx.bundle
            ? Object.values(ctx.bundle).find(
              (chunk) => chunk.type === 'asset' && chunk.name === 'bootstrap-early.js',
            )
            : null
          if (!asset?.fileName) {
            throw new Error('bootstrap-early: hashed asset не найден в bundle')
          }
          src = asset.fileName.startsWith('/') ? asset.fileName : `/${asset.fileName}`
        }
        return html.replace(placeholderRe, `<script src="${src}"></script>`)
      },
    },
  }
}

const plugins = [
  resolveFromNpmRootPlugin(),
  bootstrapEarlyAssetPlugin(),
  clientBuildIdPlugin(ERGO_CLIENT_BUILD_ID),
  vue(),
  suppressVueDeepLightningcssMinifyWarnings(),
  AutoImport({
    imports: [
      {
        '@/js/utils/logError.js': ['logError', 'logWarn', 'sanitizeError'],
      },
    ],
    // Ранний boot (head): auto-import logError тянет api/monitor и убивает Slow 3G.
    exclude: [
      /[\\/]src[\\/]js[\\/](theme-manager|color-theme|boot-locale-prefetch|bootstrap-early|bootFailure)\.js$/,
    ],
    dts: 'src/auto-imports.d.ts',
    eslintrc: {
      enabled: true,
      filepath: './.eslintrc-auto-import.json',
    },
  }),
  {
    name: 'stub-missing-module-files',
    enforce: 'pre',
    resolveId(source) {
      const srcRoot = path.resolve(__dirname, 'src')

      if (source.startsWith('@/core/')) {
        const filePath = source.slice(2)
        const resolved = path.join(srcRoot, filePath)
        const exts = ['', '.js', '.vue', '.ts', '.json']
        const exists = exts.some((ext) => fs.existsSync(resolved + ext))
        if (!exists) {
          return '\0virtual:empty-vue-component'
        }
      }
    },
    load(id) {
      if (id === '\0virtual:empty-vue-component') {
        return `import { defineComponent } from 'vue'; export default defineComponent({ render() {} })`
      }
    },
  },
]

if (analyzeBuild) {
  plugins.push(
    visualizer({
      filename: path.resolve(__dirname, 'dist/stats.html'),
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  )
}

function federationSharedUrl(fileName, isServe) {
  if (isServe) {
    return `/src/shell/shared/${fileName}`
  }
  return `/shared/${fileName}?v=${FEDERATION_SHARED_CACHE_BUST}`
}

function federationImportMapBody(isServe) {
  return JSON.stringify({
    imports: {
      vue: federationSharedUrl('vue.js', isServe),
      'vue-router': federationSharedUrl('vue-router.js', isServe),
      pinia: federationSharedUrl('pinia.js', isServe),
      'vue-i18n': federationSharedUrl('vue-i18n.js', isServe),
      'ergo-shared/module-bridge': federationSharedUrl('module-bridge.js', isServe),
      'ergo-shared/i18n': federationSharedUrl('i18n.js', isServe),
      'ergo-shared/i18n-use': federationSharedUrl('i18n-use.js', isServe),
      'ergo-shared/api': federationSharedUrl('api.js', isServe),
      'ergo-shared/endpoints': federationSharedUrl('endpoints.js', isServe),
      'ergo-shared/client-env': federationSharedUrl('client-env.js', isServe),
      'ergo-shared/access-control': federationSharedUrl('access-control.js', isServe),
      'ergo-shared/token-storage': federationSharedUrl('token-storage.js', isServe),
      'ergo-shared/lucide-icons': federationSharedUrl('lucide-icons.js', isServe),
    },
  })
}

function writeFederationImportMapHash(body) {
  const hash = crypto.createHash('sha256').update(body, 'utf8').digest('base64')
  const outDir = path.resolve(__dirname, 'dist')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'federation-importmap.hashes'), `sha256-${hash}\n`)
}

const FEDERATION_BROWSER_RUNTIME = {
  vue: path.join(npmModules, 'vue/dist/vue.runtime.esm-browser.prod.js'),
  'vue-router': path.join(npmModules, 'vue-router/dist/vue-router.esm-browser.prod.js'),
  pinia: path.join(npmModules, 'pinia/dist/pinia.esm-browser.prod.js'),
  // Полная сборка: сообщения локалей — обычные строки, runtime-only не умеет их
  // разобрать и падает с «unhandled node type: 0» (NodeTypes.Resource).
  'vue-i18n': path.join(npmModules, 'vue-i18n/dist/vue-i18n.esm-browser.prod.js'),
}

function copyFederationBrowserRuntimes(outDir) {
  const sharedDir = path.join(outDir, 'shared')
  fs.mkdirSync(sharedDir, { recursive: true })
  for (const [name, src] of Object.entries(FEDERATION_BROWSER_RUNTIME)) {
    if (!fs.existsSync(src)) {
      throw new Error(`Нет браузерного ESM для import map: ${src}`)
    }
    fs.copyFileSync(src, path.join(sharedDir, `${name}.js`))
  }
}

/** Import map + shared Vue/router/pinia для remotes (не реэкспорт из vendor_vue). */
function federationSharedPlugin() {
  if (!useFederationShared) {
    return null
  }
  return {
    name: 'ergo-federation-shared',
    transformIndexHtml(html, ctx) {
      const isServe = Boolean(ctx?.server)
      const body = federationImportMapBody(isServe)
      if (!isServe) {
        writeFederationImportMapHash(body)
      }
      const tag = `<script type="importmap">${body}</script>`
      return html.replace('<head>', `<head>\n    ${tag}`)
    },
    closeBundle() {
      copyFederationBrowserRuntimes(path.resolve(__dirname, 'dist'))
    },
  }
}

const federationShared = federationSharedPlugin()
if (federationShared) {
  plugins.push(federationShared)
  // require('vue') из CJS/UMD (vue-slicksort и т.п.) → import; top-level external это ломает.
  plugins.push(esmExternalRequirePlugin({ external: [...FEDERATION_SHARED_EXTERNALS] }))
}

const PDFJS_WASM_PUBLIC_PATH = '/pdfjs/wasm'
const PDFJS_WASM_SRC = path.join(npmModules, 'pdfjs-dist', 'wasm')

function pdfjsWasmFile(urlPath) {
  if (!urlPath.startsWith(`${PDFJS_WASM_PUBLIC_PATH}/`)) {
    return null
  }
  let name = ''
  try {
    name = decodeURIComponent(urlPath.slice(PDFJS_WASM_PUBLIC_PATH.length + 1))
  } catch {
    return null
  }
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return null
  }
  const root = path.resolve(PDFJS_WASM_SRC)
  const file = path.resolve(root, name)
  if (path.dirname(file) !== root || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return null
  }
  return file
}

function copyPdfjsWasm(outDir) {
  if (!fs.existsSync(PDFJS_WASM_SRC)) {
    throw new Error(`Нет каталога wasm pdf.js: ${PDFJS_WASM_SRC}`)
  }
  const dest = path.join(outDir, 'pdfjs', 'wasm')
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(PDFJS_WASM_SRC)) {
    const src = path.join(PDFJS_WASM_SRC, name)
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(dest, name))
    }
  }
}

function pdfjsWasmPlugin() {
  return {
    name: 'pdfjs-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = pdfjsWasmFile(req.url?.split('?')[0] || '')
        if (!file) {
          next()
          return
        }
        const types = {
          '.wasm': 'application/wasm',
          '.js': 'text/javascript; charset=utf-8',
        }
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      copyPdfjsWasm(path.resolve(__dirname, 'dist'))
    },
  }
}

plugins.push(pdfjsWasmPlugin())

export default defineConfig(() => ({
  build: {
    // Vite 8 baseline widely available ≈ последние 2–3 года браузеров (без IE)
    target: 'baseline-widely-available',
    cssCodeSplit: true,
    sourcemap: false,
    rolldownOptions: {
      // Rolldown не поддерживает Rollup treeshake.preset — дефолт уже recommended.
      ...(useFederationShared
        ? {
            // strict здесь нельзя: Rolldown ругается на пару со
            // codeSplitting.includeDependenciesRecursively = false.
            // allow-extension оставляет экспорты entry (нужны для /shared/module-bridge.js).
            preserveEntrySignatures: 'allow-extension',
            // external для vue/router/pinia/i18n — у esmExternalRequirePlugin, не здесь.
            input: {
              main: path.resolve(__dirname, 'index.html'),
              'shared/module-bridge': path.resolve(__dirname, 'src/shell/shared/module-bridge.js'),
              'shared/i18n': path.resolve(__dirname, 'src/shell/shared/i18n.js'),
              'shared/i18n-use': path.resolve(__dirname, 'src/shell/shared/i18n-use.js'),
              'shared/api': path.resolve(__dirname, 'src/shell/shared/api.js'),
              'shared/endpoints': path.resolve(__dirname, 'src/shell/shared/endpoints.js'),
              'shared/client-env': path.resolve(__dirname, 'src/shell/shared/client-env.js'),
              'shared/access-control': path.resolve(__dirname, 'src/shell/shared/access-control.js'),
              'shared/token-storage': path.resolve(__dirname, 'src/shell/shared/token-storage.js'),
              'shared/lucide-icons': path.resolve(__dirname, 'src/shell/shared/lucide-icons.js'),
            },
          }
        : {}),
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name && String(chunk.name).startsWith('shared/')) {
            return '[name].js'
          }
          return 'assets/[name]-[hash].js'
        },
        // Как прежний manualChunks: только сам модуль, без рекурсивного захвата зависимостей.
        // У vendor_vue захват рекурсивный: иначе Rolldown выносит side-effect init в lib-*.js,
        // получается цикл с vendor_vue и в браузере «e is not a function».
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              test: (id) => resolveManualChunk(id) === 'vendor_vue',
              name: 'vendor_vue',
              includeDependenciesRecursively: true,
            },
            {
              test: (id) => {
                const name = resolveManualChunk(id)
                return Boolean(name) && name !== 'vendor_vue'
              },
              name: (id) => resolveManualChunk(id),
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  plugins,
  resolve: {
    alias: [
      ...externalModuleAliases,
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ...(useFederationShared
        ? []
        : [{
            find: /^vue$/,
            replacement: path.join(npmModules, 'vue/dist/vue.esm-bundler.js'),
          }]),
      // browser → UMD с require('vue'); при federation external это падает в браузере.
      {
        find: /^vue-slicksort$/,
        replacement: path.join(npmModules, 'vue-slicksort/dist/vue-slicksort.esm.js'),
      },
      // Официальное имя пакета — @lucide/vue; модули ещё импортируют lucide-vue-next.
      {
        find: /^lucide-vue-next$/,
        replacement: path.join(npmModules, '@lucide/vue'),
      },
      // Оболочка на vue-sonner; модули ещё импортируют vue-toastification.
      {
        find: /^vue-toastification$/,
        replacement: path.resolve(__dirname, 'src/js/utils/vueToastificationCompat.js'),
      },
      // vue / при federation ещё router и pinia — не alias, иначе external не сработает
      ...npmPackageAliases(
        OPTIMIZE_DEPS_INCLUDE.filter((name) => {
          if (name === 'vue') {
            return false
          }
          if (useFederationShared && (name === 'vue-router' || name === 'pinia')) {
            return false
          }
          return true
        }),
      ),
    ],
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    modules: [npmModules, 'node_modules'],
  },

  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/scss/_inject.scss"as *;\n`,
        loadPaths: [npmModules],
        // Dart Sass 1.80+: @import и глобальные built-in — до Sass 3.0; Bootstrap 5.3 ещё на @import.
        quietDeps: true,
        silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
      },
    },
    devSourcemap: false,
  },
  server: {
    port: parseInt(process.env.CLIENT_PORT, 10) || 8001,
    host: process.env.CLIENT_HOST || 'localhost',
    https: false,
    // Прокси для CLIENT_USE_RELATIVE_API=true без nginx (редко) и ручных запросов к /api на origin Vite.
    proxy: {
      '/api': {
        target: `http://${resolveApiProxyHost(runtimeEnv)}:${runtimeEnv.API_PORT || '8000'}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `http://${resolveApiProxyHost(runtimeEnv)}:${runtimeEnv.API_PORT || '8000'}`,
        ws: true,
        changeOrigin: true,
      },
    },
    fs: {
      allow: [
        '..',
        '../..',
        npmRoot,
        npmModules,
      ],
    },
  },
  define: {
    ...buildClientEnvDefines(runtimeEnv),
    'import.meta.env.ERGO_CLIENT_BUILD_ID': JSON.stringify(ERGO_CLIENT_BUILD_ID),
  },
  optimizeDeps: {
    exclude: ['@vite-ignore', 'vue3-apexcharts'],
    include: OPTIMIZE_DEPS_INCLUDE,
    rolldownOptions: {
      plugins: [
        {
          name: 'rolldown-stub-missing-core-imports',
          resolveId(id) {
            if (id === '\0virtual:empty-vue-component' || id.includes('virtual:empty-vue-component')) {
              return '\0virtual:empty-vue-component'
            }
            if (!id.startsWith('@/core/')) {
              return null
            }
            const srcRoot = path.resolve(__dirname, 'src')
            const filePath = id.slice(2)
            const resolved = path.join(srcRoot, filePath)
            const exts = ['', '.js', '.vue', '.ts', '.json']
            const exists = exts.some((ext) => fs.existsSync(resolved + ext))
            if (!exists) {
              return '\0virtual:empty-vue-component'
            }
            return null
          },
          load(id) {
            if (id !== '\0virtual:empty-vue-component') {
              return null
            }
            return 'import { defineComponent } from \'vue\'; export default defineComponent({ render() {} })'
          },
        },
      ],
    },
  },
}))
