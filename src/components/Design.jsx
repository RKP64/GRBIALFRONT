import { useRef, useState } from 'react'
import { api } from '../api'

/* Proposes a domain, agents and a team from a sample. Nothing is created until
   the operator reviews and saves — the reviewed schema is the whole governance
   argument, and an assistant quietly creating domains would hollow it out. */
export default function Design({ onDomainsChanged }) {
  const [files, setFiles] = useState([])
  const [goal, setGoal] = useState('')
  const [proposal, setProposal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const [hot, setHot] = useState(false)
  const inputRef = useRef(null)

  const propose = async () => {
    setBusy(true); setError(null); setDone(null)
    try { setProposal(await api.proposeDesign(goal, files)) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const apply = async () => {
    setBusy(true); setError(null)
    try {
      const res = await api.applyDesign({
        ontology: proposal.ontology, agents: proposal.agents, team: proposal.team,
      })
      setDone(res); setProposal(null); setFiles([])
      onDomainsChanged?.(proposal.ontology.key)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const drop = (list) => setFiles((prev) => {
    const seen = new Set(prev.map((f) => f.name + f.size))
    return [...prev, ...[...list].filter((f) => !seen.has(f.name + f.size))]
  })

  const editOntology = (patch) =>
    setProposal({ ...proposal, ontology: { ...proposal.ontology, ...patch } })

  const removeType = (name) => {
    const types = { ...proposal.ontology.entity_types }
    delete types[name]
    editOntology({
      entity_types: types,
      allowed_triples: proposal.ontology.allowed_triples
        .filter((t) => t.source !== name && t.target !== name),
    })
  }

  if (done) {
    return (
      <div className="stack">
        <div className="banner ok">
          Created domain <strong>{done.created.ontology[0]}</strong>
          {done.created.agents.length > 0 && <> · {done.created.agents.length} agents</>}
          {done.created.team.length > 0 && <> · team {done.created.team[0]}</>}
        </div>
        {done.created.skipped?.length > 0 && (
          <div className="banner warn">
            Some parts were skipped: {done.created.skipped.join('; ')}
          </div>
        )}
        <p className="hint">{done.next}</p>
        <div><button className="btn" onClick={() => setDone(null)}>Design another</button></div>
      </div>
    )
  }

  if (proposal) {
    const o = proposal.ontology
    return (
      <div className="stack">
        {error && <div className="banner">{error}</div>}

        <div className="row wrap">
          <span style={{ fontWeight: 600, fontSize: 15 }}>Proposed design</span>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-primary" onClick={apply} disabled={busy}>
              {busy ? 'Creating…' : 'Looks right — create it'}
            </button>
            <button className="btn" onClick={() => setProposal(null)}>Start over</button>
          </div>
        </div>

        <div className="banner warn">
          Nothing has been created yet. Read it, remove what is wrong, then create it.
        </div>

        {proposal.reasoning && (
          <section className="panel">
            <div className="panel-head">Why this shape</div>
            <div className="panel-body"><p>{proposal.reasoning}</p></div>
          </section>
        )}

        {proposal.warnings.length > 0 && (
          <section className="panel" style={{ borderColor: 'var(--warning)' }}>
            <div className="panel-head" style={{ color: 'var(--warning)' }}>
              Worth checking
            </div>
            <div className="panel-body">
              <ul className="stack" style={{ gap: 6, listStyle: 'none' }}>
                {proposal.warnings.map((w, i) => <li key={i} className="hint">— {w}</li>)}
              </ul>
            </div>
          </section>
        )}

        <div className="grid cols-2">
          <div className="field">
            <label>Domain key</label>
            <input className="input" value={o.key}
                   onChange={(e) => editOntology({ key: e.target.value })} />
          </div>
          <div className="field">
            <label>Name</label>
            <input className="input" value={o.name}
                   onChange={(e) => editOntology({ name: e.target.value })} />
          </div>
        </div>

        <section className="panel">
          <div className="panel-head">
            Entity types
            <span className="spacer" />
            <span className="hint">{Object.keys(o.entity_types).length}</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="grid-table">
              <thead><tr><th>Type</th><th>Named how</th><th>Seen in the sample as</th><th /></tr></thead>
              <tbody>
                {Object.entries(o.entity_types).map(([name, spec]) => {
                  const ev = o.evidence?.[name]
                  return (
                    <tr key={name}>
                      <td style={{ color: 'var(--accent-color)', fontWeight: 500 }}>{name}</td>
                      <td className="hint">{spec.id_rule}</td>
                      <td className="hint" style={{ fontStyle: ev ? 'italic' : 'normal',
                                                    color: ev ? undefined : 'var(--warning)' }}>
                        {ev ? `“${ev}”` : 'no evidence given'}
                      </td>
                      <td style={{ width: 36 }}>
                        <button className="btn btn-quiet" style={{ padding: '2px 7px' }}
                                onClick={() => removeType(name)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid cols-2">
          <section className="panel">
            <div className="panel-head">Relationships<span className="spacer" />
              <span className="hint">{o.allowed_triples.length}</span></div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="grid-table">
                <tbody>
                  {o.allowed_triples.map((t, i) => (
                    <tr key={i}>
                      <td>{t.source}</td>
                      <td style={{ color: 'var(--accent-color)' }}>{t.relation}</td>
                      <td>{t.target}</td>
                      <td style={{ width: 36 }}>
                        <button className="btn btn-quiet" style={{ padding: '2px 7px' }}
                                onClick={() => editOntology({
                                  allowed_triples: o.allowed_triples.filter((_, j) => j !== i),
                                })}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">Agents<span className="spacer" />
              <span className="hint">{proposal.agents.length}</span></div>
            <div className="panel-body stack">
              {proposal.agents.map((a, i) => (
                <div key={a.key} className="source-row" style={{ gridTemplateColumns: '1fr 30px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{a.name}</div>
                    <p className="src-snip">{a.description}</p>
                    <div className="chips" style={{ marginTop: 6 }}>
                      {a.tools.map((t) => <span key={t} className="chip">{t}</span>)}
                    </div>
                  </div>
                  <button className="btn btn-quiet" style={{ padding: '2px 7px' }}
                          onClick={() => setProposal({
                            ...proposal,
                            agents: proposal.agents.filter((_, j) => j !== i),
                          })}>✕</button>
                </div>
              ))}
              {proposal.team && (
                <div className="routes" style={{ marginTop: 4 }}>
                  <span className="hint" style={{ fontWeight: 500 }}>
                    Working together as “{proposal.team.name}”
                  </span>
                  {proposal.team.members.map((m) => (
                    <div key={m.agent} className="route">
                      <span className={`route-node${proposal.team.entry === m.agent ? ' start' : ''}`}>
                        {m.agent}
                      </span>
                      {m.hands_off_to.length > 0
                        ? <span className="route-arrows">→ {m.hands_off_to.join(', ')}
                            {m.when && <span className="hint"> when {m.when}</span>}</span>
                        : <span className="hint">finishes</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {proposal.uncertain.length > 0 && (
          <section className="panel">
            <div className="panel-head">Could not tell from the sample</div>
            <div className="panel-body">
              <ul className="stack" style={{ gap: 6, listStyle: 'none' }}>
                {proposal.uncertain.map((u, i) => <li key={i} className="hint">— {u}</li>)}
              </ul>
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}
      <p className="hint" style={{ maxWidth: 700 }}>
        Setting up a new domain means deciding what kinds of things it contains and how
        they relate — before you have seen what the documents hold. Show a few
        representative files, say what you want to do with them, and get a draft
        design to edit.
      </p>

      <section className="panel">
        <div className="panel-head">A sample of the collection</div>
        <div className="panel-body stack">
          <div className={`dropzone${hot ? ' hot' : ''}`}
               onDragOver={(e) => { e.preventDefault(); setHot(true) }}
               onDragLeave={() => setHot(false)}
               onDrop={(e) => { e.preventDefault(); setHot(false); drop(e.dataTransfer.files) }}>
            <p>A few representative files — this is a sample, not an ingestion</p>
            <button className="btn" style={{ marginTop: 12 }}
                    onClick={() => inputRef.current?.click()}>Choose files</button>
            <input ref={inputRef} type="file" multiple hidden
                   accept=".pdf,.xlsx,.xls,.csv,.txt,.md"
                   onChange={(e) => drop(e.target.files)} />
          </div>
          {files.length > 0 && (
            <ul className="filelist">
              {files.map((f) => (
                <li key={f.name + f.size}>
                  <span>{f.name}</span>
                  <button className="btn btn-quiet" style={{ marginLeft: 'auto', padding: '2px 8px' }}
                          onClick={() => setFiles((p) => p.filter((x) => x !== f))}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <div className="field">
            <label>What do you want to do with it</label>
            <textarea className="input" rows={3} value={goal}
                      placeholder="Answer questions about who is handling which claim and under what policy."
                      onChange={(e) => setGoal(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={propose} disabled={busy || !files.length}>
            {busy ? 'Reading the sample…' : 'Propose a design'}
          </button>
        </div>
      </section>
    </div>
  )
}
