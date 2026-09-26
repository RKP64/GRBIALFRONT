import { useEffect, useState } from 'react'
import { api } from '../api'

const VERDICT_COLOUR = {
  correct: '#10B981',
  partial: '#F59E0B',
  refused: '#0EA5E9',      // a correct refusal: the data genuinely did not hold it
  incorrect: '#EF4444',
  error: '#94A3B8',        // the agent failed to answer — not a verdict
  unjudged: '#94A3B8',     // the judge failed — not a verdict
}
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)

function Score({ label, value, suffix = '' }) {
  return (
    <div className="stat">
      <div className="stat-value">{value ?? '—'}{value != null ? suffix : ''}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export default function Evals() {
  const [sets, setSets] = useState([])
  const [runs, setRuns] = useState([])
  const [agents, setAgents] = useState([])
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  const [uploadKey, setUploadKey] = useState('')
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [setKey, setSetKey] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [running, setRunning] = useState(null)   // { job_id, done, total }

  const [detail, setDetail] = useState(null)
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [comparison, setComparison] = useState(null)

  const load = async () => {
    try {
      const [s, r, a] = await Promise.all([api.evalSets(), api.evalRuns(), api.agents()])
      setSets(s); setRuns(r); setAgents(a)
      if (!setKey && s.length) setSetKey(s[0].key)
      if (!agentKey && a.length) setAgentKey(a[0].key)
      setError(null)
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  const upload = async () => {
    if (!file || !uploadKey.trim()) return
    setUploading(true); setError(null); setNote(null)
    try {
      const saved = await api.uploadEvalSet(uploadKey.trim(), name.trim(), file)
      setNote(`Loaded ${saved.items} questions into '${saved.key}'.`)
      setUploadKey(''); setName(''); setFile(null)
      await load()
    } catch (err) { setError(err.message) }
    finally { setUploading(false) }
  }

  const start = async () => {
    if (!setKey || !agentKey) return
    setError(null); setNote(null); setComparison(null)
    try {
      const started = await api.startEval({ set_key: setKey, agent_key: agentKey })
      setRunning({ job_id: started.job_id, done: 0, total: started.questions })
      poll(started.job_id)
    } catch (err) { setError(err.message) }
  }

  // Polled rather than streamed: a run is minutes long and the only thing worth
  // showing is progress, so a socket would be more machinery than the job needs.
  const poll = (jobId) => {
    const timer = setInterval(async () => {
      try {
        const job = await api.job(jobId)
        setRunning({ job_id: jobId, done: job.done, total: job.total })
        if (['succeeded', 'failed', 'cancelled'].includes(job.state)) {
          clearInterval(timer)
          setRunning(null)
          if (job.state === 'failed') setError(job.error || 'The run failed.')
          else setNote('Run finished.')
          await load()
        }
      } catch (err) {
        clearInterval(timer); setRunning(null); setError(err.message)
      }
    }, 2000)
  }

  const compare = async () => {
    if (!compareA || !compareB || compareA === compareB) return
    setError(null)
    try { setComparison(await api.evalCompare(compareA, compareB)) }
    catch (err) { setError(err.message) }
  }

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}
      {note && <div className="banner ok">{note}</div>}

      <p className="hint" style={{ maxWidth: 720 }}>
        A golden set is questions with answers someone considers correct. Run one
        against any agent to get a number, and compare two runs to see what a
        change actually did — including the questions that broke while the
        headline stayed still.
      </p>

      <section className="panel">
        <div className="panel-head">Golden sets</div>
        <div className="panel-body stack">
          {sets.length === 0 && (
            <p className="hint">None yet. Upload a CSV, XLSX or JSON with a
              question column and an expected-answer column.</p>
          )}
          {sets.map((s) => (
            <div key={s.key} className="row">
              <span className="mono">{s.key}</span>
              <span className="hint">{s.name} · {s.items} questions</span>
              <span className="spacer" />
              <button className="btn btn-quiet btn-danger"
                      onClick={async () => {
                        if (!confirm(`Remove '${s.key}'?`)) return
                        await api.deleteEvalSet(s.key); load()
                      }}>Remove</button>
            </div>
          ))}

          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" placeholder="key, e.g. bial-golden"
                   value={uploadKey} onChange={(e) => setUploadKey(e.target.value)}
                   style={{ width: 190 }} />
            <input className="input" placeholder="name (optional)"
                   value={name} onChange={(e) => setName(e.target.value)}
                   style={{ flex: 1 }} />
            <input type="file" accept=".csv,.xlsx,.xls,.json"
                   onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="btn btn-primary" onClick={upload}
                    disabled={uploading || !file || !uploadKey.trim()}>
              {uploading ? 'Reading…' : 'Upload'}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Run</div>
        <div className="panel-body stack">
          <div className="row">
            <select className="input" value={setKey} style={{ flex: 1 }}
                    onChange={(e) => setSetKey(e.target.value)}>
              {sets.map((s) => (
                <option key={s.key} value={s.key}>{s.key} ({s.items})</option>
              ))}
            </select>
            <span className="hint">against</span>
            <select className="input" value={agentKey} style={{ flex: 1 }}
                    onChange={(e) => setAgentKey(e.target.value)}>
              {agents.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} · {a.retrieval_mode || 'graph+rag'}
                  {a.model ? ` · ${a.model}` : ''}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={start}
                    disabled={!!running || !setKey || !agentKey}>
              {running ? `${running.done}/${running.total}` : 'Run'}
            </button>
          </div>
          {running && (
            <p className="hint">
              Running one question at a time so the latency figure means
              something. This takes a few minutes.
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          Runs
          <span className="spacer" />
          <span className="hint">newest first</span>
        </div>
        <div className="panel-body stack">
          {runs.length === 0 && <p className="hint">No runs yet.</p>}
          {runs.map((r) => (
            <div key={r.id} className="row">
              <span className="mono">{r.id}</span>
              <span className="hint">{r.agent_key} · {r.model}</span>
              <span className="spacer" />
              <span className="chip">
                {r.scores?.accuracy != null
                  ? `${pct(r.scores.accuracy)} accurate` : 'not scored'}
                {r.scores?.scored != null && r.scores.scored < r.scores.total
                  ? ` · ${r.scores.scored}/${r.scores.total} judged` : ''}
              </span>
              {(r.scores?.errors > 0 || r.scores?.unjudged > 0) && (
                <span className="chip" style={{ color: '#B45309' }}
                      title="Questions that could not be scored are excluded from accuracy">
                  {r.scores.errors || 0} failed · {r.scores.unjudged || 0} not judged
                </span>
              )}
              <span className="chip" title="Only measured when the agent has answer checking switched on">
                {r.scores?.grounding != null ? `${pct(r.scores.grounding)} grounded` : 'grounding not measured'}
              </span>
              {r.scores?.median_seconds != null &&
                <span className="chip">{r.scores.median_seconds}s median</span>}
              <button className="btn btn-quiet"
                      onClick={async () => setDetail(await api.evalRun(r.id))}>
                Open
              </button>
            </div>
          ))}

          {runs.length > 1 && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="hint">Compare</span>
              <select className="input" value={compareA}
                      onChange={(e) => setCompareA(e.target.value)}>
                <option value="">baseline…</option>
                {runs.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.agent_key}</option>)}
              </select>
              <span className="hint">with</span>
              <select className="input" value={compareB}
                      onChange={(e) => setCompareB(e.target.value)}>
                <option value="">changed…</option>
                {runs.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.agent_key}</option>)}
              </select>
              <button className="btn" onClick={compare}
                      disabled={!compareA || !compareB || compareA === compareB}>
                Compare
              </button>
            </div>
          )}
        </div>
      </section>

      {comparison && (
        <section className="panel">
          <div className="panel-head">
            Comparison
            <span className="spacer" />
            {comparison.accuracy_delta != null ? (
              <span className="chip" style={{
                background: comparison.accuracy_delta >= 0 ? '#E8F5E9' : '#FFEBEE',
                color: comparison.accuracy_delta >= 0 ? '#10B981' : '#EF4444',
              }}>
                {comparison.accuracy_delta >= 0 ? '+' : ''}
                {Math.round(comparison.accuracy_delta * 100)} points
              </span>
            ) : <span className="chip">no accuracy to compare</span>}
          </div>
          <div className="panel-body stack">
            {comparison.warning && <div className="banner">{comparison.warning}</div>}
            <p className="hint">{comparison.questions_compared} question
              {comparison.questions_compared === 1 ? '' : 's'} compared.</p>
            {comparison.not_comparable?.length > 0 && (
              <p className="hint">{comparison.not_comparable.length} left out because one
                run failed or could not judge them — those say nothing about whether
                answers improved.</p>
            )}
            {comparison.regressed.length === 0 && comparison.improved.length === 0 && (
              <p className="hint">No question changed verdict.</p>
            )}
            {comparison.regressed.length > 0 && (
              <>
                <p className="hint"><b>Regressed ({comparison.regressed.length})</b> —
                  these worked before and do not now.</p>
                {comparison.regressed.map((r, i) => (
                  <div key={i} className="row">
                    <span style={{ flex: 1 }}>{r.question}</span>
                    <span className="chip" style={{ color: VERDICT_COLOUR[r.from] }}>{r.from}</span>
                    <span className="hint">→</span>
                    <span className="chip" style={{ color: VERDICT_COLOUR[r.to] }}>{r.to}</span>
                  </div>
                ))}
              </>
            )}
            {comparison.improved.length > 0 && (
              <>
                <p className="hint" style={{ marginTop: 8 }}>
                  <b>Improved ({comparison.improved.length})</b></p>
                {comparison.improved.map((r, i) => (
                  <div key={i} className="row">
                    <span style={{ flex: 1 }}>{r.question}</span>
                    <span className="chip" style={{ color: VERDICT_COLOUR[r.from] }}>{r.from}</span>
                    <span className="hint">→</span>
                    <span className="chip" style={{ color: VERDICT_COLOUR[r.to] }}>{r.to}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      )}

      {detail && (
        <section className="panel">
          <div className="panel-head">
            {detail.id} · {detail.agent_key}
            <span className="spacer" />
            <button className="btn btn-quiet" onClick={() => setDetail(null)}>Close</button>
          </div>
          <div className="panel-body stack">
            <div className="stats">
              <Score label={`accurate · ${detail.scores?.scored ?? 0} judged`}
                     value={detail.scores?.accuracy != null ? Math.round(detail.scores.accuracy * 100) : '—'}
                     suffix={detail.scores?.accuracy != null ? '%' : ''} />
              <Score label="correct" value={detail.scores?.correct} />
              <Score label="right to decline" value={detail.scores?.refused} />
              <Score label="partial" value={detail.scores?.partial} />
              <Score label="incorrect" value={detail.scores?.incorrect} />
              {(detail.scores?.errors > 0 || detail.scores?.unjudged > 0) && (
                <Score label="failed / not judged"
                       value={`${detail.scores.errors || 0} / ${detail.scores.unjudged || 0}`} />
              )}
              <Score label="grounded" value={pct(detail.scores?.grounding)} />
              <Score label="median" value={detail.scores?.median_seconds ?? '—'}
                     suffix={detail.scores?.median_seconds != null ? 's' : ''} />
            </div>
            {(detail.results || []).map((r, i) => (
              <div key={i} className="stack" style={{
                borderLeft: `3px solid ${VERDICT_COLOUR[r.verdict] || '#CBD5E1'}`,
                paddingLeft: 10, marginBottom: 10,
              }}>
                <div className="row">
                  <b style={{ flex: 1 }}>{r.question}</b>
                  <span className="chip" style={{ color: VERDICT_COLOUR[r.verdict] }}>
                    {r.verdict}
                  </span>
                </div>
                <p className="hint" style={{ margin: 0 }}>Expected: {r.expected}</p>
                <p style={{ margin: 0, fontSize: 13 }}>{r.answer || '(no answer)'}</p>
                {r.reason && <p className="hint" style={{ margin: 0 }}>{r.reason}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
