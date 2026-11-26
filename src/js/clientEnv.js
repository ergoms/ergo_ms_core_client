/**
 * Настройки клиента из `.env` (подставляются при сборке через core/client/vite.config.js).
 * В `.env` — `CLIENT_*`, общие `API_*`, `DISABLED_MODULES`, `REALTIME_*`.
 * В коде используйте только этот модуль, не `import.meta.env` напрямую.
 */

function readEnv(name, fallback = '') {
  const value = import.meta.env[name]
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  return String(value)
}

function readBool(name, fallback = false) {
  const raw = readEnv(name, '')
  if (raw === '') {
    return fallback
  }
  return raw.toLowerCase() === 'true'
}

function readInt(name, fallback) {
  const parsed = Number.parseInt(readEnv(name, ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const clientEnv = {
  apiHost: readEnv('CLIENT_API_HOST', 'localhost'),
  apiPort: readEnv('CLIENT_API_PORT', '8000'),
  useRelativeApi: readBool('CLIENT_USE_RELATIVE_API', false),
  /** Язык UI по умолчанию (из DEFAULT_LANGUAGE / CLIENT_DEFAULT_LANGUAGE в .env). */
  defaultLanguage: readEnv('CLIENT_DEFAULT_LANGUAGE', 'ru'),
  /** Пояс часов интерфейса (из TIME_ZONE в .env). */
  timeZone: readEnv('CLIENT_TIME_ZONE', 'UTC'),
  logLevel: readEnv('CLIENT_LOG_LEVEL', 'debug'),
  browserLogEnabled: readBool('CLIENT_BROWSER_LOG_ENABLED', true),
  /** Сессионный мониторинг клиента → БД (POST client-monitor). */
  monitoringEnabled: readBool('CLIENT_MONITORING_ENABLED', false),

  disabledModules: readEnv('CLIENT_DISABLED_MODULES', ''),
  /** bundled | federated | standalone */
  modularity: readEnv('CLIENT_MODULARITY', 'bundled').toLowerCase() || 'bundled',
  /** CSV allow-list модулей (пусто = все кроме disabled). */
  clientModules: readEnv('CLIENT_MODULES', ''),
  /** monolith | microservice — из MODULE_RUNTIME, для выбора upload-токена. */
  moduleRuntime: readEnv('CLIENT_MODULE_RUNTIME', 'monolith').toLowerCase() || 'monolith',
  /** CSV вынесенных API-модулей (MICROSERVICE_MODULES). */
  microserviceModules: readEnv('CLIENT_MICROSERVICE_MODULES', ''),
  /** federated: name=url,name2=url2 */
  moduleRemotes: readEnv('CLIENT_MODULE_REMOTES', ''),
  federationShared: readEnv('CLIENT_FEDERATION_SHARED', 'vue,vue-router,pinia'),
  passwordMinLength: readInt('CLIENT_PASSWORD_MIN_LENGTH', 8),
  passwordMaxLength: readInt('CLIENT_PASSWORD_MAX_LENGTH', 128),
  passwordRequireLowercase: readBool('CLIENT_PASSWORD_REQUIRE_LOWERCASE', true),
  passwordRequireUppercase: readBool('CLIENT_PASSWORD_REQUIRE_UPPERCASE', false),
  passwordRequireDigit: readBool('CLIENT_PASSWORD_REQUIRE_DIGIT', true),
  passwordRequireSpecial: readBool('CLIENT_PASSWORD_REQUIRE_SPECIAL', false),
  realtimeTransport: readEnv('CLIENT_REALTIME_TRANSPORT', 'websocket'),
  realtimePollPresenceMs: readInt('CLIENT_REALTIME_POLL_PRESENCE_INTERVAL', 45000),
  realtimePollNotificationsMs: readInt('CLIENT_REALTIME_POLL_NOTIFICATIONS_INTERVAL', 15000),
  realtimePollAdminPresenceMs: readInt('CLIENT_REALTIME_POLL_ADMIN_PRESENCE_INTERVAL', 10000),
  realtimePollMessengerMs: readInt('CLIENT_REALTIME_POLL_MESSENGER_INTERVAL', 5000),
  systemVersion: readEnv('CLIENT_SYSTEM_VERSION', '3.0.0'),
  /** Кнопка «Отменить» в toast (редактор тем и др.). */
  toastUndoEnabled: readBool('CLIENT_TOAST_UNDO_ENABLED', false),
  /** Глубина стека отмен для «Стандарт системы» (минимум 1). */
  toastUndoStackMax: Math.max(1, readInt('CLIENT_TOAST_UNDO_STACK_MAX', 3)),
  /** Глазик админа: просмотр как пользователь (только если ERGO_DEV_TOOLS=true). */
  devToolsEnabled: readBool('CLIENT_DEV_TOOLS_ENABLED', false),
  /** Vite: режим разработки (сборка dev). */
  isDev: import.meta.env.DEV === true,
  /** Vite: production-сборка. */
  isProd: import.meta.env.PROD === true,
}
