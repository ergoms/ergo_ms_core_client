// 100% — собственный размер листа: 96 CSS-пикселей на дюйм, как в браузерном просмотре PDF.
export const PDF_CSS_UNITS = 96 / 72

export function layoutColumns(perView) {
  const count = Number(perView) || 1
  if (count >= 4) {
    return 4
  }
  if (count >= 2) {
    return 2
  }
  return 1
}

export function pageRotation(orientation) {
  return orientation === 'landscape' ? 90 : 0
}

const PDF_STAGE_PAD = 24
const PDF_STAGE_GAP = 12
const PDF_SCROLLBAR_RESERVE = 16

export function pdfPageCssSize(sizes, units) {
  let width = 0
  let height = 0
  for (const size of sizes || []) {
    width = Math.max(width, size.width || 0)
    height = Math.max(height, size.height || 0)
  }
  if (!width || !height) {
    return null
  }
  return { width: width * units, height: height * units }
}

export function fitPdfPageZoom(stage, pageCss, columns, { min = 0.15, max = 1 } = {}) {
  if (!stage || !pageCss?.width || !pageCss?.height) {
    return null
  }
  if (stage.clientWidth < 80 || stage.clientHeight < 80) {
    return null
  }
  const pdf = stage.querySelector('.document-viewer__pdf')
  let padX = PDF_STAGE_PAD
  let padY = PDF_STAGE_PAD
  let gap = PDF_STAGE_GAP
  if (pdf) {
    const style = getComputedStyle(pdf)
    padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    const parsedGap = parseFloat(style.columnGap || style.gap)
    if (parsedGap) {
      gap = parsedGap
    }
  }
  const cols = Math.max(1, Number(columns) || 1)
  const bar = stage.offsetWidth - stage.clientWidth
  const reserve = bar > 1 ? 0 : PDF_SCROLLBAR_RESERVE
  const availW = Math.max(1, stage.clientWidth - padX - reserve - 2)
  const availH = Math.max(1, stage.clientHeight - padY - 2)
  const rowW = pageCss.width * cols + gap * Math.max(0, cols - 1)
  const fit = Math.min(availW / rowW, availH / pageCss.height, max)
  if (!Number.isFinite(fit) || fit <= 0) {
    return null
  }
  return Math.round(Math.max(min, fit) * 100) / 100
}

export async function waitForBox(getEl, { minWidth = 160, minHeight = 160, frames = 12 } = {}) {
  for (let step = 0; step < frames; step += 1) {
    const el = getEl()
    if (el && el.offsetWidth >= minWidth && el.offsetHeight >= minHeight) {
      return el
    }
    await new Promise((resolve) => {
      requestAnimationFrame(resolve)
    })
  }
  return getEl()
}
