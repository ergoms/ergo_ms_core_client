/**
 * Безопасный треугольник между пунктом меню и боковым списком.
 * Пока курсор внутри него, соседние строки не перехватывают подменю:
 * диагональный путь к списку иначе пересекает их.
 */

function cross(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

/**
 * @param {{ x: number, y: number }} apex
 * @param {{ left: number, right: number, top: number, bottom: number }} targetRect
 * @param {number} [padding] запас по вертикали у кромки списка
 * @returns {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }]}
 */
export function buildAimTriangle(apex, targetRect, padding = 0) {
  const pad = Number(padding) || 0
  const centerX = (targetRect.left + targetRect.right) / 2
  const opensRight = apex.x <= centerX
  const edgeX = opensRight ? targetRect.left : targetRect.right
  return [
    { x: apex.x, y: apex.y },
    { x: edgeX, y: targetRect.top - pad },
    { x: edgeX, y: targetRect.bottom + pad },
  ]
}

export function isPointInTriangle(point, triangle) {
  if (!point || !Array.isArray(triangle) || triangle.length !== 3) return false
  const [a, b, c] = triangle
  const d1 = cross(a, b, point)
  const d2 = cross(b, c, point)
  const d3 = cross(c, a, point)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/**
 * Текущая точка лежит в конусе от более ранней позиции курсора к списку.
 * Якорь — не предыдущий пиксель: на границе строки шаг почти вертикальный
 * и сам по себе всегда оказывается вне узкого конуса.
 */
export function movementAimsAtRect(anchor, point, rect, yPadding = 0) {
  if (!anchor || !point || !rect) return false
  if (!(rect.width > 0) || !(rect.height > 0)) return false
  const pad = Number(yPadding) || 0
  if (
    point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top - pad
    && point.y <= rect.bottom + pad
  ) {
    return true
  }
  if (anchor.x === point.x && anchor.y === point.y) return false
  return isPointInTriangle(point, buildAimTriangle(anchor, rect, pad))
}