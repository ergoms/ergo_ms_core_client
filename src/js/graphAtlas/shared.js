const TER = ['#7E8FD6', '#4FA89A', '#D39A4C', '#B67DB8', '#6FA5CF', '#9DAE5A', '#D17C73', '#7AA88A', '#C2A160', '#8C88C9']

const DEFAULT_STRINGS = {
  stats: '{nodes} nodes: {hub} hubs and {leaf} leaves. {edges} edges, {clusters} areas.',
  composed: 'composed of',
  includes: 'includes',
  similar: 'similar',
  hub: 'Hub',
  leaf: 'Node',
  isolated: 'Unlinked',
  isolatedArea: 'unlinked',
  level: 'level',
  area: 'Area',
  noDescription: 'No description.',
  more: 'Show more',
  less: 'Show less',
  groupComposed: 'Composed of',
  groupInHub: 'Part of hub',
  groupIncludes: 'Includes',
  groupIncludedIn: 'Included in',
  groupSimilarHub: 'Similar hubs',
  groupSimilarLeaf: 'Similar nodes',
  moreRels: 'and {n} more. Raise the strength threshold to shorten the list.',
  noRels: 'No links at the current filters.',
  nothing: 'Nothing found. Try part of a word.',
  synthetic: '{name} (synth.)',
  syntheticDesc: 'Synthetic node for load testing.',
  openCard: 'Open card',
  strength: 'strength {n}',
  counts: '{hub} hubs, {leaf} nodes',
}

function fmt(template, vars) {
  return String(template || '')
    .replace(/%(\w+)%/g, (_, key) => vars[key] ?? '')
    .replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

const alphaCache = new Map()

function alpha(hex, a) {
  const key = `${hex}|${a}`
  const hit = alphaCache.get(key)
  if (hit) return hit
  const h = String(hex || '').trim().replace('#', '')
  if (h.length < 6) {
    const fallback = `rgba(21,32,42,${a})`
    alphaCache.set(key, fallback)
    return fallback
  }
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const out = `rgba(${r},${g},${b},${a})`
  alphaCache.set(key, out)
  return out
}

function localXY(cv, ev) {
  const box = cv.getBoundingClientRect()
  return [ev.clientX - box.left, ev.clientY - box.top]
}

function reducedMotion() {
  return document.documentElement.getAttribute('data-ergo-motion') === 'reduce'
    || matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const EDGE_KIND_SIMILAR = 2
/** Similar внутри области — когда узлы уже читаются, не на общем плане. */
export const SIMILAR_NEAR_K = 1
/** Межобластные similar: уверенный хвост, не пол сборки 0.35–0.40. */
export const SIMILAR_BRIDGE_MIN_W = 0.5
const SIMILAR_BRIDGE_MAX = 16
/** Потолок линий в кадре: средний масштаб / близко. Не удаление из снимка. */
export const VIEW_EDGE_CAP_MID = 600
export const VIEW_EDGE_CAP_NEAR = 1500
export const VIEW_EDGE_MID_K = 1.2

export function viewEdgeCap(k) {
  return k < VIEW_EDGE_MID_K ? VIEW_EDGE_CAP_MID : VIEW_EDGE_CAP_NEAR
}

/** Листья между областями рябят карту; хаб может держать мост. */
export function leafLeafCrossCluster(sn, tn) {
  return !sn.hub && !tn.hub && sn.cl !== tn.cl
}

export function pickSimilarBridges(nodes, edges, ok, vis) {
  const byPair = new Map()
  edges.forEach((e, j) => {
    if (e.k !== EDGE_KIND_SIMILAR || !ok(e)) return
    const sn = nodes[e.s]
    const tn = nodes[e.t]
    if (sn.cl === tn.cl) return
    if (leafLeafCrossCluster(sn, tn)) return
    if (!vis(sn) || !vis(tn)) return
    if (e.w < SIMILAR_BRIDGE_MIN_W) return
    const key = sn.cl < tn.cl ? `${sn.cl}_${tn.cl}` : `${tn.cl}_${sn.cl}`
    const list = byPair.get(key)
    if (list) list.push(j)
    else byPair.set(key, [j])
  })
  const picked = []
  byPair.forEach((list) => {
    list.sort((a, b) => edges[b].w - edges[a].w)
    picked.push(list[0])
  })
  picked.sort((a, b) => edges[b].w - edges[a].w)
  return new Set(picked.slice(0, SIMILAR_BRIDGE_MAX))
}

export function similarLineVisible(e, sn, tn, k, bridges, edgeIndex, ego) {
  if (ego) return true
  if (e.k !== EDGE_KIND_SIMILAR) return true
  if (leafLeafCrossCluster(sn, tn)) return false
  if (sn.cl === tn.cl) return k >= SIMILAR_NEAR_K
  return bridges.has(edgeIndex)
}

export function edgeLineVisible(e, sn, tn, k, bridges, edgeIndex, ego) {
  if (ego) return true
  if (leafLeafCrossCluster(sn, tn)) return false
  return similarLineVisible(e, sn, tn, k, bridges, edgeIndex, ego)
}

export { TER, DEFAULT_STRINGS, fmt, alpha, localXY, reducedMotion }

// Кадр окрестности: доля соседей, по которой меряется основной разброс,
// во сколько раз дальше него ещё тянется кадр, минимальный радиус в
// координатах снимка и потолок масштаба, чтобы узел без соседей не
// раздувался на весь холст. Подписи стоят сбоку от вершины, поэтому по
// горизонтали запас шире.
const EGO_CORE_QUANTILE = 0.85
const EGO_TAIL_FACTOR = 1.6
const EGO_MIN_REACH = 60
const EGO_MAX_SCALE = 4
const EGO_LABEL_PAD_X = 140
const EGO_LABEL_PAD_Y = 40

/**
 * Полуширина окрестности по одной оси. Если соседи разбросаны ровно, в кадр
 * входят все. Одиночный дальний хвост камеру к краю карты не уводит: его
 * ребро уходит за край кадра и видно при панораме.
 */
function egoReach(offsets) {
  if (!offsets.length) return EGO_MIN_REACH
  const sorted = offsets.slice().sort((a, b) => a - b)
  const far = sorted[sorted.length - 1]
  const core = sorted[Math.floor((sorted.length - 1) * EGO_CORE_QUANTILE)]
  return Math.max(EGO_MIN_REACH, Math.min(far, core * EGO_TAIL_FACTOR))
}

/**
 * Центр и масштаб кадра окрестности: в центре якоря (их среднее), в кадре
 * видимые соседи. ``pts`` — видимые узлы окрестности с x, y и id.
 */
export function egoFrame(pts, egoIds, width, height) {
  const idSet = new Set(egoIds || [])
  const seeds = pts.filter((n) => idSet.has(n.id))
  const anchor = seeds.length ? seeds : pts
  const cx = anchor.reduce((acc, n) => acc + n.x, 0) / anchor.length
  const cy = anchor.reduce((acc, n) => acc + n.y, 0) / anchor.length
  const rx = egoReach(pts.map((n) => Math.abs(n.x - cx)))
  const ry = egoReach(pts.map((n) => Math.abs(n.y - cy)))
  const padX = Math.min(EGO_LABEL_PAD_X, width * 0.2)
  const padY = Math.min(EGO_LABEL_PAD_Y, height * 0.15)
  const k = Math.min(
    Math.max(1, width / 2 - padX) / rx,
    Math.max(1, height / 2 - padY) / ry,
    EGO_MAX_SCALE,
  )
  return { cx, cy, k: Math.max(0.2, k) }
}
