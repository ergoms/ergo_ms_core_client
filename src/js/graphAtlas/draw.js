import {
  alpha, fmt, edgeLineVisible, viewEdgeCap, EDGE_KIND_SIMILAR,
} from './shared.js'

const LABEL_CELL = 18
const MAX_LABELS_DIM = 220
const MAX_LABELS_FAR = 80
const MAX_LABELS_MID = 180
const MAX_LABELS_NEAR = 420

function wrapText(ctx, cache, text, max) {
  const key = `${text}|${Math.round(max)}`
  if (cache.has(key)) return cache.get(key)
  const words = text.split(/\s+/)
  const out = []
  let line = ''
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > max && line) {
      out.push(line)
      line = word
    } else line = test
  })
  if (line) out.push(line)
  cache.set(key, out)
  return out
}

function isDarkPaper(css) {
  const c = (css.paper || '').replace('#', '')
  return c.length >= 2 && parseInt(c.slice(0, 2), 16) < 80
}

function nodeVisible(n, F, clusters, keep) {
  if (F.ego && !F.ego.has(n.i)) return false
  if (!F.ego && !F.iso && (n.iso || clusters[n.cl]?.iso)) return false
  if (F.layers === 'leaf' && n.hub) return false
  if (F.layers === 'hub' && !n.hub) return false
  if (F.match && !F.match.has(n.i) && n.i !== keep) return false
  return true
}

function queryGrid(grid, x0, y0, x1, y1) {
  if (!grid) return []
  const out = []
  const i0 = Math.floor(x0 / grid.cell)
  const i1 = Math.floor(x1 / grid.cell)
  const j0 = Math.floor(y0 / grid.cell)
  const j1 = Math.floor(y1 / grid.cell)
  for (let i = i0; i <= i1; i += 1) {
    for (let j = j0; j <= j1; j += 1) {
      const bucket = grid.map.get(`${i}_${j}`)
      if (bucket) out.push(...bucket)
    }
  }
  return out
}

function labelHit(occ, box) {
  const x0 = Math.floor(box.x / LABEL_CELL)
  const x1 = Math.floor((box.x + box.w) / LABEL_CELL)
  const y0 = Math.floor(box.y / LABEL_CELL)
  const y1 = Math.floor((box.y + box.h) / LABEL_CELL)
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      if (occ.has(`${x}_${y}`)) return true
    }
  }
  return false
}

function labelMark(occ, box) {
  const x0 = Math.floor(box.x / LABEL_CELL)
  const x1 = Math.floor((box.x + box.w) / LABEL_CELL)
  const y0 = Math.floor(box.y / LABEL_CELL)
  const y1 = Math.floor((box.y + box.h) / LABEL_CELL)
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) occ.add(`${x}_${y}`)
  }
}

function labelCap(k, dim) {
  if (dim) return MAX_LABELS_DIM
  if (k < 0.8) return 0
  if (k < 1.2) return MAX_LABELS_FAR
  if (k < 2) return MAX_LABELS_MID
  return MAX_LABELS_NEAR
}

function circleHitsBox(cx, cy, rad, box) {
  const nx = Math.max(box.x, Math.min(cx, box.x + box.w))
  const ny = Math.max(box.y, Math.min(cy, box.y + box.h))
  const dx = cx - nx
  const dy = cy - ny
  return dx * dx + dy * dy < rad * rad
}

function labelHitsNodes(box, around, T, k, R, nsc, skipI) {
  for (let i = 0; i < around.length; i += 1) {
    const o = around[i]
    if (o.i === skipI) continue
    const ox = o.x * k + T.x
    const oy = o.y * k + T.y
    if (circleHitsBox(ox, oy, R(o) * nsc + 2, box)) return true
  }
  return false
}

