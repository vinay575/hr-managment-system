import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertCircle,
  Banknote,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  MessageSquare,
  Paperclip,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate, todayISO } from '../../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Textarea,
} from '../../components/ui';

/* ------------------------------------------------------------------ */
/*  Status metadata                                                    */
/* ------------------------------------------------------------------ */
export const EXPENSE_STATUS = {
  draft: { label: 'Draft', tone: 'slate' },
  submitted: { label: 'Submitted', tone: 'sky' },
  under_review: { label: 'Under review', tone: 'indigo' },
  clarification_required: { label: 'Clarification required', tone: 'amber' },
  approved: { label: 'Approved', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'rose' },
  reimbursement_pending: { label: 'Reimbursement pending', tone: 'violet' },
  partially_reimbursed: { label: 'Partially reimbursed', tone: 'teal' },
  reimbursed: { label: 'Reimbursed', tone: 'emerald' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const REIMBURSEMENT_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  processing: { label: 'Processing', tone: 'sky' },
  partially_paid: { label: 'Partially paid', tone: 'teal' },
  paid: { label: 'Paid', tone: 'emerald' },
  failed: { label: 'Failed', tone: 'rose' },
  on_hold: { label: 'On hold', tone: 'slate' },
};

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export const REIMBURSABLE_STATUS = ['approved', 'reimbursement_pending', 'partially_reimbursed'];

export function ExpenseStatusBadge({ status, className }) {
  const meta = EXPENSE_STATUS[status] || { label: String(status || '—').replace(/_/g, ' '), tone: 'slate' };
  return <Badge tone={meta.tone} className={className}>{meta.label}</Badge>;
}

export function ReimbursementStatusBadge({ status, className }) {
  const meta = REIMBURSEMENT_STATUS[status] || { label: String(status || '—').replace(/_/g, ' '), tone: 'slate' };
  return <Badge tone={meta.tone} className={className}>{meta.label}</Badge>;
}

export const expenseMoney = (amount, currency = 'USD') => {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || ''} ${value.toFixed(2)}`;
  }
};

export const fileSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

export const outstandingAmount = (claim) =>
  Math.max(
    0,
    Math.round(
      ((Number(claim?.approved_amount ?? claim?.amount) || 0) - (Number(claim?.committed_amount) || 0)) * 100
    ) / 100
  );

const ACTION_META = {
  submitted: { label: 'Submitted', tone: 'sky', icon: Send },
  resubmitted: { label: 'Resubmitted', tone: 'sky', icon: RefreshCw },
  approved: { label: 'Approved', tone: 'emerald', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'rose', icon: XCircle },
  clarification_requested: { label: 'Clarification requested', tone: 'amber', icon: MessageSquare },
  cancelled: { label: 'Cancelled', tone: 'slate', icon: X },
};

/* ------------------------------------------------------------------ */
/*  Receipt management                                                 */
/* ------------------------------------------------------------------ */
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export function ReceiptUploader({ files, onFiles, existing = [], removedIds = [], onToggleExisting, maxMb = 10, maxFiles = 5 }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const previews = useMemo(
    () => (files || []).map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  );

  useEffect(
    () => () => previews.forEach((p) => URL.revokeObjectURL(p.url)),
    [previews]
  );

  const addFiles = (list) => {
    setError('');
    const incoming = Array.from(list || []);
    const valid = [];
    for (const file of incoming) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name} is not a supported receipt type. Use PDF, JPG, PNG or WEBP.`);
        continue;
      }
      if (file.size > maxMb * 1024 * 1024) {
        setError(`${file.name} is larger than ${maxMb} MB.`);
        continue;
      }
      valid.push(file);
    }
    const currentExisting = existing.filter((a) => !removedIds.includes(a.id)).length;
    if (currentExisting + (files || []).length + valid.length > maxFiles) {
      setError(`You can attach up to ${maxFiles} receipts per claim.`);
      return;
    }
    if (valid.length) onFiles([...(files || []), ...valid]);
  };

  const keptExisting = existing.filter((a) => !removedIds.includes(a.id));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="label mb-0">
          Receipts / invoices <span className="text-rose-500">*</span>
        </label>
        <span className="text-[11px] text-slate-400">PDF, JPG, PNG, WEBP · max {maxMb} MB each</span>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="mt-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center transition hover:border-brand-300 hover:bg-brand-50/30"
      >
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-500 shadow-sm">
          <Upload size={19} />
        </div>
        <p className="mt-2 text-[13px] font-semibold text-ink-800">Drop receipts here or browse</p>
        <p className="mt-0.5 text-[11.5px] text-slate-400">Receipts are stored privately and only visible to you and authorized approvers.</p>
        <Button size="sm" variant="secondary" icon={Paperclip} className="mt-3" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}

      {(keptExisting.length > 0 || previews.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {keptExisting.map((attachment) => (
            <div key={`existing-${attachment.id}`} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                {String(attachment.file_type || '').startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-ink-800">{attachment.file_name}</p>
                <p className="text-[10.5px] text-slate-400">Uploaded {fmtDate(attachment.created_at)}</p>
              </div>
              {onToggleExisting && (
                <button type="button" onClick={() => onToggleExisting(attachment.id)} className="icon-btn h-8 w-8 text-rose-500 hover:bg-rose-50" title="Remove receipt">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          {previews.map(({ file, url }, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/40 px-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-brand-500">
                {file.type.startsWith('image/') ? (
                  <img src={url} alt={file.name} className="h-full w-full object-cover" />
                ) : (
                  <FileText size={16} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-ink-800">{file.name}</p>
                <p className="text-[10.5px] text-slate-400">{fileSize(file.size)} · ready to upload</p>
              </div>
              <button
                type="button"
                onClick={() => onFiles(files.filter((_, i) => i !== index))}
                className="icon-btn h-8 w-8 text-rose-500 hover:bg-rose-50"
                title="Remove file"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expense form                                                       */
/* ------------------------------------------------------------------ */
const blankForm = (settings) => ({
  title: '',
  categoryId: '',
  expenseDate: todayISO(),
  amount: '',
  currency: settings?.default_currency || 'USD',
  purpose: '',
  projectName: '',
  clientName: '',
  vendorName: '',
  merchantName: '',
  additionalNotes: '',
});

export function ExpenseForm({
  open,
  onClose,
  onSaved,
  categories = [],
  settings = {},
  currencies = ['USD'],
  claim = null,
  departmentName = '',
}) {
  const toast = useToast();
  const [form, setForm] = useState(() => blankForm(settings));
  const [files, setFiles] = useState([]);
  const [existing, setExisting] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFiles([]);
    setRemovedIds([]);
    dirtyRef.current = false;
    if (claim?.id) {
      setLoading(true);
      api
        .get(`/expenses/${claim.id}`)
        .then((data) => {
          const c = data.claim;
          setForm({
            title: c.title || '',
            categoryId: String(c.category_id || ''),
            expenseDate: String(c.expense_date || '').slice(0, 10),
            amount: String(c.amount ?? ''),
            currency: c.currency || 'USD',
            purpose: c.purpose || '',
            projectName: c.project_name || '',
            clientName: c.client_name || '',
            vendorName: c.vendor_name || '',
            merchantName: c.merchant_name || '',
            additionalNotes: c.additional_notes || '',
          });
          setExisting(data.attachments || []);
        })
        .catch((err) => toast.error(err.message))
        .finally(() => setLoading(false));
    } else {
      setExisting([]);
      setForm(blankForm(settings));
    }
  }, [open, claim?.id, toast]);

  useEffect(() => {
    if (!open || claim?.id || dirtyRef.current) return;
    setForm((prev) => ({ ...prev, currency: settings?.default_currency || 'USD' }));
  }, [open, claim?.id, settings?.default_currency]);

  const update = (key, value) => {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const selectedCategory = categories.find((c) => String(c.id) === String(form.categoryId));
  const keptExisting = existing.filter((a) => !removedIds.includes(a.id));
  const attachmentCount = keptExisting.length + files.length;
  const threshold = Number(settings.receipt_threshold_amount || 0);
  const receiptRequired =
    Number(selectedCategory?.receipt_required) === 1 ||
    (threshold > 0 && Number(form.amount || 0) >= threshold);

  const validate = (asDraft) => {
    const next = {};
    if (!form.title.trim()) next.title = 'Expense title is required.';
    if (!form.categoryId) next.categoryId = 'Choose an expense category.';
    if (!form.expenseDate) next.expenseDate = 'Expense date is required.';
    else if (form.expenseDate > todayISO()) next.expenseDate = 'Expense date cannot be in the future.';
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) next.amount = 'Amount must be greater than zero.';
    if (selectedCategory?.max_claim_amount != null && amount > Number(selectedCategory.max_claim_amount))
      next.amount = `The maximum claim for ${selectedCategory.name} is ${expenseMoney(selectedCategory.max_claim_amount, form.currency)}.`;
    if (!form.purpose.trim()) next.purpose = 'Purpose / description is required.';
    if (!asDraft && receiptRequired && attachmentCount < 1)
      next.receipts = `A receipt is required for this claim.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (asDraft = false) => {
    if (!validate(asDraft)) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('categoryId', form.categoryId);
      fd.append('expenseDate', form.expenseDate);
      fd.append('amount', form.amount);
      fd.append('currency', form.currency);
      fd.append('purpose', form.purpose.trim());
      fd.append('projectName', form.projectName);
      fd.append('clientName', form.clientName);
      fd.append('vendorName', form.vendorName);
      fd.append('merchantName', form.merchantName);
      fd.append('additionalNotes', form.additionalNotes);
      fd.append('asDraft', asDraft ? '1' : '0');
      if (claim?.id && removedIds.length) fd.append('removeAttachmentIds', JSON.stringify(removedIds));
      files.forEach((file) => fd.append('receipts', file));
      const res = claim?.id
        ? await api.upload(`/expenses/${claim.id}`, fd, 'PUT')
        : await api.upload('/expenses', fd, 'POST');
      const submitted =
        claim?.id && !asDraft && ['draft', 'clarification_required'].includes(claim.approval_status)
          ? await api.post(`/expenses/${claim.id}/submit`)
          : null;
      toast.success(submitted?.message || res.message || (asDraft ? 'Draft saved.' : 'Expense submitted.'));
      onSaved?.(submitted?.claim || res.claim);
      onClose?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={claim ? 'Edit expense claim' : 'Submit an expense'}
      subtitle="Attach receipts, describe the spend and we’ll route it to the right approver."
      icon={Receipt}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="secondary" icon={FileText} onClick={() => save(true)} loading={saving}>
            Save draft
          </Button>
          <Button variant="primary" icon={Send} onClick={() => save(false)} loading={saving}>
            {claim ? 'Save & submit' : 'Submit claim'}
          </Button>
        </>
      }
    >
      {loading ? (
        <LoadingBlock label="Loading claim…" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Expense title"
              required
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Client visit — Mumbai"
              error={errors.title}
              wrapperClass="sm:col-span-2"
            />
            <Select label="Expense category" required value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)} error={errors.categoryId}>
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input label="Expense date" type="date" required max={todayISO()} value={form.expenseDate} onChange={(e) => update('expenseDate', e.target.value)} error={errors.expenseDate} />
            <Input label="Amount" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => update('amount', e.target.value)} error={errors.amount} placeholder="0.00" />
            <Select label="Currency" value={form.currency} onChange={(e) => update('currency', e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Field label="Department" hint="Taken from your employee profile." htmlFor="expense-department">
              <input id="expense-department" className="input bg-slate-50 text-slate-500" value={departmentName || claim?.department_name || 'Not assigned'} readOnly />
            </Field>
            <div className="sm:col-span-2">
              <Textarea label="Purpose / description" required rows={3} value={form.purpose} onChange={(e) => update('purpose', e.target.value)} error={errors.purpose} placeholder="What was this expense for?" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Optional context</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Project name" value={form.projectName} onChange={(e) => update('projectName', e.target.value)} />
              <Input label="Client name" value={form.clientName} onChange={(e) => update('clientName', e.target.value)} />
              <Input label="Vendor name" value={form.vendorName} onChange={(e) => update('vendorName', e.target.value)} />
              <Input label="Merchant / store" value={form.merchantName} onChange={(e) => update('merchantName', e.target.value)} />
            </div>
            <div className="mt-4">
              <Textarea label="Additional notes" rows={2} value={form.additionalNotes} onChange={(e) => update('additionalNotes', e.target.value)} />
            </div>
          </div>

          <div>
            <ReceiptUploader
              files={files}
              onFiles={setFiles}
              existing={existing}
              removedIds={removedIds}
              onToggleExisting={(attachmentId) =>
                setRemovedIds((prev) => (prev.includes(attachmentId) ? prev.filter((x) => x !== attachmentId) : [...prev, attachmentId]))
              }
              maxMb={Number(settings.max_attachment_mb || 10)}
              maxFiles={Number(settings.max_attachments_per_expense || 5)}
            />
            {errors.receipts && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.receipts}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Expense details                                                    */
/* ------------------------------------------------------------------ */
function Detail({ label, value, className }) {
  return (
    <div className={className}>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-ink-800">{value || '—'}</p>
    </div>
  );
}

export function ExpenseDetailsModal({ open, onClose, expenseId, onChanged, canApprove, canReimburse, onReimburse, onEdit, onChangedStatus }) {
  const { user } = useAuth();
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('');
  const [comments, setComments] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!expenseId) return;
    setLoading(true);
    try {
      const data = await api.get(`/expenses/${expenseId}`);
      setDetail(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [expenseId, toast]);

  useEffect(() => {
    if (open) {
      setMode('');
      setComments('');
      setRejectionReason('');
      load();
    } else {
      setDetail(null);
    }
  }, [open, load]);

  useEffect(() => {
    if (preview?.url) return () => URL.revokeObjectURL(preview.url);
    return undefined;
  }, [preview]);

  const claim = detail?.claim;
  const isOwn = claim && Number(claim.employee_id) === Number(user?.employeeId);
  const canAct = canApprove && claim && !isOwn && ['submitted', 'under_review', 'clarification_required'].includes(claim.approval_status);

  const previewReceipt = async (attachment) => {
    try {
      const url = await api.receiptUrl(claim.id, attachment.id);
      setPreview({ url, attachment });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const downloadReceipt = async (attachment) => {
    try {
      await api.download(`/expenses/${claim.id}/attachments/${attachment.id}`, attachment.file_name);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const act = async (action) => {
    setActing(true);
    try {
      const body = { comments };
      if (action === 'reject') body.rejectionReason = rejectionReason;
      await api.post(`/expenses/${claim.id}/${action}`, body);
      toast.success(
        action === 'approve' ? 'Expense approved.' : action === 'reject' ? 'Expense rejected.' : 'Clarification requested.'
      );
      setMode('');
      setComments('');
      setRejectionReason('');
      await load();
      onChanged?.();
      onChangedStatus?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={claim ? claim.title : 'Expense claim'}
        subtitle={claim ? `${claim.expense_code} · ${claim.category_name}` : undefined}
        icon={Receipt}
        size="xl"
        footer={
          claim ? (
            <>
              <Button variant="secondary" onClick={onClose}>Close</Button>
              {isOwn && ['draft', 'clarification_required'].includes(claim.approval_status) && onEdit && (
                <Button variant="secondary" icon={FileText} onClick={() => { onClose(); onEdit?.(claim); }}>Edit claim</Button>
              )}
              {canReimburse && REIMBURSABLE_STATUS.includes(claim.approval_status) && outstandingAmount(claim) > 0 && onReimburse && (
                <Button variant="primary" icon={Banknote} onClick={() => onReimburse(claim)}>Record reimbursement</Button>
              )}
            </>
          ) : null
        }
      >
        {loading || !claim ? (
          <LoadingBlock label="Loading expense…" />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={claim.employee_name} color={claim.avatar_color || 'indigo'} size="md" />
                <div>
                  <p className="text-[13.5px] font-semibold text-ink-900">{claim.employee_name}</p>
                  <p className="text-[11.5px] text-slate-400">{claim.employee_code} · {claim.department_name || 'No department'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ExpenseStatusBadge status={claim.approval_status} />
                {REIMBURSABLE_STATUS.includes(claim.approval_status) || claim.approval_status === 'reimbursed' ? (
                  <ReimbursementStatusBadge status={claim.reimbursement_status} />
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Claim amount</p>
                  <p className="mt-1 font-display text-[28px] font-extrabold tracking-tight text-ink-900">
                    {expenseMoney(claim.amount, claim.currency)}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-slate-400">Expense date {fmtDate(claim.expense_date)}</p>
                </div>
                {REIMBURSABLE_STATUS.includes(claim.approval_status) && (
                  <div className="text-right">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Outstanding</p>
                    <p className="mt-1 font-display text-[20px] font-bold text-emerald-600">{expenseMoney(outstandingAmount(claim), claim.currency)}</p>
                    <p className="text-[11px] text-slate-400">of {expenseMoney(claim.approved_amount ?? claim.amount, claim.currency)} approved</p>
                  </div>
                )}
                {claim.approval_status === 'reimbursed' && (
                  <div className="text-right">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Reimbursed</p>
                    <p className="mt-1 font-display text-[20px] font-bold text-emerald-600">{expenseMoney(claim.paid_amount, claim.currency)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Detail label="Category" value={claim.category_name} />
              <Detail label="Submitted" value={claim.submitted_at ? fmtDate(claim.submitted_at) : '—'} />
              <Detail label="Project" value={claim.project_name} />
              <Detail label="Client" value={claim.client_name} />
              <Detail label="Vendor" value={claim.vendor_name} />
              <Detail label="Merchant" value={claim.merchant_name} />
              <Detail label="Department" value={claim.department_name} />
              <Detail label="Attachments" value={`${detail.attachments?.length || 0} receipt(s)`} />
            </div>

            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Purpose</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-700">{claim.purpose}</p>
              {claim.additional_notes && (
                <>
                  <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Additional notes</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-500">{claim.additional_notes}</p>
                </>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-ink-900">Receipts</p>
                <span className="text-[11px] text-slate-400">{detail.attachments?.length || 0} file(s)</span>
              </div>
              {detail.attachments?.length ? (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {detail.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                        {String(attachment.file_type || '').startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink-800">{attachment.file_name}</p>
                        <p className="text-[10.5px] text-slate-400">{fileSize(attachment.file_size)}</p>
                      </div>
                      <button className="icon-btn h-8 w-8" title="Preview" onClick={() => previewReceipt(attachment)}>
                        <Info size={15} />
                      </button>
                      <button className="icon-btn h-8 w-8" title="Download" onClick={() => downloadReceipt(attachment)}>
                        <Download size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-4 py-4 text-center text-[12px] text-slate-400">No receipts attached.</p>
              )}
            </div>

            {canAct && (
              <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12.5px] font-bold text-ink-900">Approval decision</p>
                    <p className="text-[11.5px] text-slate-500">Approve, reject with a reason, or ask the employee for clarification.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" icon={Check} onClick={() => setMode(mode === 'approve' ? '' : 'approve')}>Approve</Button>
                    <Button size="sm" variant="danger" icon={XCircle} onClick={() => setMode(mode === 'reject' ? '' : 'reject')}>Reject</Button>
                    <Button size="sm" variant="secondary" icon={MessageSquare} onClick={() => setMode(mode === 'clarify' ? '' : 'clarify')}>Request clarification</Button>
                  </div>
                </div>
                {mode && (
                  <div className="mt-3 space-y-3">
                    {mode === 'reject' && (
                      <Field label="Rejection reason" required htmlFor="expense-rejection-reason">
                        <textarea id="expense-rejection-reason" className="input min-h-[80px]" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why this claim is rejected." />
                      </Field>
                    )}
                    {mode === 'clarify' && (
                      <Field label="Clarification message" required htmlFor="expense-clarification-message">
                        <textarea id="expense-clarification-message" className="input min-h-[80px]" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="What does the employee need to clarify?" />
                      </Field>
                    )}
                    {mode === 'approve' && (
                      <Field label="Approval comments" hint="Optional note for the employee." htmlFor="expense-approval-comments">
                        <textarea id="expense-approval-comments" className="input min-h-[64px]" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Looks good." />
                      </Field>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setMode('')} disabled={acting}>Cancel</Button>
                      <Button
                        size="sm"
                        variant={mode === 'reject' ? 'danger' : 'primary'}
                        loading={acting}
                        icon={mode === 'approve' ? Check : mode === 'reject' ? XCircle : Send}
                        onClick={() => {
                          if (mode === 'reject' && !rejectionReason.trim()) return toast.error('A rejection reason is required.');
                          if (mode === 'clarify' && !comments.trim()) return toast.error('Please add a clarification message.');
                          act(mode === 'approve' ? 'approve' : mode === 'reject' ? 'reject' : 'request-clarification');
                        }}
                      >
                        {mode === 'approve' ? 'Confirm approval' : mode === 'reject' ? 'Confirm rejection' : 'Send request'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <p className="text-[12px] font-bold text-ink-900">Approval history</p>
                <div className="mt-2 space-y-2">
                  {detail.approvals?.length ? (
                    detail.approvals.map((ap) => {
                      const meta = ACTION_META[ap.action] || { label: ap.action, tone: 'slate', icon: Info };
                      const Icon = meta.icon;
                      return (
                        <div key={ap.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start gap-2.5">
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                              <Icon size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[12px] font-semibold text-ink-800">{meta.label}</p>
                                <p className="text-[10.5px] text-slate-400">{fmtDate(ap.action_date)}</p>
                              </div>
                              <p className="text-[11px] text-slate-400">{ap.approver_name || 'System'}</p>
                              {ap.comments && <p className="mt-1 text-[12px] text-slate-600">{ap.comments}</p>}
                              {ap.rejection_reason && <p className="mt-1 text-[12px] text-rose-600">{ap.rejection_reason}</p>}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-center text-[12px] text-slate-400">No approval actions yet.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-bold text-ink-900">Reimbursement records</p>
                <div className="mt-2 space-y-2">
                  {detail.reimbursements?.length ? (
                    detail.reimbursements.map((r) => (
                      <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[12.5px] font-bold text-ink-900">{expenseMoney(r.amount, claim.currency)}</p>
                          <ReimbursementStatusBadge status={r.payment_status} />
                        </div>
                        <p className="mt-1 text-[11.5px] text-slate-500">
                          {PAYMENT_METHOD_LABEL[r.payment_method] || r.payment_method}
                          {r.transaction_reference ? ` · ${r.transaction_reference}` : ''}
                        </p>
                        <p className="text-[10.5px] text-slate-400">
                          {r.payment_date ? `Paid ${fmtDate(r.payment_date)}` : `Recorded ${fmtDate(r.created_at)}`}
                          {r.processed_by_name ? ` · ${r.processed_by_name}` : ''}
                        </p>
                        {r.payment_notes && <p className="mt-1 text-[11.5px] text-slate-500">{r.payment_notes}</p>}
                      </div>
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-center text-[12px] text-slate-400">No reimbursements recorded.</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="text-[12px] font-bold text-ink-900">Activity trail</p>
              <div className="mt-2 space-y-1.5">
                {detail.activity?.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-[11.5px] text-slate-500">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-ink-700">{log.description || log.action}</span>
                      <span className="text-slate-400"> · {log.user_name || 'System'} · {fmtDate(log.created_at)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.attachment?.file_name || 'Receipt'}
        subtitle="Private receipt preview"
        icon={Receipt}
        size="full"
        footer={
          preview ? (
            <Button variant="secondary" icon={Download} onClick={() => downloadReceipt(preview.attachment)}>Download</Button>
          ) : null
        }
      >
        {preview &&
          (String(preview.attachment.file_type || '').startsWith('image/') ? (
            <img src={preview.url} alt={preview.attachment.file_name} className="mx-auto max-h-[70vh] rounded-xl object-contain" />
          ) : (
            <iframe title={preview.attachment.file_name} src={preview.url} className="h-[70vh] w-full rounded-xl border border-slate-200" />
          ))}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Reimbursement modal                                                */
/* ------------------------------------------------------------------ */
export function ReimbursementModal({ open, onClose, claim, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    amount: '',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'paid',
    paymentDate: todayISO(),
    transactionReference: '',
    paymentNotes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !claim) return;
    setForm({
      amount: String(outstandingAmount(claim) || ''),
      paymentMethod: 'bank_transfer',
      paymentStatus: 'paid',
      paymentDate: todayISO(),
      transactionReference: '',
      paymentNotes: '',
    });
  }, [open, claim]);

  if (!claim) return null;
  const outstanding = outstandingAmount(claim);

  const save = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Amount must be greater than zero.');
    if (amount > outstanding + 0.005) return toast.error(`Amount cannot exceed the outstanding ${expenseMoney(outstanding, claim.currency)}.`);
    if (form.paymentStatus === 'paid' && !form.paymentDate) return toast.error('Payment date is required.');
    setSaving(true);
    try {
      await api.post(`/expenses/${claim.id}/reimbursements`, { ...form, amount });
      toast.success('Reimbursement recorded.');
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Record reimbursement"
      subtitle={`${claim.expense_code} · ${claim.employee_name}`}
      icon={Banknote}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" icon={Check} loading={saving} onClick={save}>Save reimbursement</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">Approved amount</p>
              <p className="font-display text-[18px] font-bold text-ink-900">{expenseMoney(claim.approved_amount ?? claim.amount, claim.currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">Outstanding</p>
              <p className="font-display text-[18px] font-bold text-ink-900">{expenseMoney(outstanding, claim.currency)}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Reimbursement amount" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
          <Select label="Payment method" value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
          <Select label="Payment status" value={form.paymentStatus} onChange={(e) => setForm((p) => ({ ...p, paymentStatus: e.target.value }))}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="on_hold">On hold</option>
          </Select>
          <Input label="Payment date" type="date" required value={form.paymentDate} onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))} />
          <Input label="Transaction / reference number" value={form.transactionReference} onChange={(e) => setForm((p) => ({ ...p, transactionReference: e.target.value }))} wrapperClass="sm:col-span-2" placeholder="UTR, UPI ref or cheque number" />
          <div className="sm:col-span-2">
            <Textarea label="Payment notes" rows={2} value={form.paymentNotes} onChange={(e) => setForm((p) => ({ ...p, paymentNotes: e.target.value }))} />
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11.5px] text-slate-500">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          This records a manual reimbursement. No payment gateway is used and no money is moved by Aurora.
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Small shared blocks                                                */
/* ------------------------------------------------------------------ */
export function RecentClaimRow({ claim, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50">
      <Avatar name={claim.employee_name} color={claim.avatar_color || 'indigo'} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold text-ink-900">{claim.title}</p>
        <p className="truncate text-[11px] text-slate-400">{claim.employee_name} · {claim.expense_code}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[12.5px] font-bold text-ink-900">{expenseMoney(claim.amount, claim.currency)}</p>
        <p className="text-[10.5px] text-slate-400">{fmtDate(claim.expense_date, { month: 'short', day: 'numeric' })}</p>
      </div>
    </button>
  );
}

export function NoExpenses({ title = 'No expenses yet', description, action }) {
  return <EmptyState icon={Receipt} title={title} description={description} action={action} />;
}
