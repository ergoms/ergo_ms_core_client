/**
 * Ленивая загрузка pdf.js. Worker только из бандла, не с CDN.
 *
 * Сборка federated remote инлайнит ``?url`` как ``data:`` (у lib нет public path).
 * pdf.js тогда делает ``import(data:…)`` — CSP ``script-src`` без ``data:`` это режет
 * и падает в fake worker. ``blob:`` для worker-src разрешён, origin у blob тот же.
 *
 * JBIG2 и JPEG2000 pdf.js 5 берёт из wasm. ``?url`` даёт хеш в имени файла,
 * а библиотека дописывает к каталогу фиксированные имена, поэтому каталог — /pdfjs/wasm/.
 */

const PDFJS_WASM_URL = `${import.meta.env.BASE_URL}pdfjs/wasm/`

let pdfjsLib = null
let workerBlobSrc = ''

function workerDataUrlToBlobSrc(dataUrl) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) {
    return dataUrl
  }
  const meta = dataUrl.slice(5, comma)
  const payload = dataUrl.slice(comma + 1)
  const isBase64 = /;base64/i.test(meta)
  const bytes = isBase64
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload))
  return URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }))
}

function resolvePdfWorkerSrc(raw) {
  const src = typeof raw === 'string' ? raw : ''
  if (!src) {
    return src
  }
  if (src.startsWith('data:')) {
    if (!workerBlobSrc) {
      workerBlobSrc = workerDataUrlToBlobSrc(src)
    }
    return workerBlobSrc
  }
  if (src.startsWith('/') || src.startsWith('blob:') || /^https?:/i.test(src)) {
    return src
  }
  try {
    return new URL(src, import.meta.url).href
  } catch {
    return src
  }
}

export async function loadPdfjs() {
  if (pdfjsLib) {
    return pdfjsLib
  }
  const [lib, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  lib.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc(workerUrl.default)
  pdfjsLib = lib
  return lib
}

export async function openPdfDocument(data) {
  const pdfjs = await loadPdfjs()
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return pdfjs.getDocument({ data: bytes, wasmUrl: PDFJS_WASM_URL }).promise
}

export function pdfPageViewport(page, { scale = 1, rotation = 0 } = {}) {
  const extra = ((Number(rotation) % 360) + 360) % 360
  const total = ((Number(page.rotate) || 0) + extra) % 360
  return page.getViewport({ scale, rotation: total })
}

const PAGE_CACHE_LIMIT = 6
const pageCache = new Map()
const inflightBitmaps = new Map()
const activeRenderTasks = new Set()
let cacheEpoch = 0

function isCancelledRender(error) {
  const name = error?.name || ''
  return name === 'RenderingCancelledException' || name === 'AbortException'
}

function pixelRatio() {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
}

function normalizedRotation(rotation) {
  return ((Number(rotation) % 360) + 360) % 360
}

function bitmapKey(pageNumber, scale, rotation, ratio) {
  return `${pageNumber}:${scale}:${rotation}:${ratio}`
}

function rememberBitmap(key, entry) {
  if (pageCache.has(key)) {
    pageCache.delete(key)
  }
  pageCache.set(key, entry)
  while (pageCache.size > PAGE_CACHE_LIMIT) {
    const oldest = pageCache.keys().next().value
    pageCache.delete(oldest)
  }
}

function paintCached(canvas, entry) {
  const context = canvas.getContext('2d', { alpha: false })
  if (canvas.width !== entry.pixelWidth || canvas.height !== entry.pixelHeight) {
    canvas.width = entry.pixelWidth
    canvas.height = entry.pixelHeight
  }
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(entry.canvas, 0, 0)
}

async function renderOffscreen(page, scale, rotation, ratio) {
  const viewport = pdfPageViewport(page, { scale, rotation })
  const displayWidth = Math.floor(viewport.width)
  const displayHeight = Math.floor(viewport.height)
  const offscreen = document.createElement('canvas')
  const context = offscreen.getContext('2d', { alpha: false })
  offscreen.width = Math.floor(displayWidth * ratio)
  offscreen.height = Math.floor(displayHeight * ratio)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, displayWidth, displayHeight)
  const task = page.render({
    canvasContext: context,
    viewport,
    intent: 'display',
  })
  const record = { task, scale, rotation }
  activeRenderTasks.add(record)
  try {
    await task.promise
  } finally {
    activeRenderTasks.delete(record)
  }
  return {
    canvas: offscreen,
    pixelWidth: offscreen.width,
    pixelHeight: offscreen.height,
    displayWidth,
    displayHeight,
  }
}

function ensurePageBitmap(page, scale, rotation, ratio) {
  const key = bitmapKey(page.pageNumber, scale, rotation, ratio)
  const cached = pageCache.get(key)
  if (cached) {
    rememberBitmap(key, cached)
    return Promise.resolve(cached)
  }
  const pending = inflightBitmaps.get(key)
  if (pending) {
    return pending
  }
  const epoch = cacheEpoch
  const job = renderOffscreen(page, scale, rotation, ratio).then((entry) => {
    if (epoch === cacheEpoch) {
      rememberBitmap(key, entry)
    }
    return entry
  }).finally(() => {
    if (inflightBitmaps.get(key) === job) {
      inflightBitmaps.delete(key)
    }
  })
  inflightBitmaps.set(key, job)
  return job
}

export function cancelPdfPageRenders(options = {}) {
  const keepScale = Object.prototype.hasOwnProperty.call(options, 'scale')
  for (const record of activeRenderTasks) {
    if (keepScale && record.scale === options.scale && record.rotation === normalizedRotation(options.rotation)) {
      continue
    }
    try {
      record.task.cancel()
    } catch {
      // pdf.js сам бросает RenderingCancelledException на ожидающий promise.
    }
  }
}

export function clearPdfPageCache() {
  cacheEpoch += 1
  cancelPdfPageRenders()
  pageCache.clear()
  inflightBitmaps.clear()
}

export async function renderPdfPage(page, canvas, scale, options = {}) {
  const ratio = pixelRatio()
  const rotation = normalizedRotation(options.rotation)
  try {
    const entry = await ensurePageBitmap(page, scale, rotation, ratio)
    if (options.stillCurrent && !options.stillCurrent()) {
      return null
    }
    paintCached(canvas, entry)
    return { width: entry.displayWidth, height: entry.displayHeight }
  } catch (error) {
    if (isCancelledRender(error)) {
      return null
    }
    throw error
  }
}

export function warmPdfPage(page, scale, options = {}) {
  const ratio = pixelRatio()
  const rotation = normalizedRotation(options.rotation)
  return ensurePageBitmap(page, scale, rotation, ratio).then(() => null).catch((error) => {
    if (isCancelledRender(error)) {
      return null
    }
    throw error
  })
}