function nodeLabelBlock(n, ctx, wcache) {
  const cache = wcache || new Map()
  if (n.hub) {
    const maxW = 200
    const lines = wrapText(ctx, cache, n.name, maxW)
    const widths = lines.map((line) => ctx.measureText(line).width)
    const w = Math.min(maxW, (widths.length ? Math.max(...widths) : 0) + 4)
    return { lines: lines.length ? lines : [n.name], w, h: Math.max(16, lines.length * 16), lh: 16 }
  }
  let txt = n.name
  if (txt.length > 28) txt = `${txt.slice(0, 27)}…`
  return { lines: [txt], w: ctx.measureText(txt).width + 4, h: 16, lh: 16 }
}

function drawLabels(state, k, inV, dim, vis) {
  const {
    ctx, css, nodes, sel, nbSet, T, R, labelOrder, uiFont, grid, wcache,
    vx0, vy0, vx1, vy1,
  } = state
  const cap = labelCap(k, dim)
  if (!dim && cap === 0) return
  const occ = new Set()
  const list = []
  if (dim) {
    list.push(nodes[sel])
    nbSet.forEach((i) => list.push(nodes[i]))
    list.sort((a, b) => (b.i === sel) - (a.i === sel) || (b.hub ? 1 : 0) - (a.hub ? 1 : 0)
      || (b.c - a.c) || (b.deg - a.deg))
  } else {
    const nearby = grid ? queryGrid(grid, vx0, vy0, vx1, vy1) : labelOrder.slice()
    nearby.sort((a, b) => (b.hub ? 1 : 0) - (a.hub ? 1 : 0)
      || (b.c - a.c) || (b.deg - a.deg) || (b.occ - a.occ))
    list.push(...nearby)
  }
  let drawn = 0
  const nsc = Math.max(0.8, Math.min(2.2, Math.sqrt(k) * 1.1))
  let lastFont = ''
  list.forEach((n) => {
    if (drawn >= cap) return
    if (!inV(n) || !vis(n)) return
    const x = n.x * k + T.x
    const y = n.y * k + T.y
    const r = R(n) * nsc
    const font = `400 12px ${uiFont}`
    if (font !== lastFont) { ctx.font = font; lastFont = font }
    const block = nodeLabelBlock(n, ctx, wcache)
    const aroundPad = n.hub ? 140 : 90
    const around = grid
      ? queryGrid(grid, n.x - aroundPad, n.y - aroundPad, n.x + aroundPad, n.y + aroundPad)
        .filter(vis)
      : list.filter(vis)
    const { w, h } = block
    const slots = [
      { x: x + r + 3, y: y - 8 },
      { x: x - r - 3 - w, y: y - 8 },
      { x: x - w / 2, y: y - r - 4 - h },
      { x: x - w / 2, y: y + r + 4 },
    ]
    let b = null
    for (let s = 0; s < slots.length; s += 1) {
      const cand = { x: slots[s].x, y: slots[s].y, w, h }
      const busy = (labelHit(occ, cand) && n.i !== sel)
        || labelHitsNodes(cand, around, T, k, R, nsc, n.i)
      if (!busy) {
        b = cand
        break
      }
    }
    if (!b) {
      if (n.i !== sel) return
      b = { x: slots[0].x, y: slots[0].y, w, h }
    }
    labelMark(occ, b)
    ctx.lineWidth = 3
    ctx.strokeStyle = css.paper
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    ctx.fillStyle = n.hub ? css.hub : css.ink
    block.lines.forEach((line, i) => {
      const ly = b.y + i * block.lh
      ctx.strokeText(line, b.x + 1, ly)
      ctx.fillText(line, b.x + 1, ly)
    })
    drawn += 1
  })
}

