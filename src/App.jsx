import { useEffect, useState } from 'react'
import { api } from './api'
import Ask from './components/Ask'
import Design from './components/Design'
import Explore from './components/Explore'
import Ingest from './components/Ingest'
import Access from './components/Access'
import Agents from './components/Agents'
import Schema from './components/Schema'
import ToolServers from './components/ToolServers'
import Train from './components/Train'
import Usage from './components/Usage'

/* Shown when no logo file is present. Set VITE_ORG_NAME to change it. */
const ORG_NAME = import.meta.env.VITE_ORG_NAME || 'KPMG'

const TABS = [
  { key: 'design',  label: 'Design',  Component: Design },
  { key: 'ingest',  label: 'Ingest',  Component: Ingest },
  { key: 'explore', label: 'Graph',   Component: Explore },
  { key: 'ask',     label: 'Ask',     Component: Ask },
  { key: 'agents',  label: 'Agents',  Component: Agents },
  { key: 'schema',  label: 'Schema',  Component: Schema },
  { key: 'train',   label: 'Train',   Component: Train },
  { key: 'tools',   label: 'Tools',   Component: ToolServers },
  { key: 'usage',   label: 'Usage',   Component: Usage },
  { key: 'access',  label: 'Access',  Component: Access },
]

export default function App() {
  const [tab, setTab] = useState('ingest')
  const [domains, setDomains] = useState([])
  const [domain, setDomain] = useState('')
  const [ready, setReady] = useState(null)
  const [fatal, setFatal] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [me, setMe] = useState(null)

  /* Called after the Schema tab creates or deletes an ontology so the domain
     picker reflects it immediately. */
  const onDomainsChanged = (nextKey) => {
    setRefreshKey((k) => k + 1)
    if (nextKey) setDomain(nextKey)
    else if (domains.length) setDomain(domains[0])
  }

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const r = await api.ready()
        if (!alive) return
        setReady(r); setFatal(null)
        if (r.domains?.length && !r.domains.includes(domain)) setDomain(r.domains[0])
        setDomains(r.domains || [])
      } catch (err) {
        if (alive) setFatal(err.message)
      }
    }
    poll()
    api.me().then(setMe).catch(() => setMe(null))
    const id = setInterval(poll, 20000)
    return () => { alive = false; clearInterval(id) }
    // eslint-disable-next-line
  }, [refreshKey])

  /* Hidden, not disabled: offering a button that always fails is worse than
     not offering it. The server enforces regardless. */
  const allowed = TABS.filter((t) => {
    if (!me) return true
    if (t.key === 'access') return me.can.manage_access
    if (t.key === 'train') return me.can.train
    if (t.key === 'ingest' || t.key === 'design') return me.can.ingest
    if (t.key === 'schema' || t.key === 'agents') return true
    return true
  })
  const Active = TABS.find((t) => t.key === tab)?.Component
  const storageState = ready?.storage?.status
  const lamp = fatal ? 'fault' : storageState === 'ok' ? 'ok' : ready ? 'warn' : ''
  const statusLabel = fatal
    ? 'Not connected'
    : !ready
      ? 'Connecting'
      : storageState === 'ok'
        ? 'Ready'
        : 'Limited'

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brandmark">
          {/* Drop your organisation's logo at public/logo.svg (or .png).
              If the file is absent the wordmark below is shown instead, so the
              console never renders a broken image. */}
          <img src="/logo.svg" alt="" onError={(e) => { e.currentTarget.style.display = 'none'
                                                        e.currentTarget.nextSibling.style.display = 'block' }} />
          <span className="fallback" style={{ display: 'none' }}>{ORG_NAME}</span>
        </div>
        <span className="brand-divider" />
        <span className="wordmark">Knowledge<b>Graph</b> Console</span>
        <nav className="tabs" role="tablist">
          {allowed.map((t) => (
            <button
              key={t.key} role="tab" aria-selected={tab === t.key}
              className="tab" onClick={() => setTab(t.key)}
            >{t.label}</button>
          ))}
        </nav>
        <div className="masthead-right">
          {domains.length > 0 && (
            <select
              className="domain-select" value={domain}
              onChange={(e) => setDomain(e.target.value)} aria-label="Active domain"
            >
              {domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {me && (
            <span className="hint" title={me.all_domains ? 'All domains' : me.domains.join(', ')}>
              {me.name} · {me.role}
            </span>
          )}
          <span className={`lamp ${lamp}`} title={ready?.storage?.detail || ''}>
            <i />
            {statusLabel}
          </span>
        </div>
      </header>

      <main>
        {fatal && (
          <div className="banner">
            Cannot reach the service. Check that it is running, then reload this page.
          </div>
        )}
        {ready && !ready.extraction_ready && (
          <div className="banner warn">
            Extraction and answering are unavailable until the language model is
            connected. Ask an administrator to complete the setup.
          </div>
        )}
        {ready?.storage?.detail && (
          <div className="banner warn">{ready.storage.detail}</div>
        )}
        {domain && Active && (
          <Active key={`${domain}-${refreshKey}`} domain={domain}
                  domains={domains} onDomainsChanged={onDomainsChanged} />
        )}
      </main>
    </div>
  )
}
