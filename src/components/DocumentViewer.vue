<template>
  <div class="document-viewer" :class="{ 'document-viewer--compact': compact }">
    <div v-if="showToolbar && !loading && !errorText" class="document-viewer__toolbar">
      <div v-if="kind === 'pdf'" class="document-viewer__nav">
        <HoverTooltip :text="t('components.documentViewer.prevPage')" wrap>
          <button type="button" class="document-viewer__icon-btn" :disabled="page <= 1" :aria-label="t('components.documentViewer.prevPage')" @click="goPage(page - pagesPerView)">
            <ChevronLeft :size="18" aria-hidden="true" />
          </button>
        </HoverTooltip>
        <span class="document-viewer__page">
          {{ pageLabel }}
        </span>
        <HoverTooltip :text="t('components.documentViewer.nextPage')" wrap>
          <button type="button" class="document-viewer__icon-btn" :disabled="!canNextPage" :aria-label="t('components.documentViewer.nextPage')" @click="goPage(page + pagesPerView)">
            <ChevronRight :size="18" aria-hidden="true" />
          </button>
        </HoverTooltip>
      </div>
      <div v-if="kind === 'pdf'" class="document-viewer__zoom">
        <HoverTooltip :text="t('components.documentViewer.zoomOut')" wrap>
          <button type="button" class="document-viewer__icon-btn" :disabled="zoom <= ZOOM_MIN" :aria-label="t('components.documentViewer.zoomOut')" @click="changeZoom(-ZOOM_STEP)">
            <ZoomOut :size="18" aria-hidden="true" />
          </button>
        </HoverTooltip>
        <span class="document-viewer__zoom-label">{{ zoomLabel }}</span>
        <HoverTooltip :text="t('components.documentViewer.zoomIn')" wrap>
          <button type="button" class="document-viewer__icon-btn" :disabled="zoom >= ZOOM_MAX" :aria-label="t('components.documentViewer.zoomIn')" @click="changeZoom(ZOOM_STEP)">
            <ZoomIn :size="18" aria-hidden="true" />
          </button>
        </HoverTooltip>
      </div>
      <div v-if="(kind === 'pdf' || kind === 'docx') && !compact" class="document-viewer__layout">
        <template v-if="kind === 'pdf'">
          <HoverTooltip :text="t('components.documentViewer.portrait')" wrap>
            <button type="button" class="document-viewer__icon-btn" :class="{ 'document-viewer__icon-btn--active': orientation === 'portrait' }" :aria-label="t('components.documentViewer.portrait')" :aria-pressed="orientation === 'portrait'" @click="orientation = 'portrait'">
              <RectangleVertical :size="18" aria-hidden="true" />
            </button>
          </HoverTooltip>
          <HoverTooltip :text="t('components.documentViewer.landscape')" wrap>
            <button type="button" class="document-viewer__icon-btn" :class="{ 'document-viewer__icon-btn--active': orientation === 'landscape' }" :aria-label="t('components.documentViewer.landscape')" :aria-pressed="orientation === 'landscape'" @click="orientation = 'landscape'">
              <RectangleHorizontal :size="18" aria-hidden="true" />
            </button>
          </HoverTooltip>
        </template>
        <HoverTooltip :text="t('components.documentViewer.pagesOne')" wrap>
          <button type="button" class="document-viewer__icon-btn" :class="{ 'document-viewer__icon-btn--active': pagesPerView === 1 }" :aria-label="t('components.documentViewer.pagesOne')" :aria-pressed="pagesPerView === 1" @click="pagesPerView = 1">
            <Square :size="18" aria-hidden="true" />
          </button>
        </HoverTooltip>
        <HoverTooltip :text="t('components.documentViewer.pagesTwo')" wrap>
          <button type="button" class="document-viewer__icon-btn" :class="{ 'document-viewer__icon-btn--active': pagesPerView === 2 }" :aria-label="t('components.documentViewer.pagesTwo')" :aria-pressed="pagesPerView === 2" @click="pagesPerView = 2">
            <Columns2 :size="18" aria-hidden="true" />
          </button>
        </HoverTooltip>
        <HoverTooltip :text="pagesOverflowLabel" wrap>
          <button type="button" class="document-viewer__icon-btn" :class="{ 'document-viewer__icon-btn--active': isDocxFitWidth || (kind === 'pdf' && pagesPerView === 4) }" :aria-label="pagesOverflowLabel" :aria-pressed="isDocxFitWidth || (kind === 'pdf' && pagesPerView === 4)" @click="setPagesOverflow">
            <LayoutGrid :size="18" aria-hidden="true" />
          </button>
        </HoverTooltip>
      </div>
      <DocumentViewerFind v-if="kind === 'pdf' || kind === 'docx'" v-model="searchQuery" class="document-viewer__find" :current="searchIndex" :total="searchTotal" @next="stepSearch(1)" @prev="stepSearch(-1)"/>
      <HoverTooltip v-if="src" :text="t('components.documentViewer.download')" wrap>
        <button type="button" class="document-viewer__icon-btn" :aria-label="t('components.documentViewer.download')" @click="downloadFile">
          <Download :size="18" aria-hidden="true" />
        </button>
      </HoverTooltip>
    </div>

    <div ref="stageRef" class="document-viewer__stage">
      <div v-if="loading" class="document-viewer__state">
        <SpinnerLoading :loading-text="t('components.documentViewer.loading')" />
      </div>
      <div v-else-if="errorText" class="document-viewer__state document-viewer__state--error">
        <p class="mb-2">{{ errorText }}</p>
        <button v-if="src" type="button" class="ui-btn ui-btn--secondary" @click="downloadFile">
          {{ t('components.documentViewer.download') }}
        </button>
      </div>
      <div v-else-if="kind === 'pdf'" class="document-viewer__pdf" :class="`document-viewer__pdf--cols-${pdfCols}`">
        <div v-for="n in pageCount" :key="n" class="document-viewer__sheet" v-csp-style="canvasStyles[n - 1] || emptyStyle">
          <canvas class="document-viewer__canvas" :aria-label="pdfPageAria(n)"/>
          <div class="document-viewer__text"/>
        </div>
      </div>
      <div v-else-if="kind === 'docx'" ref="docxHost" class="document-viewer__docx" v-csp-style="docxFitStyle"/>
      <div v-else class="document-viewer__state">
        <p class="mb-2">{{ t('components.documentViewer.unsupported') }}</p>
        <button v-if="src" type="button" class="ui-btn ui-btn--primary" @click="downloadFile">
          {{ t('components.documentViewer.download') }}
        </button>
      </div>
    </div>
    <DocumentViewerPageHud :stage="stageRef" :host="docxHost" :active="kind === 'docx' && !loading && !errorText"/>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Columns2, Download, LayoutGrid, RectangleHorizontal, RectangleVertical, Square, ZoomIn, ZoomOut, } from '@lucide/vue'
