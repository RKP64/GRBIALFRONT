import { useEffect, useState } from 'react'
import { api } from '../api'

const blank = () => ({
  key: '', name: '', description: '',
  entity_types: {}, allowed_triples: [], normalization_rules: [], id_transforms: [],
  strip_type_prefixes: true, collapse_whitespace: true,
  open_relations: false, custom_prompt: '',
})

export default function Schema({ domain, onDomainsChanged }) {
  const [spec, setSpec] = useState(null)
  const [draft, setDraft] = useState(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importNotes, setImportNotes] = useState([])

  // new-row inputs
  const [newType, setNewType] = useState({ name: '', id_rule: '' })
  const [newTriple, setNewTriple] = useState({ source: '', relation: '', target: '' })
  const [newRule, setNewRule] = useState('')
  const [newTransform, setNewTransform] = useState({ pattern: '', replace: '', case: '', note: '' })

  const load = async () => {
    try {
      const d = await api.ontology(domain)
      setSpec(d); setDraft(null); setEditing(false); setError(null)
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [domain])

  const startEdit = () => {
    setDraft({
      key: spec.key, name: spec.name, description: spec.description,
      entity_types: JSON.parse(JSON.stringify(spec.entity_types)),
      allowed_triples: spec.allowed_triples.map((t) => ({ ...t })),
      normalization_rules: [...spec.normalization_rules],
      id_transforms: (spec.id_transforms || []).map((t) => ({ ...t })),
      strip_type_prefixes: spec.strip_type_prefixes,
      collapse_whitespace: spec.collapse_whitespace,
      open_relations: spec.open_relations,
      custom_prompt: spec.custom_prompt,
    })
    setEditing(true); setSaved(null)
  }

  const startNew = () => {
    setDraft(blank()); setEditing(true); setSaved(null); setError(null); setImportNotes([])
  }

  // Read a schema someone wrote elsewhere. JSON is parsed as-is; a spreadsheet
  // or document is mapped by the backend. Either way the result lands in the
  // editor as a draft so it can be checked before it becomes the contract.
  const importFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true); setError(null); setSaved(null); setImportNotes([])
    try {
      const d = await api.importOntology(file)
      setDraft({
        key: d.key || '', name: d.name || '', description: d.description || '',
        entity_types: d.entity_types || {},
        allowed_triples: d.allowed_triples || [],
        normalization_rules: d.normalization_rules || [],
        id_transforms: d.id_transforms || [],
        strip_type_prefixes: d.strip_type_prefixes !== false,
        collapse_whitespace: d.collapse_whitespace !== false,
        open_relations: !!d.open_relations,
        custom_prompt: d.custom_prompt || '',
      })
      const count = Object.keys(d.entity_types || {}).length
      setImportNotes([
        d.source === 'mapped'
          ? `Read ${count} entity types and ${(d.allowed_triples || []).length} relationships from ${file.name}. This was interpreted from your document — check it before saving.`
          : `Loaded ${count} entity types and ${(d.allowed_triples || []).length} relationships from ${file.name}.`,
        ...(d.notes || []),
      ])
      setEditing(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const exportJson = () => {
    if (!spec) return
    const payload = {
      key: spec.key, name: spec.name, description: spec.description,
      entity_types: spec.entity_types,
      allowed_triples: spec.allowed_triples,
      normalization_rules: spec.normalization_rules,
      id_transforms: spec.id_transforms,
      strip_type_prefixes: spec.strip_type_prefixes,
      collapse_whitespace: spec.collapse_whitespace,
      open_relations: spec.open_relations,
      custom_prompt: spec.custom_prompt,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${spec.key}-ontology.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const save = async () => {
    setError(null)
    try {
      const saved = await api.saveOntology(draft)
      setSpec(saved); setEditing(false); setDraft(null)
      setSaved(`Saved “${saved.name}”. It is now available as a domain.`)
      onDomainsChanged?.(saved.key)
    } catch (err) { setError(err.message) }
  }

  const remove = async () => {
    setError(null)
    try { await api.deleteOntology(spec.key); onDomainsChanged?.(null) }
    catch (err) { setError(err.message) }
  }

  const duplicate = async () => {
    const newKey = window.prompt('New key for the copy (lowercase, no spaces):', `${spec.key}_v2`)
    if (!newKey) return
    setError(null)
    try {
      const copy = await api.duplicateOntology(spec.key, newKey)
      onDomainsChanged?.(copy.key)
      setSaved(`Created “${copy.name}”. Select it above to edit.`)
    } catch (err) { setError(err.message) }
  }

  if (error && !spec) return <div className="banner">{error}</div>
  if (!spec) return <p className="hint">Loading schema…</p>

  const d = editing ? draft : spec
  const typeNames = Object.keys(d.entity_types)

  // ---------- read-only view ----------
  if (!editing) {
    return (
      <div className="stack">
        {error && <div className="banner">{error}</div>}
        {saved && <div className="banner ok">{saved}</div>}

        <div className="row wrap">
          <div>
            <div className="mono" style={{ fontSize: 15 }}>{spec.name}</div>
            <p className="hint">{spec.description || 'No description.'}</p>
          </div>
          <div className="row" style={{ marginLeft: 'auto' }}>
            {spec.builtin ? (
              <>
                <span className="chip">built-in · read only</span>
                <button className="btn" onClick={duplicate}>Duplicate to edit</button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={startEdit}>Edit ontology</button>
                <button className="btn btn-danger" onClick={remove}>Delete</button>
              </>
            )}
            <button className="btn" onClick={startNew}>New ontology</button>
            <button className="btn" onClick={exportJson}
                    disabled={!spec}>Export JSON</button>
            <label className="btn" style={{ cursor: importing ? 'wait' : 'pointer' }}>
              {importing ? 'Reading…' : 'Import schema'}
              <input type="file" hidden disabled={importing}
                     accept=".json,.xlsx,.xls,.csv,.txt,.md"
                     onChange={importFile} />
            </label>
          </div>
        </div>

        <p className="hint" style={{ maxWidth: 700 }}>
          This is the contract the extractor must obey. The extraction prompt and the
          validator are both generated from it, so the two can never drift apart.
        </p>

        <div className="grid cols-2">
          <section className="panel">
            <div className="panel-head">Entity types · {typeNames.length}</div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="grid-table">
                <thead><tr><th>Type</th><th>Identifier rule</th></tr></thead>
                <tbody>
                  {typeNames.map((name) => (
                    <tr key={name}>
                      <td style={{ color: 'var(--signal)' }}>{name}</td>
                      <td style={{ color: 'var(--muted)' }}>
                        {spec.entity_types[name].id_rule || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              Permitted relationships · {spec.open_relations ? 'open' : spec.allowed_triples.length}
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              {spec.open_relations ? (
                <p className="hint" style={{ padding: 16 }}>
                  Any relation name is accepted; both endpoints must still be declared entity types.
                </p>
              ) : (
                <table className="grid-table">
                  <thead><tr><th>Source</th><th>Relation</th><th>Target</th></tr></thead>
                  <tbody>
                    {spec.allowed_triples.map((t, i) => (
                      <tr key={i}>
                        <td>{t.source}</td>
                        <td style={{ color: 'var(--ion)' }}>{t.relation}</td>
                        <td>{t.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panel-head">
            Extraction prompt
            <span className="spacer" />
            <span className="chip">{spec.custom_prompt ? 'custom' : 'generated from schema'}</span>
          </div>
          <div className="panel-body">
            {spec.id_transforms?.length > 0 && (
              <table className="grid-table" style={{ marginBottom: 14 }}>
                <thead><tr><th>Identifier rule</th><th>Becomes</th><th>Note</th></tr></thead>
                <tbody>
                  {spec.id_transforms.map((t, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ color: 'var(--ion)' }}>{t.pattern}</td>
                      <td className="mono">{t.replace || '—'}{t.case ? ` (${t.case})` : ''}</td>
                      <td style={{ color: 'var(--muted)' }}>{t.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {spec.normalization_rules.length > 0 && (
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column',
                           gap: 6, marginBottom: 14 }}>
                {spec.normalization_rules.map((r, i) => (
                  <li key={i} className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>— {r}</li>
                ))}
              </ul>
            )}
            <button className="btn btn-quiet" onClick={() => setShowPrompt(!showPrompt)}>
              {showPrompt ? 'Hide' : 'Show'} the prompt sent to the model
            </button>
            {showPrompt && <pre className="promptbox">{spec.effective_prompt}</pre>}
          </div>
        </section>
      </div>
    )
  }

  // ---------- editor ----------
  const setD = (patch) => setDraft({ ...draft, ...patch })

  const addType = () => {
    const name = newType.name.trim()
    if (!name) return
    setD({ entity_types: { ...draft.entity_types, [name]: { id_rule: newType.id_rule.trim(), examples: [] } } })
    setNewType({ name: '', id_rule: '' })
  }
  const removeType = (name) => {
    const next = { ...draft.entity_types }
    delete next[name]
    setD({
      entity_types: next,
      allowed_triples: draft.allowed_triples.filter((t) => t.source !== name && t.target !== name),
    })
  }
  const addTriple = () => {
    const { source, relation, target } = newTriple
    if (!source || !relation.trim() || !target) return
    setD({ allowed_triples: [...draft.allowed_triples, { source, relation: relation.trim(), target }] })
    setNewTriple({ source: '', relation: '', target: '' })
  }

  return (
    <div className="stack">
      {error && <div className="banner">{error}</div>}
      {importNotes.length > 0 && (
        <div className="banner warn">
          {importNotes.map((n, i) => <div key={i}>{n}</div>)}
        </div>
      )}

      <div className="row wrap">
        <span className="mono" style={{ fontSize: 14 }}>
          {draft.key ? `Editing ${draft.key}` : 'New ontology'}
        </span>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" onClick={save}>Save ontology</button>
          <button className="btn" onClick={() => { setEditing(false); setDraft(null) }}>Cancel</button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">Domain</div>
        <div className="panel-body grid cols-3">
          <div className="field">
            <label>Key</label>
            <input className="input" value={draft.key} placeholder="contracts"
                   onChange={(e) => setD({ key: e.target.value })} />
          </div>
          <div className="field">
            <label>Display name</label>
            <input className="input" value={draft.name} placeholder="Vendor Contracts"
                   onChange={(e) => setD({ name: e.target.value })} />
          </div>
          <div className="field">
            <label>Description</label>
            <input className="input" value={draft.description}
                   placeholder="What this domain covers"
                   onChange={(e) => setD({ description: e.target.value })} />
          </div>
        </div>
      </section>

      <div className="grid cols-2">
        <section className="panel">
          <div className="panel-head">Entity types</div>
          <div className="panel-body stack">
            <table className="grid-table">
              <thead><tr><th>Type</th><th>Identifier rule</th><th /></tr></thead>
              <tbody>
                {typeNames.map((name) => (
                  <tr key={name}>
                    <td style={{ color: 'var(--signal)' }}>{name}</td>
                    <td>
                      <input className="input" style={{ padding: '4px 8px' }}
                             value={draft.entity_types[name].id_rule}
                             placeholder="how instances are named"
                             onChange={(e) => setD({ entity_types: { ...draft.entity_types,
                               [name]: { ...draft.entity_types[name], id_rule: e.target.value } } })} />
                    </td>
                    <td style={{ width: 34 }}>
                      <button className="btn btn-quiet" style={{ padding: '2px 7px' }}
                              onClick={() => removeType(name)} aria-label={`Remove ${name}`}>✕</button>
                    </td>
                  </tr>
                ))}
                {typeNames.length === 0 && (
                  <tr><td colSpan={3} style={{ color: 'var(--muted)' }}>
                    Add the kinds of things this domain contains.
                  </td></tr>
                )}
              </tbody>
            </table>
            <div className="row">
              <input className="input" placeholder="Type name, e.g. Party" value={newType.name}
                     onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                     onKeyDown={(e) => e.key === 'Enter' && addType()} />
              <input className="input" placeholder="Identifier rule" value={newType.id_rule}
                     onChange={(e) => setNewType({ ...newType, id_rule: e.target.value })}
                     onKeyDown={(e) => e.key === 'Enter' && addType()} />
              <button className="btn" onClick={addType}>Add</button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            Permitted relationships
            <span className="spacer" />
            <label className="row mono" style={{ fontSize: 11, gap: 6, color: 'var(--muted)' }}>
              <input type="checkbox" checked={draft.open_relations}
                     onChange={(e) => setD({ open_relations: e.target.checked })} />
              allow any relation name
            </label>
          </div>
          <div className="panel-body stack">
            {draft.open_relations ? (
              <p className="hint">
                Relation names are unrestricted. Endpoints must still be declared entity types.
                Useful while exploring a new corpus; tighten it once the real relations are known.
              </p>
            ) : (
              <>
                <table className="grid-table">
                  <thead><tr><th>Source</th><th>Relation</th><th>Target</th><th /></tr></thead>
                  <tbody>
                    {draft.allowed_triples.map((t, i) => (
                      <tr key={i}>
                        <td>{t.source}</td>
                        <td style={{ color: 'var(--ion)' }}>{t.relation}</td>
                        <td>{t.target}</td>
                        <td style={{ width: 34 }}>
                          <button className="btn btn-quiet" style={{ padding: '2px 7px' }}
                                  onClick={() => setD({ allowed_triples:
                                    draft.allowed_triples.filter((_, j) => j !== i) })}>✕</button>
                        </td>
                      </tr>
                    ))}
                    {draft.allowed_triples.length === 0 && (
                      <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>
                        No relationships yet — extraction will produce nodes but no edges.
                      </td></tr>
                    )}
                  </tbody>
                </table>
                <div className="row">
                  <select className="domain-select" value={newTriple.source}
                          onChange={(e) => setNewTriple({ ...newTriple, source: e.target.value })}>
                    <option value="">source…</option>
                    {typeNames.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input className="input" placeholder="relation, e.g. signs" value={newTriple.relation}
                         onChange={(e) => setNewTriple({ ...newTriple, relation: e.target.value })}
                         onKeyDown={(e) => e.key === 'Enter' && addTriple()} />
                  <select className="domain-select" value={newTriple.target}
                          onChange={(e) => setNewTriple({ ...newTriple, target: e.target.value })}>
                    <option value="">target…</option>
                    {typeNames.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="btn" onClick={addTriple}>Add</button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">Normalisation rules</div>
        <div className="panel-body stack">
          <p className="hint">
            Plain-language instructions telling the model how identifiers should look.
            Prefix stripping and identifier cleanup also run in code after extraction.
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {draft.normalization_rules.map((r, i) => (
              <li key={i} className="row">
                <span className="mono" style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>— {r}</span>
                <button className="btn btn-quiet" style={{ padding: '2px 7px' }}
                        onClick={() => setD({ normalization_rules:
                          draft.normalization_rules.filter((_, j) => j !== i) })}>✕</button>
              </li>
            ))}
          </ul>
          <div className="row">
            <input className="input" placeholder='e.g. Pvt Ltd -> Private Limited' value={newRule}
                   onChange={(e) => setNewRule(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && newRule.trim()) {
                       setD({ normalization_rules: [...draft.normalization_rules, newRule.trim()] })
                       setNewRule('')
                     }
                   }} />
            <button className="btn" onClick={() => {
              if (!newRule.trim()) return
              setD({ normalization_rules: [...draft.normalization_rules, newRule.trim()] })
              setNewRule('')
            }}>Add</button>
          </div>
          <label className="row mono" style={{ fontSize: 12, gap: 8, color: 'var(--muted)' }}>
            <input type="checkbox" checked={draft.strip_type_prefixes}
                   onChange={(e) => setD({ strip_type_prefixes: e.target.checked })} />
            Strip entity-type prefixes from identifiers (“Party Acme Ltd” → “Acme Ltd”)
          </label>
          <label className="row mono" style={{ fontSize: 12, gap: 8, color: 'var(--muted)' }}>
            <input type="checkbox" checked={draft.collapse_whitespace}
                   onChange={(e) => setD({ collapse_whitespace: e.target.checked })} />
            Collapse repeated whitespace in identifiers
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Identifier rules</div>
        <div className="panel-body stack">
          <p className="hint">
            Pattern-based cleanup applied to every identifier this domain produces, in
            order. Use these when a domain has its own conventions — ticket references,
            part numbers, name suffixes. A rule that matches takes precedence over the
            generic prefix stripper above.
          </p>
          <table className="grid-table">
            <thead><tr><th>Match (regex)</th><th>Replace with</th><th>Case</th><th>Note</th><th /></tr></thead>
            <tbody>
              {draft.id_transforms.map((t, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: 'var(--ion)' }}>{t.pattern}</td>
                  <td className="mono">{t.replace || <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                  <td style={{ color: 'var(--muted)' }}>{t.case || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{t.note}</td>
                  <td style={{ width: 34 }}>
                    <button className="btn btn-quiet" style={{ padding: '2px 7px' }}
                            onClick={() => setD({ id_transforms:
                              draft.id_transforms.filter((_, j) => j !== i) })}>✕</button>
                  </td>
                </tr>
              ))}
              {draft.id_transforms.length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>
                  None. Identifiers are used as the model produces them.
                </td></tr>
              )}
            </tbody>
          </table>
          <div className="row wrap">
            <input className="input" style={{ minWidth: 200 }} placeholder="regex, e.g. ^([A-Z]{2,4})[\s-]?(\d+)$"
                   value={newTransform.pattern}
                   onChange={(e) => setNewTransform({ ...newTransform, pattern: e.target.value })} />
            <input className="input" style={{ maxWidth: 130 }} placeholder="replace, e.g. \\1-\\2"
                   value={newTransform.replace}
                   onChange={(e) => setNewTransform({ ...newTransform, replace: e.target.value })} />
            <select className="domain-select" value={newTransform.case}
                    onChange={(e) => setNewTransform({ ...newTransform, case: e.target.value })}>
              <option value="">keep case</option>
              <option value="upper">UPPER</option>
              <option value="lower">lower</option>
              <option value="title">Title</option>
            </select>
            <input className="input" style={{ maxWidth: 200 }} placeholder="note (shown to the model)"
                   value={newTransform.note}
                   onChange={(e) => setNewTransform({ ...newTransform, note: e.target.value })} />
            <button className="btn" onClick={() => {
              if (!newTransform.pattern.trim()) return
              setD({ id_transforms: [...draft.id_transforms, { ...newTransform }] })
              setNewTransform({ pattern: '', replace: '', case: '', note: '' })
            }}>Add</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          Extraction prompt
          <span className="spacer" />
          <span className="chip">{draft.custom_prompt ? 'custom' : 'generated from schema'}</span>
        </div>
        <div className="panel-body stack">
          <p className="hint">
            Leave this empty to use the prompt generated from the schema above — it stays in sync
            as you edit. Write your own only when you need instructions the schema cannot express;
            validation still enforces the entity types and relationships either way.
          </p>
          <textarea className="input" rows={draft.custom_prompt ? 16 : 4}
                    placeholder="Empty — using the generated prompt. Type here to override it."
                    value={draft.custom_prompt}
                    onChange={(e) => setD({ custom_prompt: e.target.value })} />
          <div className="row">
            <button className="btn" onClick={() => setShowPrompt(!showPrompt)}>
              {showPrompt ? 'Hide' : 'Show'} generated prompt
            </button>
            {draft.custom_prompt && (
              <button className="btn btn-quiet" onClick={() => setD({ custom_prompt: '' })}>
                Revert to generated
              </button>
            )}
          </div>
          {showPrompt && <pre className="promptbox">{spec.generated_prompt}</pre>}
        </div>
      </section>
    </div>
  )
}
