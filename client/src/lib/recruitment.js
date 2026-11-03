export const STAGES = [
  'applied',
  'screening',
  'shortlisted',
  'interview_scheduled',
  'interview_completed',
  'selected',
  'offer_sent',
  'hired',
  'rejected',
];

export const STAGE_META = {
  applied: { label: 'Applied', tone: 'slate', bar: '#94a3b8' },
  screening: { label: 'Screening', tone: 'sky', bar: '#38bdf8' },
  shortlisted: { label: 'Shortlisted', tone: 'indigo', bar: '#6366f1' },
  interview_scheduled: { label: 'Interview scheduled', tone: 'violet', bar: '#8b5cf6' },
  interview_completed: { label: 'Interview completed', tone: 'teal', bar: '#14b8a6' },
  selected: { label: 'Selected', tone: 'emerald', bar: '#10b981' },
  offer_sent: { label: 'Offer sent', tone: 'amber', bar: '#f59e0b' },
  hired: { label: 'Hired', tone: 'emerald', bar: '#059669' },
  rejected: { label: 'Rejected', tone: 'rose', bar: '#f43f5e' },
};

export const STAGE_TRANSITIONS = {
  applied: ['screening', 'rejected'],
  screening: ['shortlisted', 'rejected'],
  shortlisted: ['interview_scheduled', 'rejected'],
  interview_scheduled: ['interview_completed', 'shortlisted', 'rejected'],
  interview_completed: ['selected', 'shortlisted', 'rejected'],
  selected: ['offer_sent', 'rejected'],
  offer_sent: ['hired', 'rejected'],
  hired: [],
  rejected: [],
};

export const JOB_STATUS_TONE = {
  draft: 'slate',
  open: 'emerald',
  'on-hold': 'amber',
  closed: 'rose',
};

export const OFFER_STATUS_TONE = {
  draft: 'slate',
  sent: 'sky',
  accepted: 'emerald',
  rejected: 'rose',
  expired: 'amber',
  withdrawn: 'slate',
};

export const INTERVIEW_STATUS_TONE = {
  scheduled: 'indigo',
  rescheduled: 'amber',
  completed: 'emerald',
  cancelled: 'rose',
};

export const RECOMMENDATION_TONE = {
  strong_hire: 'emerald',
  hire: 'sky',
  hold: 'amber',
  reject: 'rose',
};

export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'intern'];
export const WORK_MODES = ['on-site', 'remote', 'hybrid'];
export const JOB_STATUSES = ['draft', 'open', 'on-hold', 'closed'];
export const INTERVIEW_TYPES = ['technical', 'hr', 'managerial', 'final'];
export const INTERVIEW_MODES = ['online', 'offline', 'phone'];
export const SOURCES = ['direct', 'referral', 'linkedin', 'website', 'job_board', 'agency', 'campus', 'other'];
export const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn'];

export const pretty = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const token = () => localStorage.getItem('aurora_token') || sessionStorage.getItem('aurora_token');

/** Multipart upload (resumes) using the same auth token as the JSON client. */
export async function uploadFile(path, file, field = 'resume') {
  const body = new FormData();
  body.append(field, file);
  const res = await fetch((import.meta.env.VITE_API_URL || '/api') + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || 'Upload failed.');
  return data;
}

/** Authenticated file download — resumes are never exposed as public URLs. */
export async function downloadFile(path, fallback = 'document.pdf') {
  const res = await fetch((import.meta.env.VITE_API_URL || '/api') + path, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Download failed.');
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const name = match?.[1] || fallback;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