import DocumentViewerFind from '@/components/DocumentViewerFind.vue'
import DocumentViewerPageHud from '@/components/DocumentViewerPageHud.vue'
import '@/components/documentViewerText.css'
import HoverTooltip from '@/components/HoverTooltip.vue'
import SpinnerLoading from '@/components/SpinnerLoading.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { logError } from '@/js/utils/logError.js'
import { downloadMedia } from '@/js/utils/mediaDownload.js'
import { DOCUMENT_PREVIEW_KIND, detectDocumentPreviewKind, fetchMediaBlob, } from '@/js/utils/mediaPreview.js'
import { PDF_CSS_UNITS, fitPdfPageZoom, layoutColumns, pageRotation, pdfPageCssSize, waitForBox, } from '@/js/utils/documentViewerLayout.js'
import { countDocxPages, DOCX_PAGES_FIT_WIDTH, fitDocxToStage, renderDocxDocument } from '@/js/utils/documentViewerDocx.js'
import { applyDocumentSearch, clearDocumentSearch, scrollSearchRange, } from '@/js/utils/documentViewerSearch.js'
import { bindViewerStage, handlePdfStageWheel, pdfPageFromScroll, revealPdfPage, unbindViewerStage, viewerCanvases, } from '@/js/utils/documentViewerStage.js'

