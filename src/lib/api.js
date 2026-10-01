const API_BASE = '/api';

async function fetchWithAuth(url, options = {}) {
  const session = localStorage.getItem('session');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (session) {
    headers['Cookie'] = `session=${session}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('session');
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    return null;
  }

  return response;
}

export async function apiGet(path, options = {}) {
  if (!navigator.onLine) {
    return { ok: false, status: 0, json: () => Promise.resolve({ offline: true }) };
  }
  return fetchWithAuth(`${API_BASE}${path}`, options);
}

export async function apiPost(path, data, options = {}) {
  if (!navigator.onLine) {
    return { ok: false, status: 0, json: () => Promise.resolve({ offline: true }) };
  }
  return fetchWithAuth(`${API_BASE}${path}`, {
    method: 'POST',
    ...options,
    body: JSON.stringify(data),
  });
}

export async function apiPut(path, data, options = {}) {
  if (!navigator.onLine) {
    return { ok: false, status: 0, json: () => Promise.resolve({ offline: true }) };
  }
  return fetchWithAuth(`${API_BASE}${path}`, {
    method: 'PUT',
    ...options,
    body: JSON.stringify(data),
  });
}

export async function apiDelete(path, options = {}) {
  if (!navigator.onLine) {
    return { ok: false, status: 0, json: () => Promise.resolve({ offline: true }) };
  }
  return fetchWithAuth(`${API_BASE}${path}`, {
    method: 'DELETE',
    ...options,
  });
}

export async function apiWithOfflineFallback(path, data, options = {}) {
  if (navigator.onLine) {
    try {
      const response = await fetchWithAuth(`${API_BASE}${path}`, options);
      return { success: true, data: await response.json(), synced: true };
    } catch (error) {
      return { success: false, error, synced: false };
    }
  }
  return { success: false, error: new Error('Offline'), synced: false };
}
