const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('aurora_token') || sessionStorage.getItem('aurora_token');
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Please check your connection.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    if (res.status === 401 && token) {
      window.dispatchEvent(new CustomEvent('aurora:unauthorized'));
    }
    const err = new Error(data?.message || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const authToken = () => localStorage.getItem('aurora_token') || sessionStorage.getItem('aurora_token');

async function uploadRequest(path, formData, method = 'POST') {
  const token = authToken();
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  } catch {
    throw new Error('Cannot reach the server. Please check your connection.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new CustomEvent('aurora:unauthorized'));
    const err = new Error(data?.message || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

async function downloadRequest(path, fallbackName = 'download') {
  const token = authToken();
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('aurora:unauthorized'));
    let message = 'Could not download the file.';
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      /* noop */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^\";]+)"?/i);
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData, method = 'POST') => uploadRequest(path, formData, method),
  download: (path, fallbackName) => downloadRequest(path, fallbackName),
  receiptUrl: async (claimId, attachmentId) => {
    const token = authToken();
    const res = await fetch(`${BASE}/expenses/${claimId}/attachments/${attachmentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Could not load this receipt.');
    return URL.createObjectURL(await res.blob());
  },
  performanceAttachmentUrl: async (goalId, attachmentId) => {
    const token = authToken();
    const res = await fetch(`${BASE}/performance/goals/${goalId}/attachments/${attachmentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Could not load this attachment.');
    return URL.createObjectURL(await res.blob());
  },
};

export const fmtMoney = (n, compact = false) => {
  const value = Number(n) || 0;
  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
};

export const fmtDate = (d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => {
  if (!d) return '—';
  const date = typeof d === 'string' && d.length <= 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-US', opts);
};

export const fmtTime = (t) => {
  if (!t) return '—';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return String(t);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${ampm}`;
};

export const fmtDateRange = (start, end) => {
  if (!start) return '—';
  if (!end || String(start).slice(0, 10) === String(end).slice(0, 10)) return fmtDate(start);
  const sameYear = new Date(start).getFullYear() === new Date(end).getFullYear();
  return `${fmtDate(start, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} – ${fmtDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

export const monthLabel = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const monthShort = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fullName = (p) => (p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '');
