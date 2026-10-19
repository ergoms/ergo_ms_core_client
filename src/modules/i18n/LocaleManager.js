/**
 * Загрузка client/js/locales.js из модулей и merge в vue-i18n.
 * На старте и при смене языка merge только нужных locale (active + fallback).
 */
import { ModuleLoader } from '@/modules/core/ModuleLoader.js'
import {
  FALLBACK_LOCALE,
  getCurrentLocale,
  i18n,
  setLocaleMessagesReadyHandler,
  SUPPORTED_LOCALES,
} from '@/i18n/index.js'

let sharedManager = null
let modulesPacksPromise = null
/** @type {Map<string, object>|null} moduleKey → pack { ru, en, fr } */
let cachedModulePacks = null
/** locale → уже смержены в vue-i18n */
const mergedLocales = new Set()

export class LocaleManager extends ModuleLoader {
  /**
   * Один раз подхватывает packs модулей (без merge).
   * @returns {Promise<Map<string, object>>}
   */
  async loadModulePacks() {
    if (cachedModulePacks) {
      return cachedModulePacks
    }
    if (modulesPacksPromise) {
      return modulesPacksPromise
    }

    modulesPacksPromise = (async () => {
      const modules = await this.loadAllModulesAsync('js/locales.js')
      const packs = new Map()
      for (const [key, mod] of Object.entries(modules)) {
        const pack = mod.default || mod
        if (pack && typeof pack === 'object') {
          packs.set(key, pack)
        }
      }
      cachedModulePacks = packs
      return packs
    })()

    try {
      return await modulesPacksPromise
    } finally {
      modulesPacksPromise = null
    }
  }

  /**
   * Merge модульных сообщений для указанных locale (идемпотентно по locale).
   * @param {string[]} locales
   */
  async mergeLocales(locales) {
    const wanted = [...new Set(locales.map((l) => String(l || '').trim()).filter(Boolean))]
      .filter((l) => SUPPORTED_LOCALES.includes(l))
    const pending = wanted.filter((l) => !mergedLocales.has(l))
    if (pending.length === 0) {
      return true
    }

    const packs = await this.loadModulePacks()
    for (const locale of pending) {
      for (const pack of packs.values()) {
        let messages = pack[locale]
        if (typeof messages === 'function') {
          const loaded = await messages()
          messages = loaded?.default || loaded
        }
        if (messages && typeof messages === 'object') {
          i18n.global.mergeLocaleMessage(locale, messages)
        }
      }
      mergedLocales.add(locale)
    }
    return true
  }

  /**
   * Регистрирует pack локалей из манифеста (federated / standalone).
   * @param {object} pack — { ru: {...}, en: {...} }
   * @param {string} moduleKey
   */
  registerLocalesFromManifest(pack, moduleKey) {
    if (!pack || typeof pack !== 'object') {
      return
    }
    if (!cachedModulePacks) {
      cachedModulePacks = new Map()
    }
    const key = `manifest:${moduleKey}`
    cachedModulePacks.set(key, pack)
    // Сбросить «уже смержено», чтобы mergeLocales подхватил новый pack
    for (const locale of Object.keys(pack)) {
      mergedLocales.delete(locale)
    }
  }

  /**
   * Подхватывает packs и merge для active (+ fallback при необходимости).
   */
  async mergeModuleLocales() {
    const active = getCurrentLocale()
    const locales = [active]
    if (active !== FALLBACK_LOCALE) {
      locales.push(FALLBACK_LOCALE)
    }
    return this.mergeLocales(locales)
  }
}

export function getLocaleManager() {
  if (!sharedManager) {
    sharedManager = new LocaleManager()
    setLocaleMessagesReadyHandler(async (locale) => {
      const locales = [locale]
      if (locale !== FALLBACK_LOCALE) {
        locales.push(FALLBACK_LOCALE)
      }
      await sharedManager.mergeLocales(locales)
    })
  }
  return sharedManager
}

export async function preloadModuleLocales() {
  return getLocaleManager().mergeModuleLocales()
}