const ZOOM_MIN = 0.15
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25
const STAGE_PAD = 24

const props = defineProps({
  src: {
    type: String,
    default: '',
  },
  filename: {
    type: String,
    default: '',
  },
  compact: {
    type: Boolean,
    default: false,
  },
  showToolbar: {
    type: Boolean,
    default: true,
  },
})

const { t } = useAppI18n()
const loading = ref(false)
const errorText = ref('')
const kind = ref(DOCUMENT_PREVIEW_KIND.UNSUPPORTED)
const page = ref(1)
const pageCount = ref(1)
const zoom = ref(1)
const orientation = ref('portrait')
const pagesPerView = ref(1)
const canvasStyles = ref([])
const emptyStyle = {}
const docxFitStyle = ref({})
const docxHost = ref(null)
const stageRef = ref(null)
const searchQuery = ref('')
const searchIndex = ref(0)
const searchTotal = ref(0)
let pdfDoc = null
let docxNative = null
let loadToken = 0
let renderToken = 0
let resizeTimer = 0
let searchTimer = 0
let stageObserver = null
let pdfPageCss = null
let zoomTouched = false
let applyingFit = false

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const pdfCols = computed(() => layoutColumns(pagesPerView.value))
const isDocxFitWidth = computed(() => (
  kind.value === DOCUMENT_PREVIEW_KIND.DOCX
  && (pagesPerView.value === DOCX_PAGES_FIT_WIDTH || pagesPerView.value >= 4)
))
const pagesOverflowLabel = computed(() => (
  kind.value === DOCUMENT_PREVIEW_KIND.DOCX
    ? t('components.documentViewer.pagesFitWidth')
    : t('components.documentViewer.pagesFour')
))
const pageEnd = computed(() => (
  Math.min(pageCount.value, page.value + pdfCols.value - 1)
))
const canNextPage = computed(() => pageEnd.value < pageCount.value)
const pageLabel = computed(() => {
  if (pageEnd.value === page.value) {
    return t('components.documentViewer.pageOf', { current: page.value, total: pageCount.value })
  }
  return t('components.documentViewer.pageRangeOf', {
    from: page.value,
    to: pageEnd.value,
    total: pageCount.value,
  })
})
function pdfPageAria(n) {
  return t('components.documentViewer.pdfPage', { current: n, total: pageCount.value })
}

function goPage(next) {
  page.value = revealPdfPage(stageRef.value, next, pagesPerView.value, pageCount.value)
}

function onStageScroll() {
  if (kind.value !== DOCUMENT_PREVIEW_KIND.PDF || !stageRef.value) {
    return
  }
  const rowStart = pdfPageFromScroll(stageRef.value, pageCount.value, pagesPerView.value)
  if (rowStart !== page.value) {
    page.value = rowStart
  }
}

function syncPdfFit(sizes, quiet = false) {
  if (sizes) {
    pdfPageCss = pdfPageCssSize(sizes, PDF_CSS_UNITS)
  }
  if (zoomTouched) {
    return
  }
  const next = fitPdfPageZoom(stageRef.value, pdfPageCss, pdfCols.value, { min: ZOOM_MIN, max: 1 })
  if (next == null || Math.abs(next - zoom.value) < 0.01) {
    return
  }
  if (quiet) {
    applyingFit = true
    zoom.value = next
    nextTick(() => {
      applyingFit = false
    })
    return
  }
  zoom.value = next
}

function changeZoom(delta) {
  zoomTouched = true
  const stepped = Math.round((zoom.value + delta) / ZOOM_STEP) * ZOOM_STEP
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(stepped * 100) / 100))
}

function setPagesOverflow() {
  pagesPerView.value = kind.value === DOCUMENT_PREVIEW_KIND.DOCX ? DOCX_PAGES_FIT_WIDTH : 4
}

