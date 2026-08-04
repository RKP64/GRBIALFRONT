import { useEffect, useState } from 'react'
import { api } from '../api'

const blank = () => ({
  key: '', name: '', description: '', domains: [], system_prompt: '',
  tools: [], max_steps: 6, temperature: 0.2, verify: true, starters: [],
})

/* A team is a set of agents plus the routes between them. Routes are declared,
   not inferred from a prompt, so the diagram below is the actual behaviour. */
function Teams({ agents, onChanged }) {
  const [teams, setTeams] = useState([])
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    try { setTeams(await api.teams()); setError(null) }
    catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])

  const startNew = () => setDraft({
    key: '', name: '', description: '', entry: '', members: [],
    max_handoffs: 6, max_steps_per_agent: 4, verify: true, starters: [],
  })

  const save = async () => {
    setError(null)
    try { await api.saveTeam(draft); setDraft(null); await load(); onChanged?.() }
    catch (err) { setError(err.message) }
  }

  const remove = async (key) => {
    if (!window.confirm(`Delete the team “${key}”?`)) return
    try { await api.deleteTeam(key); await load(); onChanged?.() }
    catch (err) { setError(err.message) }
  }

  const setD = (patch) => setDraft({ ...draft, ...patch })
  const memberKeys = (draft?.members || []).map((m) => m.agent)

  const addMember = (key) => setD({
    members: [...draft.members, { agent: key, hands_off_to: [], when: '' }],
    entry: draft.entry || key,
  })
  const updateMember = (i, patch) => setD({
    members: draft.members.map((m, j) => (j === i ? { ...m, ...patch } : m)),
  })
  const removeMember = (i) => {
    const gone = draft.members[i].agent
    setD({
      members: draft.members.filter((_, j) => j !== i)
        .map((m) => ({ ...m, hands_off_to: m.hands_off_to.filter((t) => t !== gone) })),
      entry: draft.entry === gone ? '' : draft.entry,
    })
  }

  if (draft) {
    return (
      <div className="stack">
        {error && <div className="banner">{error}</div>}
        <div className="row wrap">
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {draft.key ? `Editing ${draft.key}` : 'New team'}
          </span>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-primary" onClick={save}>Save team</button>
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>

        <section className="panel">
          <div className="panel-body grid cols-3">
            <div className="field">
              <label>Key</label>
              <input className="input" value={draft.key}
                     onChange={(e) => setD({ key: e.target.value })} placeholder="tax-desk" />
            </div>
            <div className="field">
              <label>Name</label>
              <input className="input" value={draft.name}
                     onChange={(e) => setD({ name: e.target.value })} placeholder="Tax Desk" />
            </div>
            <div className="field">
              <label>Description</label>
              <input className="input" value={draft.description}
                     onChange={(e) => setD({ description: e.target.value })} />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            Who is on the team
            <span className="spacer" />
            <select className="domain-select" value=""
                    onChange={(e) => e.target.value && addMember(e.target.value)}>
              <option value="">Add an agent…</option>
              {agents.filter((a) => !memberKeys.includes(a.key))
                     .map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
            </select>
          </div>
          <div className="panel-body stack">
            {draft.members.length === 0 && (
              <p className="hint">Add at least one agent.</p>
            )}
            {draft.members.map((m, i) => {
              const agent = agents.find((a) => a.key === m.agent)
              return (
                <div key={m.agent} className="panel" style={{ background: 'var(--surface-muted)' }}>
                  <div className="panel-head">
                    {agent?.name || m.agent}
                    {draft.entry === m.agent && <span className="chip entry">starts here</span>}
                    <span className="spacer" />
                    {draft.entry !== m.agent && (
                      <button className="btn btn-quiet" style={{ padding: '2px 8px' }}
                              onClick={() => setD({ entry: m.agent })}>Start here</button>
                    )}
                    <button className="btn btn-quiet btn-danger" style={{ padding: '2px 8px' }}
                            onClick={() => removeMember(i)}>Remove</button>
                  </div>
                  <div className="panel-body stack">
                    <div className="field">
                      <label>Hands off when</label>
                      <input className="input" value={m.when} placeholder="the facts are gathered"
                             onChange={(e) => updateMember(i, { when: e.target.value })} />
                    </div>
                    <div>
                      <label className="hint" style={{ fontWeight: 500 }}>May pass to</label>
                      <div className="chips" style={{ marginTop: 6 }}>
                        {memberKeys.filter((k) => k !== m.agent).map((k) => (
                          <button key={k}
                                  className={`chip${m.hands_off_to.includes(k) ? ' entry' : ''}`}
                                  onClick={() => updateMember(i, {
                                    hands_off_to: m.hands_off_to.includes(k)
                                      ? m.hands_off_to.filter((x) => x !== k)
                                      : [...m.hands_off_to, k],
                                  })}>
                            {m.hands_off_to.includes(k) ? '✓ ' : ''}{k}
                          </button>
                        ))}
                        {memberKeys.length < 2 && (
                          <span className="hint">Add another agent to create a route.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">Limits</div>
          <div className="panel-body grid cols-3">
            <div className="field">
              <label>Most handoffs allowed</label>
              <input className="input" type="number" min={1} max={12} value={draft.max_handoffs}
                     onChange={(e) => setD({ max_handoffs: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Steps each agent may take</label>
              <input className="input" type="number" min={1} max={8}
                     value={draft.max_steps_per_agent}
                     onChange={(e) => setD({ max_steps_per_agent: Number(e.target.value) })} />
            </div>
            <label className="row" style={{ gap: 8, alignSelf: 'end', paddingBottom: 10 }}>
              <input type="checkbox" checked={draft.verify}
                     onChange={(e) => setD({ verify: e.target.checked })} />
              <span>Check the final answer</span>
            </label>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}
      <div className="row wrap">
        <p className="hint" style={{ maxWidth: 640 }}>
          A team passes one conversation between agents. Each agent declares who it
          may pass to, so the routes below are the actual behaviour, not a description
          of it.
        </p>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {teams.length > 0 && <button className="btn flat" onClick={() =>
            api.download('/teams/export/all', 'teams.json')}>Export all</button>}
          <label className="btn flat" style={{ cursor: 'pointer' }}>
            Import
            <input type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return
              try {
                const res = await api.importTeams(f)
                alert(`Teams: ${res.teams_imported?.length || 0} imported, ${res.teams_skipped?.length || 0} skipped\nAgents: ${res.agents_imported?.length || 0} imported, ${res.agents_skipped?.length || 0} skipped`)
                load(); onChanged?.()
              } catch (err) { alert(err.message) }
              e.target.value = ''
            }} />
          </label>
          <button className="btn btn-primary"
                  onClick={startNew} disabled={agents.length === 0}>New team</button>
        </span>
      </div>

      {teams.length === 0 ? (
        <section className="panel">
          <div className="panel-body empty">
            <h3>No teams yet</h3>
            <p className="hint">
              {agents.length === 0
                ? 'Create some agents first.'
                : 'Group agents when one question needs more than one kind of work.'}
            </p>
          </div>
        </section>
      ) : (
        <div className="stack">
          {teams.map((t) => (
            <section key={t.key} className="panel">
              <div className="panel-head">
                {t.name}
                <span className="spacer" />
                <button className="btn btn-quiet" style={{ padding: '2px 8px' }}
                        onClick={() => api.download(`/teams/${t.key}/export`, `${t.key}.team.json`)}>Export</button>
                <button className="btn btn-quiet" style={{ padding: '2px 8px' }}
                        onClick={() => setDraft({ ...t })}>Edit</button>
                <button className="btn btn-quiet btn-danger" style={{ padding: '2px 8px' }}
                        onClick={() => remove(t.key)}>Delete</button>
              </div>
              <div className="panel-body stack">
                <p className="hint">{t.description || 'No description.'}</p>
                <div className="routes">
                  {t.members.map((m) => (
                    <div key={m.agent} className="route">
                      <span className={`route-node${t.entry === m.agent ? ' start' : ''}`}>
                        {agents.find((a) => a.key === m.agent)?.name || m.agent}
                      </span>
                      {m.hands_off_to.length > 0 ? (
                        <span className="route-arrows">
                          → {m.hands_off_to.join(', ')}
                          {m.when && <span className="hint"> when {m.when}</span>}
                        </span>
                      ) : (
                        <span className="hint">finishes the conversation</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="chips">
                  <span className="chip">up to {t.max_handoffs} handoffs</span>
                  <span className="chip">{t.max_steps_per_agent} steps each</span>
                  {t.verify && <span className="chip">checked</span>}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/* External tool servers. Registration is an administrator action because a tool
   is code that runs on request. */
function ToolServers() {
  const [servers, setServers] = useState([])
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [probe, setProbe] = useState({})

  const load = async () => {
    try { setServers(await api.mcpServers()); setError(null) }
    catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setError(null)
    try {
      const res = await api.saveMcpServer({
        ...draft,
        headers: draft.token ? { Authorization: `Bearer ${draft.token}` } : {},
      })
      setProbe({ ...probe, [res.key]: res.probe })
      setDraft(null); await load()
    } catch (err) { setError(err.message) }
  }

  const check = async (key) => {
    try { setProbe({ ...probe, [key]: await api.probeMcpServer(key) }) }
    catch (err) { setError(err.message) }
  }

  const remove = async (key) => {
    if (!window.confirm(`Remove “${key}”? Agents using its tools will lose them.`)) return
    try { await api.deleteMcpServer(key); await load() } catch (err) { setError(err.message) }
  }

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}
      <div className="row wrap">
        <p className="hint" style={{ maxWidth: 640 }}>
          Connect tool servers so agents can use capabilities built elsewhere. Their
          tools are named after the server, so one can never stand in for a built-in.
        </p>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
                onClick={() => setDraft({ key: '', name: '', url: '', description: '', token: '' })}>
          Connect a server
        </button>
      </div>

      {draft && (
        <section className="panel">
          <div className="panel-head">New tool server</div>
          <div className="panel-body stack">
            <div className="grid cols-2">
              <div className="field">
                <label>Short key</label>
                <input className="input" value={draft.key} placeholder="fx"
                       onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
              </div>
              <div className="field">
                <label>Name</label>
                <input className="input" value={draft.name} placeholder="Currency Tools"
                       onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Address</label>
              <input className="input mono" value={draft.url} placeholder="https://tools.internal/mcp"
                     onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            </div>
            <div className="field">
              <label>Access token, if it needs one</label>
              <input className="input" type="password" value={draft.token}
                     onChange={(e) => setDraft({ ...draft, token: e.target.value })} />
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={save}
                      disabled={!draft.key.trim() || !draft.url.trim()}>
                Connect and check
              </button>
              <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        </section>
      )}

      {servers.length === 0 ? (
        <section className="panel">
          <div className="panel-body empty">
            <h3>No tool servers connected</h3>
            <p className="hint">Agents are using the built-in tools only.</p>
          </div>
        </section>
      ) : servers.map((s) => {
        const p = probe[s.key]
        const healthy = p ? p.connected : !s.last_error
        return (
          <section key={s.key} className="panel">
            <div className="panel-head">
              {s.name}
              <span className={`chip${healthy ? ' entry' : ''}`}
                    style={healthy ? undefined : { color: 'var(--danger)' }}>
                {healthy ? `${p?.tool_count ?? s.tool_count} tools` : 'unreachable'}
              </span>
              <span className="spacer" />
              <button className="btn btn-quiet" style={{ padding: '2px 8px' }}
                      onClick={() => check(s.key)}>Check</button>
              <button className="btn btn-quiet btn-danger" style={{ padding: '2px 8px' }}
                      onClick={() => remove(s.key)}>Remove</button>
            </div>
            <div className="panel-body stack">
              <p className="hint mono" style={{ fontSize: 12 }}>{s.url}</p>
              {s.description && <p className="hint">{s.description}</p>}
              {(p?.error || s.last_error) && (
                <p className="hint" style={{ color: 'var(--danger)' }}>
                  {p?.error || s.last_error}
                </p>
              )}
              {p?.tools?.length > 0 && (
                <div className="chips">
                  {p.tools.map((t) => (
                    <span key={t.name} className="chip mono" title={t.description}>
                      {s.key}__{t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default function Agents({ domain, domains = [] }) {
  const [agents, setAgents] = useState([])
  const [tools, setTools] = useState(null)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [starter, setStarter] = useState('')
  const [view, setView] = useState('agents')

  const load = async () => {
    try {
      const [a, t, all] = await Promise.all([api.agents(), api.agentTools(), api.allTools()])
      setAgents(a)
      setTools({ ...t, tools: [...(all.builtin || []), ...(all.external || [])] })
      setError(null)
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])

  const startNew = () => {
    setDraft({ ...blank(), domains: domain ? [domain] : [],
               tools: (tools?.tools || []).map((t) => t.name) })
    setNote(null); setError(null)
  }

  const save = async () => {
    setError(null)
    try {
      const saved = await api.saveAgent(draft)
      setNote(`Saved “${saved.name}”. It is now available on the Ask tab.`)
      setDraft(null); await load()
    } catch (err) { setError(err.message) }
  }

  const remove = async (key) => {
    if (!window.confirm(`Delete the agent “${key}”?`)) return
    try { await api.deleteAgent(key); await load() } catch (err) { setError(err.message) }
  }

  const setD = (patch) => setDraft({ ...draft, ...patch })
  const toggle = (list, value) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

  if (tools && !tools.available) {
    return (
      <div className="banner warn">
        Agents need a language model that supports tool use. {tools.note}
      </div>
    )
  }

  // ---------------- editor ----------------
  if (draft) {
    return (
      <div className="stack">
        {error && <div className="banner">{error}</div>}
        <div className="row wrap">
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {draft.key ? `Editing ${draft.key}` : 'New agent'}
          </span>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-primary" onClick={save}>Save agent</button>
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>

        <div className="grid cols-2">
          <section className="panel">
            <div className="panel-head">Identity</div>
            <div className="panel-body stack">
              <div className="grid cols-2">
                <div className="field">
                  <label>Key</label>
                  <input className="input" value={draft.key} placeholder="tax-advisor"
                         onChange={(e) => setD({ key: e.target.value })} />
                </div>
                <div className="field">
                  <label>Name</label>
                  <input className="input" value={draft.name} placeholder="Tax Advisor"
                         onChange={(e) => setD({ name: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Description</label>
                <input className="input" value={draft.description}
                       placeholder="What this agent is for"
                       onChange={(e) => setD({ description: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">What it may read</div>
            <div className="panel-body stack">
              <p className="hint">
                An agent chooses where to look for itself, so this list is enforced —
                a request for anything outside it is refused before any lookup runs.
              </p>
              <div className="chips">
                {domains.map((d) => (
                  <button key={d}
                          className={`chip${draft.domains.includes(d) ? ' entry' : ''}`}
                          onClick={() => setD({ domains: toggle(draft.domains, d) })}>
                    {draft.domains.includes(d) ? '✓ ' : ''}{d}
                  </button>
                ))}
              </div>
              {draft.domains.length === 0 && (
                <p className="hint" style={{ color: 'var(--warning)' }}>
                  Choose at least one.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panel-head">Instructions</div>
          <div className="panel-body stack">
            <p className="hint">
              Leave empty for sensible defaults. Write your own to set the role,
              what to prioritise, and how to answer when something is not recorded.
            </p>
            <textarea className="input" rows={7} value={draft.system_prompt}
                      placeholder="You are a tax compliance assistant. Cite the provision you rely on…"
                      onChange={(e) => setD({ system_prompt: e.target.value })} />
          </div>
        </section>

        <div className="grid cols-2">
          <section className="panel">
            <div className="panel-head">Tools it may use</div>
            <div className="panel-body stack">
              {(tools?.tools || []).map((t) => (
                <label key={t.name} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <input type="checkbox" style={{ marginTop: 4 }}
                         checked={draft.tools.includes(t.name)}
                         onChange={() => setD({ tools: toggle(draft.tools, t.name) })} />
                  <span>
                    <span className="mono" style={{ fontWeight: 500 }}>{t.name}</span>
                    {t.external && <span className="chip" style={{ marginLeft: 8 }}>external</span>}
                    <span className="hint" style={{ display: 'block' }}>{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">Effort and checking</div>
            <div className="panel-body stack">
              <div className="field">
                <label>Maximum steps before it must answer</label>
                <input className="input" type="number" min={1} max={12} value={draft.max_steps}
                       onChange={(e) => setD({ max_steps: Number(e.target.value) })} />
              </div>
              <p className="hint">
                Higher lets it dig further; lower keeps answers fast and cheap.
                Six suits most questions.
              </p>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={draft.verify}
                       onChange={(e) => setD({ verify: e.target.checked })} />
                <span>Check every answer against the graph</span>
              </label>
              <div className="field">
                <label>Example questions</label>
                <div className="row">
                  <input className="input" value={starter} placeholder="Shown to users as a starting point"
                         onChange={(e) => setStarter(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && starter.trim()) {
                             setD({ starters: [...draft.starters, starter.trim()] })
                             setStarter('')
                           }
                         }} />
                  <button className="btn" onClick={() => {
                    if (!starter.trim()) return
                    setD({ starters: [...draft.starters, starter.trim()] })
                    setStarter('')
                  }}>Add</button>
                </div>
              </div>
              <div className="chips">
                {draft.starters.map((s, i) => (
                  <button key={i} className="chip"
                          onClick={() => setD({ starters: draft.starters.filter((_, j) => j !== i) })}>
                    {s} ✕
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }

  // ---------------- list ----------------
  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}
      {note && <div className="banner ok">{note}</div>}

      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        <button className={`seg-btn${view === 'agents' ? ' on' : ''}`}
                onClick={() => setView('agents')}>Agents</button>
        <button className={`seg-btn${view === 'teams' ? ' on' : ''}`}
                onClick={() => setView('teams')}>Teams</button>
        <button className={`seg-btn${view === 'servers' ? ' on' : ''}`}
                onClick={() => setView('servers')}>Tool servers</button>
      </div>

      {view === 'teams' && <Teams agents={agents} onChanged={load} />}
      {view === 'servers' && <ToolServers />}
      {view === 'agents' && <>

      <div className="row wrap">
        <p className="hint" style={{ maxWidth: 640 }}>
          An agent is a saved way of working: what it may read, what it is for, which
          tools it may use, and how hard it may look before answering.
        </p>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {agents.length > 0 && <button className="btn flat" onClick={() =>
            api.download('/agents/export/all', 'agents.json')}>Export all</button>}
          <label className="btn flat" style={{ cursor: 'pointer' }}>
            Import
            <input type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return
              try {
                const res = await api.importAgents(f)
                alert(`Imported: ${res.imported?.length || 0}, Skipped: ${res.skipped?.length || 0}`)
                load()
              } catch (err) { alert(err.message) }
              e.target.value = ''
            }} />
          </label>
          <button className="btn btn-primary" onClick={startNew}>New agent</button>
        </span>
      </div>

      {agents.length === 0 ? (
        <section className="panel">
          <div className="panel-body empty">
            <h3>No agents yet</h3>
            <p className="hint">
              Create one to give a set of questions a consistent way of being answered.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid cols-2">
          {agents.map((a) => (
            <section key={a.key} className="panel">
              <div className="panel-head">
                {a.name}
                <span className="spacer" />
                <button className="btn btn-quiet" style={{ padding: '2px 8px' }}
                        onClick={() => api.download(`/agents/${a.key}/export`, `${a.key}.agent.json`)}>Export</button>
                <button className="btn btn-quiet" style={{ padding: '2px 8px' }}
                        onClick={() => setDraft({ ...a })}>Edit</button>
                <button className="btn btn-quiet btn-danger" style={{ padding: '2px 8px' }}
                        onClick={() => remove(a.key)}>Delete</button>
              </div>
              <div className="panel-body stack">
                <p className="hint">{a.description || 'No description.'}</p>
                <div className="chips">
                  {a.domains.map((d) => <span key={d} className="chip entry">{d}</span>)}
                  <span className="chip">{a.tools.length} tools</span>
                  <span className="chip">up to {a.max_steps} steps</span>
                  {a.verify && <span className="chip">checked</span>}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      </>}
    </div>
  )
}
