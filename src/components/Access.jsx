import { useEffect, useState } from 'react'
import { api } from '../api'

const ROLES = [
  ['viewer', 'Read the graph, ask questions, use agents'],
  ['editor', 'Everything a viewer can do, plus add documents and build schemas, agents and teams'],
  ['admin', 'Everything an editor can do, plus training and managing people'],
]

export default function Access({ domains = [] }) {
  const [keys, setKeys] = useState([])
  const [me, setMe] = useState(null)
  const [draft, setDraft] = useState(null)
  const [issued, setIssued] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      const [k, m] = await Promise.all([api.accessKeys(), api.me()])
      setKeys(k); setMe(m); setError(null)
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])

  const startNew = async () => {
    setIssued(null); setError(null)
    try {
      const { key } = await api.generateKey()
      setDraft({ key, name: '', role: 'viewer', domains: ['*'] })
    } catch (err) { setError(err.message) }
  }

  const save = async () => {
    setError(null)
    try {
      await api.saveKey(draft)
      // Shown once: the server masks keys from here on, so a leaked list is
      // not a leaked credential.
      setIssued({ ...draft })
      setDraft(null); await load()
    } catch (err) { setError(err.message) }
  }

  const revoke = async (masked, name) => {
    const key = window.prompt(
      `Revoking “${name}”. Paste the full key to confirm — it is masked here, so you `
      + `will need the copy you issued.`)
    if (!key) return
    try { await api.revokeKey(key); await load() } catch (err) { setError(err.message) }
  }

  const setD = (patch) => setDraft({ ...draft, ...patch })
  const toggleDomain = (d) => {
    if (d === '*') return setD({ domains: ['*'] })
    const without = draft.domains.filter((x) => x !== '*')
    setD({ domains: without.includes(d) ? without.filter((x) => x !== d) : [...without, d] })
  }

  if (me && !me.can.manage_access) {
    return (
      <div className="banner warn">
        Managing access needs administrator rights. You are signed in as {me.name} ({me.role}).
      </div>
    )
  }

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}

      {issued && (
        <div className="panel" style={{ borderColor: 'var(--success)' }}>
          <div className="panel-head" style={{ color: 'var(--success)' }}>
            Key issued for {issued.name}
          </div>
          <div className="panel-body stack">
            <p className="hint">
              Copy it now and give it to them directly. It is masked everywhere from
              here on, so this is the only time it is shown.
            </p>
            <code className="promptbox" style={{ marginTop: 0 }}>{issued.key}</code>
            <div className="row">
              <button className="btn" onClick={() => navigator.clipboard?.writeText(issued.key)}>
                Copy
              </button>
              <button className="btn btn-quiet" onClick={() => setIssued(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {draft ? (
        <section className="panel">
          <div className="panel-head">New key</div>
          <div className="panel-body stack">
            <div className="grid cols-2">
              <div className="field">
                <label>Who is this for</label>
                <input className="input" value={draft.name} autoFocus
                       placeholder="Priya, tax team"
                       onChange={(e) => setD({ name: e.target.value })} />
              </div>
              <div className="field">
                <label>Key</label>
                <input className="input mono" value={draft.key} readOnly />
              </div>
            </div>

            <div className="field">
              <label>What they may do</label>
              <div className="stack" style={{ gap: 8 }}>
                {ROLES.map(([role, help]) => (
                  <label key={role} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                    <input type="radio" name="role" checked={draft.role === role}
                           style={{ marginTop: 4 }}
                           onChange={() => setD({ role })} />
                    <span>
                      <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{role}</span>
                      <span className="hint" style={{ display: 'block' }}>{help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Which domains they may read</label>
              <div className="chips">
                <button className={`chip${draft.domains.includes('*') ? ' entry' : ''}`}
                        onClick={() => toggleDomain('*')}>
                  {draft.domains.includes('*') ? '✓ ' : ''}All domains
                </button>
                {domains.map((d) => (
                  <button key={d}
                          className={`chip${draft.domains.includes(d) ? ' entry' : ''}`}
                          onClick={() => toggleDomain(d)}>
                    {draft.domains.includes(d) ? '✓ ' : ''}{d}
                  </button>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 6 }}>
                Checked separately from the role — an editor limited to one domain
                cannot read another, whatever they are allowed to do.
              </p>
            </div>

            <div className="row">
              <button className="btn btn-primary" onClick={save}
                      disabled={!draft.name.trim() || draft.domains.length === 0}>
                Issue key
              </button>
              <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        </section>
      ) : (
        <div className="row wrap">
          <p className="hint" style={{ maxWidth: 620 }}>
            Each key belongs to a person and carries what they may do and which
            domains they may read. Keys are shown once when issued and masked
            afterwards.
          </p>
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
                  onClick={startNew}>New key</button>
        </div>
      )}

      <section className="panel">
        <div className="panel-head">Keys<span className="spacer" /><span className="hint">{keys.length}</span></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {keys.length === 0 ? (
            <div className="empty"><p className="hint">No keys issued yet.</p></div>
          ) : (
            <table className="grid-table">
              <thead>
                <tr><th>Who</th><th>Key</th><th>May do</th><th>May read</th><th>Last used</th><th /></tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.key}>
                    <td>{k.name}</td>
                    <td className="mono hint">{k.key}</td>
                    <td><span className="chip">{k.role}</span></td>
                    <td>
                      {k.domains.includes('*')
                        ? <span className="hint">all domains</span>
                        : k.domains.map((d) => <span key={d} className="chip entry">{d}</span>)}
                    </td>
                    <td className="hint">
                      {k.last_seen ? new Date(k.last_seen).toLocaleString() : 'never'}
                    </td>
                    <td style={{ width: 90 }}>
                      <button className="btn btn-quiet btn-danger" style={{ padding: '2px 8px' }}
                              onClick={() => revoke(k.key, k.name)}>Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
