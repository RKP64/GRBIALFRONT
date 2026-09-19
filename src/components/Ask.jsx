import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Markdown from './Markdown'

/* The agent's working. Shown collapsed by default — the answer is the point,
   the trace is for when it looks wrong. */
function Trace({ steps, toolCalls, stoppedAtLimit, path }) {
  const [open, setOpen] = useState(false)
  const icon = { thinking: '·', tool_call: '→', tool_result: '←', answer: '✓',
                 limit: '!', handoff: '⇢', agent_start: '▸' }
  return (
    <div className="trace">
      <button className="trace-head" onClick={() => setOpen(!open)}>
        <span style={{ fontWeight: 600 }}>
          {path?.length > 1
            ? path.join(' → ')
            : `${toolCalls} source${toolCalls === 1 ? '' : 's'} consulted`}
        </span>
        {stoppedAtLimit && (
          <span className="hint" style={{ color: 'var(--warning)' }}>reached step limit</span>
        )}
        <span className="hint" style={{ marginLeft: 'auto' }}>{open ? 'hide' : 'how it worked'}</span>
      </button>
      {open && (
        <ol className="trace-body">
          {steps.map((s, i) => (
            <li key={i} className={`trace-step ${s.kind}`}>
              <span className="trace-mark">{icon[s.kind] || '·'}</span>
              <div>
                <span className="trace-detail">{s.detail}</span>
                {s.duration_ms > 0 && (
                  <span className="hint" style={{ marginLeft: 8 }}>{s.duration_ms}ms</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* Claim-level grounding. Shown as a per-claim breakdown rather than a single
   number, because "which sentence is unsupported" is the actionable part. */
function Verification({ result }) {
  const [open, setOpen] = useState(false)
  const pct = Math.round((result.grounding_score || 0) * 100)
  const tone = result.contradicted > 0 ? 'bad'
    : result.unsupported > 0 ? 'warn' : 'good'
  const colour = { good: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)' }[tone]
  const icon = { supported: '✓', unsupported: '?', contradicted: '✕', not_checkable: '·' }

  if (!result.checkable_claims) {
    return <p className="hint" style={{ marginTop: 10 }}>No factual claims to check.</p>
  }

  return (
    <div className="grounding" style={{ borderColor: colour }}>
      <button className="grounding-head" onClick={() => setOpen(!open)}>
        <span className="grounding-score" style={{ color: colour }}>{pct}%</span>
        <span>
          <span style={{ fontWeight: 600 }}>
            {result.supported} of {result.checkable_claims} claims traced to a recorded fact
          </span>
          {result.contradicted > 0 && (
            <span style={{ display: 'block', color: 'var(--danger)', fontSize: 12.5 }}>
              {result.contradicted} conflict{result.contradicted > 1 ? 's' : ''} with the graph
            </span>
          )}
        </span>
        <span className="hint" style={{ marginLeft: 'auto' }}>{open ? 'hide' : 'details'}</span>
      </button>

      {open && (
        <div className="grounding-body">
          {result.claims.map((c, i) => (
            <div key={i} className={`claim ${c.status}`}>
              <span className="claim-mark">{icon[c.status]}</span>
              <div>
                <div>{c.claim}</div>
                {c.evidence?.length > 0 && (
                  <div className="claim-evidence">
                    {c.evidence.map((e, n) => (
                      <span key={n}>
                        {e.source} <em>{e.relation.replace(/_/g, ' ')}</em> {e.target}
                      </span>
                    ))}
                  </div>
                )}
                {c.status !== 'supported' && c.reason && (
                  <div className="claim-reason">{c.reason}</div>
                )}
              </div>
            </div>
          ))}
          {result.note && <p className="hint" style={{ marginTop: 10 }}>{result.note}</p>}
        </div>
      )}
    </div>
  )
}

export default function Ask({ domain }) {
  const [turns, setTurns] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('graph')
  const [modes, setModes] = useState(null)
  const [docSource, setDocSource] = useState('auto')
  const [checkAnswers, setCheckAnswers] = useState(true)
  const [agentMode, setAgentMode] = useState(false)
  const [agentReady, setAgentReady] = useState(null)
  const [agents, setAgents] = useState([])
  const [agentKey, setAgentKey] = useState('')
  const [teams, setTeams] = useState([])
  const scrollRef = useRef(null)

  useEffect(() => {
    api.queryModes(domain).then(setModes).catch(() => setModes(null))
    api.agentTools().then(setAgentReady).catch(() => setAgentReady(null))
    api.agents().then(setAgents).catch(() => setAgents([]))
    api.teams().then(setTeams).catch(() => setTeams([]))
  }, [domain])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns, busy])
  useEffect(() => { setTurns([]) }, [domain])

  const hybridReady = modes?.hybrid?.available
  const sources = modes?.hybrid?.sources || []
  const sourceLabel = { service: 'search service', local: 'this workspace' }
  const activeAgent = agents.find((a) => a.key === agentKey)

  const send = async (text) => {
    const question = (text ?? draft).trim()
    if (!question || busy) return
    setDraft(''); setBusy(true)
    setTurns((prev) => [...prev, { role: 'you', text: question }])
    try {
      const res = agentMode
        ? (agentKey.startsWith('team:')
            ? await api.askTeam(agentKey.slice(5), { question, verify: checkAnswers })
            : agentKey
              ? await api.askSavedAgent(agentKey, { question, domain, verify: checkAnswers })
              : await api.askAgent({ domain, question, verify: checkAnswers, max_steps: 6 }))
        : await api.query({
            domain, question, mode, top_k: 5, hops: 1, doc_k: 5,
            doc_source: mode === 'hybrid' ? docSource : 'none',
            verify: checkAnswers,
          })
      setTurns((prev) => [...prev, { role: 'graph', agent: agentMode, ...res }])
    } catch (err) {
      setTurns((prev) => [...prev, { role: 'graph', error: err.message }])
    } finally { setBusy(false) }
  }

  return (
    <div className="chat">
      <div className="row wrap" style={{ paddingBottom: 12 }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--muted)' }}>Answer from</span>
        <div className="seg">
          <button className={`seg-btn${!agentMode && mode === 'graph' ? ' on' : ''}`}
                  onClick={() => { setAgentMode(false); setMode('graph') }}>Graph only</button>
          <button className={`seg-btn${!agentMode && mode === 'hybrid' ? ' on' : ''}`}
                  onClick={() => { if (hybridReady) { setAgentMode(false); setMode('hybrid') } }}
                  disabled={!hybridReady}
                  title={hybridReady ? '' : modes?.hybrid?.note || 'Document search is not connected'}>
            Graph + documents
          </button>
          <button className={`seg-btn${agentMode ? ' on' : ''}`}
                  onClick={() => agentReady?.available && setAgentMode(true)}
                  disabled={!agentReady?.available}
                  title={agentReady?.available ? '' : agentReady?.note || 'Not available'}>
            Let it decide
          </button>
        </div>
        {agentMode && (agents.length > 0 || teams.length > 0) && (
          <>
            <span className="hint" style={{ fontWeight: 500, marginLeft: 8 }}>Using</span>
            <select className="domain-select" value={agentKey}
                    onChange={(e) => setAgentKey(e.target.value)}>
              <option value="">No saved agent</option>
              {agents.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
              {teams.length > 0 && (
                <optgroup label="Teams">
                  {teams.map((t) => (
                    <option key={t.key} value={`team:${t.key}`}>{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </>
        )}
        {mode === 'hybrid' && sources.length > 1 && (
          <>
            <span className="hint" style={{ fontWeight: 500, marginLeft: 8 }}>Passages from</span>
            <select className="domain-select" value={docSource}
                    onChange={(e) => setDocSource(e.target.value)}>
              <option value="auto">Best available</option>
              <option value="service">Search service</option>
              <option value="local">This workspace</option>
            </select>
          </>
        )}
        <label className="row" style={{ gap: 7, marginLeft: 8 }}>
          <input type="checkbox" checked={checkAnswers}
                 onChange={(e) => setCheckAnswers(e.target.checked)} />
          <span className="hint">Check answers against the graph</span>
        </label>
        <span className="hint" style={{ marginLeft: 'auto' }}>
          {agentMode
            ? 'Chooses its own sources and looks again if the first pass is thin.'
            : mode === 'graph'
              ? 'Entities and their connections only.'
              : 'Graph facts plus source passages, searched in parallel.'}
        </span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {turns.length === 0 && (
          <div className="empty">
            <h3>{activeAgent ? activeAgent.name : 'Ask the graph'}</h3>
            {activeAgent?.description && (
              <p className="hint" style={{ marginBottom: 10 }}>{activeAgent.description}</p>
            )}
            <p className="hint">
              Answers are grounded in what was retrieved — open the context panel on any
              answer to see exactly which nodes, edges and passages were used.
            </p>
            {activeAgent?.starters?.length > 0 && (
              <div className="chips" style={{ justifyContent: 'center', marginTop: 16 }}>
                {activeAgent.starters.map((q) => (
                  <button key={q} className="chip" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            )}
            {!hybridReady && modes && (
              <p className="hint" style={{ marginTop: 12, color: 'var(--amber)' }}>
                {modes.hybrid.note}
              </p>
            )}
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={`turn ${turn.role === 'you' ? 'you' : ''}`}>
            <span className="who">{turn.role === 'you' ? 'You' : 'Assistant'}</span>
            <div className="bubble">
              {turn.role === 'you' && <p>{turn.text}</p>}
              {turn.error && <p style={{ color: 'var(--coral)' }}>{turn.error}</p>}
              {turn.answer && <Markdown>{turn.answer}</Markdown>}

              {turn.role === 'graph' && !turn.error && (
                <>
                  {turn.steps && (
                    <Trace steps={turn.steps} toolCalls={turn.tool_calls}
                           stoppedAtLimit={turn.stopped_at_limit} path={turn.path} />
                  )}

                  <div className="chips">
                    <span className="chip">
                      {turn.team?.name || turn.agent?.name || (turn.agent ? 'agent'
                        : turn.mode === 'hybrid' ? 'graph + documents' : 'graph')}
                    </span>
                    <span className="chip">matched by {turn.retriever}</span>
                    {(turn.entry_points || []).slice(0, 6).map((e) => (
                      <span key={e} className="chip entry">{e}</span>
                    ))}
                    <span className="chip">
                      {turn.subgraph?.nodes?.length || 0} nodes · {turn.subgraph?.edges?.length || 0} edges
                    </span>
                    {turn.documents?.length > 0 && (
                      <span className="chip doc">
                        {turn.documents.length} passages
                        {sourceLabel[turn.document_source]
                          ? ` from ${sourceLabel[turn.document_source]}` : ''}
                      </span>
                    )}
                  </div>

                  {turn.search_note && (
                    <p className="hint" style={{ marginTop: 8, color: 'var(--amber)' }}>
                      {turn.search_note}
                    </p>
                  )}

                  {turn.documents?.length > 0 && (
                    <div className="sources">
                      {turn.documents.map((d, n) => (
                        <div key={n} className="source-row">
                          <span className="mono src-n">[{n + 1}]</span>
                          <div>
                            {d.url ? (
                              <a href={d.url} target="_blank" rel="noreferrer" className="src-title">
                                {d.title}
                              </a>
                            ) : <span className="src-title">{d.title}</span>}
                            <p className="src-snip">{d.content.slice(0, 190)}…</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {turn.verification && !turn.verification.error && (
                    <Verification result={turn.verification} />
                  )}

                  {(turn.context || turn.document_context) && (
                    <details className="evidence">
                      <summary>Retrieved context</summary>
                      <pre>
                        {turn.context ? `— KNOWLEDGE GRAPH —\n${turn.context}\n\n` : ''}
                        {turn.document_context ? `— DOCUMENTS —\n${turn.document_context}` : ''}
                      </pre>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="turn">
            <span className="who">Assistant</span>
            <div className="bubble">
              <p className="hint">
                {agentMode ? 'Working through it…'
                  : mode === 'hybrid' ? 'Searching the graph and the documents…'
                  : 'Searching the graph…'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        <input className="input" value={draft} placeholder="Ask a question…"
               onChange={(e) => setDraft(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button className="btn btn-primary" onClick={() => send()} disabled={busy || !draft.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
