import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'

/* Node colour is derived from the type name itself, so any ontology — one we
   ship or one the user invents this afternoon — gets a stable palette without
   anybody maintaining a colour map. */
const PALETTE = ['#3DD68C', '#5AC8E8', '#E8B54B', '#F0674F', '#B48CE8',
                 '#E88CC4', '#8CE8D2', '#E8A05A', '#7FA9E8', '#C4E85A']
const colourFor = (type) => {
  let h = 0
  for (let i = 0; i < (type || '').length; i++) h = (h * 31 + type.charCodeAt(i)) % 997
  return PALETTE[h % PALETTE.length]
}

/* Deterministic force-directed layout, no external library.
   Seeded by node id so the same graph always renders the same way. */
function layout(nodes, edges, width, height, iterations = 220) {
  const n = nodes.length
  if (!n) return []
  const idx = new Map(nodes.map((d, i) => [d.id, i]))
  const pos = nodes.map((d, i) => {
    let h = 0
    for (let c = 0; c < d.id.length; c++) h = (h * 31 + d.id.charCodeAt(c)) % 10007
    const angle = (h / 10007) * Math.PI * 2
    const radius = 0.18 + ((h % 97) / 97) * 0.32
    return {
      x: width / 2 + Math.cos(angle) * radius * width,
      y: height / 2 + Math.sin(angle) * radius * height,
      vx: 0, vy: 0,
    }
  })
  const links = edges
    .map((e) => [idx.get(e.source), idx.get(e.target)])
    .filter(([a, b]) => a !== undefined && b !== undefined && a !== b)

  const area = width * height
  const k = Math.sqrt(area / n) * 0.62
  let temp = width / 8

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) { pos[i].vx = 0; pos[i].vy = 0 }
    // repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x
        let dy = pos[i].y - pos[j].y
        let dist = Math.hypot(dx, dy) || 0.01
        const force = (k * k) / dist
        dx /= dist; dy /= dist
        pos[i].vx += dx * force; pos[i].vy += dy * force
        pos[j].vx -= dx * force; pos[j].vy -= dy * force
      }
    }
    // attraction along edges
    for (const [a, b] of links) {
      let dx = pos[a].x - pos[b].x
      let dy = pos[a].y - pos[b].y
      let dist = Math.hypot(dx, dy) || 0.01
      const force = (dist * dist) / k
      dx /= dist; dy /= dist
      pos[a].vx -= dx * force; pos[a].vy -= dy * force
      pos[b].vx += dx * force; pos[b].vy += dy * force
    }
    for (let i = 0; i < n; i++) {
      const speed = Math.hypot(pos[i].vx, pos[i].vy) || 0.01
      const step = Math.min(speed, temp)
      pos[i].x += (pos[i].vx / speed) * step
      pos[i].y += (pos[i].vy / speed) * step
      pos[i].x = Math.max(24, Math.min(width - 24, pos[i].x))
      pos[i].y = Math.max(24, Math.min(height - 24, pos[i].y))
    }
    temp *= 0.975
  }
  return pos
}