function wrapLines(ctx, cache, text, max, maxLines) {
  const lines = wrapText(ctx, cache, text, max)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

function drawTerritoryLabels(state, k, over, dim, vis) {
  const {
    ctx, css, clusters, F, T, W, H, s, cartoFont, uiFont, wcache,
  } = state
  if (k > 1.1) return
  const a = over ? 1 : Math.max(0, 1 - (k - 0.55) / 0.55)
  if (a <= 0.02) return
  const asCategory = state.areaMode === 'groups'
  ctx.globalAlpha = a * (dim ? 0.35 : 1)
  const occ = new Set()
  clusters.slice().sort((x, y) => y.mem.length - x.mem.length).forEach((c) => {
    if (c.iso && !F.iso) return
    if (vis && !c.mem.some((n) => vis(n))) return
    const x = c.cx * k + T.x
    const y = c.cy * k + T.y
    if (x < -200 || x > W + 200 || y < -60 || y > H + 60) return
    const title = c.iso ? s.isolated : c.name
    const fs = Math.max(13, Math.min(asCategory ? 16 : 21, 9 + Math.sqrt(c.mem.length) * 0.9))
    let lines
    let lineH
    if (asCategory) {
      ctx.font = `600 ${fs}px ${uiFont}`
      const maxW = Math.min(220, Math.max(112, 72 + Math.sqrt(c.mem.length) * 18))
      lines = wrapLines(ctx, wcache, title, maxW, 3)
      lineH = fs * 1.2
    } else {
      ctx.font = `italic ${fs}px ${cartoFont}`
      let t = title
      if (t.length > 34) t = `${t.slice(0, 33)}…`
      lines = [t]
      lineH = fs
    }
    const widths = lines.map((line) => ctx.measureText(line).width)
    const w = Math.max(...widths)
    const titleH = lineH * lines.length
    const b = {
      x: x - w / 2 - 4,
      y: y - titleH / 2 - 2,
      w: w + 8,
      h: titleH + 16,
    }
    if (labelHit(occ, b)) return
    labelMark(occ, b)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = css.paper
    ctx.lineJoin = 'round'
    const y0 = y - (titleH - lineH) / 2
    lines.forEach((line, i) => {
      const ly = y0 + i * lineH
      ctx.strokeText(line, x, ly)
      ctx.fillStyle = css.ink
      ctx.fillText(line, x, ly)
    })
    ctx.font = `400 12px ${uiFont}`
    const caption = fmt(s.counts, {
      hub: c.hubCount, leaf: c.leafCount, comp: c.hubCount, skill: c.leafCount,
    })
    const capY = y + titleH / 2 + 8
    ctx.strokeText(caption, x, capY)
    ctx.fillStyle = css.muted
    ctx.fillText(caption, x, capY)
  })
  ctx.globalAlpha = 1
}

function hullOnScreen(c, vx0, vy0, vx1, vy1) {
  return c.bx1 >= vx0 && c.bx0 <= vx1 && c.by1 >= vy0 && c.by0 <= vy1
}

function drawWorldLayer(state, D, over, interacting, dim, vis) {
  const {
    ctx, clusters, corr, F, T, DPR, css, vx0, vy0, vx1, vy1,
  } = state
  const k = T.k
  ctx.save()
  ctx.setTransform(DPR * k, 0, 0, DPR * k, T.x * DPR, T.y * DPR)
  clusters.forEach((c) => {
    if (c.iso && !F.iso) return
    if (!c.hullPath) return
    if (!hullOnScreen(c, vx0, vy0, vx1, vy1)) return
    if (vis && !c.mem.some((n) => vis(n))) return
    ctx.fillStyle = alpha(c.col, c.iso ? (D ? 0.05 : 0.07) : (D ? 0.13 : 0.15))
    ctx.fill(c.hullPath)
    ctx.lineWidth = 1 / k
    ctx.setLineDash(c.iso ? [3 / k, 5 / k] : [])
    ctx.strokeStyle = alpha(c.col, D ? 0.45 : 0.55)
    ctx.stroke(c.hullPath)
  })
  ctx.setLineDash([])
  if (over && !dim) {
    corr.forEach((g) => {
      const A = clusters[g.a]
      const B = clusters[g.b]
      if ((A.iso || B.iso) && !F.iso) return
      const minx = Math.min(A.cx, B.cx)
      const maxx = Math.max(A.cx, B.cx)
      const miny = Math.min(A.cy, B.cy)
      const maxy = Math.max(A.cy, B.cy)
      if (maxx < vx0 || minx > vx1 || maxy < vy0 || miny > vy1) return
      const mx = (A.cx + B.cx) / 2
      const my = (A.cy + B.cy) / 2
      ctx.beginPath()
      ctx.moveTo(A.cx, A.cy)
      ctx.quadraticCurveTo(
        mx - (B.cy - A.cy) * 0.12,
        my + (B.cx - A.cx) * 0.12,
        B.cx,
        B.cy,
      )
      ctx.lineWidth = Math.min(14, 0.6 + Math.sqrt(g.w) * 0.9) / k
      ctx.strokeStyle = alpha(css.muted, D ? 0.2 : 0.14)
      ctx.lineCap = 'round'
      ctx.stroke()
    })
  }
  if (!interacting && !over) drawVisibleEdges(state, vis, dim)
  ctx.restore()
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
}

function pickViewportEdges(state, vis, ids, k, bridges) {
  const { nodes, edges, ok } = state
  const hier = []
  const sim = []
  ids.forEach((j) => {
    const e = edges[j]
    if (!ok(e)) return
    const sn = nodes[e.s]
    const tn = nodes[e.t]
    if (!vis(sn) || !vis(tn)) return
    if (!edgeLineVisible(e, sn, tn, k, bridges, j, Boolean(state.F?.ego || state.F?.allEdges))) return
    if (e.k === EDGE_KIND_SIMILAR) sim.push(j)
    else hier.push(j)
  })
  const byW = (a, b) => edges[b].w - edges[a].w
  hier.sort(byW)
  sim.sort(byW)
  if (state.F?.allEdges) return hier.concat(sim)
  const cap = viewEdgeCap(k)
  if (hier.length >= cap) return hier.slice(0, cap)
  return hier.concat(sim.slice(0, cap - hier.length))
}

function drawVisibleEdges(state, vis, dim) {
  const {
    ctx, nodes, edges, T, css, edgeGrid, vx0, vy0, vx1, vy1, simBridges,
  } = state
  const k = T.k
  if (!state.edgeIdBuf) state.edgeIdBuf = new Set()
  const ids = queryEdgeIds(edgeGrid, vx0, vy0, vx1, vy1, state.edgeIdBuf)
  const eA = Math.min(0.55, 0.12 + (k - 0.55) * 0.35)
  const lwScale = Math.max(0.7, Math.min(1.6, k)) / k
  const curve = k >= 1.15
  const bridges = simBridges || new Set()
  const drawn = pickViewportEdges(state, vis, ids, k, bridges)
  const paths = []
  for (let b = 0; b < 12; b += 1) paths[b] = { pi: new Path2D(), po: new Path2D(), n: 0 }
  drawn.forEach((j) => {
    const e = edges[j]
    const sn = nodes[e.s]
    const tn = nodes[e.t]
    const bucket = Math.min(3, Math.floor(e.w * 4))
    const slot = paths[e.k * 4 + bucket]
    slot.n += 1
    if (sn.cl !== tn.cl && curve) {
      slot.po.moveTo(sn.x, sn.y)
      const mx = (sn.x + tn.x) / 2
      const my = (sn.y + tn.y) / 2
      slot.po.quadraticCurveTo(
        mx - (tn.y - sn.y) * 0.15,
        my + (tn.x - sn.x) * 0.15,
        tn.x,
        tn.y,
      )
    } else {
      slot.pi.moveTo(sn.x, sn.y)
      slot.pi.lineTo(tn.x, tn.y)
    }
  })
  paths.forEach((slot, idx) => {
    if (!slot.n) return
    const kind = Math.floor(idx / 4)
    const bucket = idx % 4
    const col = [css.cmp, css.inc, css.sim][kind]
    const a = dim ? 0.05 : eA * (0.45 + bucket * 0.22) * (kind === 2 ? 0.8 : 1)
    if (a < 0.01) return
    ctx.setLineDash(kind === 2 && k >= 1.15 ? [3 / k, 3 / k] : [])
    ctx.lineCap = 'butt'
    ctx.lineWidth = (0.5 + bucket * 0.45) * lwScale
    ctx.strokeStyle = alpha(col, a)
    ctx.stroke(slot.pi)
    ctx.strokeStyle = alpha(col, a * 0.28)
    ctx.stroke(slot.po)
  })
  ctx.setLineDash([])
}

function nodeScreenScale(k) {
  return Math.max(0.8, Math.min(2.2, Math.sqrt(k) * 1.1))
}

function rimAlong(n, R, nsc, ux, uy) {
  const r = R(n) * nsc
  if (!n.hub) return r
  const ax = Math.abs(ux) > 1e-4 ? r / Math.abs(ux) : Infinity
  const ay = Math.abs(uy) > 1e-4 ? r / Math.abs(uy) : Infinity
  return Math.min(ax, ay)
}

function shortenCurve(x1, y1, cx, cy, x2, y2, tn, R, nsc, full) {
  let t = 1
  if (!full) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 14; i += 1) {
      const mid = (lo + hi) / 2
      const u = 1 - mid
      const x = u * u * x1 + 2 * u * mid * cx + mid * mid * x2
      const y = u * u * y1 + 2 * u * mid * cy + mid * mid * y2
      const dx = x - x2
      const dy = y - y2
      const dist = Math.hypot(dx, dy) || 1
      if (dist > rimAlong(tn, R, nsc, dx / dist, dy / dist)) lo = mid
      else hi = mid
    }
    t = lo
  }
  const u = 1 - t
  const qx = x1 + (cx - x1) * t
  const qy = y1 + (cy - y1) * t
  const rx = cx + (x2 - cx) * t
  const ry = cy + (y2 - cy) * t
  const dx = 2 * u * (cx - x1) + 2 * t * (x2 - cx)
  const dy = 2 * u * (cy - y1) + 2 * t * (y2 - cy)
  const len = Math.hypot(dx, dy) || 1
  return {
    cx: qx, cy: qy, x: qx + (rx - qx) * t, y: qy + (ry - qy) * t, ux: dx / len, uy: dy / len,
  }
}

