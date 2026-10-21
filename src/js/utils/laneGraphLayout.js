/**
 * Раскладка LaneGraph: колонки, ряды, цепочки зависимостей и ортогональные рёбра.
 * Координаты в пикселях канвы. Доменных полей (семестр, з.е.) здесь нет.
 */

export const LANE_GRAPH_CARD_WIDTH = 188
export const LANE_GRAPH_CARD_HEIGHT = 64
export const LANE_GRAPH_COLUMN_PITCH = 228
export const LANE_GRAPH_HEADER_HEIGHT = 46
export const LANE_GRAPH_ROW_GAP = 14
export const LANE_GRAPH_ROW_PITCH = LANE_GRAPH_CARD_HEIGHT + LANE_GRAPH_ROW_GAP

const TONES = ['accent', 'info', 'success', 'warning', 'neutral']

export function laneGraphX(lane) {
  return Number(lane) * LANE_GRAPH_COLUMN_PITCH
}

export function laneGraphY(row, rowY = null) {
  if (Array.isArray(rowY) && rowY[row] != null) return rowY[row]
  return LANE_GRAPH_HEADER_HEIGHT + Number(row) * LANE_GRAPH_ROW_PITCH
}

export function estimateLaneGraphCardHeight(title) {
  const inner = LANE_GRAPH_CARD_WIDTH - 20
  const charsPerLine = Math.max(12, Math.floor(inner / 8.2))
  const lines = Math.max(1, Math.ceil(Array.from(String(title || '')).length / charsPerLine))
  return Math.max(LANE_GRAPH_CARD_HEIGHT, 14 + lines * 18 + 18)
}

function placeCards(items) {
  const rowCount = items.reduce((max, item) => Math.max(max, (item.row || 0) + 1), 1)
  const rowHeights = Array.from({ length: rowCount }, () => LANE_GRAPH_CARD_HEIGHT)
  for (const item of items) {
    item.cardHeight = estimateLaneGraphCardHeight(item.title)
    rowHeights[item.row] = Math.max(rowHeights[item.row], item.cardHeight)
  }
  const rowY = []
  let y = LANE_GRAPH_HEADER_HEIGHT
  for (let index = 0; index < rowCount; index += 1) {
    rowY[index] = y
    y += rowHeights[index] + LANE_GRAPH_ROW_GAP
  }
  for (const item of items) {
    item.x = laneGraphX(item.lane)
    item.y = rowY[item.row]
  }
  return { rowCount, rowY, canvasHeight: y }
}

export function hashTone(value) {
  const text = String(value || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return TONES[Math.abs(hash) % TONES.length]
}

function asId(value) {
  const text = String(value ?? '').trim()
  return text
}

function asLane(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw < 0) return 0
  return Math.floor(raw)
}

function asRow(value) {
  if (value == null || value === '') return null
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw < 0) return null
  return Math.floor(raw)
}