function onStageWheel(event) {
  if (kind.value !== DOCUMENT_PREVIEW_KIND.PDF) {
    return
  }
  handlePdfStageWheel(event, {
    zoomStep: ZOOM_STEP,
    changeZoom,
  })
}

function bindStage(el) {
  bindViewerStage(el, onStageWheel, stageObserver, onStageScroll)
}

function unbindStage(el) {
  unbindViewerStage(el, onStageWheel, stageObserver, onStageScroll)
}

function applyDocxFit() {
  const result = fitDocxToStage(
    docxHost.value,
    stageRef.value,
    docxNative,
    STAGE_PAD,
    pagesPerView.value,
    pageCount.value,
    props.compact,
  )
  docxNative = result.native
  docxFitStyle.value = result.style
}

function scheduleStageFit() {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    if (loading.value) {
      return
    }
    if (kind.value === DOCUMENT_PREVIEW_KIND.PDF) {
      syncPdfFit()
      return
    }
    if (kind.value === DOCUMENT_PREVIEW_KIND.DOCX) {
      applyDocxFit()
    }
  }, 200)
}

stageObserver = new ResizeObserver(scheduleStageFit)

async function downloadFile() {
  if (!props.src) {
    return
  }
  try {
    await downloadMedia(props.src, { filename: props.filename || undefined })
  } catch (error) {
    logError('DocumentViewer.downloadFile', error)
  }
}

function resetView() {
  renderToken += 1
  pdfDoc = null
  page.value = 1
  pageCount.value = 1
  zoom.value = 1
  zoomTouched = false
  pdfPageCss = null
  errorText.value = ''
  kind.value = detectDocumentPreviewKind(props.filename)
  canvasStyles.value = []
  docxNative = null
  docxFitStyle.value = {}
  if (docxHost.value) {
    docxHost.value.replaceChildren()
  }
  clearDocumentSearch()
}

function runSearch(index) {
  const pdf = kind.value === DOCUMENT_PREVIEW_KIND.PDF
  const docx = kind.value === DOCUMENT_PREVIEW_KIND.DOCX
  const host = pdf ? stageRef.value?.querySelector('.document-viewer__pdf') : docxHost.value
  const applied = applyDocumentSearch(pdf || docx ? host : null, searchQuery.value, index)
  searchTotal.value = applied.total
  searchIndex.value = applied.index
  if (applied.ranges[applied.index]) scrollSearchRange(applied.ranges[applied.index])
}

function stepSearch(delta) {
  if (searchTotal.value) runSearch(searchIndex.value + delta)
}

async function renderPdfStrip() {
  if (!pdfDoc || kind.value !== DOCUMENT_PREVIEW_KIND.PDF) {
    return
  }
  const token = ++renderToken
  const { cancelPdfPageRenders, pdfPageViewport, renderPdfPage, renderPdfTextLayer } = await import(
    '@/js/utils/documentViewerPdf.js'
  )
  const total = pageCount.value
  const rotation = pageRotation(orientation.value)
  const stage = await waitForBox(() => stageRef.value)
  if (!stage || token !== renderToken) {
    return
  }
  const scrollRatio = stage.scrollHeight > 1 ? stage.scrollTop / stage.scrollHeight : 0
  const loaded = []
  const sizes = []
  for (let number = 1; number <= total; number += 1) {
    const pdfPage = await pdfDoc.getPage(number)
    if (token !== renderToken) {
      return
    }
    loaded.push(pdfPage)
    const view = pdfPageViewport(pdfPage, { scale: 1, rotation })
    sizes.push({ width: view.width, height: view.height })
  }
  await nextTick()
  if (!viewerCanvases(stageRef.value)[0]) {
    await nextTick()
  }
  if (!stageRef.value || token !== renderToken) {
    return
  }
  syncPdfFit(sizes, true)
  const scale = zoom.value * PDF_CSS_UNITS
  cancelPdfPageRenders({ scale, rotation })
  canvasStyles.value = sizes.map((size) => ({
    width: `${Math.floor(size.width * scale)}px`,
    height: `${Math.floor(size.height * scale)}px`,
  }))
  await nextTick()
  if (!stageRef.value || token !== renderToken) {
    return
  }
  if (scrollRatio > 0) {
    stageRef.value.scrollTop = scrollRatio * stageRef.value.scrollHeight
  }
  const canvases = viewerCanvases(stageRef.value)
  for (let index = 0; index < loaded.length; index += 1) {
    const canvas = canvases[index]
    if (!canvas || token !== renderToken) {
      return
    }
    try {
      const size = await renderPdfPage(loaded[index], canvas, scale, {
        rotation,
        stillCurrent: () => token === renderToken,
      })
      if (!size || token !== renderToken) {
        return
      }
      const textHost = canvas.parentElement?.querySelector('.document-viewer__text')
      if (textHost) {
        await renderPdfTextLayer(loaded[index], textHost, scale, {
          rotation,
          stillCurrent: () => token === renderToken,
        })
      }
    } catch (error) {
      logError('DocumentViewer.renderPdfStrip', error)
      if (token === renderToken) {
        runSearch(searchIndex.value)
      }
      return
    }
  }
  if (token === renderToken) {
    runSearch(searchIndex.value)
  }
}