export default function GraphView({ domain, types }) {
  const [data, setData] = useState(null)
  const [limit, setLimit] = useState(120)
  const [typeFilter, setTypeFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const W = 900, H = 520

  const load = async () => {
    setBusy(true); setError(null)
    try { setData(await api.visualize(domain, limit, typeFilter || undefined)) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [domain, limit, typeFilter])

  const view = useMemo(() => {
    if (!data?.nodes?.length) return null
    const pos = layout(data.nodes, data.edges, W, H)
    const maxDeg = Math.max(1, ...data.nodes.map((d) => d.degree || 1))
    const index = new Map(data.nodes.map((d, i) => [d.id, i]))
    return { pos, maxDeg, index }
  }, [data])

  const neighbours = useMemo(() => {
    if (!selected || !data) return new Set()
    const s = new Set([selected])
    for (const e of data.edges) {
      if (e.source === selected) s.add(e.target)
      if (e.target === selected) s.add(e.source)
    }
    return s
  }, [selected, data])

  const legend = useMemo(() => {
    if (!data) return []
    const seen = new Map()
    for (const nd of data.nodes) seen.set(nd.type, (seen.get(nd.type) || 0) + 1)
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [data])

  const selectedNode = data?.nodes.find((n) => n.id === selected)
  const selectedEdges = data?.edges.filter((e) => e.source === selected || e.target === selected) || []

  return (
    <section className="panel">
      <div className="panel-head">
        Graph view
        <span className="spacer" />
        <span className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
          {data ? `${data.nodes.length} of ${data.total_nodes} nodes` : '—'}
        </span>
      </div>
      <div className="panel-body stack">
        {error && <div className="banner">{error}</div>}

        <div className="row wrap">
          <select className="domain-select" value={typeFilter}
                  onChange={(e) => { setTypeFilter(e.target.value); setSelected(null) }}>
            <option value="">All entity types</option>
            {(types || []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="domain-select" value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}>
            {[60, 120, 200, 350].map((n) => <option key={n} value={n}>{n} nodes</option>)}
          </select>
          <button className="btn" onClick={load} disabled={busy}>
            {busy ? 'Laying out…' : 'Redraw'}
          </button>
          {selected && (
            <button className="btn btn-quiet" onClick={() => setSelected(null)}>Clear selection</button>
          )}
          <span className="hint" style={{ marginLeft: 'auto' }}>
            Showing the most connected nodes. Click one to isolate its neighbourhood.
          </span>
        </div>

        {!data?.nodes?.length ? (
          <div className="empty">
            <h3>Nothing to draw yet</h3>
            <p className="hint">Extract a document on the Ingest tab first.</p>
          </div>
        ) : (
          <>
            <div className="chips">
              {legend.map(([t, count]) => (
                <span key={t} className="chip" style={{ borderColor: colourFor(t) }}>
                  <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                              background: colourFor(t), marginRight: 6 }} />
                  {t} · {count}
                </span>
              ))}
            </div>

            <div className="graph-canvas">
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
                   role="img" aria-label="Knowledge graph visualisation">
                <g>
                  {data.edges.map((e, i) => {
                    const a = view.index.get(e.source), b = view.index.get(e.target)
                    if (a === undefined || b === undefined) return null
                    const dim = selected && !(neighbours.has(e.source) && neighbours.has(e.target))
                    return (
                      <line key={i} x1={view.pos[a].x} y1={view.pos[a].y}
                            x2={view.pos[b].x} y2={view.pos[b].y}
                            stroke={dim ? '#1A2523' : '#2C3B37'}
                            strokeWidth={Math.min(3, 0.6 + Math.log2(e.weight + 1))} />
                    )
                  })}
                </g>
                <g>
                  {data.nodes.map((nd, i) => {
                    const r = 4 + Math.sqrt((nd.degree || 1) / view.maxDeg) * 12
                    const dim = selected && !neighbours.has(nd.id)
                    const isSel = selected === nd.id
                    return (
                      <g key={nd.id} transform={`translate(${view.pos[i].x},${view.pos[i].y})`}
                         onClick={() => setSelected(isSel ? null : nd.id)}
                         onMouseEnter={() => setHover(nd)} onMouseLeave={() => setHover(null)}
                         style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1 }}>
                        <circle r={r} fill={colourFor(nd.type)}
                                stroke={isSel ? '#E6EFEC' : 'transparent'} strokeWidth={2} />
                        {(r > 9 || isSel) && (
                          <text x={r + 4} y={4} fontSize="10" fill="#E6EFEC"
                                fontFamily="IBM Plex Mono, monospace" pointerEvents="none">
                            {nd.id.length > 26 ? nd.id.slice(0, 25) + '…' : nd.id}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </g>
              </svg>
              {hover && (
                <div className="graph-tip mono">
                  <strong>{hover.id}</strong><br />
                  {hover.type} · {hover.degree} connections
                  {hover.evidence ? <><br /><span style={{ color: 'var(--muted)' }}>{hover.evidence}</span></> : null}
                </div>
              )}
            </div>

            {selectedNode && (
              <div className="panel" style={{ background: 'var(--surface-2)' }}>
                <div className="panel-head">
                  {selectedNode.id}
                  <span className="spacer" />
                  <span className="mono" style={{ fontSize: 11, color: colourFor(selectedNode.type) }}>
                    {selectedNode.type}
                  </span>
                </div>
                <div className="panel-body">
                  {selectedNode.evidence && (
                    <p className="hint" style={{ marginBottom: 10 }}>“{selectedNode.evidence}”</p>
                  )}
                  <table className="grid-table">
                    <thead><tr><th>Direction</th><th>Relation</th><th>Connected node</th></tr></thead>
                    <tbody>
                      {selectedEdges.slice(0, 40).map((e, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--dim)' }}>{e.source === selected ? 'out' : 'in'}</td>
                          <td style={{ color: 'var(--ion)' }}>{e.relation}</td>
                          <td>{e.source === selected ? e.target : e.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