function eachFocusEdge(state, vis, paint) {
  const {
    nodes, edges, adj, sel, T, R, ok,
  } = state
  const k = T.k
  const nsc = nodeScreenScale(k)
  adj[sel].forEach((j) => {
    const e = edges[j]
    if (!ok(e)) return
    const sn = nodes[e.s]
    const tn = nodes[e.t]
    if (!vis(sn) || !vis(tn)) return
    const x1 = sn.x * k + T.x
    const y1 = sn.y * k + T.y
    const x2 = tn.x * k + T.x
    const y2 = tn.y * k + T.y
    const curved = sn.cl !== tn.cl
    let end = { x: x2, y: y2, ux: 0, uy: 0, cx: 0, cy: 0 }
    if (curved) {
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      const cx = mx - (y2 - y1) * 0.15
      const cy = my + (x2 - x1) * 0.15
      end = shortenCurve(x1, y1, cx, cy, x2, y2, tn, R, nsc, e.k === 2)
    } else if (e.k !== 2) {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1
      const ux = (x2 - x1) / len
      const uy = (y2 - y1) / len
      const rim = rimAlong(tn, R, nsc, ux, uy)
      end = { x: x2 - ux * rim, y: y2 - uy * rim, ux, uy, cx: 0, cy: 0 }
    }
    paint(e, x1, y1, end, curved, k)
  })
}

