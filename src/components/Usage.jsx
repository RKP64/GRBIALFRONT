import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'

const money = (n) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`)
const count = (n) => n.toLocaleString()

const OPERATION_LABEL = {
  extraction: 'Building graphs',
  answering: 'Answering questions',
  verification: 'Checking answers',
  agent: 'Agents working',
  embedding: 'Meaning-based search',
  other: 'Other',
}

/* Daily cost as a plain bar chart. No charting library — a dozen bars does not
   justify the dependency, and this stays legible when there is one day of data. */
function DailyCost({ days }) {
  const max = Math.max(...days.map((d) => d.cost), 0.000001)
  return (
    <div className="bars">
      {days.map((d) => (
        <div key={d.day} className="bar-col" title={`${d.day}: ${money(d.cost)} over ${d.calls} calls`}>
          <div className="bar" style={{ height: `${Math.max(3, (d.cost / max) * 100)}%` }} />
          <span className="bar-label">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Usage() {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    try { setData(await api.usage(days)); setError(null) }
    catch (err) { setError(err.message) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [days])

  const showEvents = async () => {
    if (events) return setEvents(null)
    try { setEvents(await api.usageEvents(7, 80)) } catch (err) { setError(err.message) }
  }

  const perDay = useMemo(() => {
    if (!data?.by_day?.length) return 0
    return data.cost / data.by_day.length
  }, [data])

  if (error) return <div className="banner">{error}</div>
  if (!data) return <p className="hint">Loading…</p>

  if (!data.calls) {
    return (
      <section className="panel">
        <div className="panel-body empty">
          <h3>Nothing recorded yet</h3>
          <p className="hint">
            Usage appears here once documents have been processed or questions asked.
          </p>
        </div>
      </section>
    )
  }

  return (
    <div className="stack">
      <div className="row wrap">
        <select className="domain-select" value={days}
                onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        <button className="btn" onClick={load}>Refresh</button>
        <span className="hint" style={{ marginLeft: 'auto' }}>{data.note}</span>
      </div>

      <div className="grid cols-4">
        <div className="readout signal"><div className="v">{money(data.cost)}</div>
          <div className="k">Estimated spend</div></div>
        <div className="readout"><div className="v">{money(perDay)}</div>
          <div className="k">Average per day</div></div>
        <div className="readout"><div className="v">{count(data.calls)}</div>
          <div className="k">Model calls</div></div>
        <div className="readout"><div className="v">
          {((data.input_tokens + data.output_tokens) / 1000).toFixed(0)}k</div>
          <div className="k">Tokens processed</div></div>
      </div>

      {data.estimated_share > 0 && (
        <p className="hint">
          {Math.round(data.estimated_share * 100)}% of calls had no token count from the
          provider and were estimated from length. Treat those figures as approximate.
        </p>
      )}

      {data.by_day.length > 1 && (
        <section className="panel">
          <div className="panel-head">Spend per day</div>
          <div className="panel-body"><DailyCost days={data.by_day} /></div>
        </section>
      )}

      <div className="grid cols-2">
        <section className="panel">
          <div className="panel-head">What the spend goes on</div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="grid-table">
              <thead><tr><th>Activity</th><th className="num">Calls</th><th className="num">Cost</th><th className="num">Share</th></tr></thead>
              <tbody>
                {Object.entries(data.by_operation).map(([op, v]) => (
                  <tr key={op}>
                    <td>{OPERATION_LABEL[op] || op}</td>
                    <td className="num">{count(v.calls)}</td>
                    <td className="num">{money(v.cost)}</td>
                    <td className="num hint">
                      {data.cost ? `${Math.round((v.cost / data.cost) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">By model</div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="grid-table">
              <thead><tr><th>Model</th><th className="num">Calls</th><th className="num">Cost</th></tr></thead>
              <tbody>
                {Object.entries(data.by_model).map(([m, v]) => (
                  <tr key={m}>
                    <td className="mono" style={{ fontSize: 12 }}>{m}</td>
                    <td className="num">{count(v.calls)}</td>
                    <td className="num">{money(v.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {Object.keys(data.by_domain || {}).length > 0 && (
        <section className="panel">
          <div className="panel-head">By domain</div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="grid-table">
              <thead><tr><th>Domain</th><th className="num">Calls</th><th className="num">Cost</th></tr></thead>
              <tbody>
                {Object.entries(data.by_domain).map(([d, v]) => (
                  <tr key={d}><td>{d}</td><td className="num">{count(v.calls)}</td>
                    <td className="num">{money(v.cost)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div>
        <button className="btn" onClick={showEvents}>
          {events ? 'Hide individual calls' : 'Show individual calls'}
        </button>
      </div>

      {events && (
        <section className="panel">
          <div className="panel-head">Recent calls<span className="spacer" />
            <span className="hint">{events.length}</span></div>
          <div className="panel-body" style={{ padding: 0, maxHeight: 420, overflowY: 'auto' }}>
            <table className="grid-table">
              <thead><tr><th>When</th><th>Activity</th><th>Model</th><th>Domain</th>
                <th className="num">Tokens</th><th className="num">Cost</th><th className="num">Took</th></tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td className="hint">{new Date(e.at).toLocaleTimeString()}</td>
                    <td>{OPERATION_LABEL[e.operation] || e.operation}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{e.model}</td>
                    <td className="hint">{e.domain || '—'}</td>
                    <td className="num">
                      {count(e.input_tokens + e.output_tokens)}
                      {e.estimated_tokens && <span className="hint" title="Estimated"> ~</span>}
                    </td>
                    <td className="num">{money(e.cost)}</td>
                    <td className="num hint">{e.duration_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
