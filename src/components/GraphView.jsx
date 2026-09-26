import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'

/* ---------------------------------------------------------------- palette
   Type colours are derived from the type name, so any ontology — shipped or
   invented this afternoon — gets a stable palette with no colour map to keep.
   Spine colours are fixed, because the spine is a fixed, shared vocabulary. */
const TYPE_PALETTE = ['#4FD1C5', '#63B3ED', '#F6AD55', '#FC8181', '#B794F4',
  '#F687B3', '#68D391', '#F6E05E', '#90CDF4', '#FBB6CE', '#9AE6B4', '#FEB2B2',
  '#D6BCFA', '#81E6D9']
const hashColour = (s) => {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973
  return TYPE_PALETTE[h % TYPE_PALETTE.length]
}
const SPINE_COLOURS = {
  Person: '#63B3ED', Asset: '#F6AD55', Vendor: '#FC8181', Location: '#68D391',
  Process: '#B794F4', Document: '#F6E05E', Organisation: '#4FD1C5', Event: '#F687B3',
}
const NO_SPINE = '#718096'
// Ring colour by distance from the traced entity: the cascade reads outward.
const HOP_COLOURS = ['#FFFFFF', '#FFD166', '#FF9F43', '#FF5C8A', '#B388FF']
const HOP_LABEL = ['Selected', '1 hop — direct', '2 hops', '3 hops', '4 hops']

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const radiusFor = (degree) => clamp(2.5 + 3.4 * Math.sqrt(degree || 1), 4, 30)
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/* ------------------------------------------------------------ Barnes-Hut
   Repulsion between every pair is O(n²), which is why the old view stopped at
   350 nodes. A quadtree lets distant clusters act as one mass, bringing each
   tick to O(n log n) — the difference between a few hundred nodes and a few
   thousand at interactive frame rates. */
function buildTree(nodes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of nodes) {
    if (n.x < x0) x0 = n.x; if (n.y < y0) y0 = n.y
    if (n.x > x1) x1 = n.x; if (n.y > y1) y1 = n.y
  }
  const size = Math.max(x1 - x0, y1 - y0, 1) + 2
  const root = { x0: x0 - 1, y0: y0 - 1, size, mass: 0, cx: 0, cy: 0, body: null, kids: null }
  const insert = (q, n, depth) => {
    if (q.mass === 0 && !q.kids) {            // empty leaf
      q.body = n; q.mass = 1; q.cx = n.x; q.cy = n.y; return
    }
    if (!q.kids) {                             // occupied leaf: split
      if (depth > 40) { q.mass += 1; return }  // coincident points: stack
      const half = q.size / 2
      q.kids = [0, 1, 2, 3].map((i) => ({
        x0: q.x0 + (i % 2) * half, y0: q.y0 + (i > 1 ? half : 0), size: half,
        mass: 0, cx: 0, cy: 0, body: null, kids: null,
      }))
      const old = q.body; q.body = null
      place(q, old, depth)
    }
    place(q, n, depth)
    q.cx = (q.cx * q.mass + n.x) / (q.mass + 1)
    q.cy = (q.cy * q.mass + n.y) / (q.mass + 1)
    q.mass += 1
  }
  const place = (q, n, depth) => {
    const half = q.size / 2
    const i = (n.x >= q.x0 + half ? 1 : 0) + (n.y >= q.y0 + half ? 2 : 0)
    insert(q.kids[i], n, depth + 1)
  }
  for (const n of nodes) insert(root, n, 0)
  return root
}

function repel(q, n, strength, alpha) {
  if (!q || q.mass === 0) return
  const dx = q.cx - n.x, dy = q.cy - n.y
  const d2 = dx * dx + dy * dy
  if (!q.kids || (q.size * q.size) / (d2 || 1) < 0.81) {   // theta = 0.9
    if (q.body === n && !q.kids) return
    const d = Math.sqrt(d2) || 0.5
    const f = (strength * q.mass * alpha) / Math.max(d2, 36)
    n.vx -= (dx / d) * f * d
    n.vy -= (dy / d) * f * d
    return
  }
  for (const k of q.kids) repel(k, n, strength, alpha)
}

