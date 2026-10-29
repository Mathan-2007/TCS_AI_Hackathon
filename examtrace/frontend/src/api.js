const BASE = import.meta.env.VITE_API_URL || '/api';

const clearSession = () => {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch {}
};

export const getToken = () => {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
};

async function request(path, { method = 'GET', body, form, raw } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearSession();
    if (window.location.pathname !== '/login') window.location.assign('/login');
  }
  if (raw) {
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message || 'Download failed');
    }
    return res.blob();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, form) => request(p, { method: 'POST', form }),
  blob: (p) => request(p, { raw: true }),
};
