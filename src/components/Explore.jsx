import { useEffect, useState } from 'react'
import { api } from '../api'
import GraphView from './GraphView'

export default function Explore({ domain }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [indexing, setIndexing] = useState(false)
  const [passages, setPassages] = useState(null)
  const [passageBusy, setPassageBusy] = useState(false)

  const load = async () => {
    try {
      setStats(await api.stats(domain))
      setPassages(await api.passageStats(domain))
      setError(null)
    } catch (err) { setError(err.message) }
  }

  const buildPassageIndex = async () => {
    setPassageBusy(true); setNote(null)
    try {
      const res = await api.buildPassageIndex(domain)
      setNote(res.vectors
        ? `Passage search ready — ${res.indexed} passages can now be found by meaning.`
        : res.note)
      setPassages(await api.passageStats(domain))
    } catch (err) { setError(err.message) } finally { setPassageBusy(false) }
  }

  const clearPassages = async () => {
    try { await api.clearPassages(domain); setPassages(await api.passageStats(domain)) }
    catch (err) { setError(err.message) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [domain])

  const buildIndex = async () => {
    setIndexing(true); setNote(null)
    try {
      const res = await api.buildIndex(domain)
      setNote(res.indexed
        ? `Ready — ${res.indexed} entities can now be found by meaning as well as by name.`
        : res.note)
    } catch (err) { setError(err.message) } finally { setIndexing(false) }
  }

  const download = async (kind) => {
    setError(null)
    try {
      await api.download(`/graph/${domain}/export.${kind}`, `${domain}.${kind}`)
    } catch (err) { setError(err.message) }
  }

  const total = stats?.nodes || 0
  const types = Object.keys(stats?.node_types || {})

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}

      <div className="grid cols-3">
        <div className="readout signal"><div className="v">{stats?.nodes ?? '—'}</div><div className="k">Nodes</div></div>
        <div className="readout signal"><div className="v">{stats?.edges ?? '—'}</div><div className="k">Edges</div></div>
        <div className="readout"><div className="v">{types.length || '—'}</div><div className="k">Entity types in use</div></div>
      </div>

      <div className="row wrap">
        <button className="btn" onClick={load}>Refresh</button>
        <button className="btn" onClick={() => download('graphml')} disabled={!total}>
          Download GraphML
        </button>
        <button className="btn" onClick={() => download('json')} disabled={!total}>
          Download JSON
        </button>
        <button className="btn" onClick={buildIndex} disabled={indexing || !total}>
          {indexing ? 'Preparing…' : 'Enable meaning-based search'}
        </button>
        {note && <span className="hint">{note}</span>}
      </div>
      {passages?.passages > 0 && (
        <section className="panel">
          <div className="panel-head">
            Source passages
            <span className="spacer" />
            <span className="hint">
              {passages.passages} kept
              {passages.vectors ? ' · searchable by meaning' : ' · searchable by keyword'}
            </span>
          </div>
          <div className="panel-body stack">
            <p className="hint">
              The passages your documents were read from are kept here, so questions can be
              answered from the original wording as well as from the graph — with no external
              search service required.
            </p>
            <div className="row wrap">
              <button className="btn" onClick={buildPassageIndex} disabled={passageBusy}>
                {passageBusy ? 'Preparing…'
                  : passages.vectors ? 'Refresh passage search' : 'Enable meaning-based passage search'}
              </button>
              <button className="btn btn-danger" onClick={clearPassages}>Discard passages</button>
            </div>
          </div>
        </section>
      )}

      <p className="hint">
        Both downloads are open, standard formats. GraphML is read by graph
        visualisation and analysis tools; JSON gives you the same nodes and edges
        for use in your own applications.
      </p>

      {total > 0 && <GraphView domain={domain} types={types} />}

      {total === 0 ? (
        <section className="panel">
          <div className="panel-body empty">
            <h3>No graph yet</h3>
            <p className="hint">Extract a document on the Ingest tab and the breakdown appears here.</p>
          </div>
        </section>
      ) : (
        <div className="grid cols-2">
          <section className="panel">
            <div className="panel-head">Entities by type</div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="grid-table">
                <thead><tr><th>Type</th><th className="num">Count</th><th className="num">Share</th></tr></thead>
                <tbody>
                  {Object.entries(stats.node_types).map(([type, count]) => (
                    <tr key={type}>
                      <td>{type}</td>
                      <td className="num">{count}</td>
                      <td className="num" style={{ color: 'var(--muted)' }}>
                        {((count / total) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">Relationships</div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="grid-table">
                <thead><tr><th>Relation</th><th className="num">Count</th></tr></thead>
                <tbody>
                  {Object.entries(stats.relationships || {}).map(([rel, count]) => (
                    <tr key={rel}><td>{rel}</td><td className="num">{count}</td></tr>
                  ))}
                  {Object.keys(stats.relationships || {}).length === 0 && (
                    <tr><td colSpan={2} style={{ color: 'var(--muted)' }}>None recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
