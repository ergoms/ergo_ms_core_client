/**
 * Динамические стили без атрибута style="" — совместимо с CSP style-src 'self'.
 * Пишет правила в один adopted stylesheet (см. cspStyleSheet.js).
 */

import { setCspStyleSheet } from './cspStyleSheet.js'

const SHEET_ID = 'v-csp-style'
const ATTR = 'data-csp-style'

let seq = 0
const rules = new Map()
let flushQueued = false

function kebab(prop) {
  if (prop.startsWith('--')) {
    return prop
  }
  return prop.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)
}

export function declsFromStyleValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ''
  }
  return Object.entries(value)
    .filter(([, item]) => item != null && item !== '')
    .map(([key, item]) => `${kebab(key)}:${item}`)
    .join(';')
}

function flush() {
  const css = [...rules.entries()]
    .filter(([, decls]) => decls)
    .map(([id, decls]) => `[${ATTR}="${id}"]{${decls}}`)
    .join('')
  setCspStyleSheet(SHEET_ID, css)
}

function scheduleFlush() {
  if (flushQueued) {
    return
  }
  flushQueued = true
  // microtask, не rAF: координаты overlay (SelectBox и т.п.) должны
  // попасть в stylesheet до paint, иначе fixed без top/left рисуется
  // в «статической» позиции внизу документа на один кадр или дольше.
  const run = () => {
    flushQueued = false
    flush()
  }
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run)
    return
  }
  Promise.resolve().then(run)
}

function ensureId(el) {
  if (!el.getAttribute(ATTR)) {
    seq += 1
    el.setAttribute(ATTR, `s${seq}`)
  }
  return el.getAttribute(ATTR)
}

export function applyCspStyle(el, value) {
  const decls = declsFromStyleValue(value)
  if (!decls) {
    const id = el.getAttribute(ATTR)
    if (!id) {
      return
    }
    rules.delete(id)
    el.removeAttribute(ATTR)
    scheduleFlush()
    return
  }
  const id = ensureId(el)
  if (rules.get(id) === decls) {
    return
  }
  rules.set(id, decls)
  // Координаты overlay нужны до paint — flush сразу, без ожидания кадра.
  if (/\b(top|left|right|bottom|--[a-z0-9-]*(?:top|left|right|bottom))\s*:/i.test(decls)) {
    flushQueued = false
    flush()
    return
  }
  scheduleFlush()
}

export function releaseCspStyle(el) {
  const id = el.getAttribute(ATTR)
  if (!id) {
    return
  }
  rules.delete(id)
  el.removeAttribute(ATTR)
  scheduleFlush()
}

export const vCspStyle = {
  mounted(el, binding) {
    applyCspStyle(el, binding.value)
  },
  updated(el, binding) {
    applyCspStyle(el, binding.value)
  },
  unmounted(el) {
    releaseCspStyle(el)
  },
}

export const cspStyleDirectivePlugin = {
  install(app) {
    app.directive('csp-style', vCspStyle)
  },
}
