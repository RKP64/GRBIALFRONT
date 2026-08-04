const BASE = import.meta.env.VITE_API_BASE || '/api'
const KEY = import.meta.env.VITE_API_KEY || 'dev-key-change-me'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'X-API-Key': KEY, ...(options.headers || {}) },
  })
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try { detail = (await res.json()).detail || detail } catch { /* non-JSON body */ }
    throw new Error(detail)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
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
