import { layoutColumns } from '@/js/utils/documentViewerLayout.js'

export function viewerCanvases(stage) {
  if (!stage) {
    return []
  }
  return [...stage.querySelectorAll('canvas.document-viewer__canvas')]
}

function canvasScrollTop(canvas, stage) {
  return stage.scrollTop + canvas.getBoundingClientRect().top - stage.getBoundingClientRect().top
}

export function revealPdfPage(stage, next, perView, pageCount) {
  const cols = layoutColumns(perView)
  const raw = Math.min(Math.max(1, Number(next) || 1), pageCount || 1)
  const rowStart = Math.floor((raw - 1) / cols) * cols + 1
  const canvas = viewerCanvases(stage)[rowStart - 1]
  if (canvas && stage) {
    stage.scrollTo({ top: Math.max(0, canvasScrollTop(canvas, stage) - 12), behavior: 'smooth' })
  }
  return rowStart
}

export function pdfPageFromScroll(stage, pageCount, perView) {
  const cols = layoutColumns(perView)
  const canvases = viewerCanvases(stage)
  let current = 1
  for (let index = 0; index < pageCount; index += 1) {
    const canvas = canvases[index]
    if (!canvas) {
      continue
    }
    if (canvasScrollTop(canvas, stage) <= stage.scrollTop + 24) {
      current = index + 1
    }
  }
  return Math.floor((current - 1) / cols) * cols + 1
}

export function handlePdfStageWheel(event, ctx) {
  if (!event.ctrlKey) {
    return
  }
  event.preventDefault()
  ctx.changeZoom(event.deltaY > 0 ? -ctx.zoomStep : ctx.zoomStep)
}

export function bindViewerStage(el, onWheel, observer, onScroll) {
  if (!el) {
    return
  }
  el.addEventListener('wheel', onWheel, { passive: false })
  if (onScroll) {
    el.addEventListener('scroll', onScroll, { passive: true })
  }
  observer?.observe(el)
}

export function unbindViewerStage(el, onWheel, observer, onScroll) {
  if (!el) {
    return
  }
  el.removeEventListener('wheel', onWheel)
  if (onScroll) {
    el.removeEventListener('scroll', onScroll)
  }
  observer?.unobserve(el)
}
