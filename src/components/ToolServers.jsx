import { useEffect, useState } from 'react'
import { api } from '../api'

export default function ToolServers() {
  const [servers, setServers] = useState([])
  const [tools, setTools] = useState([])
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const [s, t] = await Promise.all([api.toolServers(), api.allTools()])
      setServers(s); setTools(t.tools || []); setError(null)
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setBusy(true); setError(null)
    try { await api.saveToolServer(draft); setDraft(null); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const toggle = async (s) => {
    try { await api.saveToolServer({ ...s, token: '', enabled: !s.enabled }); await load() }
    catch (err) { setError(err.message) }
  }

  const remove = async (key) => {
    if (!window.confirm(`Remove the “${key}” tool server?`)) return
    try { await api.deleteToolServer(key); await load() } catch (err) { setError(err.message) }
  }

  const external = tools.filter((t) => t.external)

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}

      <div className="row wrap">
        <p className="hint" style={{ maxWidth: 640 }}>
          Tool servers add capabilities agents can use — anything speaking the Model
          Context Protocol. Their tools appear alongside the built-in ones and are
          named after the server, so two servers offering the same tool stay distinct.
        </p>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
                onClick={() => setDraft({ key: '', name: '', url: '', token: '',
                                          enabled: true, timeout: 20 })}>
          Add a server
        </button>
      </div>

      {draft && (
        <section className="panel">
          <div className="panel-head">New tool server</div>
          <div className="panel-body stack">
            <div className="grid cols-3">
              <div className="field">
                <label>Key</label>
                <input className="input" value={draft.key} placeholder="finance-tools"
                       onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
              </div>
              <div className="field">
                <label>Name</label>
                <input className="input" value={draft.name} placeholder="Finance Tools"
                       onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Timeout (seconds)</label>
                <input className="input" type="number" min={1} max={120} value={draft.timeout}
                       onChange={(e) => setDraft({ ...draft, timeout: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid cols-2">
              <div className="field">
                <label>Address</label>
                <input className="input" value={draft.url}
                       placeholder="https://tools.internal/mcp"
                       onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
              </div>
              <div className="field">
                <label>Token, if it needs one</label>
                <input className="input" type="password" value={draft.token}
                       placeholder="Leave blank if not required"
                       onChange={(e) => setDraft({ ...draft, token: e.target.value })} />
              </div>
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={save}
                      disabled={busy || !draft.key.trim() || !draft.url.trim()}>
                {busy ? 'Connecting…' : 'Add and connect'}
              </button>
              <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
            </div>
            <p className="hint">
              The server is contacted when you save, so you will know straight away
              whether it answers and what it offers.
            </p>
          </div>
        </section>
      )}

      {servers.length === 0 ? (
        <section className="panel">
          <div className="panel-body empty">
            <h3>No tool servers</h3>
            <p className="hint">
              Agents work with the built-in graph tools alone. Add a server to give
              them more.
            </p>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-head">Servers<span className="spacer" />
            <button className="btn btn-quiet" style={{ padding: '2px 10px' }}
                    onClick={load}>Recheck</button></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="grid-table">
              <thead><tr><th>Server</th><th>Address</th><th>State</th>
                <th className="num">Tools</th><th /></tr></thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={s.key}>
                    <td>{s.name}<span className="hint" style={{ display: 'block' }}>{s.key}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.url}</td>
                    <td>
                      {!s.enabled
                        ? <span className="chip">off</span>
                        : s.reachable
                          ? <span className="state succeeded">answering</span>
                          : <span className="state failed">not answering</span>}
                      {s.detail && !s.reachable && s.enabled && (
                        <span className="hint" style={{ display: 'block' }}>{s.detail}</span>
                      )}
                    </td>
                    <td className="num">{s.tools}</td>
                    <td style={{ width: 150 }}>
                      <button className="btn btn-quiet" style={{ padding: '2px 8px' }}
                              onClick={() => toggle(s)}>{s.enabled ? 'Turn off' : 'Turn on'}</button>
                      <button className="btn btn-quiet btn-danger" style={{ padding: '2px 8px' }}
                              onClick={() => remove(s.key)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {external.length > 0 && (
        <section className="panel">
          <div className="panel-head">Tools these servers offer<span className="spacer" />
            <span className="hint">{external.length}</span></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="grid-table">
              <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
              <tbody>
                {external.map((t) => (
                  <tr key={t.name}>
                    <td className="mono" style={{ fontSize: 12 }}>{t.name}</td>
                    <td className="hint">{t.description}</td>
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