async function renderDocx(buffer) {
  await nextTick()
  if (!docxHost.value) {
    return
  }
  await renderDocxDocument(buffer, docxHost.value)
  docxNative = null
  pageCount.value = countDocxPages(docxHost.value) || 1
  const stage = await waitForBox(() => stageRef.value)
  if (!stage) {
    return
  }
  applyDocxFit()
  runSearch(searchIndex.value)
}

async function loadDocument() {
  const token = ++loadToken
  resetView()
  if (!props.src) {
    errorText.value = t('components.documentViewer.empty')
    return
  }
  loading.value = true
  let docxBuffer = null
  try {
    const result = await fetchMediaBlob(props.src, { filename: props.filename })
    if (token !== loadToken) {
      return
    }
    kind.value = result.kind
    if (result.kind === DOCUMENT_PREVIEW_KIND.PDF) {
      const { clearPdfPageCache, openPdfDocument } = await import('@/js/utils/documentViewerPdf.js')
      clearPdfPageCache()
      pdfDoc = await openPdfDocument(await result.blob.arrayBuffer())
      if (token !== loadToken) {
        return
      }
      pageCount.value = pdfDoc.numPages || 1
    } else if (result.kind === DOCUMENT_PREVIEW_KIND.DOCX) {
      docxBuffer = await result.blob.arrayBuffer()
    }
  } catch (error) {
    if (token !== loadToken) {
      return
    }
    logError('DocumentViewer.loadDocument', error)
    errorText.value = t('components.documentViewer.loadError')
  } finally {
    if (token === loadToken) {
      loading.value = false
    }
  }
  // Полотно и контейнер DOCX спрятаны за v-if="loading": рисовать после finally.
  if (token !== loadToken) {
    return
  }
  if (kind.value === DOCUMENT_PREVIEW_KIND.PDF && pdfDoc) {
    await renderPdfStrip()
  } else if (kind.value === DOCUMENT_PREVIEW_KIND.DOCX && docxBuffer) {
    await renderDocx(docxBuffer)
  }
}

watch(() => [props.src, props.filename], loadDocument, { immediate: true })
watch(searchQuery, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => runSearch(0), 200)
})
watch([zoom, orientation, pagesPerView], () => {
  if (loading.value || applyingFit) {
    return
  }
  if (kind.value === DOCUMENT_PREVIEW_KIND.PDF && pdfDoc) {
    renderPdfStrip()
  } else if (kind.value === DOCUMENT_PREVIEW_KIND.DOCX) {
    applyDocxFit()
  }
})

watch(stageRef, (el, prev) => {
  unbindStage(prev)
  bindStage(el)
})