function asWeight(value) {
  const raw = Number(value)
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

function uniqueIds(values) {
  const seen = new Set()
  const ids = []
  for (const value of values || []) {
    const id = asId(value)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function normalizeLaneGraphItems(items) {
  const nodes = []
  for (let index = 0; index < (items || []).length; index += 1) {
    const raw = items[index]
    if (!raw || typeof raw !== 'object') continue
    const id = asId(raw.id)
    const title = String(raw.title || '').trim()
    if (!id || !title) continue
    nodes.push({
      id,
      title,
      lane: asLane(raw.lane),
      row: asRow(raw.row),
      category: String(raw.category || '').trim(),
      weight: asWeight(raw.weight),
      badge: String(raw.badge || '').trim(),
      optional: Boolean(raw.optional),
      highlight: Boolean(raw.highlight),
      dependsOn: uniqueIds(raw.dependsOn),
      meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : null,
      order: index,
    })
  }
  return nodes
}

function assignRows(items) {
  const byLane = new Map()
  for (const item of items) {
    if (!byLane.has(item.lane)) byLane.set(item.lane, [])
    byLane.get(item.lane).push(item)
  }
  const placed = []
  for (const [, group] of [...byLane.entries()].sort((a, b) => a[0] - b[0])) {
    const used = new Set()
    const withRow = []
    const withoutRow = []
    for (const item of group) {
      if (item.row == null || used.has(item.row)) withoutRow.push(item)
      else {
        used.add(item.row)
        withRow.push(item)
      }
    }
    withRow.sort((a, b) => a.row - b.row || a.order - b.order)
    withoutRow.sort((a, b) => a.order - b.order)
    let next = 0
    const takeNext = () => {
      while (used.has(next)) next += 1
      const row = next
      used.add(row)
      next += 1
      return row
    }
    for (const item of withRow) placed.push({ ...item, row: item.row })
    for (const item of withoutRow) placed.push({ ...item, row: takeNext() })
  }
  return placed
}

function buildAdjacency(items) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const children = new Map()
  const parents = new Map()
  for (const item of items) {
    if (!children.has(item.id)) children.set(item.id, [])
    if (!parents.has(item.id)) parents.set(item.id, [])
  }
  for (const item of items) {
    const links = []
    for (const parentId of item.dependsOn) {
      if (!byId.has(parentId) || parentId === item.id) continue
      links.push(parentId)
      parents.get(item.id).push(parentId)
      children.get(parentId).push(item.id)
    }
    item.dependsOn = uniqueIds(links)
  }
  return { byId, children, parents }
}

function collectSet(id, edges, memo) {
  if (memo.has(id)) return memo.get(id)
  const found = new Set()
  for (const next of edges.get(id) || []) {
    found.add(next)
    collectSet(next, edges, memo).forEach((value) => found.add(value))
  }
  memo.set(id, found)
  return found
}

function chainDepth(id, edges, memo) {
  if (memo.has(id)) return memo.get(id)
  const next = edges.get(id) || []
  const depth = next.length
    ? 1 + Math.max(...next.map((child) => chainDepth(child, edges, memo)))
    : 1
  memo.set(id, depth)
  return depth
}

export function collectUpstream(id, parents, acc = new Set()) {
  for (const parentId of parents.get(id) || []) {
    if (acc.has(parentId)) continue
    acc.add(parentId)
    collectUpstream(parentId, parents, acc)
  }
  return acc
}

export function collectDownstream(id, children, acc = new Set()) {
  for (const childId of children.get(id) || []) {
    if (acc.has(childId)) continue
    acc.add(childId)
    collectDownstream(childId, children, acc)
  }
  return acc
}

function computeMetrics(items, children, parents) {
  const descMemo = new Map()
  const inMemo = new Map()
  const outMemo = new Map()
  const metrics = {}
  let maxDepth = 0
  for (const item of items) {
    const blocking = collectSet(item.id, children, descMemo).size
    const depthIn = chainDepth(item.id, parents, inMemo)
    const depthOut = chainDepth(item.id, children, outMemo)
    const chain = depthIn + depthOut - 1
    maxDepth = Math.max(maxDepth, chain)
    metrics[item.id] = { blocking, depthIn, depthOut, chain, critical: false }
  }
  for (const item of items) {
    metrics[item.id].critical = metrics[item.id].chain === maxDepth && maxDepth > 1
  }
  return { byId: metrics, maxChain: maxDepth }
}

function roundedPath(points, radius) {
  const pts = points.filter((point, index) => (
    index === 0
    || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) > 0.5
  ))
  if (!pts.length) return ''
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}`
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const d1 = Math.hypot(x1 - x0, y1 - y0)
    const d2 = Math.hypot(x2 - x1, y2 - y1)
    if (!d1 || !d2) continue
    const rr = Math.min(radius, d1 / 2, d2 / 2)
    const ax = x1 - ((x1 - x0) / d1) * rr
    const ay = y1 - ((y1 - y0) / d1) * rr
    const bx = x1 + ((x2 - x1) / d2) * rr
    const by = y1 + ((y2 - y1) / d2) * rr
    d += ` L${ax} ${ay} Q${x1} ${y1} ${bx} ${by}`
  }
  const last = pts[pts.length - 1]
  return `${d} L${last[0]} ${last[1]}`
}

function portY(list, id, item) {
  const n = list.length
  const i = Math.max(0, list.indexOf(id))
  const spread = n > 1 ? Math.min(8, 36 / Math.max(1, n - 1)) : 0
  const height = item.cardHeight || LANE_GRAPH_CARD_HEIGHT
  const top = item.y != null ? item.y : laneGraphY(item.row)
  return top + (height / 2) + (i - (n - 1) / 2) * spread
}

function routeEdges(items, byId) {
  const outgoing = {}
  const incoming = {}
  for (const item of items) {
    for (const parentId of item.dependsOn) {
      if (!outgoing[parentId]) outgoing[parentId] = []
      if (!incoming[item.id]) incoming[item.id] = []
      outgoing[parentId].push(item.id)
      incoming[item.id].push(parentId)
    }
  }
  const sortIds = (ids) => ids.sort((a, b) => {
    const left = byId.get(a)
    const right = byId.get(b)
    return (left?.row || 0) - (right?.row || 0) || (left?.lane || 0) - (right?.lane || 0)
  })
  Object.keys(outgoing).forEach((key) => sortIds(outgoing[key]))
  Object.keys(incoming).forEach((key) => sortIds(incoming[key]))

  const pairs = []
  for (const item of items) {
    for (const parentId of item.dependsOn) {
      const parent = byId.get(parentId)
      if (parent) pairs.push([parent, item])
    }
  }
  pairs.sort((left, right) => (
    portY(outgoing[left[0].id] || [], left[1].id, left[0])
    - portY(outgoing[right[0].id] || [], right[1].id, right[0])
  ))

  const laneSlots = {}
  const channels = {}
  const nextLaneX = (lane) => {
    const i = (laneSlots[lane] = (laneSlots[lane] || 0) + 1) - 1
    return laneGraphX(lane) + LANE_GRAPH_CARD_WIDTH + 7 + (i % 7) * 4.2
  }

  const edges = []
  for (const [from, to] of pairs) {
    const startY = portY(outgoing[from.id] || [], to.id, from)
    const endY = portY(incoming[to.id] || [], from.id, to)
    const startX = laneGraphX(from.lane) + LANE_GRAPH_CARD_WIDTH
    const endX = laneGraphX(to.lane) - 3
    let d = ''
    let bad = false
    if (to.lane <= from.lane) {
      bad = true
      const x1 = laneGraphX(from.lane) + LANE_GRAPH_CARD_WIDTH / 2
      const y1 = (from.y != null ? from.y : laneGraphY(from.row)) + (from.cardHeight || LANE_GRAPH_CARD_HEIGHT)
      const x2 = laneGraphX(to.lane) + LANE_GRAPH_CARD_WIDTH / 2
      const y2 = to.y != null ? to.y : laneGraphY(to.row)
      d = `M${x1} ${y1}C${x1} ${y1 + 40},${x2} ${y2 - 40},${x2} ${y2}`
    } else if (to.lane === from.lane + 1) {
      const lx = nextLaneX(from.lane)
      d = roundedPath([[startX, startY], [lx, startY], [lx, endY], [endX, endY]], 6)
    } else {
      const l1 = nextLaneX(from.lane)
      const l2 = nextLaneX(to.lane - 1)
      const ci = (channels[to.row] = (channels[to.row] || 0) + 1) - 1
      const toTop = to.y != null ? to.y : laneGraphY(to.row)
      const cy = toTop - 9 + ((ci % 3) - 1) * 3
      d = roundedPath(
        [[startX, startY], [l1, startY], [l1, cy], [l2, cy], [l2, endY], [endX, endY]],
        6,
      )
    }
    edges.push({
      id: `${from.id}__${to.id}`,
      from: from.id,
      to: to.id,
      d,
      bad,
    })
  }
  return edges
}

function buildLanes(items, lanesProp, laneCount) {
  const byIndex = new Map()
  for (const lane of lanesProp || []) {
    if (!lane || typeof lane !== 'object') continue
    const index = asLane(lane.id ?? lane.index)
    byIndex.set(index, {
      id: index,
      title: String(lane.title || '').trim(),
      weightLimit: asWeight(lane.weightLimit) || null,
    })
  }
  const views = []
  for (let index = 0; index < laneCount; index += 1) {
    const preset = byIndex.get(index) || {}
    const members = items.filter((item) => item.lane === index)
    const weight = members.reduce((sum, item) => sum + item.weight, 0)
    const weightLimit = preset.weightLimit || null
    views.push({
      id: index,
      title: preset.title || '',
      weight,
      weightLimit,
      over: Boolean(weightLimit) && weight > weightLimit,
      ratio: weightLimit ? Math.min(100, (weight / weightLimit) * 100) : (weight > 0 ? 100 : 0),
      x: laneGraphX(index),
      style: {
        left: `${laneGraphX(index)}px`,
        width: `${LANE_GRAPH_CARD_WIDTH}px`,
      },
    })
  }
  return views
}

export function deriveLaneGraphCategories(items, categoriesProp) {
  const byId = new Map()
  for (const row of categoriesProp || []) {
    if (!row || typeof row !== 'object') continue
    const id = asId(row.id)
    if (!id) continue
    byId.set(id, {
      id,
      label: String(row.label || id).trim() || id,
      tone: TONES.includes(row.tone) ? row.tone : hashTone(id),
    })
  }
  for (const item of items) {
    if (!item.category || byId.has(item.category)) continue
    byId.set(item.category, {
      id: item.category,
      label: item.category,
      tone: hashTone(item.category),
    })
  }
  return [...byId.values()]
}

export function layoutLaneGraph({ items, lanes } = {}) {
  const packed = assignRows(normalizeLaneGraphItems(items))
  const { rowCount, canvasHeight } = placeCards(packed)
  const maxLane = packed.reduce((max, item) => Math.max(max, item.lane), -1)
  const laneCountFromProp = (lanes || []).reduce((max, lane) => {
    const index = asLane(lane?.id ?? lane?.index)
    return Math.max(max, index)
  }, -1)
  const laneCount = Math.max(maxLane, laneCountFromProp) + 1
  const { byId, children, parents } = buildAdjacency(packed)
  const metrics = computeMetrics(packed, children, parents)
  const edges = routeEdges(packed, byId)
  const width = Math.max(LANE_GRAPH_COLUMN_PITCH, laneCount * LANE_GRAPH_COLUMN_PITCH)
  const height = Math.max(LANE_GRAPH_HEADER_HEIGHT + LANE_GRAPH_ROW_PITCH, canvasHeight)
  return {
    items: packed.map((item) => ({
      ...item,
      style: {
        left: `${item.x}px`,
        top: `${item.y}px`,
        width: `${LANE_GRAPH_CARD_WIDTH}px`,
        height: `${item.cardHeight}px`,
      },
    })),
    byId,
    children,
    parents,
    edges,
    metrics,
    lanes: buildLanes(packed, lanes, Math.max(laneCount, 0)),
    size: { width, height, rows: rowCount, laneCount: Math.max(laneCount, 0) },
    hasEdges: edges.length > 0,
  }
}

export function isCriticalEdge(edge, metrics) {
  if (!edge || edge.bad) return false
  const from = metrics?.byId?.[edge.from]
  const to = metrics?.byId?.[edge.to]
  if (!from?.critical || !to?.critical) return false
  return to.depthIn === from.depthIn + 1
}
