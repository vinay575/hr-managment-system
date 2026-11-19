import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  FileText,
  History,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
  XCircle,
} from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Avatar,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Textarea,
} from '../../components/ui';

export const DOC_STATUS = {
  verified: { label: 'Verified', tone: 'emerald', style: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15', icon: CheckCircle2 },
  pending: { label: 'Pending', tone: 'amber', style: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15', icon: History },
  rejected: { label: 'Rejected', tone: 'rose', style: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15', icon: XCircle },
  expired: { label: 'Expired', tone: 'rose', style: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15', icon: AlertTriangle },
  expiring: { label: 'Expiring soon', tone: 'amber', style: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15', icon: AlertTriangle },
  missing: { label: 'Missing', tone: 'slate', style: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/15', icon: AlertTriangle },
  valid: { label: 'Valid', tone: 'emerald', style: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15', icon: CheckCircle2 },
  none: { label: 'No expiry', tone: 'slate', style: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-500/15', icon: FileText },
};

export const statusMeta = (status) => DOC_STATUS[status] || DOC_STATUS.pending;

export function StatusPill({ status, label }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', meta.style)}>
      <Icon size={11} />
      {label || meta.label}
    </span>
  );
}

export const formatBytes = (bytes) => {
  const n = Number(bytes) || 0;
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const expiryTone = (doc) => {
  if (doc.expiry_status === 'expired') return 'text-rose-600';
  if (doc.expiry_status === 'expiring') return 'text-amber-600';
  return 'text-slate-500';
};

export function expiryText(doc) {
  if (!doc.expiry_date) return '—';
  const days = doc.days_remaining;
  if (days == null) return fmtDate(doc.expiry_date);
  if (days < 0) return `${fmtDate(doc.expiry_date)} · ${Math.abs(days)}d overdue`;
  if (days === 0) return `${fmtDate(doc.expiry_date)} · today`;
  return `${fmtDate(doc.expiry_date)} · ${days}d left`;
}

export function DocumentRow({ doc, onOpen, showEmployee = true, actions }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 transition hover:border-brand-200 hover:bg-brand-50/20 sm:flex-nowrap">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <FileText size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onOpen?.(doc)} className="truncate text-left text-[13px] font-semibold text-ink-900 hover:text-brand-600">
            {doc.name}
          </button>
          <StatusPill status={doc.status} />
          {doc.expiry_status === 'expired' && <StatusPill status="expired" />}
          {doc.expiry_status === 'expiring' && <StatusPill status="expiring" />}
          {doc.source !== 'documents' && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{doc.source_label}</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
          {showEmployee && doc.employee_name ? `${doc.employee_name} · ` : ''}
          {doc.category_name} · {formatBytes(doc.file_size)} · Uploaded {fmtDate(doc.uploaded_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={clsx('hidden text-[11px] font-medium sm:block', expiryTone(doc))}>{expiryText(doc)}</span>
        {actions}
        {onOpen && (
          <Button size="sm" variant="ghost" icon={Eye} onClick={() => onOpen(doc)} aria-label="View document">
            View
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Upload                                                             */
/* ------------------------------------------------------------------ */
const EMPTY_FORM = {
  employeeId: '',
  categoryId: '',
  name: '',
  documentNumber: '',
  issueDate: '',
  expiryDate: '',
  description: '',
};

export function UploadDocumentModal({ open, onClose, onSaved, employees = [], categories = [], fixedEmployeeId = null, defaultCategoryId = '' }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, employeeId: fixedEmployeeId ? String(fixedEmployeeId) : '', categoryId: defaultCategoryId || '' });
    setFile(null);
    setError('');
  }, [open, fixedEmployeeId, defaultCategoryId]);

  const activeCategories = useMemo(() => categories.filter((c) => Number(c.is_active)), [categories]);
  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of activeCategories) {
      const key = c.group_name || 'Other Documents';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return [...map.entries()];
  }, [activeCategories]);
  const selectedCategory = activeCategories.find((c) => String(c.id) === String(form.categoryId));

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError('');
    if (!form.employeeId) return setError('Choose the employee this document belongs to.');
    if (!form.categoryId) return setError('Choose a document category.');
    if (!file) return setError('Select a file to upload.');
    if (selectedCategory?.requires_expiry && !form.expiryDate) return setError('This document type requires an expiry date.');
    if (form.issueDate && form.expiryDate && form.expiryDate < form.issueDate) return setError('Expiry date cannot be before the issue date.');

    const fd = new FormData();
    fd.append('employeeId', form.employeeId);
    fd.append('categoryId', form.categoryId);
    fd.append('name', form.name.trim() || file.name);
    fd.append('documentNumber', form.documentNumber);
    fd.append('issueDate', form.issueDate);
    fd.append('expiryDate', form.expiryDate);
    fd.append('description', form.description);
    fd.append('file', file);

    setSaving(true);
    try {
      const res = await api.upload('/documents', fd);
      toast.success(res.message || 'Document uploaded.');
      onSaved?.(res.document);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload document"
      subtitle="Files are stored privately and every access is authenticated."
      icon={UploadCloud}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={UploadCloud} loading={saving} onClick={submit}>Upload document</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {!fixedEmployeeId && (
          <Select label="Employee" required value={form.employeeId} onChange={(e) => update('employeeId', e.target.value)}>
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name ? `${emp.first_name} ${emp.last_name}` : emp.name} {emp.employee_code ? `· ${emp.employee_code}` : ''}
              </option>
            ))}
          </Select>
        )}

        <Select
          label="Document category"
          required
          value={form.categoryId}
          onChange={(e) => {
            const id = e.target.value;
            update('categoryId', id);
            const cat = activeCategories.find((c) => String(c.id) === String(id));
            if (cat && !form.name) update('name', cat.name);
          }}
          hint={selectedCategory ? `${selectedCategory.group_name}${Number(selectedCategory.requires_verification) ? ' · requires HR verification' : ''}` : undefined}
        >
          <option value="">Select a category…</option>
          {grouped.map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </Select>

        <Field label="Select file" required hint="PDF, JPG, JPEG, PNG, DOC or DOCX. Stored under a generated private name.">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={clsx(
              'flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 text-left transition',
              file ? 'border-brand-300 bg-brand-50/40' : 'border-slate-300 bg-slate-50/40 hover:border-brand-300 hover:bg-brand-50/30'
            )}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-brand-600 shadow-sm"><UploadCloud size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-ink-800">{file ? file.name : 'Click to choose a file'}</span>
              <span className="block text-[11px] text-slate-400">{file ? `${formatBytes(file.size)} · ready to upload` : 'Your file name is never used as the storage path.'}</span>
            </span>
            {file && <span className="text-[11px] font-semibold text-brand-600">Change</span>}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              if (f && !form.name.trim()) update('name', f.name.replace(/\.[^.]+$/, ''));
            }}
          />
        </Field>

        <Input label="Document title" value={form.name} maxLength={200} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Aadhaar Card" />
        <Input label="Document number (optional)" value={form.documentNumber} maxLength={120} onChange={(e) => update('documentNumber', e.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Issue date (optional)" type="date" value={form.issueDate} onChange={(e) => update('issueDate', e.target.value)} />
          <Input
            label={selectedCategory?.requires_expiry ? 'Expiry date *' : 'Expiry date (optional)'}
            type="date"
            value={form.expiryDate}
            onChange={(e) => update('expiryDate', e.target.value)}
          />
        </div>
        <Textarea label="Notes (optional)" rows={2} maxLength={2000} value={form.description} onChange={(e) => update('description', e.target.value)} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail / verification                                              */
/* ------------------------------------------------------------------ */
export function DocumentDetailModal({ open, uid, onClose, onChanged }) {
  const toast = useToast();
  const { can, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceRef = useRef(null);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/documents/${encodeURIComponent(uid)}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (open && uid) load();
    if (!open) {
      setData(null);
      setMode(null);
      setReason('');
      setNotes('');
      setPreviewError('');
    }
  }, [open, uid, load]);

  const doc = data?.document;

  useEffect(() => {
    if (!open || !doc || doc.source === 'exit') return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(doc.mime_type)) return;
    let url = '';
    let cancelled = false;
    api
      .documentUrl(doc.uid)
      .then((u) => {
        if (cancelled) return URL.revokeObjectURL(u);
        url = u;
        setPreviewUrl(u);
      })
      .catch(() => setPreviewError('Preview is unavailable. You can still download the file.'));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setPreviewUrl('');
    };
  }, [open, doc]);

  const isOwner = doc && Number(doc.employee_id) === Number(user?.employeeId);
  const canVerify = can('documents.verify') && !isOwner && doc?.source !== 'exit';
  const canManage = can('documents.manage');

  const verify = async (reject) => {
    if (reject && !reason.trim()) return toast.error('A rejection reason is required.');
    setBusy(true);
    try {
      const res = await api.post(`/documents/${doc.uid}/${reject ? 'reject' : 'verify'}`, {
        rejectionReason: reason,
        notes,
      });
      toast.success(res.message);
      setMode(null);
      setReason('');
      setNotes('');
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${doc.name}"? This permanently removes the stored file.`)) return;
    setBusy(true);
    try {
      const res = await api.del(`/documents/${doc.uid}`);
      toast.success(res.message || 'Document deleted.');
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      await api.download(`/documents/${doc.uid}/download`, doc.file_name || 'document');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const replace = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', doc.name);
    fd.append('issueDate', doc.issue_date || '');
    fd.append('expiryDate', doc.expiry_date || '');
    fd.append('documentNumber', doc.document_number_value || '');
    fd.append('description', doc.description || '');
    setReplacing(true);
    try {
      const res = await api.upload(`/documents/${doc.uid}/replace`, fd);
      toast.success(res.message || 'Document replaced.');
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReplacing(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={doc?.name || 'Document'}
      subtitle={doc ? `${doc.category_name} · ${doc.source_label}` : 'Loading…'}
      icon={FileText}
      size="xl"
      footer={
        doc ? (
          <>
            {canManage && doc.source === 'documents' && (
              <Button variant="danger" icon={Trash2} onClick={remove} disabled={busy}>Delete</Button>
            )}
            {doc.source === 'documents' && (canManage || (isOwner && doc.status !== 'verified')) && (
              <>
                <input ref={replaceRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={replace} />
                <Button variant="secondary" icon={RefreshCw} loading={replacing} onClick={() => replaceRef.current?.click()}>Replace file</Button>
              </>
            )}
            <Button variant="primary" icon={Download} onClick={download}>Download</Button>
          </>
        ) : null
      }
    >
      {loading ? (
        <div className="grid place-items-center py-16 text-[12px] text-slate-400">Loading document…</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</div>
      ) : doc ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {doc.source === 'exit' ? (
                <div className="grid place-items-center gap-2 px-6 py-16 text-center">
                  <FileText size={28} className="text-slate-300" />
                  <p className="text-[12px] font-semibold text-ink-700">Generated exit document</p>
                  <p className="max-w-xs text-[11px] text-slate-500">This PDF is generated from the offboarding record. Download it to view the signed copy.</p>
                </div>
              ) : previewUrl && doc.mime_type === 'application/pdf' ? (
                <iframe title={doc.name} src={previewUrl} className="h-[420px] w-full bg-white" />
              ) : previewUrl && doc.mime_type?.startsWith('image/') ? (
                <img src={previewUrl} alt={doc.name} className="max-h-[420px] w-full object-contain" />
              ) : (
                <div className="grid place-items-center gap-2 px-6 py-16 text-center">
                  <FileText size={28} className="text-slate-300" />
                  <p className="text-[12px] font-semibold text-ink-700">Preview not available</p>
                  <p className="max-w-xs text-[11px] text-slate-500">{previewError || 'Download the file to open it in its native application.'}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <Info label="Status"><StatusPill status={doc.status} /></Info>
              <Info label="Category">{doc.category_name}</Info>
              <Info label="Document number">{doc.document_number_value || doc.document_number || '—'}</Info>
              <Info label="File size">{formatBytes(doc.file_size)}</Info>
              <Info label="Issue date">{doc.issue_date ? fmtDate(doc.issue_date) : '—'}</Info>
              <Info label="Expiry date"><span className={expiryTone(doc)}>{expiryText(doc)}</span></Info>
              <Info label="Uploaded">{fmtDate(doc.uploaded_at)}</Info>
              <Info label="Uploaded by">{doc.uploaded_by_name || doc.employee_name || '—'}</Info>
              <Info label="Verified by">{doc.verified_by_name || '—'}</Info>
              <Info label="Verified on">{doc.verified_at ? fmtDate(doc.verified_at) : '—'}</Info>
            </div>

            {doc.rejection_reason && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600">Rejection reason</p>
                <p className="mt-1 text-[12px] leading-relaxed text-rose-700">{doc.rejection_reason}</p>
              </div>
            )}
            {doc.verification_notes && !doc.rejection_reason && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Verification notes</p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{doc.verification_notes}</p>
              </div>
            )}
            {doc.description && <p className="text-[12px] leading-relaxed text-slate-500">{doc.description}</p>}
          </div>

          <div className="space-y-4">
            {canVerify && doc.status !== 'verified' && (
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[12px] font-bold text-ink-900">Verification</p>
                {mode ? (
                  <div className="mt-3 space-y-3">
                    <Textarea
                      label={mode === 'reject' ? 'Rejection reason' : 'Verification notes (optional)'}
                      required={mode === 'reject'}
                      rows={3}
                      value={mode === 'reject' ? reason : notes}
                      onChange={(e) => (mode === 'reject' ? setReason(e.target.value) : setNotes(e.target.value))}
                      placeholder={mode === 'reject' ? 'Explain what needs to be corrected…' : 'Add an optional internal note…'}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
                      <Button
                        size="sm"
                        variant={mode === 'reject' ? 'danger' : 'primary'}
                        icon={mode === 'reject' ? XCircle : ShieldCheck}
                        loading={busy}
                        onClick={() => verify(mode === 'reject')}
                      >
                        {mode === 'reject' ? 'Reject document' : 'Verify document'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => setMode('verify')}>Verify</Button>
                    <Button size="sm" variant="secondary" icon={XCircle} onClick={() => setMode('reject')}>Reject</Button>
                  </div>
                )}
                {isOwner && <p className="mt-2 text-[11px] text-slate-400">You cannot verify your own document.</p>}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink-900"><History size={14} /> Verification history</p>
              {data.verificationHistory?.length ? (
                <ol className="mt-3 space-y-3">
                  {data.verificationHistory.map((h) => (
                    <li key={h.id} className="relative border-l border-slate-200 pl-3">
                      <span className="absolute -left-[4px] top-1.5 h-2 w-2 rounded-full bg-brand-400" />
                      <p className="text-[11.5px] font-semibold capitalize text-ink-800">{h.action} · {h.status || '—'}</p>
                      <p className="text-[10.5px] text-slate-400">{h.performed_by_name || 'System'} · {fmtDate(h.created_at)}</p>
                      {h.rejection_reason && <p className="mt-1 text-[11px] text-rose-600">{h.rejection_reason}</p>}
                      {h.notes && !h.rejection_reason && <p className="mt-1 text-[11px] text-slate-500">{h.notes}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-[11.5px] text-slate-400">No verification events recorded yet.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink-900"><History size={14} /> Activity</p>
              {data.activity?.length ? (
                <ul className="mt-3 space-y-2.5">
                  {data.activity.slice(0, 12).map((a) => (
                    <li key={a.id} className="text-[11px]">
                      <p className="font-semibold text-ink-700">{a.action.replace(/[._]/g, ' ')}</p>
                      <p className="text-[10.5px] text-slate-400">{a.performed_by_name || 'System'} · {fmtDate(a.created_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11.5px] text-slate-400">No activity recorded yet.</p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              Stored privately · authenticated access only · original file name sanitised.
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function Info({ label, children }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 text-[12px] font-medium text-ink-800">{children}</div>
    </div>
  );
}

export function EmployeeFileGrid({
  employees = [],
  onSelect,
  countNoun = 'file',
  emptyIcon = Users,
  emptyTitle = 'No employees found',
  emptyDescription,
  emptyAction,
  loading = false,
  loadingLabel = 'Loading employee documents…',
  className,
}) {
  if (loading) return <LoadingBlock label={loadingLabel} className="py-16" />;
  if (!employees.length) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className="py-16"
      />
    );
  }
  return (
    <div className={clsx('grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3', className)}>
      {employees.map((emp) => (
        <button
          key={emp.employee_id}
          type="button"
          onClick={() => onSelect?.(emp)}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/20"
        >
          <Avatar name={emp.employee_name} color={emp.avatar_color || 'indigo'} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-ink-900">{emp.employee_name}</span>
            <span className="block truncate text-[10.5px] text-slate-400">
              {emp.employee_code || 'No employee ID'}{emp.department_name ? ` · ${emp.department_name}` : ''}
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1">
              {emp.complete && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Complete</span>}
              {emp.pending > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{emp.pending} pending</span>}
              {emp.missing > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{emp.missing} missing</span>}
              {emp.rejected > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{emp.rejected} rejected</span>}
              {emp.expiring > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{emp.expiring} expiring</span>}
              {emp.expired > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{emp.expired} expired</span>}
              {!emp.total && !emp.missing && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">No uploads</span>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[14px] font-extrabold text-ink-900">{emp.total}</span>
            <span className="block text-[10px] text-slate-400">{countNoun}{emp.total === 1 ? '' : 's'}</span>
          </span>
          <ChevronRight size={15} className="shrink-0 text-slate-300" />
        </button>
      ))}
    </div>
  );
}

export function EmployeeDocumentsModal({ open, employee, onClose, onOpenDocument, onUpload, onRemind, refreshKey = 0 }) {
  const { can } = useAuth();
  const employeeId = employee?.employee_id ?? employee?.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reminding, setReminding] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError('');
    try {
      setData(await api.get(`/documents/employee/${employeeId}/summary`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (open && employeeId) load();
    if (!open) {
      setData(null);
      setError('');
    }
  }, [open, employeeId, load, refreshKey]);

  const canManage = can('documents.manage');
  const documents = data?.documents || [];
  const summary = data?.summary || {};
  const outstanding = (data?.required || []).filter((row) => row.status === 'missing' || row.status === 'rejected');

  const upload = () => {
    onUpload?.(employee);
  };

  const remind = async () => {
    if (!onRemind) return;
    setReminding(true);
    try {
      await onRemind(employee);
    } finally {
      setReminding(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee?.employee_name || 'Employee documents'}
      subtitle={employee ? `${employee.employee_code || 'No employee ID'}${employee.department_name ? ` · ${employee.department_name}` : ''}` : 'Loading…'}
      icon={FileText}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {onRemind && outstanding.length > 0 && (
            <Button variant="secondary" icon={BellRing} loading={reminding} onClick={remind}>Send reminder</Button>
          )}
          {canManage && (
            <Button variant="primary" icon={UploadCloud} onClick={upload}>Upload document</Button>
          )}
        </>
      }
    >
      {loading ? (
        <LoadingBlock label="Loading employee documents…" className="py-12" />
      ) : error ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Submitted</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-ink-900">{documents.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Verified</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-emerald-700">{summary.verified || 0}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Pending / review</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-amber-700">{(summary.pending || 0) + (summary.rejected || 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Missing required</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-ink-900">{summary.missing || 0}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12.5px] font-bold text-ink-900">Submitted documents</p>
              <p className="text-[11px] text-slate-400">{documents.length} file{documents.length === 1 ? '' : 's'}</p>
            </div>
            {documents.length ? (
              <div className="mt-3 space-y-2">
                {documents.map((doc) => (
                  <DocumentRow key={doc.uid} doc={doc} showEmployee={false} onOpen={(item) => onOpenDocument?.(item.uid)} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileText}
                title="No documents submitted yet"
                description={`${employee?.employee_name || 'This employee'} has not uploaded any documents yet.`}
                action={canManage ? <Button variant="primary" icon={UploadCloud} onClick={upload}>Upload first document</Button> : null}
                className="mt-3 py-10"
              />
            )}
          </div>

          {outstanding.length > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3.5">
              <p className="text-[11.5px] font-bold text-amber-800">Outstanding required documents</p>
              <div className="mt-2 space-y-1.5">
                {outstanding.map((row) => (
                  <div key={`${row.employee_id}-${row.category_id}`} className="flex items-center justify-between gap-3 text-[11.5px]">
                    <span className="min-w-0 truncate text-amber-800">{row.category_name}</span>
                    <StatusPill status={row.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function EmployeeCell({ doc }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar name={doc.employee_name} color={doc.avatar_color || 'indigo'} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-ink-900">{doc.employee_name}</p>
        <p className="truncate text-[10.5px] text-slate-400">{doc.employee_code}{doc.department_name ? ` · ${doc.department_name}` : ''}</p>
      </div>
    </div>
  );
}
