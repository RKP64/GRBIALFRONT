import { useEffect, useState } from 'react'
import { api } from '../api'

const KIND_LABEL = {
  fact: 'Direct facts', inverse: 'Reverse lookups', multihop: 'Two-step reasoning',
  refusal: 'Knowing when to decline', passage: 'Source wording',
}

const modelId = (m) => (typeof m === 'string' ? m : m?.id || '')

export default function Train({ domain }) {
  const [providers, setProviders] = useState([])
  const [datasets, setDatasets] = useState([])
  const [jobs, setJobs] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)

  const [gen, setGen] = useState({
    include_facts: true, include_inverse: true, include_multihop: true,
    include_refusals: true, include_passages: false, rephrase: false,
    abstract_entities: false, seed: 42,
  })
  const [cfg, setCfg] = useState({
    provider: '', base_model: '', suffix: '', epochs: 2, seed: 42,
  })
  // Shown only where the provider genuinely configures an adapter.
  const [adapter, setAdapter] = useState({
    lora_rank: 16, lora_alpha: 32, lora_dropout: 0.05,
    quantization: '4bit', max_seq_length: 2048, learning_rate: 0.0002,
  })

  const load = async () => {
    try {
      const [p, d, j] = await Promise.all([
        api.trainingProviders(), api.datasets(), api.trainingJobs(),
      ])
      setProviders(p); setDatasets(d); setJobs(j); setError(null)
      const trainable = p.find((x) => x.can_train)
      setCfg((c) => ({
        ...c,
        provider: c.provider || trainable?.key || '',
        base_model: c.base_model || modelId(trainable?.base_models?.[0]) || '',
      }))
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [domain])

  // Poll while anything is still running, so the page reflects the provider.
  useEffect(() => {
    if (!jobs.some((j) => !['succeeded', 'failed', 'cancelled'].includes(j.state))) return
    const id = setInterval(async () => {
      try { setJobs(await api.trainingJobs()) } catch { /* transient */ }
    }, 15000)
    return () => clearInterval(id)
  }, [jobs])

  const openDataset = async (id) => {
    setSelected(id); setDetail(null)
    try { setDetail(await api.dataset(id)) } catch (err) { setError(err.message) }
  }

  const generate = async () => {
    setBusy(true); setError(null); setNote(null)
    try {
      const meta = await api.generateDataset({ domain, ...gen })
      setNote(`Built ${meta.train_examples} training and ${meta.validation_examples} validation examples.`)
      await load(); await openDataset(meta.id)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const start = async () => {
    if (!selected) { setError('Choose a training set first.'); return }
    setBusy(true); setError(null); setNote(null)
    try {
      const supports = (k) => activeProvider?.hyperparameters?.includes(k)
      const extras = Object.fromEntries(
        Object.entries(adapter).filter(([k]) => supports(k)))
      await api.startTraining({ ...cfg, ...extras, dataset_id: selected })
      setNote('Training started. It will continue on the provider even if you close this page.')
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const deploy = async (job) => {
    const name = window.prompt('Name for this model:', `${job.domain}-slm`)
    if (!name) return
    try {
      const res = await api.deployModel(job.id, name)
      setNote(res.deployment?.manual_step || 'Model registered.')
      await load()
    } catch (err) { setError(err.message) }
  }

  const activeProvider = providers.find((p) => p.key === cfg.provider)
  const trainable = providers.filter((p) => p.can_train)

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}
      {note && <div className="banner ok">{note}</div>}

      <p className="hint" style={{ maxWidth: 760 }}>
        The graph is also a source of training data. Every relationship it holds can be
        turned into a question and answer, every two-step path into a reasoning example,
        and every gap into an example of declining to answer — each one traceable to an
        entity that passed schema validation.
      </p>

      <div className="split">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">1 · Build a training set from {domain}</div>
            <div className="panel-body stack">
              {[['include_facts', 'Direct facts', 'One question per relationship.'],
                ['include_inverse', 'Reverse lookups', 'Everything pointing at one entity.'],
                ['include_multihop', 'Two-step reasoning', 'Facts that must be joined to answer.'],
                ['include_refusals', 'Knowing when to decline', 'Questions the graph cannot answer.'],
                ['include_passages', 'Source wording', 'Passages as written, if kept during ingestion.'],
                ['abstract_entities', 'Shareable (names removed)',
                 'Replace every entity name with a typed placeholder. Teaches '
                 + 'vocabulary and reasoning without carrying your facts, so the '
                 + 'dataset can leave your organisation. Source passages are excluded.'],
                ['rephrase', 'Natural phrasing',
                 'Rewrite the generated questions the way a person would ask them. '
                 + 'Costs model calls; answers are never altered.'],
              ].map(([key, label, help]) => (
                <label key={key} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <input type="checkbox" checked={gen[key]} style={{ marginTop: 4 }}
                         onChange={(e) => setGen({ ...gen, [key]: e.target.checked })} />
                  <span>
                    <span style={{ fontWeight: 500 }}>{label}</span>
                    <span className="hint" style={{ display: 'block' }}>{help}</span>
                  </span>
                </label>
              ))}
              <button className="btn btn-primary" onClick={generate} disabled={busy}>
                {busy ? 'Building…' : 'Build training set'}
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">2 · Choose a base model</div>
            <div className="panel-body stack">
              {trainable.length === 0 ? (
                <p className="hint">
                  No provider here can run training yet. {providers.map((p) => p.note)
                    .filter(Boolean)[0]}
                </p>
              ) : (
                <>
                  <div className="field">
                    <label>Provider</label>
                    <select className="domain-select" value={cfg.provider}
                            onChange={(e) => {
                              const p = providers.find((x) => x.key === e.target.value)
                              setCfg({ ...cfg, provider: e.target.value,
                                       base_model: modelId(p?.base_models?.[0]) || '' })
                            }}>
                      {trainable.map((p) => <option key={p.key} value={p.key}>{p.label || p.key}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Base model</label>
                    {activeProvider?.base_models?.length ? (
                      <select className="domain-select" value={cfg.base_model}
                              onChange={(e) => setCfg({ ...cfg, base_model: e.target.value })}>
                        {activeProvider.base_models.map((m) => (
                          typeof m === 'string'
                            ? <option key={m} value={m}>{m}</option>
                            : <option key={m.id} value={m.id}>{m.label || m.id}</option>
                        ))}
                      </select>
                    ) : (
                      <input className="input" value={cfg.base_model} placeholder="model identifier"
                             onChange={(e) => setCfg({ ...cfg, base_model: e.target.value })} />
                    )}
                  </div>
                  <div className="grid cols-2">
                    <div className="field">
                      <label>Name suffix</label>
                      <input className="input" value={cfg.suffix} placeholder="tax-v1"
                             onChange={(e) => setCfg({ ...cfg, suffix: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Passes over the data</label>
                      <input className="input" type="number" min={1} max={10} value={cfg.epochs}
                             onChange={(e) => setCfg({ ...cfg, epochs: Number(e.target.value) })} />
                    </div>
                  </div>
                  <p className="hint">
                    Two passes suit most sets built this way. More risks the model
                    memorising the phrasing rather than learning the facts.
                  </p>

                  {activeProvider?.hyperparameters?.includes('lora_rank') && (
                    <details className="evidence" open>
                      <summary>Adapter settings</summary>
                      <div className="stack" style={{ marginTop: 12 }}>
                        <p className="hint">
                          Training happens on your hardware, so these are applied rather
                          than suggested. Only a small set of extra weights is trained;
                          the base model is left untouched.
                        </p>
                        <div className="grid cols-3">
                          <div className="field">
                            <label>Capacity (rank)</label>
                            <input className="input" type="number" min={1} max={256}
                                   value={adapter.lora_rank}
                                   onChange={(e) => setAdapter({ ...adapter,
                                     lora_rank: Number(e.target.value),
                                     lora_alpha: Number(e.target.value) * 2 })} />
                          </div>
                          <div className="field">
                            <label>Scaling (alpha)</label>
                            <input className="input" type="number" min={1} max={512}
                                   value={adapter.lora_alpha}
                                   onChange={(e) => setAdapter({ ...adapter,
                                     lora_alpha: Number(e.target.value) })} />
                          </div>
                          <div className="field">
                            <label>Dropout</label>
                            <input className="input" type="number" step="0.01" min={0} max={0.5}
                                   value={adapter.lora_dropout}
                                   onChange={(e) => setAdapter({ ...adapter,
                                     lora_dropout: Number(e.target.value) })} />
                          </div>
                        </div>
                        <div className="grid cols-3">
                          <div className="field">
                            <label>Memory saving</label>
                            <select className="domain-select" value={adapter.quantization}
                                    onChange={(e) => setAdapter({ ...adapter,
                                      quantization: e.target.value })}>
                              <option value="4bit">4-bit (fits a single card)</option>
                              <option value="8bit">8-bit</option>
                              <option value="none">None (needs most VRAM)</option>
                            </select>
                          </div>
                          <div className="field">
                            <label>Max example length</label>
                            <input className="input" type="number" min={128} max={32768}
                                   value={adapter.max_seq_length}
                                   onChange={(e) => setAdapter({ ...adapter,
                                     max_seq_length: Number(e.target.value) })} />
                          </div>
                          <div className="field">
                            <label>Learning rate</label>
                            <input className="input" type="number" step="0.00001"
                                   value={adapter.learning_rate}
                                   onChange={(e) => setAdapter({ ...adapter,
                                     learning_rate: Number(e.target.value) })} />
                          </div>
                        </div>
                        <p className="hint">
                          Higher capacity learns more and overfits sooner. Scaling is
                          usually twice the capacity — it follows automatically unless
                          you change it.
                        </p>
                      </div>
                    </details>
                  )}
                  <button className="btn btn-primary" onClick={start} disabled={busy || !selected}>
                    {selected ? 'Start training' : 'Choose a training set first'}
                  </button>
                  {activeProvider && (
                    <div className="chips" style={{ marginTop: 8 }}>
                      <span className="chip"
                            style={activeProvider.can_download_weights
                              ? { background: '#E8F5E9', color: '#1F7A4D',
                                  borderColor: '#BFE3CC' }
                              : {}}>
                        {activeProvider.can_download_weights
                          ? 'Weights downloadable'
                          : 'Weights stay with provider'}
                      </span>
                      {activeProvider.data_residency && (
                        <span className="chip">{activeProvider.data_residency}</span>
                      )}
                    </div>
                  )}
                  {activeProvider?.requirements?.length > 0 && (
                    <p className="hint">
                      Needs: {activeProvider.requirements.join('; ')}.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              Training sets
              <span className="spacer" />
              <span className="hint">{datasets.length}</span>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              {datasets.length === 0 ? (
                <div className="empty"><p className="hint">None built yet.</p></div>
              ) : (
                <table className="grid-table">
                  <thead><tr><th>Set</th><th className="num">Train</th><th className="num">Validate</th><th /></tr></thead>
                  <tbody>
                    {datasets.map((d) => (
                      <tr key={d.id} onClick={() => openDataset(d.id)}
                          style={{ cursor: 'pointer',
                                   background: selected === d.id ? 'var(--accent-soft)' : undefined }}>
                        <td>{d.id}<span className="hint" style={{ display: 'block' }}>{d.domain}</span></td>
                        <td className="num">{d.train_examples}</td>
                        <td className="num">{d.validation_examples}</td>
                        <td style={{ width: 40 }}>
                          <a className="btn btn-quiet" style={{ padding: '2px 8px' }}
                             href={`#`} onClick={async (e) => {
                               e.preventDefault(); e.stopPropagation()
                               await api.download(`/training/datasets/${d.id}/download?split=train`,
                                                  `${d.id}.train.jsonl`)
                             }}>↓</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {detail && (
            <section className="panel">
              <div className="panel-head">What this set teaches</div>
              <div className="panel-body stack">
                <div className="chips">
                  {Object.entries(detail.breakdown || {}).map(([kind, n]) => (
                    <span key={kind} className="chip">{KIND_LABEL[kind] || kind}: {n}</span>
                  ))}
                </div>
                {(detail.preview || []).slice(0, 3).map((row, i) => {
                  const m = Object.fromEntries(row.messages.map((x) => [x.role, x.content]))
                  return (
                    <div key={i} className="source-row" style={{ gridTemplateColumns: '1fr' }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{m.user}</div>
                        <p className="src-snip">{m.assistant}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">3 · Models</div>
            <div className="panel-body" style={{ padding: 0 }}>
              {jobs.length === 0 ? (
                <div className="empty"><p className="hint">No training runs yet.</p></div>
              ) : (
                <table className="grid-table">
                  <thead><tr><th>Run</th><th>Base</th><th>State</th><th /></tr></thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id}>
                        <td>
                          {j.suffix || j.id}
                          <span className="hint" style={{ display: 'block' }}>{j.domain}</span>
                        </td>
                        <td className="hint">{j.base_model}</td>
                        <td>
                          <span className={`state ${['succeeded', 'failed', 'cancelled'].includes(j.state)
                            ? j.state : 'running'}`}>{j.state}</span>
                          {typeof j.progress === 'number' && j.progress > 0 && j.progress < 1 && (
                            <span className="hint" style={{ display: 'block' }}>
                              {Math.round(j.progress * 100)}%
                            </span>
                          )}
                          {j.error && <span className="hint" style={{ display: 'block', color: 'var(--danger)' }}>
                            {j.error.slice(0, 70)}</span>}
                        </td>
                        <td style={{ width: 130 }}>
                          {j.model_ref && !j.deployment && (
                            <button className="btn" style={{ padding: '4px 10px' }}
                                    onClick={() => deploy(j)}>Make available</button>
                          )}
                          {j.deployment && <span className="chip entry">ready</span>}
                          {!j.model_ref && !['failed', 'cancelled'].includes(j.state) && (
                            <button className="btn btn-quiet" style={{ padding: '4px 10px' }}
                                    onClick={async () => { await api.cancelTraining(j.id); load() }}>
                              Stop</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
