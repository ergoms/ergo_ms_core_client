import {
  mean,
  min as d3min,
  max as d3max,
  quadtree,
  polygonHull,
  polygonContains,
  zoom,
  zoomIdentity,
  select as d3select,
} from 'd3'
import {
  createAtlasRenderer,
  buildNodeGrid,
  buildEdgeGrid,
  buildHullPath,
  nodeVisible,
} from './draw.js'
import {
  TER, DEFAULT_STRINGS, localXY, reducedMotion,
  pickSimilarBridges, EDGE_KIND_SIMILAR, leafLeafCrossCluster,
} from './shared.js'

function kindsToFlags(kinds) {
  if (!kinds) return [true, true, true]
  return [kinds === 'composed_of', kinds === 'includes', kinds === 'similar']
}

function emptyApi() {
  return {
    destroy() {},
    selectById() { return false },
    unselect() {},
    flyToCluster() {},
    setFilters() {},
    setEgoIds() {},
    setAreas() {},
    zoomBy() {},
    fit() {},
    resize() {},
  }
}

function normalizeEgoIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return []
  return ids.map((id) => String(id || '')).filter(Boolean)
}

function cssZoom(base, next) {
  const k = next.k / base.k
  const x = next.x - base.x * k
  const y = next.y - base.y * k
  return `translate3d(${x}px, ${y}px, 0) scale(${k})`
}

