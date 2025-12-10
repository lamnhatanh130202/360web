// src/utils/api.js
import { getToken } from '../cms/utils/auth';

export const apiBase = (path = '') => {
  if (!path.startsWith('/')) path = '/' + path;
  // Ép tất cả request đi tới /api/... để Vite proxy chuyển về backend
  return ('/api' + path).replace(/\/+/g, '/');
};

export async function fetchJson(url, opts = {}) {
  const token = getToken();
  const mergedHeaders = {
    ...(opts.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const r = await fetch(url, { credentials: 'same-origin', ...opts, headers: mergedHeaders });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Expected JSON but got: ${ct}\n${text}`);
  }
  return JSON.parse(text);
}

// Scene helpers
export async function getScenes() {
  return fetchJson(apiBase('/scenes'));
}
export async function createScene(payload) {
  return fetchJson(apiBase('/scenes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
export async function updateScene(id, payload) {
  return fetchJson(apiBase('/scenes/' + encodeURIComponent(id)), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
export async function deleteScene(id) {
  return fetchJson(apiBase('/scenes/' + encodeURIComponent(id)), {
    method: 'DELETE'
  });
}
export async function uploadFile(formData) {
  const r = await fetch(apiBase('/upload'), {
    method: 'POST',
    body: formData
  });
  if (!r.ok) {
    const txt = await r.text().catch(()=>null);
    throw new Error(`HTTP ${r.status}: ${txt}`);
  }
  return r.json();
}