function drawFocusEdges(state, vis) {
  const { ctx, css } = state
  eachFocusEdge(state, vis, (e, x1, y1, end, curved) => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    if (curved) ctx.quadraticCurveTo(end.cx, end.cy, end.x, end.y)
    else ctx.lineTo(end.x, end.y)
    ctx.setLineDash(e.k === 2 ? [5, 4] : [])
    ctx.lineWidth = 0.8 + e.w * 3.4
    ctx.strokeStyle = alpha([css.cmp, css.inc, css.sim][e.k], 0.35 + e.w * 0.6)
    ctx.stroke()
  })
  ctx.setLineDash([])
}

function drawFocusArrows(state, vis) {
  const { ctx, css, T } = state
  if (T.k <= 0.8) return
  const wing = 16
  const spread = 0.55
  eachFocusEdge(state, vis, (e, _x1, _y1, end) => {
    if (e.k === 2) return
    const ang = Math.atan2(end.uy, end.ux)
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(end.x - Math.cos(ang - spread) * wing, end.y - Math.sin(ang - spread) * wing)
    ctx.lineTo(end.x - Math.cos(ang + spread) * wing, end.y - Math.sin(ang + spread) * wing)
    ctx.closePath()
    ctx.fillStyle = [css.cmp, css.inc, css.sim][e.k]
    ctx.fill()
  })
}

