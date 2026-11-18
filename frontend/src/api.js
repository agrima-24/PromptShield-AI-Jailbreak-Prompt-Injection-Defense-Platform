// Every request goes to the app-laptop backend. The browser never talks to the defense laptop.
const json = async (response) => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
};

const post = (path, body) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

const del = (path) =>
  fetch(path, { method: 'DELETE' }).then(res => {
    if (res.status === 204) return true;
    return json(res);
  });

export const api = {
  status: () => fetch('/api/status').then(json),
  attacks: () => fetch('/api/attacks').then(json),
  chat: (body) => post('/api/chat', body),
  results: () => fetch('/api/results').then(json),
  result: (name) => fetch(`/api/results/${encodeURIComponent(name)}`).then(json),
  transcripts: (runId) => fetch(`/api/transcripts/${encodeURIComponent(runId)}`).then(json),
  runs: () => fetch('/api/runs').then(json),
  run: (id) => fetch(`/api/runs/${encodeURIComponent(id)}`).then(json),
  deleteRun: (id) => del(`/api/runs/${encodeURIComponent(id)}`),
  history: (params = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', params.limit);
    if (params.offset) q.set('offset', params.offset);
    if (params.search) q.set('search', params.search);
    if (params.category && params.category !== 'all') q.set('category', params.category);
    return fetch(`/api/history?${q.toString()}`).then(json);
  },
  historyItem: (id) => fetch(`/api/history/${id}`).then(json),
  deleteHistory: (id) => del(`/api/history/${id}`),
  clearHistory: () => del('/api/history'),
};
