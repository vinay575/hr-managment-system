import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  BellRing,
  Building2,
  CheckCheck,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Globe2,
  Megaphone,
  Paperclip,
  Send,
  UploadCloud,
  Users,
} from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '../../components/ui';

export const CATEGORY_META = {
  general: { label: 'General', tone: 'slate', icon: Megaphone, ring: 'bg-slate-100 text-slate-600' },
  hr: { label: 'HR', tone: 'sky', icon: Users, ring: 'bg-sky-50 text-sky-600' },
  holiday: { label: 'Holiday', tone: 'emerald', icon: Globe2, ring: 'bg-emerald-50 text-emerald-600' },
  policy: { label: 'Policy', tone: 'violet', icon: FileText, ring: 'bg-violet-50 text-violet-600' },
  important: { label: 'Important Notice', tone: 'rose', icon: AlertTriangle, ring: 'bg-rose-50 text-rose-600' },
};

export const ROLE_OPTIONS = [
  { key: 'employee', label: 'Employees' },
  { key: 'hr', label: 'HR' },
  { key: 'administration', label: 'Administration' },
  { key: 'ceo', label: 'CEO' },
  { key: 'super_admin', label: 'Super Admin' },
];

export const roleLabel = (key) => ROLE_OPTIONS.find((r) => r.key === key)?.label || key;

export const STATUS_META = {
  draft: { label: 'Draft', tone: 'slate' },
  scheduled: { label: 'Scheduled', tone: 'amber' },
  published: { label: 'Published', tone: 'emerald' },
  archived: { label: 'Archived', tone: 'slate' },
};

export const categoryMeta = (key) => CATEGORY_META[key] || CATEGORY_META.general;
export const statusMeta = (key) => STATUS_META[key] || STATUS_META.draft;

export function CategoryPill({ category, label }) {
  const meta = categoryMeta(category);
  const Icon = meta.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', meta.ring)}>
      <Icon size={11} /> {label || meta.label}
    </span>
  );
}

export function StatusPill({ status, label }) {
  const meta = statusMeta(status);
  return <Badge status={status === 'published' ? 'approved' : status === 'scheduled' ? 'pending' : 'inactive'} dot>{label || meta.label}</Badge>;
}