onUnmounted(() => {
  loadToken += 1
  renderToken += 1
  clearDocumentSearch()
  pdfDoc = null
  window.clearTimeout(resizeTimer)
  window.clearTimeout(searchTimer)
  import('@/js/utils/documentViewerPdf.js').then(({ clearPdfPageCache }) => {
    clearPdfPageCache()
  }).catch(() => {})
  unbindStage(stageRef.value)
  if (stageObserver) {
    stageObserver.disconnect()
  }
})
</script>

<style scoped lang="scss">
@use '@/scss/ui/mixins' as *;

.document-viewer {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 18rem;
  height: 100%;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius, 0.625rem);
  overflow: hidden;
}

.document-viewer--compact {
  min-height: 14rem;
}

.document-viewer__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface-2, var(--ui-surface));

  :deep(.hover-tooltip) {
    display: contents;
  }
}

.document-viewer__nav,
.document-viewer__zoom,
.document-viewer__layout {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.document-viewer__find {
  flex: 1 1 14rem;
  min-width: min(100%, 14rem);
  max-width: 24rem;
  margin-left: auto;
}

.document-viewer__page,
.document-viewer__zoom-label {
  min-width: 7rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
}

.document-viewer__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm, 0.375rem);
  background: transparent;
  color: var(--ui-text);
  @include ui-a11y-focus;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ui-accent) 10%, var(--ui-surface));
  }

  &:disabled {
    opacity: 0.4;
  }

  &--active {
    background: color-mix(in srgb, var(--ui-accent) 14%, var(--ui-surface));
    border-color: var(--ui-border);
  }
}

.document-viewer__stage {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: color-mix(in srgb, var(--ui-text) 4%, var(--ui-surface));
}

.document-viewer__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 12rem;
  padding: 1.25rem;
  text-align: center;
  color: var(--ui-text-muted);
}

.document-viewer__state--error {
  color: var(--ui-danger);
}

.document-viewer__pdf {
  display: grid;
  justify-content: safe center;
  justify-items: center;
  align-content: start;
  gap: 0.75rem;
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
  padding: 0.75rem;
}

.document-viewer__pdf--cols-1 {
  grid-template-columns: max-content;
}

.document-viewer__pdf--cols-2 {
  grid-template-columns: repeat(2, max-content);
}

.document-viewer__pdf--cols-4 {
  grid-template-columns: repeat(4, max-content);
}

.document-viewer__sheet {
  position: relative;
  background: #fff;
  box-shadow: var(--ui-shadow-sm, none);
}

.document-viewer__canvas {
  display: block;
  width: 100%;
  height: 100%;
  // Размер — собственный размер листа и зум. max-width сжал бы страницу и размазал текст.
  max-width: none;
  background: #fff;
}

.document-viewer__docx {
  width: 100%;
  padding: 0.75rem;
  // Лист как бумага: белый фон и тёмный текст даже в тёмной теме.
  color: #111;

  :deep(.docx-wrapper) {
    display: grid;
    justify-content: center;
    justify-items: stretch;
    align-items: stretch;
    align-content: start;
    // Библиотека вешает на лист margin-bottom: 30px — без перехвата ряды шире колонок.
    row-gap: 1.5rem;
    column-gap: 1.5rem;
    background: transparent;
    padding: 0;
    width: var(--docx-wrapper-width, var(--docx-page-width, auto));
    margin-inline: auto;
    transform: scale(var(--docx-fit-scale, 1));
    transform-origin: top center;
    margin-bottom: calc(var(--docx-wrapper-height, 0px) * (var(--docx-fit-scale, 1) - 1));
    grid-template-columns: repeat(var(--docx-cols, 1), var(--docx-page-width, max-content));
  }

  :deep(.docx-wrapper > section.docx) {
    background: #fff;
    color: #111;
    box-shadow: var(--ui-shadow-sm, none);
    margin: 0;
    // Высота как у самого высокого листа, без обрезки полей overflow: hidden.
    min-height: var(--docx-page-height, auto);
    overflow: visible;
  }
}
</style>