import { apiBase, fetchJson } from '../../utils/api';

export async function getHotspots() {
  return fetchJson(apiBase('/api/hotspots'));
}

export async function createHotspot(data) {
  return fetchJson(apiBase('/api/hotspots'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateHotspot(id, data) {
  return fetchJson(apiBase('/api/hotspots/' + encodeURIComponent(id)), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function deleteHotspot(id) {
  return fetchJson(apiBase('/api/hotspots/' + encodeURIComponent(id)), {
    method: 'DELETE'
  });
}