function addRound(path, x, y, r) {
  if (typeof path.roundRect === 'function') path.roundRect(x - r, y - r, r * 2, r * 2, r * 0.35)
  else path.rect(x - r, y - r, r * 2, r * 2)
}

function drawNodes(state, vis, inV, dim, simple) {
  const {
    ctx, css, nodes, F, sel, nbSet, T, R, grid, vx0, vy0, vx1, vy1,
  } = state
  const k = T.k
  const nsc = nodeScreenScale(k)
  const candidates = grid
    ? queryGrid(grid, vx0, vy0, vx1, vy1)
    : nodes
  const skills = new Path2D()
  const comps = new Path2D()
  const dimSkills = new Path2D()
  const dimComps = new Path2D()
  let selN = null
  candidates.forEach((n) => {
    if (!inV(n) || !vis(n)) return
    const matched = !F.match || F.match.has(n.i)
    const on = (!dim || n.i === sel || nbSet.has(n.i)) && matched
    const x = n.x * k + T.x
    const y = n.y * k + T.y
    const r = R(n) * nsc
    if (n.i === sel) selN = { n, x, y, r }
    if (n.hub && !simple) {
      addRound(on ? comps : dimComps, x, y, r)
    } else {
      const p = on ? skills : dimSkills
      p.moveTo(x + r, y)
      p.arc(x, y, r, 0, 7)
    }
  })
  if (dim) {
    ctx.globalAlpha = 0.14
    ctx.fillStyle = css.leaf
    ctx.fill(dimSkills)
    ctx.fillStyle = css.hub
    ctx.fill(dimComps)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = css.leaf
  ctx.fill(skills)
  ctx.fillStyle = css.hub
  ctx.fill(comps)
  if (selN) {
    ctx.beginPath()
    ctx.arc(selN.x, selN.y, selN.r + 5, 0, 7)
    ctx.strokeStyle = css.sel
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

export function createAtlasRenderer(state) {
  function vis(n) {
    return nodeVisible(n, state.F, state.clusters, state.sel)
  }

  function render() {
    const {
      ctx, T, W, H, DPR, css, sel,
    } = state
    const k = T.k
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.fillStyle = css.paper
    ctx.fillRect(0, 0, W, H)
    state.vx0 = -T.x / k - 48
    state.vy0 = -T.y / k - 48
    state.vx1 = (W - T.x) / k + 48
    state.vy1 = (H - T.y) / k + 48
    const inV = (n) => n.x > state.vx0 && n.x < state.vx1 && n.y > state.vy0 && n.y < state.vy1
    const over = k < 0.72
    const D = isDarkPaper(css)
    const dim = sel !== null
    const interacting = state.lod === 'nav' || state.detail === 'lite'
    ctx.lineJoin = 'round'
    drawWorldLayer(state, D, over, interacting, dim, vis)
    if (!interacting && dim) drawFocusEdges(state, vis)
    drawNodes(state, vis, inV, dim, interacting)
    if (!interacting && dim) drawFocusArrows(state, vis)
    if (!interacting) {
      drawLabels(state, k, inV, dim, vis)
      drawTerritoryLabels(state, k, over, dim, vis)
    }
  }

  return {
    render,
    vis,
    clearCache() { state.wcache.clear() },
  }
}

export function buildNodeGrid(nodes, cell = 28) {
  const map = new Map()
  nodes.forEach((n) => {
    const key = `${Math.floor(n.x / cell)}_${Math.floor(n.y / cell)}`
    const bucket = map.get(key)
    if (bucket) bucket.push(n)
    else map.set(key, [n])
  })
  return { map, cell }
}

function walkEdgeCells(x0, y0, x1, y1, cell, visit) {
  let i = Math.floor(x0 / cell)
  let j = Math.floor(y0 / cell)
  const i1 = Math.floor(x1 / cell)
  const j1 = Math.floor(y1 / cell)
  visit(i, j)
  if (i === i1 && j === j1) return
  const dx = x1 - x0
  const dy = y1 - y0
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const tDeltaX = stepX === 0 ? Infinity : cell / adx
  const tDeltaY = stepY === 0 ? Infinity : cell / ady
  let tMaxX = stepX === 0 ? Infinity : ((stepX > 0 ? (i + 1) * cell - x0 : x0 - i * cell) / adx)
  let tMaxY = stepY === 0 ? Infinity : ((stepY > 0 ? (j + 1) * cell - y0 : y0 - j * cell) / ady)
  const maxSteps = Math.abs(i1 - i) + Math.abs(j1 - j) + 2
  for (let s = 0; s < maxSteps && (i !== i1 || j !== j1); s += 1) {
    if (tMaxX < tMaxY) {
      i += stepX
      tMaxX += tDeltaX
    } else {
      j += stepY
      tMaxY += tDeltaY
    }
    visit(i, j)
  }
}

export function buildEdgeGrid(nodes, edges, cell = 48) {
  const map = new Map()
  const add = (ci, cj, id) => {
    const key = `${ci}_${cj}`
    const bucket = map.get(key)
    if (bucket) bucket.push(id)
    else map.set(key, [id])
  }
  edges.forEach((e, id) => {
    const sn = nodes[e.s]
    const tn = nodes[e.t]
    walkEdgeCells(sn.x, sn.y, tn.x, tn.y, cell, (ci, cj) => add(ci, cj, id))
  })
  return { map, cell }
}

export function queryEdgeIds(grid, x0, y0, x1, y1, into) {
  const ids = into || new Set()
  ids.clear()
  if (!grid) return ids
  const i0 = Math.floor(x0 / grid.cell)
  const i1 = Math.floor(x1 / grid.cell)
  const j0 = Math.floor(y0 / grid.cell)
  const j1 = Math.floor(y1 / grid.cell)
  for (let i = i0; i <= i1; i += 1) {
    for (let j = j0; j <= j1; j += 1) {
      const bucket = grid.map.get(`${i}_${j}`)
      if (!bucket) continue
      for (let n = 0; n < bucket.length; n += 1) ids.add(bucket[n])
    }
  }
  return ids
}

export function buildHullPath(hull) {
  const p = new Path2D()
  hull.forEach((pt, i) => {
    if (i) p.lineTo(pt[0], pt[1])
    else p.moveTo(pt[0], pt[1])
  })
  p.closePath()
  return p
}

export { nodeVisible }