export function mountGraphAtlas(root, options = {}) {
  const s = { ...DEFAULT_STRINGS, ...(options.strings || {}) }
  let onSel = options.onSelect || null
  const RAW = options.data
  if (!RAW?.nodes || !RAW?.edges) return emptyApi()

  const cssKeys = ['paper', 'paper-2', 'ink', 'muted', 'line', 'hub', 'leaf', 'sim', 'inc', 'cmp', 'sel']
  const css = {}
  const readCss = () => {
    const st = getComputedStyle(root)
    cssKeys.forEach((key) => { css[key] = st.getPropertyValue(`--${key}`).trim() })
    state.uiFont = st.fontFamily || 'system-ui, sans-serif'
    state.cartoFont = st.getPropertyValue('--carto').trim() || 'Georgia, "Times New Roman", serif'
  }

  let nodes = []
  let edges = []
  let clusters = []
  let areaMode = options.filters?.areas === 'groups' ? 'groups' : 'links'

  function loadNodes() {
    nodes = RAW.nodes.map((n, i) => ({
      i, id: n[0], name: n[1], hub: n[2] === 1,
      lcl: n[3], lx: n[4], ly: n[5],
      occ: n[6], deg: n[7], iso: !n[7], grp: n[8], lvl: n[9], desc: n[10], syn: false,
      gcl: n.length > 11 ? n[11] : n[3],
      gx: n.length > 12 ? n[12] : n[4],
      gy: n.length > 13 ? n[13] : n[5],
      cl: n[3], x: n[4], y: n[5],
    }))
    edges = RAW.edges.map((e) => ({ s: e[0], t: e[1], k: e[2], w: e[3] }))
  }
  loadNodes()

  function applyAreaPositions() {
    const useG = areaMode === 'groups'
    nodes.forEach((n) => {
      n.cl = useG ? n.gcl : n.lcl
      n.x = useG ? n.gx : n.lx
      n.y = useG ? n.gy : n.ly
    })
  }

  function loadClusters() {
    const src = (areaMode === 'groups' && RAW.group_clusters?.length)
      ? RAW.group_clusters
      : RAW.clusters
    clusters = src.map((c, i) => ({ ...c, i, col: TER[i % TER.length] }))
  }

  let adj = []
  let corr = []
  let edgeGrid = null
  let qt
  let labelOrder = []
  const init = options.filters || {}
  const F = {
    k: kindsToFlags(init.kinds),
    wmin: Number(init.wmin) || 0,
    iso: Boolean(init.iso),
    layers: init.layers || 'both',
    match: null,
    allEdges: Boolean(init.allEdges),
    egoIds: normalizeEgoIds(options.egoIds),
    ego: null,
  }
  const ok = (e) => F.k[e.k] && e.w >= F.wmin - 1e-9
  const R = (n) => (n.hub ? 3.2 + Math.sqrt(n.deg) * 0.55 : 1.6 + Math.sqrt(n.deg) * 0.42)
  const vis = (n) => nodeVisible(n, F, clusters, state.sel)

  function applyQuery(query) {
    const v = String(query || '').trim().toLowerCase()
    if (!v) {
      F.match = null
      return
    }
    const hit = new Set()
    nodes.forEach((n) => {
      if (!n.syn && n.name.toLowerCase().includes(v)) hit.add(n.i)
    })
    F.match = hit
  }
  applyQuery(init.query)

  function applyEgo() {
    const ids = F.egoIds
    if (!ids.length) {
      F.ego = null
      return
    }
    const seeds = []
    const idSet = new Set(ids)
    nodes.forEach((n) => {
      if (idSet.has(n.id)) seeds.push(n.i)
    })
    if (!seeds.length) {
      F.ego = null
      return
    }
    const ego = new Set(seeds)
    seeds.forEach((i) => {
      (adj[i] || []).forEach((j) => {
        const e = edges[j]
        if (!ok(e)) return
        ego.add(e.s === i ? e.t : e.s)
      })
    })
    F.ego = ego
  }

  function rebatch() {
    if (F.ego) {
      state.simBridges = new Set()
      corr = []
      return
    }
    const full = Boolean(F.allEdges)
    const bridges = full ? new Set() : pickSimilarBridges(nodes, edges, ok, vis)
    state.simBridges = bridges
    const agg = {}
    edges.forEach((e, j) => {
      if (!ok(e)) return
      const a = nodes[e.s].cl
      const b = nodes[e.t].cl
      if (a === b) return
      if (!full && leafLeafCrossCluster(nodes[e.s], nodes[e.t])) return
      if (!vis(nodes[e.s]) || !vis(nodes[e.t])) return
      const isSimBridge = e.k === EDGE_KIND_SIMILAR && (full || bridges.has(j))
      if (e.k === EDGE_KIND_SIMILAR && !full && !isSimBridge) return
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      const g = agg[key] || (agg[key] = {
        a: Math.min(a, b), b: Math.max(a, b), n: 0, w: 0, sim: 0,
      })
      g.n += 1
      g.w += e.w
      if (isSimBridge) g.sim += 1
    })
    corr = Object.values(agg).filter((g) => g.n >= 2 || g.sim > 0).sort((x, y) => x.w - y.w)
  }

  function syncState() {
    state.nodes = nodes
    state.edges = edges
    state.clusters = clusters
    state.adj = adj
    state.corr = corr
    state.ok = ok
    state.labelOrder = labelOrder
    state.grid = buildNodeGrid(nodes)
    state.edgeGrid = edgeGrid
    state.areaMode = areaMode
  }

  function prepHulls() {
    clusters.forEach((c) => {
      c.mem = nodes.filter((n) => n.cl === c.i && (!F.ego || F.ego.has(n.i)))
      const pts = c.mem.map((n) => [n.x, n.y])
      if (!pts.length) {
        Object.assign(c, {
          cx: 0, cy: 0, hull: null, hullPath: null,
          bx0: 0, by0: 0, bx1: 0, by1: 0, hubCount: 0, leafCount: 0,
        })
        return
      }
      c.cx = mean(pts, (p) => p[0])
      c.cy = mean(pts, (p) => p[1])
      const ex = []
      pts.forEach((p) => {
        for (let a = 0; a < 12; a += 1) {
          ex.push([p[0] + Math.cos(a * Math.PI / 6) * 14, p[1] + Math.sin(a * Math.PI / 6) * 14])
        }
      })
      c.hull = polygonHull(ex)
      if (!c.hull) {
        const x = c.cx || 0
        const y = c.cy || 0
        c.hull = [[x - 18, y], [x, y - 18], [x + 18, y], [x, y + 18]]
      }
      c.hullPath = buildHullPath(c.hull)
      let bx0 = Infinity
      let by0 = Infinity
      let bx1 = -Infinity
      let by1 = -Infinity
      c.hull.forEach(([x, y]) => {
        if (x < bx0) bx0 = x
        if (y < by0) by0 = y
        if (x > bx1) bx1 = x
        if (y > by1) by1 = y
      })
      c.bx0 = bx0
      c.by0 = by0
      c.bx1 = bx1
      c.by1 = by1
      c.hubCount = c.mem.filter((n) => n.hub).length
      c.leafCount = c.mem.length - c.hubCount
    })
  }

  function prep() {
    adj = nodes.map(() => [])
    edges.forEach((e, j) => { adj[e.s].push(j); adj[e.t].push(j) })
    applyEgo()
    prepHulls()
    qt = quadtree(nodes, (n) => n.x, (n) => n.y)
    labelOrder = nodes.slice().sort((a, b) => (b.hub - a.hub) || (b.deg - a.deg) || (b.occ - a.occ))
    edgeGrid = buildEdgeGrid(nodes, edges)
    rebatch()
    syncState()
  }

  const cv = root.querySelector('canvas.atlas__map')
  if (!cv) return emptyApi()
  const view = cv.parentElement || root
  const ctx = cv.getContext('2d', { alpha: false, desynchronized: true })
    || cv.getContext('2d')
  const state = {
    ctx,
    css,
    nodes,
    edges,
    clusters,
    corr,
    adj,
    F,
    sel: null,
    nbSet: null,
    T: zoomIdentity,
    W: 0,
    H: 0,
    DPR: 1,
    R,
    labelOrder,
    root,
    s,
    wcache: new Map(),
    ok,
    lod: 'full',
    detail: 'full',
    grid: null,
    edgeGrid: null,
    edgeIdBuf: new Set(),
    areaMode,
    simBridges: new Set(),
    uiFont: 'system-ui, sans-serif',
    cartoFont: 'Georgia, "Times New Roman", serif',
  }
  const renderer = createAtlasRenderer(state)
  let raf = 0
  let detailRaf = 0
  let commitTimer = 0
  let gestureBase = null
  function clearCssZoom() {
    cv.style.transform = ''
    cv.style.willChange = ''
    gestureBase = null
  }
  function cancelDetail() {
    if (detailRaf) {
      cancelAnimationFrame(detailRaf)
      detailRaf = 0
    }
  }
  function cancelCommit() {
    window.clearTimeout(commitTimer)
    commitTimer = 0
  }
  function beginNav() {
    cancelCommit()
    cancelDetail()
    if (state.lod !== 'nav') {
      gestureBase = state.T
      state.lod = 'nav'
      cv.style.transformOrigin = '0 0'
      cv.style.willChange = 'transform'
    }
    cv.classList.add('drag')
  }
  function commitGesture() {
    cancelCommit()
    cv.classList.remove('drag')
    if (state.lod !== 'nav') {
      clearCssZoom()
      return
    }
    state.lod = 'full'
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    cancelDetail()
    state.detail = 'lite'
    renderer.render()
    clearCssZoom()
    detailRaf = requestAnimationFrame(() => {
      detailRaf = 0
      if (state.lod === 'nav') return
      state.detail = 'full'
      renderer.render()
    })
  }
  function scheduleCommit() {
    cancelCommit()
    commitTimer = window.setTimeout(() => {
      commitTimer = 0
      commitGesture()
    }, 80)
  }
  function draw() {
    if (state.lod === 'nav') return
    cancelDetail()
    state.detail = 'full'
    if (raf) return
    raf = requestAnimationFrame(() => { raf = 0; renderer.render() })
  }
  let sizeTimer = 0
  function size() {
    if (state.lod === 'nav') commitGesture()
    else clearCssZoom()
    state.lod = 'full'
    state.DPR = Math.min(1.25, window.devicePixelRatio || 1)
    state.W = Math.max(1, view.clientWidth || root.clientWidth)
    state.H = Math.max(1, view.clientHeight || root.clientHeight)
    cv.width = Math.round(state.W * state.DPR)
    cv.height = Math.round(state.H * state.DPR)
    cv.style.width = `${state.W}px`
    cv.style.height = `${state.H}px`
    draw()
  }
  function sizeSoon() {
    window.clearTimeout(sizeTimer)
    sizeTimer = window.setTimeout(size, 60)
  }

  const zoomBehavior = zoom().scaleExtent([0.2, 8]).duration(0)
    .filter((ev) => !ev.target?.closest?.('.ag__zoom, .atlas__panel, button, input, a'))
    .on('start', beginNav)
    .on('end', scheduleCommit)
    .on('zoom', (ev) => {
      if (state.lod !== 'nav' || !gestureBase) beginNav()
      state.T = ev.transform
      if (gestureBase) {
        cv.style.transform = cssZoom(gestureBase, ev.transform)
        return
      }
      draw()
    })
  d3select(view).call(zoomBehavior).on('dblclick.zoom', null)

  function zoomTo(transform, anim) {
    const selView = d3select(view)
    if (anim && !reducedMotion()) selView.transition().duration(anim).call(zoomBehavior.transform, transform)
    else selView.call(zoomBehavior.transform, transform)
  }
  function fit(anim) {
    let pts = nodes.filter(vis)
    if (!pts.length) pts = nodes
    else if (F.ego) {
      const seed = pts.find((n) => F.egoIds.includes(n.id)) || pts[0]
      const local = pts.filter((n) => n.cl === seed.cl)
      pts = local.length >= 2 ? local : [seed]
    }
    const xs = pts.map((n) => n.x)
    const ys = pts.map((n) => n.y)
    const x0 = d3min(xs)
    const x1 = d3max(xs)
    const y0 = d3min(ys)
    const y1 = d3max(ys)
    const pad = F.ego ? 80 : 56
    const dx = Math.max(40, x1 - x0)
    const dy = Math.max(40, y1 - y0)
    const sc = Math.min(state.W / (dx + pad), state.H / (dy + pad), 8)
    zoomTo(zoomIdentity.translate(state.W / 2, state.H / 2).scale(sc).translate(-(x0 + x1) / 2, -(y0 + y1) / 2), anim ? 240 : 0)
  }
  function zoomBy(factor) {
    const next = Math.min(8, Math.max(0.2, state.T.k * factor))
    const t = state.T
    const cx = (state.W / 2 - t.x) / t.k
    const cy = (state.H / 2 - t.y) / t.k
    zoomTo(zoomIdentity.translate(state.W / 2, state.H / 2).scale(next).translate(-cx, -cy), 160)
  }
  function pick(mx, my) {
    const x = (mx - state.T.x) / state.T.k
    const y = (my - state.T.y) / state.T.k
    const n = qt.find(x, y, 12 / state.T.k + 3)
    if (!n || !vis(n)) return null
    return n
  }

  const tip = root.querySelector('.atlas__tip')
  let moveRaf = 0
  let lastMove = null
  const onMove = (ev) => {
    lastMove = ev
    if (moveRaf) return
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0
      const e = lastMove
      lastMove = null
      if (!e || state.lod === 'nav') {
        if (tip) tip.style.display = 'none'
        return
      }
      const [mx, my] = localXY(view, e)
      const n = pick(mx, my)
      if (n) {
        tip.style.display = 'block'
        tip.textContent = n.name
        tip.style.left = `${Math.min(mx + 14, state.W - 330)}px`
        tip.style.top = `${my + 14}px`
        cv.style.cursor = 'pointer'
      } else {
        tip.style.display = 'none'
        cv.style.cursor = ''
      }
    })
  }
  const onLeave = () => { if (tip) tip.style.display = 'none' }
  let downAt = null
  const onDown = (e) => { downAt = [e.clientX, e.clientY] }
  const onClick = (ev) => {
    if (downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return
    const [mx, my] = localXY(view, ev)
    const n = pick(mx, my)
    if (n) { select(n.i); return }
    if (state.T.k < 1.1) {
      const x = (mx - state.T.x) / state.T.k
      const y = (my - state.T.y) / state.T.k
      const c = clusters.find((cl) => (!cl.iso || F.iso) && polygonContains(cl.hull, [x, y]))
        || clusters.reduce((best, cl) => {
          const d = Math.hypot(cl.cx - x, cl.cy - y)
          return d < best.d ? { c: cl, d } : best
        }, { c: null, d: 1e9 }).c
      if (c) flyToCluster(c)
      return
    }
    if (state.sel !== null) unselect()
  }

  function flyToCluster(c) {
    if (!c?.hull) return
    const xs = c.hull.map((p) => p[0])
    const ys = c.hull.map((p) => p[1])
    const x0 = d3min(xs)
    const x1 = d3max(xs)
    const y0 = d3min(ys)
    const y1 = d3max(ys)
    const sc = Math.max(1.6, Math.min(4, Math.min(state.W / (x1 - x0 + 120), state.H / (y1 - y0 + 120))))
    zoomTo(zoomIdentity.translate(state.W / 2, state.H / 2).scale(sc).translate(-(x0 + x1) / 2, -(y0 + y1) / 2), 240)
  }
  function flyTo(n, scale) {
    const sc = scale || Math.max(state.T.k, 2.2)
    zoomTo(zoomIdentity.translate(state.W / 2, state.H / 2).scale(sc).translate(-n.x, -n.y), 240)
  }

  function relationGroups(i) {
    const n = nodes[i]
    const defs = [
      { key: 'cmp', title: s.groupComposed, f: (e) => e.k === 0 && e.s === i, col: css.cmp, dash: false },
      { key: 'inHub', title: s.groupInHub, f: (e) => e.k === 0 && e.t === i, col: css.cmp, dash: false },
      { key: 'inc', title: s.groupIncludes, f: (e) => e.k === 1 && e.s === i, col: css.inc, dash: false },
      { key: 'inInc', title: s.groupIncludedIn, f: (e) => e.k === 1 && e.t === i, col: css.inc, dash: false },
      {
        key: 'sim',
        title: n.hub ? s.groupSimilarHub : s.groupSimilarLeaf,
        f: (e) => e.k === 2,
        col: css.sim,
        dash: true,
      },
    ]
    return defs.map((g) => {
      const es = adj[i].map((j) => edges[j]).filter((e) => {
        if (!ok(e) || !g.f(e)) return false
        const o = nodes[e.s === i ? e.t : e.s]
        return !F.ego || F.ego.has(o.i)
      }).sort((a, b) => b.w - a.w)
      return {
        title: g.title,
        col: g.col,
        dash: g.dash,
        items: es.slice(0, 60).map((e) => {
          const o = nodes[e.s === i ? e.t : e.s]
          return { id: o.id, name: o.name, w: e.w }
        }),
        more: Math.max(0, es.length - 60),
      }
    }).filter((g) => g.items.length)
  }

  function selectedPayload(i) {
    const n = nodes[i]
    const cl = clusters[n.cl]
    const area = cl?.iso ? s.isolatedArea : (cl?.name || '')
    return {
      public_id: n.id,
      name: n.name,
      hub: n.hub,
      level: n.lvl,
      desc: n.desc,
      area,
      syn: n.syn,
      groups: relationGroups(i),
    }
  }

  function select(i, fly = false) {
    state.sel = i
    state.nbSet = new Set()
    adj[i].forEach((j) => {
      const e = edges[j]
      if (ok(e)) state.nbSet.add(e.s === i ? e.t : e.s)
    })
    if (typeof onSel === 'function') onSel(selectedPayload(i))
    if (fly) {
      requestAnimationFrame(() => flyTo(nodes[i]))
      return
    }
    draw()
  }
  function unselect() {
    state.sel = null
    state.nbSet = null
    draw()
    if (typeof onSel === 'function') onSel(null)
  }

  const onKey = (e) => { if (e.key === 'Escape') unselect() }

  function emitSelected() {
    if (state.sel === null) return
    if (typeof onSel === 'function') onSel(selectedPayload(state.sel))
  }

  function setFilters(patch = {}) {
    if (patch.kinds !== undefined) F.k = kindsToFlags(patch.kinds)
    if (patch.layers !== undefined) F.layers = patch.layers || 'both'
    if (patch.wmin !== undefined) F.wmin = Number(patch.wmin) || 0
    if (patch.iso !== undefined) F.iso = Boolean(patch.iso)
    if (patch.allEdges !== undefined) F.allEdges = Boolean(patch.allEdges)
    if (patch.query !== undefined) applyQuery(patch.query)
    if (F.egoIds.length) {
      applyEgo()
      prepHulls()
    }
    rebatch()
    syncState()
    if (state.sel !== null) {
      if (!vis(nodes[state.sel])) {
        unselect()
        return
      }
      state.nbSet = new Set()
      adj[state.sel].forEach((j) => {
        const e = edges[j]
        if (ok(e)) state.nbSet.add(e.s === state.sel ? e.t : e.s)
      })
      emitSelected()
    }
    draw()
  }

  function setAreas(mode) {
    const next = mode === 'groups' ? 'groups' : 'links'
    if (next === areaMode && clusters.length) return
    areaMode = next
    applyAreaPositions()
    loadClusters()
    prep()
    if (state.sel !== null) {
      if (!vis(nodes[state.sel])) unselect()
      else emitSelected()
    }
    fit(true)
  }

  const themeObs = new MutationObserver(() => { readCss(); draw() })
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme', 'class'] })
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const onScheme = () => { readCss(); draw() }
  mq.addEventListener('change', onScheme)
  const ro = new ResizeObserver(() => sizeSoon())
  ro.observe(root)
  view.addEventListener('pointermove', onMove, { passive: true })
  view.addEventListener('mouseleave', onLeave)
  view.addEventListener('pointerdown', onDown)
  view.addEventListener('click', onClick)
  addEventListener('keydown', onKey)

  readCss()
  applyAreaPositions()
  loadClusters()
  prep()
  size()
  fit(false)
  if (document.fonts) document.fonts.ready.then(() => { renderer.clearCache(); draw() })

  return {
    selectById(id, fly = false) {
      const n = nodes.find((node) => node.id === id)
      if (!n) return false
      if (state.sel === n.i) return true
      select(n.i, fly)
      return true
    },
    flyToCluster: (i) => flyToCluster(clusters[i]),
    unselect,
    setFilters,
    setEgoIds(ids) {
      const next = normalizeEgoIds(ids)
      if (next.length === F.egoIds.length && next.every((id, i) => id === F.egoIds[i])) return
      F.egoIds = next
      applyEgo()
      prepHulls()
      rebatch()
      syncState()
      if (state.sel !== null && !vis(nodes[state.sel])) unselect()
      fit(false)
      draw()
    },
    setAreas,
    zoomBy,
    fit: () => fit(true),
    resize: size,
    set onSelect(fn) { onSel = fn },
    get onSelect() { return onSel },
    destroy() {
      themeObs.disconnect()
      ro.disconnect()
      window.clearTimeout(sizeTimer)
      cancelCommit()
      if (raf) cancelAnimationFrame(raf)
      cancelDetail()
      if (moveRaf) cancelAnimationFrame(moveRaf)
      mq.removeEventListener('change', onScheme)
      view.removeEventListener('pointermove', onMove)
      view.removeEventListener('mouseleave', onLeave)
      view.removeEventListener('pointerdown', onDown)
      view.removeEventListener('click', onClick)
      removeEventListener('keydown', onKey)
      d3select(view).interrupt().on('.zoom', null)
      clearCssZoom()
    },
  }
}

