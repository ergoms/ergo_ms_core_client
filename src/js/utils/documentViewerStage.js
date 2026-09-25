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
