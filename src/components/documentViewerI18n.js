import { i18n } from '@/i18n/index.js'
import enComponents from '@/i18n/locales/en/components.js'
import frComponents from '@/i18n/locales/fr/components.js'
import ruComponents from '@/i18n/locales/ru/components.js'

let merged = false

/**
 * Federated remote тянет просмотр, а каталог ядра живёт в оболочке.
 * Если оболочка старше компонента, ключи поиска отсутствуют — подмешиваем их.
 */
export function ensureDocumentViewerI18n() {
  if (merged) {
    return
  }
  merged = true
  if (i18n.global.te('components.documentViewer.searchPlaceholder')) {
    return
  }
  const packs = { ru: ruComponents, en: enComponents, fr: frComponents }
  for (const [locale, messages] of Object.entries(packs)) {
    if (messages.documentViewer) {
      i18n.global.mergeLocaleMessage(locale, {
        components: { documentViewer: messages.documentViewer },
      })
    }
  }
}
