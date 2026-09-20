import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useJobStream } from '../useJobStream'

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour12: false }) : '')

export default function Ingest({ domain }) {
  const [files, setFiles] = useState([])
  const [hot, setHot] = useState(false)
  const [jobId, setJobId] = useState(null)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)
  const inputRef = useRef(null)
  const tapeRef = useRef(null)
  const { job, events } = useJobStream(jobId)

  useEffect(() => {
    if (tapeRef.current) tapeRef.current.scrollTop = tapeRef.current.scrollHeight
  }, [events])

  const addFiles = useCallback((incoming) => {
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...[...incoming].filter((f) => !seen.has(f.name + f.size))]
    })
  }, [])

  const start = async () => {
    setError(null); setStarting(true)
    try {
      const res = await api.ingest(domain, files)
      setJobId(res.job_id)
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) { setError(err.message) } finally { setStarting(false) }
  }

  const cancel = async () => { try { await api.cancelJob(jobId) } catch (err) { setError(err.message) } }

  const running = job && (job.state === 'running' || job.state === 'queued')
  const meterClass = job?.state === 'failed' || job?.state === 'cancelled' ? 'fault'
    : job?.state === 'succeeded' ? 'done' : ''

  return (
    <div className="split">
      <div className="stack">
        <section className="panel">
          <div className="panel-head">Source documents</div>
          <div className="panel-body stack">
            {error && <div className="banner">{error}</div>}
            <div
              className={`dropzone${hot ? ' hot' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setHot(true) }}
              onDragLeave={() => setHot(false)}
              onDrop={(e) => { e.preventDefault(); setHot(false); addFiles(e.dataTransfer.files) }}
            >
              <p>Drop chat logs, spreadsheets, PDFs or text here</p>
              <button className="btn" style={{ marginTop: 12 }} onClick={() => inputRef.current?.click()}>
                Choose files
              </button>
              <input
                ref={inputRef} type="file" multiple hidden
                accept=".pdf,.xlsx,.xls,.csv,.txt,.md"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <ul className="filelist">
                {files.map((f) => (
                  <li key={f.name + f.size}>
                    <span>{f.name}</span>
                    <span className="sz">{fmtSize(f.size)}</span>
                    <button
                      className="btn btn-quiet" style={{ padding: '2px 8px' }}
                      onClick={() => setFiles((p) => p.filter((x) => x !== f))}
                      aria-label={`Remove ${f.name}`}
                    >✕</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="row">
              <button className="btn btn-primary" disabled={!files.length || starting} onClick={start}>
                {starting ? 'Starting…' : `Extract graph from ${files.length || 0} file${files.length === 1 ? '' : 's'}`}
              </button>
              {running && <button className="btn btn-danger" onClick={cancel}>Stop</button>}
            </div>
            <p className="hint">
              Every entity and relationship is checked against the <strong>{domain}</strong> ontology
              before it reaches the graph. Anything outside the schema is rejected and counted below.
            </p>
          </div>
        </section>

        {job && (
          <section className="panel">
            <div className="panel-head">
              Job {job.id}
              <span className="spacer" />
              <span className={`state ${job.state}`}>{job.state}</span>
            </div>
            <div className="panel-body stack">
              <div className={`meter ${meterClass}`}><i style={{ width: `${(job.progress * 100).toFixed(1)}%` }} /></div>
              <div className="row mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                <span>{job.done} / {job.total} chunks</span>
                <span className="spacer" style={{ marginLeft: 'auto' }}>
                  {(job.progress * 100).toFixed(0)}%
                </span>
              </div>
              <div className="grid cols-3">
                <div className="readout signal"><div className="v">{job.counters.nodes_added}</div><div className="k">Nodes</div></div>
                <div className="readout signal"><div className="v">{job.counters.edges_added}</div><div className="k">Edges</div></div>
                <div className={`readout ${job.counters.rejects ? 'amber' : ''}`}>
                  <div className="v">{job.counters.rejects}</div><div className="k">Rejected</div>
                </div>
              </div>
              {job.error && <div className="banner">{job.error}</div>}
            </div>
          </section>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          Extraction log
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>{events.length} events</span>
        </div>
        <div className="panel-body">
          <div className="tape" ref={tapeRef}>
            {events.length === 0 && (
              <div className="tape-empty">
                Idle. Start an extraction to watch chunks land here in real time.
              </div>
            )}
            {events.map((e) => (
              <div key={e.seq} className={`tape-row ${e.kind}`}>
                <span className="t">{clock(e.ts)}</span>
                <span className="g" />
                <span className="m">
                  {e.message}
                  {/* The server already sends the exception text on a failed
                      chunk. Showing only the class name turns a one-line
                      diagnosis into a round trip through the jobs endpoint. */}
                  {e.detail && <span className="tape-detail"> — {e.detail}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
