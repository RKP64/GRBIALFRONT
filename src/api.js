const BASE = import.meta.env.VITE_API_BASE || '/api'
const KEY = import.meta.env.VITE_API_KEY || 'dev-key-change-me'

// A signed-in session takes precedence; the configured key is the fallback so
// a developer instance works before anyone has signed in.
function authHeaders() {
  const token = localStorage.getItem('kg_token')
  return token ? { Authorization: `Bearer ${token}` } : { 'X-API-Key': KEY }
}

function signOut() {
  localStorage.removeItem('kg_token')
  localStorage.removeItem('kg_user')
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  if (res.status === 401 && localStorage.getItem('kg_token')
      && !path.startsWith('/auth/login')) {
    // The session has expired or been revoked. Clear it and let the app fall
    // back to the login page, rather than leaving every panel showing an error.
    signOut()
    window.location.reload()
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try { detail = formatDetail((await res.json()).detail) || detail } catch { /* non-JSON body */ }
    throw new Error(detail)
  }
  return res.status === 204 ? null : res.json()
}

/** Turn an error body into something a person can read.
 *
 * FastAPI returns a plain string for errors we raise ourselves, but a list of
 * objects for request-validation failures — {loc, msg, type} per offending
 * field. Passing that list straight to Error() stringifies each object as
 * "[object Object]", which hides the one thing the user needs: which field is
 * wrong and why.
 */
function formatDetail(detail) {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item
        const where = Array.isArray(item?.loc)
          ? item.loc.filter((p) => p !== 'body').join(' → ')
          : ''
        const message = item?.msg || item?.message || JSON.stringify(item)
        return where ? `${where}: ${message}` : message
      })
      .join('; ')
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail)
  }
  return String(detail)
}