function tick(sim) {
  const { nodes, links } = sim
  const alpha = sim.alpha
  const tree = buildTree(nodes)
  for (const n of nodes) repel(tree, n, 42 + 6 * Math.sqrt(n.degree || 1), alpha)
  for (const l of links) {
    const a = l.s, b = l.t
    let dx = b.x - a.x, dy = b.y - a.y
    const d = Math.sqrt(dx * dx + dy * dy) || 0.5
    const want = 26 + 2.2 * (a.r + b.r)
    const f = ((d - want) / d) * 0.07 * alpha
    dx *= f; dy *= f
    b.vx -= dx; b.vy -= dy
    a.vx += dx; a.vy += dy
  }
  for (const n of nodes) {
    n.vx -= n.x * 0.012 * alpha              // gentle pull to centre
    n.vy -= n.y * 0.012 * alpha
    if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue }
    n.vx *= 0.58; n.vy *= 0.58
    n.x += clamp(n.vx, -40, 40); n.y += clamp(n.vy, -40, 40)
  }
  sim.alpha += (0 - sim.alpha) * 0.02
}

/* ================================================================ component */
export default function GraphView({ domain, types }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const simRef = useRef({ nodes: [], links: [], byId: new Map(), alpha: 0 })
  const camRef = useRef({ x: 0, y: 0, k: 1, anim: null })
  const posMemory = useRef(new Map())       // id -> {x,y}, survives refresh
  const drawState = useRef({})              // mirror of UI state for the frame loop
  const interact = useRef({ mode: null, node: null, sx: 0, sy: 0, moved: 0 })
  const dirty = useRef(true)                // set whenever the picture must change
  const pendingFit = useRef(false)          // fit the view once the layout settles
  const fitRef = useRef(() => {})

  const [meta, setMeta] = useState(null)    // counts from the last load
  const [limit, setLimit] = useState(250)
  const [typeFilter, setTypeFilter] = useState('')
  const [colourBy, setColourBy] = useState('type')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [updated, setUpdated] = useState(null)
  const [settling, setSettling] = useState(false)
  const [hover, setHover] = useState(null)
  const [highlightKey, setHighlightKey] = useState(null)
  const [hops, setHops] = useState(2)
  const [focus, setFocus] = useState(null)  // impact result + lookup maps
  const [tracing, setTracing] = useState(false)
  const [pathTo, setPathTo] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [size, setSize] = useState({ w: 900, h: 640 })
  const [legendVersion, setLegendVersion] = useState(0)

  // search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)

  const colourOf = useCallback((n) => (
    colourBy === 'spine' ? (SPINE_COLOURS[n.spine] || NO_SPINE) : hashColour(n.type)
  ), [colourBy])

  /* ------------------------------------------------------------ data load */
  const mergeInto = useCallback((nodesIn, edgesIn, anchorOf) => {
    const sim = simRef.current
    let added = 0
    for (const raw of nodesIn) {
      let n = sim.byId.get(raw.id)
      if (!n) {
        const mem = posMemory.current.get(raw.id)
        const anchor = anchorOf ? sim.byId.get(anchorOf(raw.id)) : null
        const spread = Math.sqrt(Math.max(sim.nodes.length, 20)) * 14
        n = {
          id: raw.id, x: mem ? mem.x : anchor ? anchor.x + (Math.random() - 0.5) * 60
            : (Math.random() - 0.5) * spread,
          y: mem ? mem.y : anchor ? anchor.y + (Math.random() - 0.5) * 60
            : (Math.random() - 0.5) * spread,
          vx: 0, vy: 0, fx: null, fy: null,
        }
        sim.nodes.push(n); sim.byId.set(n.id, n); added++
      }
      n.type = raw.type || n.type || 'unknown'
      n.spine = raw.spine !== undefined ? raw.spine : n.spine
      n.degree = Math.max(raw.degree || 0, n.degree || 0, 1)
      n.evidence = raw.evidence || n.evidence || ''
      n.r = radiusFor(n.degree)
    }
    const have = new Set(sim.links.map((l) => `${l.s.id}|${l.t.id}|${l.relation}`))
    for (const e of edgesIn) {
      const s = sim.byId.get(e.source), t = sim.byId.get(e.target)
      if (!s || !t || s === t) continue
      const key = `${s.id}|${t.id}|${e.relation || ''}`
      if (have.has(key)) continue
      have.add(key)
      sim.links.push({ s, t, relation: e.relation || '' })
    }
    return added
  }, [])

  const load = useCallback(async (isRefresh = false) => {
    setBusy(true); setError(null)
    try {
      const data = await api.visualize(domain, limit, typeFilter || undefined)
      const sim = simRef.current
      const before = new Set(sim.byId.keys())
      for (const n of sim.nodes) posMemory.current.set(n.id, { x: n.x, y: n.y })
      sim.nodes = []; sim.links = []; sim.byId = new Map()
      mergeInto(data.nodes || [], data.edges || [])
      const newIds = (data.nodes || []).filter((n) => !before.has(n.id)).length
      sim.alpha = isRefresh ? 0.6 : 1
      if (isRefresh) {                          // visible re-settle, same layout
        for (const n of sim.nodes) { n.x += (Math.random() - 0.5) * 30; n.y += (Math.random() - 0.5) * 30 }
      }
      setFocus(null); setPathTo(null); setHighlightKey(null)
      setMeta({
        shown: sim.nodes.length, total: data.total_nodes ?? sim.nodes.length,
        edges: sim.links.length, truncated: data.truncated,
        spineDeclared: data.spine_declared, added: isRefresh ? newIds : null,
      })
      setUpdated(new Date())
      setLegendVersion((v) => v + 1)
      if (!isRefresh) pendingFit.current = true
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, limit, typeFilter, mergeInto])

  useEffect(() => { load(false) }, [load])

  /* ------------------------------------------------------------- impact */
  const focusEntity = useCallback(async (id, hopCount = hops) => {
    setTracing(true); setError(null); setShowResults(false); setPathTo(null)
    try {
      const res = await api.impact(domain, id, hopCount, Math.min(1500, 400 * hopCount))
      if (!res.found) {
        setFocus({ notFound: true, note: res.note, suggestions: res.suggestions || [] })
        return
      }
      // via-map gives each reached entity the node it was reached through,
      // which is both where to place it and how to draw the path back.
      const via = new Map()
      for (const items of Object.values(res.by_distance || {})) {
        for (const it of items) via.set(it.id, it)
      }
      mergeInto(res.nodes || [], res.edges || [], (nid) => via.get(nid)?.via)
      const dist = new Map((res.nodes || []).map((n) => [n.id, n.distance]))
      dist.set(res.entity, 0)
      simRef.current.alpha = Math.max(simRef.current.alpha, 0.35)
      setFocus({ ...res, dist, via, started: performance.now() })
      setMeta((m) => m && { ...m, shown: simRef.current.nodes.length, edges: simRef.current.links.length })
      setLegendVersion((v) => v + 1)
      setTimeout(() => flyTo(res.entity, 1.5), 60)
    } catch (err) { setError(err.message) } finally { setTracing(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, hops, mergeInto])

  const clearFocus = () => { setFocus(null); setPathTo(null) }

  // Changing the hop count while an entity is traced re-traces it.
  useEffect(() => {
    if (focus?.entity) focusEntity(focus.entity, hops)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hops])

  /* ------------------------------------------------------------- search */
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try { setResults(await api.graphSearch(domain, q, 12)); setShowResults(true) }
      catch { setResults([]) }
    }, 220)
    return () => clearTimeout(t)
  }, [query, domain])

  /* -------------------------------------------------------------- camera */
  const toWorld = (sx, sy) => {
    const c = camRef.current
    const { w, h } = drawState.current.size
    return { x: (sx - w / 2 - c.x) / c.k, y: (sy - h / 2 - c.y) / c.k }
  }
  const animateCam = (tx, ty, tk, ms = 650) => {
    const c = camRef.current
    c.anim = { from: { x: c.x, y: c.y, k: c.k }, to: { x: tx, y: ty, k: tk }, t0: performance.now(), ms }
  }
  const flyTo = (id, minK = 1.4) => {
    const n = simRef.current.byId.get(id)
    if (!n) return
    const k = Math.max(camRef.current.k, minK)
    animateCam(-n.x * k, -n.y * k, k)
  }
  const fitView = (ms = 650) => {
    const sim = simRef.current
    const live = drawState.current.focus
    const { w: vw, h: vh } = drawState.current.size
    const set = live?.dist ? sim.nodes.filter((n) => live.dist.has(n.id)) : sim.nodes
    if (!set.length) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of set) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y)
      x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y)
    }
    const k = clamp(Math.min(vw / (x1 - x0 + 120), vh / (y1 - y0 + 120)), 0.08, 3)
    if (ms <= 0) {
      const c = camRef.current
      c.anim = null; c.k = k; c.x = -((x0 + x1) / 2) * k; c.y = -((y0 + y1) / 2) * k
      return
    }
    animateCam(-((x0 + x1) / 2) * k, -((y0 + y1) / 2) * k, k, ms)
  }

  fitRef.current = fitView

  /* ----------------------------------------------------- mirror to frame */
  drawState.current = { colourOf, hover, highlightKey, focus, pathTo, colourBy, size }
  dirty.current = true

  /* --------------------------------------------------------- frame loop */
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf, lastSettleFlag = null
    const frame = () => {
      const sim = simRef.current
      const cam = camRef.current
      const st = drawState.current
      const { w, h } = st.size
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr) }

      // layout: spend up to ~10ms per frame on physics
      if (sim.alpha > 0.004) {
        const t0 = performance.now()
        do { tick(sim) } while (performance.now() - t0 < 10 && sim.alpha > 0.004)
      }
      const settlingNow = sim.alpha > 0.004
      if (settlingNow !== lastSettleFlag) { lastSettleFlag = settlingNow; setSettling(settlingNow) }
      // Fit early (so the first view is framed) and again once settled.
      if (pendingFit.current && (!settlingNow || sim.alpha < 0.08)) {
        if (!settlingNow) pendingFit.current = false
        fitRef.current(!settlingNow ? 500 : 0)
      }

      // Nothing moving and nothing changed: skip the draw. Keeps an idle
      // graph from burning CPU, which matters on a small VM.
      const animating = sim.alpha > 0.004 || cam.anim || (st.focus && st.focus.dist)
      if (!animating && !dirty.current) { raf = requestAnimationFrame(frame); return }
      dirty.current = false

      if (cam.anim) {
        const p = clamp((performance.now() - cam.anim.t0) / cam.anim.ms, 0, 1)
        const e = ease(p)
        cam.x = cam.anim.from.x + (cam.anim.to.x - cam.anim.from.x) * e
        cam.y = cam.anim.from.y + (cam.anim.to.y - cam.anim.from.y) * e
        cam.k = cam.anim.from.k + (cam.anim.to.k - cam.anim.from.k) * e
        if (p >= 1) cam.anim = null
      }

      // background
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.75)
      g.addColorStop(0, '#16213E'); g.addColorStop(1, '#0A0F1F')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)

      ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * (w / 2 + cam.x), dpr * (h / 2 + cam.y))
      const px = 1 / cam.k                     // one screen pixel in world units
      const focus = st.focus?.dist ? st.focus : null
      const now = performance.now()
      const reveal = (n) => {                  // cascade: hop d lights up after d*320ms
        if (!focus) return 1
        const d = focus.dist.get(n.id)
        if (d === undefined) return 0
        return clamp((now - focus.started - d * 320) / 320, 0, 1)
      }
      const keyOf = (n) => (st.colourBy === 'spine' ? (n.spine || '(no spine)') : n.type)
      const dimmed = (n) => (focus ? !focus.dist.has(n.id)
        : st.highlightKey ? keyOf(n) !== st.highlightKey : false)

      // --- edges
      ctx.lineWidth = 0.7 * px
      ctx.strokeStyle = focus || st.highlightKey ? 'rgba(120,140,190,0.05)' : 'rgba(130,160,220,0.22)'
      ctx.beginPath()
      for (const l of sim.links) {
        if (focus && focus.dist.has(l.s.id) && focus.dist.has(l.t.id)) continue
        ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y)
      }
      ctx.stroke()
      if (focus) {
        for (let d = 4; d >= 1; d--) {
          ctx.strokeStyle = HOP_COLOURS[d]
          ctx.lineWidth = 1.3 * px
          ctx.beginPath()
          for (const l of sim.links) {
            const ds = focus.dist.get(l.s.id), dt = focus.dist.get(l.t.id)
            if (ds === undefined || dt === undefined || Math.max(ds, dt) !== d) continue
            const a = Math.min(reveal(l.s), reveal(l.t))
            if (a <= 0) continue
            ctx.globalAlpha = 0.55 * a
            ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y)
          }
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
      // hovered node's edges stand out
      if (st.hover) {
        const hn = sim.byId.get(st.hover.id)
        if (hn) {
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4 * px
          ctx.beginPath()
          for (const l of sim.links) if (l.s === hn || l.t === hn) { ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y) }
          ctx.stroke()
        }
      }
      // traced path back to the selected entity
      if (st.pathTo && focus) {
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3 * px
        ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = 12
        ctx.beginPath()
        let cur = st.pathTo, guard = 0
        while (cur && cur !== focus.entity && guard++ < 6) {
          const step = focus.via.get(cur)
          const a = sim.byId.get(cur), b = step && sim.byId.get(step.via)
          if (!a || !b) break
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
          cur = step.via
        }
        ctx.stroke(); ctx.shadowBlur = 0
      }

      // --- nodes: batched by colour for speed, dimmed ones first
      const groups = new Map()
      for (const n of sim.nodes) {
        const faint = dimmed(n)
        const key = (faint ? 'd' : 'b') + st.colourOf(n)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(n)
      }
      for (const [key, list] of groups) {
        const faint = key[0] === 'd'
        ctx.fillStyle = key.slice(1)
        ctx.globalAlpha = faint ? 0.1 : 1
        ctx.beginPath()
        for (const n of list) {
          const a = faint ? 1 : reveal(n)
          if (!faint && a < 1 && focus) continue   // drawn below with its own alpha
          const rr = Math.max(n.r, 2.4 * px)
          ctx.moveTo(n.x + rr, n.y); ctx.arc(n.x, n.y, rr, 0, Math.PI * 2)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (focus) {
        for (const n of sim.nodes) {           // nodes still fading in, and hop rings
          const d = focus.dist.get(n.id)
          if (d === undefined) continue
          const a = reveal(n)
          if (a <= 0) continue
          ctx.globalAlpha = a
          if (a < 1) { ctx.fillStyle = st.colourOf(n); ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill() }
          ctx.strokeStyle = HOP_COLOURS[d]; ctx.lineWidth = (d === 0 ? 3 : 2) * px
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 2.5 * px, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.globalAlpha = 1
        const fnode = sim.byId.get(focus.entity)
        if (fnode) {                           // expanding ripple from the selection
          for (let i = 0; i < 3; i++) {
            const t = ((now - focus.started) / 2400 + i / 3) % 1
            ctx.strokeStyle = `rgba(255,209,102,${0.5 * (1 - t)})`
            ctx.lineWidth = 2 * px
            ctx.beginPath(); ctx.arc(fnode.x, fnode.y, fnode.r + t * 140, 0, Math.PI * 2); ctx.stroke()
          }
          ctx.shadowColor = '#FFD166'; ctx.shadowBlur = 24
          ctx.fillStyle = '#FFFFFF'
          ctx.beginPath(); ctx.arc(fnode.x, fnode.y, fnode.r * 0.45, 0, Math.PI * 2); ctx.fill()
          ctx.shadowBlur = 0
        }
      } else {
        // soft glow on the busiest hubs gives the picture a focal structure
        const hubs = [...sim.nodes].sort((a, b) => b.degree - a.degree).slice(0, 15)
        for (const n of hubs) {
          if (dimmed(n)) continue
          const c = st.colourOf(n)
          ctx.shadowColor = c; ctx.shadowBlur = 26
          ctx.fillStyle = c
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill()
          ctx.shadowBlur = 0
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6 * px
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3 * px, 0, Math.PI * 2); ctx.stroke()
        }
      }
      if (st.hover) {
        const hn = sim.byId.get(st.hover.id)
        if (hn) {
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2 * px
          ctx.beginPath(); ctx.arc(hn.x, hn.y, hn.r + 3 * px, 0, Math.PI * 2); ctx.stroke()
        }
      }

      // --- labels in screen space, so text stays readable at any zoom
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = '600 11px Inter, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      const labelled = new Set()
      if (focus) {
        const reached = sim.nodes.filter((n) => focus.dist.has(n.id))
        const cap = cam.k > 1.6 ? 220 : 60
        reached.sort((a, b) => focus.dist.get(a.id) - focus.dist.get(b.id) || b.degree - a.degree)
          .slice(0, cap).forEach((n) => labelled.add(n))
      } else {
        const top = cam.k > 2 ? 200 : cam.k > 1 ? 50 : 16
        ;[...sim.nodes].filter((n) => !dimmed(n)).sort((a, b) => b.degree - a.degree)
          .slice(0, top).forEach((n) => labelled.add(n))
      }
      if (st.hover) { const hn = sim.byId.get(st.hover.id); if (hn) labelled.add(hn) }
      for (const n of labelled) {
        const sx = n.x * cam.k + w / 2 + cam.x, sy = n.y * cam.k + h / 2 + cam.y
        if (sx < -50 || sy < -20 || sx > w + 50 || sy > h + 20) continue
        const a = focus ? reveal(n) : 1
        if (a <= 0) continue
        const text = n.id.length > 28 ? n.id.slice(0, 27) + '…' : n.id
        const tx = sx + n.r * cam.k + 5
        ctx.globalAlpha = a
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,15,31,0.9)'; ctx.strokeText(text, tx, sy)
        ctx.fillStyle = focus && focus.entity === n.id ? '#FFD166' : '#E2E8F0'
        ctx.fillText(text, tx, sy)
      }
      ctx.globalAlpha = 1
      // relation names on the traced path / hovered node's edges when zoomed in
      if (cam.k > 1.1 && (st.hover || st.pathTo)) {
        ctx.font = '500 10px Inter, system-ui, sans-serif'
        const hn = st.hover && sim.byId.get(st.hover.id)
        for (const l of sim.links) {
          if (!(hn && (l.s === hn || l.t === hn))) continue
          const mx = ((l.s.x + l.t.x) / 2) * cam.k + w / 2 + cam.x
          const my = ((l.s.y + l.t.y) / 2) * cam.k + h / 2 + cam.y
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,15,31,0.9)'; ctx.strokeText(l.relation, mx, my)
          ctx.fillStyle = '#FBD38D'; ctx.fillText(l.relation, mx, my)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* -------------------------------------------------------------- sizing */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      setSize({ w, h: fullscreen ? window.innerHeight - 150 : 640 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fullscreen])

  /* ---------------------------------------------------------- pointers */
  const hitTest = (sx, sy) => {
    const p = toWorld(sx, sy)
    const sim = simRef.current
    let best = null, bestD = Infinity
    for (const n of sim.nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y)
      const reach = n.r + 4 / camRef.current.k
      if (d < reach && d < bestD) { best = n; bestD = d }
    }
    return best
  }
  const local = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onDown = (e) => {
    const { x, y } = local(e)
    const n = hitTest(x, y)
    interact.current = { mode: n ? 'node' : 'pan', node: n, sx: x, sy: y, moved: 0,
      cx: camRef.current.x, cy: camRef.current.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    const { x, y } = local(e)
    const it = interact.current
    if (it.mode) {
      it.moved = Math.max(it.moved, Math.hypot(x - it.sx, y - it.sy))
      if (it.mode === 'pan') {
        camRef.current.anim = null
        camRef.current.x = it.cx + (x - it.sx); camRef.current.y = it.cy + (y - it.sy)
        dirty.current = true
      } else if (it.node && it.moved > 3) {
        const p = toWorld(x, y)
        it.node.fx = p.x; it.node.fy = p.y
        simRef.current.alpha = Math.max(simRef.current.alpha, 0.25)
      }
      return
    }
    const n = hitTest(x, y)
    const next = n ? { id: n.id, x, y } : null
    if ((next?.id || null) !== (hover?.id || null)) setHover(next)
    else if (next) setHover(next)
  }
  const onUp = (e) => {
    const it = interact.current
    interact.current = { mode: null }
    if (it.moved < 4) {
      if (it.node) focusEntity(it.node.id)
      else if (focus) clearFocus()
    } else if (it.node) {
      it.node.fx = null; it.node.fy = null     // release after drag
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const onWheel = (e) => {
    e.preventDefault()
    const { x, y } = local(e)
    const c = camRef.current
    c.anim = null
    const before = toWorld(x, y)
    c.k = clamp(c.k * Math.exp(-e.deltaY * 0.0015), 0.05, 8)
    const { w, h } = drawState.current.size
    c.x = x - w / 2 - before.x * c.k
    c.y = y - h / 2 - before.y * c.k
    dirty.current = true
  }
  useEffect(() => {                            // non-passive wheel so the page never scrolls
    const el = canvasRef.current
    const h = (e) => onWheel(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  })
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { clearFocus(); setFullscreen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* -------------------------------------------------------- derived UI */
  const legend = useMemo(() => {
    const counts = new Map()
    for (const n of simRef.current.nodes) {
      const key = colourBy === 'spine' ? (n.spine || '(no spine)') : n.type
      const c = counts.get(key) || { n: 0, colour: colourOf(n) }
      c.n++; counts.set(key, c)
    }
    return [...counts.entries()].sort((a, b) => b[1].n - a[1].n)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legendVersion, colourBy, colourOf])

  const hoverNode = hover && simRef.current.byId.get(hover.id)
  const pathSteps = useMemo(() => {
    if (!pathTo || !focus?.via) return []
    const out = []
    let cur = pathTo, guard = 0
    while (cur && cur !== focus.entity && guard++ < 6) {
      const step = focus.via.get(cur)
      if (!step) break
      out.push(step); cur = step.via
    }
    return out.reverse()
  }, [pathTo, focus])

  /* ------------------------------------------------------------ render */
  const chip = (bg) => ({ display: 'inline-block', width: 10, height: 10, borderRadius: 10,
    background: bg, marginRight: 6, verticalAlign: -1, boxShadow: `0 0 6px ${bg}` })

  return (
    <section className="panel" style={fullscreen ? {
      position: 'fixed', inset: 12, zIndex: 50, overflow: 'auto', background: 'var(--panel, #fff)' } : undefined}>
      <div className="panel-head">
        Graph view
        <span className="spacer" />
        <span className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
          {meta ? `${meta.shown} of ${meta.total} nodes · ${meta.edges} edges` : '—'}
          {settling ? ' · arranging…' : ''}
        </span>
      </div>
      <div className="panel-body stack">
        {error && <div className="banner">{error}</div>}

        {/* ---- toolbar */}
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
            <input className="input" value={query} style={{ width: '100%' }}
                   placeholder="Search an entity and jump to it…"
                   onChange={(e) => setQuery(e.target.value)}
                   onFocus={() => results.length && setShowResults(true)}
                   onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { focusEntity(results[0].id); setQuery(results[0].id) } }} />
            {showResults && results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                background: '#111831', border: '1px solid #2D3A5E', borderRadius: 8,
                maxHeight: 320, overflow: 'auto', boxShadow: '0 12px 30px rgba(0,0,0,0.4)' }}>
                {results.map((r) => (
                  <div key={r.id} onMouseDown={() => { focusEntity(r.id); setQuery(r.id) }}
                       style={{ padding: '7px 10px', cursor: 'pointer', color: '#E2E8F0', fontSize: 13,
                         display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #1E2745' }}>
                    <span style={chip(colourBy === 'spine' ? (SPINE_COLOURS[r.spine] || NO_SPINE) : hashColour(r.type))} />
                    <span style={{ flex: 1 }}>{r.id}</span>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>{r.type} · {r.degree} links</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <select className="domain-select" value={hops} onChange={(e) => setHops(Number(e.target.value))}
                  title="How far to trace the effect of a selected entity">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Trace {n} hop{n > 1 ? 's' : ''}</option>)}
          </select>
          <select className="domain-select" value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All entity types</option>
            {(types || []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="domain-select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[100, 250, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} nodes</option>)}
          </select>
          <select className="domain-select" value={colourBy} onChange={(e) => { setColourBy(e.target.value); setHighlightKey(null) }}>
            <option value="type">Colour by type</option>
            <option value="spine">Colour by shared spine</option>
          </select>
          <button className="btn" onClick={() => load(true)} disabled={busy}>{busy ? 'Loading…' : '↻ Refresh'}</button>
          <button className="btn" onClick={fitView}>Fit</button>
          <button className="btn" onClick={() => setFullscreen((f) => !f)}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
        </div>

        {meta && (
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
            {updated && `Updated ${updated.toLocaleTimeString()}`}
            {meta.added != null && ` · ${meta.added} new since last load`}
            {meta.truncated && ` · showing the ${meta.shown} best-connected — raise the node count to see more`}
            {colourBy === 'spine' && !meta.spineDeclared &&
              ' · this domain declares no spine types yet (Schema tab → Extends)'}
          </div>
        )}

        {/* ---- canvas + side panel */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div ref={wrapRef} style={{ position: 'relative', flex: '1 1 600px', minWidth: 320,
            borderRadius: 10, overflow: 'hidden', border: '1px solid #1E2745' }}>
            <canvas ref={canvasRef}
                    style={{ width: '100%', height: size.h, display: 'block', touchAction: 'none',
                      cursor: hover ? 'pointer' : interact.current.mode === 'pan' ? 'grabbing' : 'grab' }}
                    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
                    onPointerLeave={() => setHover(null)} />
            {(busy || tracing) && (
              <div style={{ position: 'absolute', top: 12, left: 12, padding: '6px 12px', borderRadius: 20,
                background: 'rgba(17,24,49,0.9)', color: '#FFD166', fontSize: 12, border: '1px solid #2D3A5E' }}>
                {busy ? 'Loading graph…' : `Tracing ${hops} hop${hops > 1 ? 's' : ''}…`}
              </div>
            )}
            {!busy && meta && meta.shown === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#94A3B8' }}>
                No entities in this domain yet — ingest documents first.
              </div>
            )}
            {hoverNode && !interact.current.mode && (
              <div style={{ position: 'absolute', left: clamp(hover.x + 14, 0, size.w - 260), top: clamp(hover.y + 14, 0, size.h - 120),
                width: 250, pointerEvents: 'none', background: 'rgba(17,24,49,0.96)', color: '#E2E8F0',
                border: `1px solid ${colourOf(hoverNode)}`, borderRadius: 8, padding: '8px 10px', fontSize: 12,
                boxShadow: '0 10px 24px rgba(0,0,0,0.45)' }}>
                <div style={{ fontWeight: 700, marginBottom: 3, wordBreak: 'break-word' }}>{hoverNode.id}</div>
                <div style={{ color: '#94A3B8' }}>
                  <span style={chip(colourOf(hoverNode))} />{hoverNode.type}
                  {hoverNode.spine ? ` · extends ${hoverNode.spine}` : ''} · {hoverNode.degree} links
                </div>
                {focus?.dist?.has(hoverNode.id) && (
                  <div style={{ marginTop: 4, color: HOP_COLOURS[focus.dist.get(hoverNode.id)] }}>
                    {HOP_LABEL[focus.dist.get(hoverNode.id)]} from {focus.entity}
                  </div>
                )}
                {hoverNode.evidence && (
                  <div style={{ marginTop: 5, color: '#CBD5E0', fontStyle: 'italic' }}>
                    "{hoverNode.evidence.slice(0, 140)}{hoverNode.evidence.length > 140 ? '…' : ''}"
                  </div>
                )}
                <div style={{ marginTop: 5, color: '#718096' }}>Click to trace its effect</div>
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 11, color: '#718096' }}>
              Scroll to zoom · drag to pan · drag a node to move it · click a node to trace · Esc to clear
            </div>
          </div>

          {/* side panel: impact when an entity is traced, legend otherwise */}
          <div style={{ flex: '0 1 320px', minWidth: 260, maxHeight: size.h, overflow: 'auto' }}>
            {focus?.notFound && (
              <div className="banner">
                {focus.note}
                {focus.suggestions?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {focus.suggestions.map((s) => (
                      <button key={s} className="btn" style={{ margin: 2 }} onClick={() => focusEntity(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {focus?.found ? (
              <div className="stack" style={{ gap: 10 }}>
                <div style={{ padding: 12, borderRadius: 10, background: 'linear-gradient(135deg,#1A2548,#101830)', color: '#E2E8F0' }}>
                  <div style={{ fontSize: 11, color: '#FFD166', letterSpacing: '.06em', textTransform: 'uppercase' }}>Effect trace</div>
                  <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0', wordBreak: 'break-word' }}>{focus.entity}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>
                    {focus.type || 'unknown'} — reaches <b style={{ color: '#fff' }}>{focus.total}</b> entit{focus.total === 1 ? 'y' : 'ies'} within {focus.reached_hops} of {focus.hops} hop{focus.hops > 1 ? 's' : ''}
                  </div>
                  {focus.reached_hops < focus.hops && (
                    <div style={{ fontSize: 11, color: '#FBD38D', marginTop: 4 }}>
                      Nothing further is connected beyond {focus.reached_hops} hop{focus.reached_hops === 1 ? '' : 's'}.
                    </div>
                  )}
                  {focus.truncated && (
                    <div style={{ fontSize: 11, color: '#FBD38D', marginTop: 4 }}>
                      Hop {focus.truncated_levels.join(', ')} was capped to its best-connected entities.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={fitView}>Fit to trace</button>
                    <button className="btn" onClick={clearFocus}>Clear</button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>What is affected, by type</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.entries(focus.by_type || {}).map(([t, n]) => (
                      <span key={t} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12,
                        background: 'var(--chip, #EDF2F7)' }}>
                        <span style={chip(hashColour(t))} />{t} <b>{n}</b>
                      </span>
                    ))}
                  </div>
                </div>

                {pathSteps.length > 0 && (
                  <div style={{ padding: 10, borderRadius: 8, border: '1px solid #CBD5E0', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Why {pathTo} is affected</div>
                    <div>{focus.entity}</div>
                    {pathSteps.map((s, i) => (
                      <div key={i} style={{ paddingLeft: 8 * (i + 1) }}>
                        {s.direction === 'out' ? '↳ ' : '↰ '}
                        <span style={{ color: '#DD6B20' }}>{s.relation || 'related'}</span>
                        {s.direction === 'out' ? ' → ' : ' ← '}{s.id}
                      </div>
                    ))}
                  </div>
                )}

                {Object.entries(focus.by_distance || {}).map(([d, items]) => (
                  <details key={d} open={Number(d) <= 2}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      <span style={chip(HOP_COLOURS[Number(d)])} />{HOP_LABEL[Number(d)]} · {items.length}
                    </summary>
                    <div style={{ marginTop: 4 }}>
                      {items.slice(0, 80).map((it) => (
                        <div key={it.id} onClick={() => { setPathTo(it.id); flyTo(it.id, 1.8) }}
                             style={{ fontSize: 12, padding: '3px 6px', cursor: 'pointer', borderRadius: 4,
                               background: pathTo === it.id ? 'rgba(255,209,102,0.2)' : 'transparent' }}>
                          <span style={chip(hashColour(it.type))} />{it.id}
                          <span style={{ color: 'var(--dim)' }}> · {it.type} · via {it.relation || 'link'}</span>
                        </div>
                      ))}
                      {items.length > 80 && <div className="hint">…and {items.length - 80} more</div>}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {colourBy === 'spine' ? 'Shared spine types' : 'Entity types'} — click to highlight
                </div>
                {legend.map(([key, v]) => (
                  <div key={key} onClick={() => setHighlightKey(highlightKey === key ? null : key)}
                       style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                         background: highlightKey === key ? 'rgba(99,179,237,0.18)' : 'transparent',
                         opacity: highlightKey && highlightKey !== key ? 0.45 : 1 }}>
                    <span style={chip(v.colour)} />{key}<span style={{ float: 'right', color: 'var(--dim)' }}>{v.n}</span>
                  </div>
                ))}
                <p className="hint" style={{ marginTop: 8 }}>
                  Click any node — or search for one — to see everything it affects, up to four hops out.
                  Rings are coloured by distance and light up outward in sequence.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
