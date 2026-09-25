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