export const api = {
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  logout: signOut,
  authUsers: () => request('/auth/users'),
  createUser: (body) =>
    request('/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteUser: (username) => request(`/auth/users/${username}`, { method: 'DELETE' }),
  auditLog: (limit = 100) => request(`/auth/audit?limit=${limit}`),
  importOntology: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/ontologies/import', { method: 'POST', body: form })
  },
  impact: (domain, entity, hops = 2) =>
    request(`/graph/${domain}/impact?entity=${encodeURIComponent(entity)}&hops=${hops}`),
  evalSets: () => request('/evals/sets'),
  evalSet: (key) => request(`/evals/sets/${key}`),
  uploadEvalSet: (key, name, file) => {
    const form = new FormData()
    form.append('key', key); form.append('name', name); form.append('file', file)
    return request('/evals/sets', { method: 'POST', body: form })
  },
  deleteEvalSet: (key) => request(`/evals/sets/${key}`, { method: 'DELETE' }),
  startEval: (body) =>
    request('/evals/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  evalRuns: () => request('/evals/runs'),
  evalRun: (id) => request(`/evals/runs/${id}`),
  evalCompare: (a, b) => request(`/evals/compare?a=${a}&b=${b}`),
  ready: () => request('/readyz'),
  me: () => request('/access/me'),
  usage: (days = 30) => request(`/usage?days=${days}`),
  usageEvents: (days = 7, limit = 200) =>
    request(`/usage/events?days=${days}&limit=${limit}`),
  accessKeys: () => request('/access/keys'),
  generateKey: () => request('/access/keys/generate', { method: 'POST' }),
  saveKey: (body) =>
    request('/access/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  revokeKey: (key) => request(`/access/keys/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  ontologies: () => request('/ontologies'),
  ontology: (key) => request(`/ontologies/${key}`),
  proposeDesign: (goal, files) => {
    const form = new FormData()
    form.append('goal', goal)
    for (const f of files) form.append('files', f)
    return request('/design/propose', { method: 'POST', body: form })
  },
  applyDesign: (body) =>
    request('/design/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  saveOntology: (body) =>
    request('/ontologies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  duplicateOntology: (key, newKey) =>
    request(`/ontologies/${key}/duplicate?new_key=${encodeURIComponent(newKey)}`, {
      method: 'POST',
    }),
  deleteOntology: (key) => request(`/ontologies/${key}`, { method: 'DELETE' }),
  queryModes: (domain) =>
    request(`/query/modes${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`),
  agentTools: () => request('/agents/tools'),
  toolServers: () => request('/tool-servers'),
  allTools: () => request('/tool-servers/tools'),
  saveToolServer: (body) =>
    request('/tool-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteToolServer: (key) => request(`/tool-servers/${key}`, { method: 'DELETE' }),
  // Aliases used by the ToolServers panel inside Agents.jsx
  mcpServers: () => request('/tool-servers'),
  saveMcpServer: (body) =>
    request('/tool-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  probeMcpServer: (key) => request(`/tool-servers/${key}/probe`, { method: 'POST' }),
  deleteMcpServer: (key) => request(`/tool-servers/${key}`, { method: 'DELETE' }),
  agents: () => request('/agents'),
  agent: (key) => request(`/agents/${key}`),
  saveAgent: (body) =>
    request('/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteAgent: (key) => request(`/agents/${key}`, { method: 'DELETE' }),
  askAgent: (key, body) =>
    request(`/agents/${key}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deployAgent: (key, body = {}) =>
    request(`/agents/${key}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  undeployAgent: (key) =>
    request(`/agents/${key}/undeploy`, { method: 'POST' }),
  analyzeFiles: (files, goal = '') => {
    const form = new FormData()
    form.append('goal', goal)
    for (const f of files) form.append('files', f)
    return request('/design/analyze', { method: 'POST', body: form })
  },
  saveAgent: (body) =>
    request('/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteAgent: (key) => request(`/agents/${key}`, { method: 'DELETE' }),
  exportAgent: (key) => `${BASE}/agents/${key}/export`,
  exportAllAgents: () => `${BASE}/agents/export/all`,
  importAgents: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/agents/import', { method: 'POST', body: form })
  },
  askSavedAgent: (key, body) =>
    request(`/agents/${key}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  askAgent: (body) =>
    request('/agents/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  teams: () => request('/teams'),
  saveTeam: (body) =>
    request('/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteTeam: (key) => request(`/teams/${key}`, { method: 'DELETE' }),
  exportTeam: (key) => `${BASE}/teams/${key}/export`,
  exportAllTeams: () => `${BASE}/teams/export/all`,
  importTeams: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/teams/import', { method: 'POST', body: form })
  },
  askTeam: (key, body) =>
    request(`/teams/${key}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  verifyAnswer: (domain, answer, question) =>
    request('/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, answer, question }),
    }),
  trainingProviders: () => request('/training/providers'),
  datasets: () => request('/training/datasets'),
  dataset: (id) => request(`/training/datasets/${id}`),
  generateDataset: (body) =>
    request('/training/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteDataset: (id) => request(`/training/datasets/${id}`, { method: 'DELETE' }),
  trainingJobs: () => request('/training/jobs'),
  startTraining: (body) =>
    request('/training/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  cancelTraining: (id) => request(`/training/jobs/${id}/cancel`, { method: 'POST' }),
  deployModel: (id, deployment_name) =>
    request(`/training/jobs/${id}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deployment_name }),
    }),
  passageStats: (domain) => request(`/graph/${domain}/passages`),
  buildPassageIndex: (domain) =>
    request(`/graph/${domain}/passages/index`, { method: 'POST' }),
  clearPassages: (domain) => request(`/graph/${domain}/passages`, { method: 'DELETE' }),
  visualize: (domain, limit = 150, nodeType) =>
    request(`/graph/${domain}/visualize?limit=${limit}` +
      (nodeType ? `&node_type=${encodeURIComponent(nodeType)}` : '')),
  jobs: () => request('/jobs'),
  job: (id) => request(`/jobs/${id}`),
  cancelJob: (id) => request(`/jobs/${id}/cancel`, { method: 'POST' }),
  stats: (domain) => request(`/graph/${domain}/stats`),
  subgraph: (domain, q) =>
    request(`/graph/${domain}/subgraph?q=${encodeURIComponent(q)}&top_k=8&hops=1`),
  buildIndex: (domain) => request(`/graph/${domain}/index`, { method: 'POST' }),
  query: (body) =>
    request('/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  ingest: (domain, files) => {
    const form = new FormData()
    form.append('domain', domain)
    for (const f of files) form.append('files', f)
    return request('/ingest', { method: 'POST', body: form })
  },
  exportGraphmlUrl: (domain) => `${BASE}/graph/${domain}/export.graphml`,
  exportJsonUrl: (domain) => `${BASE}/graph/${domain}/export.json`,
  download: async (path, filename) => {
    const res = await fetch(`${BASE}${path}`, { headers: { 'X-API-Key': KEY } })
    if (!res.ok) throw new Error(`Download failed (${res.status})`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  streamUrl: (id) => `${BASE}/jobs/${id}/stream`,
  apiKey: KEY,
}