export function AudienceLabel({ announcement }) {
  if (!announcement) return null;
  const isRoles = announcement.audience === 'roles';
  const Icon = announcement.audience === 'department' ? Building2 : Users;
  const roles = Array.isArray(announcement.audience_roles) ? announcement.audience_roles : [];
  const text = isRoles
    ? roles.length
      ? `Roles: ${roles.map(roleLabel).join(', ')}`
      : 'Specific roles'
    : announcement.audience === 'department'
      ? announcement.department_name || 'Specific department'
      : 'Everyone';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      <Icon size={12} />
      {text}
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

export const fmtDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export function announcementWhen(row) {
  if (row.status === 'scheduled') return `Goes live ${fmtDateTime(row.publish_at)}`;
  if (row.status === 'published') return `Published ${fmtDateTime(row.published_at || row.publish_at || row.created_at)}`;
  if (row.status === 'archived') return `Archived ${fmtDateTime(row.archived_at)}`;
  return `Created ${fmtDateTime(row.created_at)}`;
}

/* ------------------------------------------------------------------ */
/*  Create / edit                                                      */
/* ------------------------------------------------------------------ */
const EMPTY_FORM = {
  title: '',
  content: '',
  category: 'general',
  audience: 'everyone',
  roles: [],
  departmentId: '',
  publishMode: 'now',
  publishAt: '',
  requiresAcknowledgment: false,
};

const toLocalInput = (value) => {
  if (!value) return '';
  const raw = String(value).replace(' ', 'T').slice(0, 16);
  return raw;
};

export function AnnouncementFormModal({ open, onClose, onSaved, announcement = null, departments = [] }) {
  const toast = useToast();
  const isEdit = Boolean(announcement?.id);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setFile(null);
    setRemoveAttachment(false);
    if (announcement) {
      setForm({
        title: announcement.title || '',
        content: announcement.content || '',
        category: announcement.category || 'general',
        audience: announcement.audience || 'everyone',
        roles: Array.isArray(announcement.audience_roles) ? announcement.audience_roles : [],
        departmentId: announcement.audience === 'department' && announcement.department_id ? String(announcement.department_id) : '',
        publishMode: announcement.status === 'scheduled' ? 'schedule' : announcement.status === 'draft' ? 'draft' : 'now',
        publishAt: toLocalInput(announcement.publish_at),
        requiresAcknowledgment: Boolean(Number(announcement.requires_acknowledgment)),
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
  }, [open, announcement]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError('');
    if (form.title.trim().length < 3) return setError('Give the announcement a clear title.');
    if (form.content.trim().length < 5) return setError('Write the announcement content.');
    if (form.audience === 'department' && !form.departmentId) return setError('Choose the department this announcement is for.');
    if (form.audience === 'roles' && !form.roles.length) return setError('Choose at least one role for this announcement.');
    if (form.publishMode === 'schedule' && !form.publishAt) return setError('Choose when this announcement should be published.');

    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('content', form.content.trim());
    fd.append('category', form.category);
    fd.append('audience', form.audience);
    fd.append('roles', form.audience === 'roles' ? form.roles.join(',') : '');
    fd.append('departmentId', form.audience === 'department' ? form.departmentId : '');
    fd.append('publishMode', form.publishMode);
    if (form.publishMode === 'schedule') fd.append('publishAt', form.publishAt);
    fd.append('requiresAcknowledgment', form.requiresAcknowledgment ? '1' : '0');
    if (removeAttachment) fd.append('removeAttachment', '1');
    if (file) fd.append('file', file);

    setSaving(true);
    try {
      const res = isEdit
        ? await api.upload(`/announcements/${announcement.id}`, fd, 'PUT')
        : await api.upload('/announcements', fd);
      toast.success(res.message || 'Announcement saved.');
      onSaved?.(res.announcement);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const modes = isEdit && announcement?.status === 'published' ? ['now', 'schedule'] : isEdit ? ['now', 'schedule', 'draft'] : ['now', 'schedule', 'draft'];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit announcement' : 'New announcement'}
      subtitle="Company, team and role-based communication with optional acknowledgment tracking."
      icon={Megaphone}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Send} loading={saving} onClick={submit}>
            {form.publishMode === 'schedule' ? 'Schedule announcement' : form.publishMode === 'draft' ? 'Save draft' : 'Publish announcement'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <Input label="Title" required maxLength={200} value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Annual holiday calendar 2026" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Category" required value={form.category} onChange={(e) => update('category', e.target.value)}>
            {Object.entries(CATEGORY_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </Select>
          <Select
            label="Audience"
            required
            value={form.audience}
            onChange={(e) => update('audience', e.target.value)}
            hint="Everyone reaches the whole company. Specific roles let you address HR, Administration, leadership or all employees."
          >
            <option value="everyone">Everyone</option>
            <option value="roles">Specific roles</option>
            <option value="department">Specific department</option>
          </Select>
        </div>

        {form.audience === 'roles' && (
          <Field label="Roles" required hint="Each active person with one of these roles receives the announcement and a notification.">
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => {
                const active = form.roles.includes(role.key);
                return (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() =>
                      update(
                        'roles',
                        active ? form.roles.filter((key) => key !== role.key) : [...form.roles, role.key]
                      )
                    }
                    className={clsx(
                      'rounded-full border px-3 py-1.5 text-[12px] font-semibold transition',
                      active
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-600'
                    )}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {form.audience === 'department' && (
          <Select label="Department" required value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)}>
            <option value="">Select a department…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        )}

        <Textarea
          label="Announcement content"
          required
          rows={7}
          maxLength={20000}
          value={form.content}
          onChange={(e) => update('content', e.target.value)}
          placeholder="Write the full announcement. Line breaks are preserved in the employee feed."
        />

        <Field label="Attachment (optional)" hint="PDF, JPG, JPEG, PNG, DOC or DOCX. Stored privately.">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setRemoveAttachment(false); }}
            />
            <Button variant="secondary" icon={UploadCloud} onClick={() => fileRef.current?.click()}>
              {file ? 'Change file' : 'Choose file'}
            </Button>
            {file && <span className="text-[11.5px] font-medium text-slate-600">{file.name} · {formatBytes(file.size)}</span>}
            {!file && announcement?.has_attachment && !removeAttachment && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-500">
                <Paperclip size={12} /> {announcement.attachment_name}
                <button type="button" className="font-semibold text-rose-600 hover:text-rose-700" onClick={() => setRemoveAttachment(true)}>Remove</button>
              </span>
            )}
            {removeAttachment && <span className="text-[11.5px] font-medium text-rose-600">Attachment will be removed on save.</span>}
          </div>
        </Field>

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-[12px] font-bold text-ink-900">Publishing</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {modes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => update('publishMode', mode)}
                className={clsx(
                  'rounded-xl border px-3 py-2.5 text-left transition',
                  form.publishMode === mode ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200' : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <p className="text-[12px] font-semibold text-ink-800">{mode === 'now' ? 'Publish now' : mode === 'schedule' ? 'Schedule' : 'Save draft'}</p>
                <p className="mt-0.5 text-[10.5px] text-slate-500">
                  {mode === 'now' ? 'Visible immediately' : mode === 'schedule' ? 'Goes live automatically' : 'Only visible to managers'}
                </p>
              </button>
            ))}
          </div>
          {form.publishMode === 'schedule' && (
            <div className="mt-3">
              <Input label="Publish date & time" type="datetime-local" required value={form.publishAt} onChange={(e) => update('publishAt', e.target.value)} />
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={form.requiresAcknowledgment}
            onChange={(e) => update('requiresAcknowledgment', e.target.checked)}
          />
          <span>
            <span className="block text-[12px] font-semibold text-ink-900">Require acknowledgment</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">Employees see an acknowledge button and their response is tracked in reports.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail                                                             */
/* ------------------------------------------------------------------ */
export function AnnouncementDetailModal({ open, id, onClose, onChanged, onEdit, onAcknowledge }) {
  const toast = useToast();
  const { can, user } = useAuth();
  const [announcement, setAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/announcements/${encodeURIComponent(id)}`);
      setAnnouncement(res.announcement);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (open && id) load();
    if (!open) {
      setAnnouncement(null);
      setPreviewUrl('');
      setError('');
    }
  }, [open, id, load]);

  useEffect(() => {
    let url = '';
    let cancelled = false;
    if (open && announcement?.has_attachment && ['application/pdf', 'image/jpeg', 'image/png'].includes(announcement.attachment_mime)) {
      api.announcementAttachmentUrl(announcement.id)
        .then((u) => { if (cancelled) URL.revokeObjectURL(u); else { url = u; setPreviewUrl(u); } })
        .catch(() => setPreviewUrl(''));
    }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); setPreviewUrl(''); };
  }, [open, announcement?.id, announcement?.has_attachment, announcement?.attachment_mime]);

  const download = async () => {
    try {
      await api.download(`/announcements/${announcement.id}/attachment/download`, announcement.attachment_name || 'attachment');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const acknowledge = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/announcements/my/${announcement.id}/acknowledge`);
      toast.success(res.message || 'Announcement acknowledged.');
      await load();
      onAcknowledge?.();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const manage = can('announcements.manage') && announcement?.status !== 'archived';
  const canAcknowledge = can('announcements.self') && Number(announcement?.requires_acknowledgment) && !announcement?.acknowledged_at;
  const targeted = Boolean(user?.employeeId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={announcement?.title || 'Announcement'}
      subtitle={announcement ? announcementWhen(announcement) : 'Loading…'}
      icon={Megaphone}
      size="xl"
      footer={
        announcement ? (
          <>
            {manage && <Button variant="secondary" icon={Send} onClick={() => onEdit?.(announcement)}>Edit</Button>}
            {announcement.has_attachment && <Button variant="secondary" icon={Download} onClick={download}>Download attachment</Button>}
            {canAcknowledge && targeted && (
              <Button variant="primary" icon={CheckCheck} loading={busy} onClick={acknowledge}>Acknowledge</Button>
            )}
          </>
        ) : null
      }
    >
      {loading ? (
        <div className="grid place-items-center py-16 text-[12px] text-slate-400">Loading announcement…</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</div>
      ) : announcement ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryPill category={announcement.category} label={announcement.category_label} />
            <StatusPill status={announcement.status} label={announcement.status_label} />
            <AudienceLabel announcement={announcement} />
            {Number(announcement.requires_acknowledgment) ? <Badge status="pending" dot>Acknowledgment required</Badge> : null}
          </div>

          {announcement.acknowledged_at && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-700">
              <CheckCircle2 size={15} /> Acknowledged {fmtDateTime(announcement.acknowledged_at)}
            </div>
          )}

          <div className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-[13px] leading-relaxed text-slate-700">
            {announcement.content}
          </div>

          {announcement.has_attachment && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3.5 py-2.5">
                <Paperclip size={14} className="text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-800">{announcement.attachment_name}</span>
                <span className="text-[10.5px] text-slate-400">{formatBytes(announcement.attachment_size)}</span>
                <Button size="sm" variant="ghost" icon={Eye} onClick={() => api.announcementAttachmentUrl(announcement.id).then((u) => window.open(u, '_blank')).catch((e) => toast.error(e.message))}>Preview</Button>
              </div>
              {previewUrl && announcement.attachment_mime === 'application/pdf' ? (
                <iframe title={announcement.attachment_name} src={previewUrl} className="h-[320px] w-full bg-white" />
              ) : previewUrl && announcement.attachment_mime?.startsWith('image/') ? (
                <img src={previewUrl} alt={announcement.attachment_name} className="max-h-[320px] w-full object-contain" />
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
            <Info label="Author">{announcement.created_by_name || 'HR team'}</Info>
            <Info label="Audience">{announcement.audience_label}</Info>
            <Info label="Published">{fmtDateTime(announcement.published_at || announcement.publish_at)}</Info>
            <Info label="Requires ack.">{Number(announcement.requires_acknowledgment) ? 'Yes' : 'No'}</Info>
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

/* ------------------------------------------------------------------ */
/*  Row                                                                */
/* ------------------------------------------------------------------ */
export function AnnouncementRow({ row, onOpen, actions }) {
  const meta = categoryMeta(row.category);
  const Icon = meta.icon;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 transition hover:border-brand-200 hover:bg-brand-50/20 sm:flex-nowrap">
      <div className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', meta.ring)}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onOpen?.(row)} className="max-w-full truncate text-left text-[13px] font-semibold text-ink-900 hover:text-brand-600">
            {row.title}
          </button>
          <StatusPill status={row.status} label={row.status_label} />
          {Number(row.requires_acknowledgment) ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <BellRing size={10} /> Ack required
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
          {row.category_label} · {announcementWhen(row)} · {row.audience_label}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onOpen && <Button size="sm" variant="ghost" icon={Eye} onClick={() => onOpen(row)}>View</Button>}
      </div>
    </div>
  );
}
