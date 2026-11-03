import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  History,
  Paperclip,
  PauseCircle,
  PlayCircle,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
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
  Progress,
  SearchInput,
  Select,
  Textarea,
} from '../../components/ui';

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */
export const GOAL_STATUS = {
  not_started: { label: 'Not Started', tone: 'slate' },
  in_progress: { label: 'In Progress', tone: 'sky' },
  completed: { label: 'Completed', tone: 'emerald' },
  on_hold: { label: 'On Hold', tone: 'amber' },
  overdue: { label: 'Overdue', tone: 'rose' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const GOAL_STATUS_ORDER = ['not_started', 'in_progress', 'completed', 'on_hold', 'overdue', 'cancelled'];

export const PRIORITY = {
  low: { label: 'Low', tone: 'slate' },
  medium: { label: 'Medium', tone: 'sky' },
  high: { label: 'High', tone: 'amber' },
  critical: { label: 'Critical', tone: 'rose' },
};

export const CYCLE_STATUS = {
  draft: { label: 'Draft', tone: 'slate' },
  scheduled: { label: 'Scheduled', tone: 'sky' },
  active: { label: 'Active', tone: 'emerald' },
  completed: { label: 'Completed', tone: 'indigo' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
};

export const REVIEW_PERIOD = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-Yearly',
  annually: 'Annually',
  custom: 'Custom Period',
};

export const EDITABLE_GOAL_STATUSES = ['not_started', 'in_progress', 'completed', 'on_hold'];

export const goalStatusOf = (goal) => goal?.effective_status || goal?.status || 'not_started';
export const goalStatusLabel = (goal) => GOAL_STATUS[goalStatusOf(goal)]?.label || 'Not Started';
export const progressTone = (status) =>
  status === 'completed' ? 'emerald' : status === 'overdue' ? 'rose' : status === 'on_hold' ? 'amber' : status === 'cancelled' ? 'slate' : 'sky';
export const employeeName = (row) => (row ? `${row.first_name || ''} ${row.last_name || ''}`.trim() : '');

export function GoalStatusBadge({ status, goal, className }) {
  const key = status || goalStatusOf(goal);
  const meta = GOAL_STATUS[key] || GOAL_STATUS.not_started;
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }) {
  const meta = PRIORITY[priority] || PRIORITY.medium;
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

export function CycleStatusBadge({ status, className }) {
  const meta = CYCLE_STATUS[status] || CYCLE_STATUS.draft;
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Employee picker                                                    */
/* ------------------------------------------------------------------ */
export function EmployeePicker({ employees = [], value = [], onChange, disabled = false, emptyLabel = 'No employees found.' }) {
  const [search, setSearch] = useState('');
  const selected = new Set(value.map(Number));
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      `${e.first_name} ${e.last_name} ${e.employee_code || ''} ${e.department_name || ''}`.toLowerCase().includes(q)
    );
  }, [employees, search]);

  const toggle = (id) => {
    if (disabled) return;
    const numeric = Number(id);
    if (selected.has(numeric)) onChange(value.filter((v) => Number(v) !== numeric));
    else onChange([...value, numeric]);
  };

  return (
    <div className={clsx('rounded-xl border border-slate-200', disabled && 'bg-slate-50')}>
      <div className="border-b border-slate-100 p-2.5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search employees…" />
      </div>
      <div className="max-h-44 overflow-y-auto p-1.5">
        {filtered.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-slate-400">{emptyLabel}</p>}
        {filtered.map((employee) => {
          const active = selected.has(Number(employee.id));
          return (
            <button
              type="button"
              key={employee.id}
              onClick={() => toggle(employee.id)}
              disabled={disabled}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
                active ? 'bg-brand-50' : 'hover:bg-slate-50',
                disabled && 'cursor-default'
              )}
            >
              <span
                className={clsx(
                  'grid h-4 w-4 shrink-0 place-items-center rounded border text-white',
                  active ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'
                )}
              >
                {active && <CheckCircle2 size={11} />}
              </span>
              <Avatar name={employeeName(employee)} color={employee.avatar_color || 'indigo'} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-ink-800">{employeeName(employee)}</span>
                <span className="block truncate text-[10.5px] text-slate-400">
                  {employee.employee_code || '—'}
                  {employee.department_name ? ` · ${employee.department_name}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
        <span>{value.length} selected</span>
        {value.length > 0 && !disabled && (
          <button type="button" onClick={() => onChange([])} className="font-semibold text-slate-500 hover:text-rose-600">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Goal form                                                          */
/* ------------------------------------------------------------------ */
const emptyGoalForm = (employeeId = '') => ({
  title: '',
  description: '',
  employeeIds: employeeId ? [Number(employeeId)] : [],
  departmentId: '',
  startDate: new Date().toISOString().slice(0, 10),
  targetDate: '',
  priority: 'medium',
  status: 'not_started',
  instructions: '',
  additionalNotes: '',
});

export function GoalForm({ open, onClose, onSaved, goal, employees = [], departments = [] }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyGoalForm());
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const editing = Boolean(goal?.id);

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    if (goal?.id) {
      setForm({
        title: goal.title || '',
        description: goal.description || '',
        employeeIds: [Number(goal.employee_id)],
        departmentId: goal.department_id ? String(goal.department_id) : '',
        startDate: String(goal.start_date || '').slice(0, 10),
        targetDate: String(goal.target_date || '').slice(0, 10),
        priority: goal.priority || 'medium',
        status: goal.status === 'overdue' ? 'in_progress' : goal.status || 'not_started',
        instructions: goal.instructions || '',
        additionalNotes: goal.additional_notes || '',
      });
    } else {
      setForm(emptyGoalForm());
    }
  }, [open, goal]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!form.title.trim()) return toast.error('Please enter a goal title.');
    if (!form.description.trim()) return toast.error('Please enter a goal description.');
    if (!form.employeeIds.length) return toast.error('Please choose at least one employee.');
    if (!form.startDate || !form.targetDate) return toast.error('Please choose start and target dates.');
    if (form.targetDate < form.startDate) return toast.error('Target date cannot be earlier than the start date.');
    try {
      setSaving(true);
      if (editing) {
        const res = await api.put(`/performance/goals/${goal.id}`, {
          title: form.title.trim(),
          description: form.description.trim(),
          departmentId: form.departmentId || null,
          startDate: form.startDate,
          targetDate: form.targetDate,
          priority: form.priority,
          status: form.status,
          instructions: form.instructions,
          additionalNotes: form.additionalNotes,
        });
        toast.success('Goal updated.');
        onSaved?.(res.goal);
      } else {
        const payload = {
          title: form.title.trim(),
          description: form.description.trim(),
          employeeIds: form.employeeIds,
          departmentId: form.departmentId || null,
          startDate: form.startDate,
          targetDate: form.targetDate,
          priority: form.priority,
          status: form.status,
          instructions: form.instructions,
          additionalNotes: form.additionalNotes,
        };
        const res = await api.post('/performance/goals', payload);
        if (files.length) {
          for (const created of res.data || []) {
            const fd = new FormData();
            for (const file of files) fd.append('attachments', file);
            await api.upload(`/performance/goals/${created.id}/attachments`, fd);
          }
        }
        toast.success(
          res.count > 1 ? `${res.count} goals assigned.` : 'Goal created and assigned.'
        );
        onSaved?.(res.data?.[0], res.data);
      }
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
      onClose={onClose}
      title={editing ? 'Edit goal' : 'Assign a goal'}
      subtitle={editing ? goal.goal_code : 'Create clear, time-bound goals for your team.'}
      icon={Target}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Assign goal'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Goal title" required value={form.title} maxLength={180} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Launch the Q4 customer onboarding refresh" />
        <Textarea label="Goal description" required value={form.description} rows={4} onChange={(e) => set({ description: e.target.value })} placeholder="What does success look like?" />

        <Field label="Assigned employee(s)" required hint={editing ? 'Reassigning is not supported — create a new goal for a different employee.' : 'Assign to one or more employees at once.'}>
          {editing ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Avatar name={goal.employee_name} color={goal.avatar_color || 'indigo'} size="sm" />
              <div>
                <p className="text-[12.5px] font-semibold text-ink-800">{goal.employee_name}</p>
                <p className="text-[10.5px] text-slate-400">{goal.employee_code}{goal.department_name ? ` · ${goal.department_name}` : ''}</p>
              </div>
            </div>
          ) : (
            <EmployeePicker employees={employees} value={form.employeeIds} onChange={(ids) => set({ employeeIds: ids })} />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Department" value={form.departmentId} onChange={(e) => set({ departmentId: e.target.value })}>
            <option value="">Employee&apos;s department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select label="Priority" value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
            {Object.entries(PRIORITY).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </Select>
          <Input label="Start date" type="date" required value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          <Input label="Target completion date" type="date" required value={form.targetDate} onChange={(e) => set({ targetDate: e.target.value })} />
          <Select label="Goal status" value={form.status} onChange={(e) => set({ status: e.target.value })}>
            {EDITABLE_GOAL_STATUSES.map((key) => <option key={key} value={key}>{GOAL_STATUS[key].label}</option>)}
          </Select>
          <Field label="Attachments" hint="PDF, JPG, PNG or WEBP · up to 5 files · 10 MB each.">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-slate-600"
            />
          </Field>
        </div>

        <Textarea label="Additional instructions" value={form.instructions} rows={2} onChange={(e) => set({ instructions: e.target.value })} placeholder="Optional guidance for the employee." />
        <Textarea label="Supporting notes" value={form.additionalNotes} rows={2} onChange={(e) => set({ additionalNotes: e.target.value })} placeholder="Optional context, links or references." />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress form                                                      */
/* ------------------------------------------------------------------ */
export function GoalProgressModal({ open, onClose, goal, onSaved }) {
  const toast = useToast();
  const [percentage, setPercentage] = useState(0);
  const [status, setStatus] = useState('in_progress');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || !goal) return;
    const current = Number(goal.progress_percentage || 0);
    setPercentage(current);
    setStatus(goalStatusOf(goal) === 'overdue' ? 'in_progress' : goalStatusOf(goal));
    setNotes('');
    setFiles([]);
  }, [open, goal]);

  if (!goal) return null;

  const changeStatus = (next) => {
    setStatus(next);
    if (next === 'completed') setPercentage(100);
    else if (next === 'not_started') setPercentage(0);
    else if (next === 'in_progress' && (percentage <= 0 || percentage >= 100)) setPercentage(Math.min(99, Math.max(1, percentage)));
  };

  const changePercentage = (next) => {
    const value = Math.max(0, Math.min(100, Number(next) || 0));
    setPercentage(value);
    if (status !== 'on_hold') {
      if (value === 100) setStatus('completed');
      else if (value === 0) setStatus('not_started');
      else if (status === 'completed' || status === 'not_started') setStatus('in_progress');
    }
  };

  const submit = async () => {
    if (status === 'completed' && percentage !== 100) return toast.error('Completed goals must be at 100%.');
    if (status === 'in_progress' && (percentage < 1 || percentage > 99)) return toast.error('In-progress goals need progress between 1% and 99%.');
    if (status === 'not_started' && percentage !== 0) return toast.error('Not started goals must be at 0%.');
    try {
      setSaving(true);
      const fd = new FormData();
      fd.append('status', status);
      fd.append('progressPercentage', String(percentage));
      fd.append('progressNotes', notes);
      for (const file of files) fd.append('attachments', file);
      const res = await api.upload(`/performance/goals/${goal.id}/progress`, fd);
      toast.success(status === 'completed' ? 'Goal marked completed.' : 'Progress updated.');
      onSaved?.(res.goal);
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
      onClose={onClose}
      title="Update goal progress"
      subtitle={`${goal.goal_code} · ${goal.title}`}
      icon={TrendingUp}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit}>Save progress</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <Avatar name={goal.employee_name} color={goal.avatar_color || 'indigo'} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink-900">{goal.title}</p>
            <p className="text-[11px] text-slate-400">{goal.employee_name} · target {fmtDate(goal.target_date)}</p>
          </div>
          <GoalStatusBadge goal={goal} />
        </div>

        <div>
          <div className="flex items-end justify-between">
            <p className="label mb-0">Progress percentage</p>
            <p className="font-display text-[22px] font-bold leading-none text-ink-900 tabular">{percentage}%</p>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={percentage}
            onChange={(e) => changePercentage(e.target.value)}
            className="mt-3 w-full accent-brand-500"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <progress className="sr-only" value={percentage} max="100" />
            <Progress value={percentage} tone={progressTone(status)} className="flex-1" />
            <input
              type="number"
              min="0"
              max="100"
              value={percentage}
              onChange={(e) => changePercentage(e.target.value)}
              className="input w-20 py-1.5 text-center text-[12px]"
            />
          </div>
        </div>

        <Select label="Goal status" value={status} onChange={(e) => changeStatus(e.target.value)}>
          {EDITABLE_GOAL_STATUSES.map((key) => <option key={key} value={key}>{GOAL_STATUS[key].label}</option>)}
        </Select>

        <Textarea label="Progress notes" value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="What changed since the last update?" />

        <Field label="Supporting attachment" hint="Optional · PDF, JPG, PNG or WEBP · 10 MB max.">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
            className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-slate-600"
          />
        </Field>

        <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-[11.5px] leading-relaxed text-sky-700">
          Every update is preserved with the previous percentage, new percentage, status change, author and note.
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Goal details                                                       */
/* ------------------------------------------------------------------ */
function downloadFile(goalId, attachment) {
  return api.performanceAttachmentUrl(goalId, attachment.id).then((url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.file_name || 'attachment';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
}

export function GoalDetailsModal({ open, onClose, goalId, canManage, canProgress, onEdit, onProgress, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!goalId) return;
    try {
      setLoading(true);
      const res = await api.get(`/performance/goals/${goalId}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    else setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goalId]);

  const goal = data?.goal;
  const [confirmation, setConfirmation] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const cancelGoal = () => {
    setCancelReason('');
    setConfirmation({ type: 'cancelGoal' });
  };

  const removeAttachment = (attachment) => {
    setConfirmation({ type: 'removeAttachment', attachment });
  };

  const confirmGoalAction = async () => {
    if (!goal || !confirmation) return;
    try {
      setActionBusy(true);
      if (confirmation.type === 'cancelGoal') {
        await api.post(`/performance/goals/${goal.id}/cancel`, { reason: cancelReason });
        toast.success('Goal cancelled. Historical progress preserved.');
      } else {
        await api.del(`/performance/goals/${goal.id}/attachments/${confirmation.attachment.id}`);
        toast.success('Attachment removed.');
      }
      setConfirmation(null);
      setCancelReason('');
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={goal ? goal.title : 'Goal details'}
        subtitle={goal ? `${goal.goal_code} · ${goal.employee_name}` : ''}
        icon={Target}
        size="xl"
        footer={
          goal ? (
            <>
              {canManage && !['completed', 'cancelled'].includes(goal.status) && (
                <Button variant="danger" size="sm" onClick={cancelGoal}>Cancel goal</Button>
              )}
              {canManage && goal.status !== 'cancelled' && (
                <Button variant="secondary" size="sm" onClick={() => onEdit?.(goal)}>Edit goal</Button>
              )}
              {canProgress && goal.status !== 'cancelled' && (
                <Button variant="primary" size="sm" icon={TrendingUp} onClick={() => onProgress?.(goal)}>Update progress</Button>
              )}
            </>
          ) : null
        }
      >
        {loading || !goal ? (
          <LoadingBlock label="Loading goal…" />
        ) : (
          <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <GoalStatusBadge goal={goal} />
            <PriorityBadge priority={goal.priority} />
            <span className="text-[11px] text-slate-400">Assigned by {goal.assigned_by_name || '—'}</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Employee</p>
              <div className="mt-2 flex items-center gap-2">
                <Avatar name={goal.employee_name} color={goal.avatar_color || 'indigo'} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-ink-800">{goal.employee_name}</p>
                  <p className="text-[10.5px] text-slate-400">{goal.employee_code} · {goal.department_name || 'Unassigned'}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Timeline</p>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-800"><CalendarDays size={14} className="text-slate-400" />{fmtDate(goal.start_date)} → {fmtDate(goal.target_date)}</p>
              <p className="mt-1 text-[10.5px] text-slate-400">Created {fmtDate(goal.created_at)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Progress</p>
                <p className="text-[12.5px] font-bold text-ink-900 tabular">{Number(goal.progress_percentage)}%</p>
              </div>
              <Progress value={Number(goal.progress_percentage)} tone={progressTone(goalStatusOf(goal))} className="mt-2" />
              <p className="mt-1 text-[10.5px] text-slate-400">{goal.update_count} update{Number(goal.update_count) === 1 ? '' : 's'} recorded</p>
            </div>
          </div>

          <div>
            <h4 className="font-display text-[14px] font-bold text-ink-900">Description</h4>
            <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">{goal.description}</p>
          </div>

          {goal.instructions && (
            <div>
              <h4 className="font-display text-[14px] font-bold text-ink-900">Additional instructions</h4>
              <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">{goal.instructions}</p>
            </div>
          )}
          {goal.additional_notes && (
            <div>
              <h4 className="font-display text-[14px] font-bold text-ink-900">Supporting notes</h4>
              <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">{goal.additional_notes}</p>
            </div>
          )}

          <div>
            <h4 className="flex items-center gap-2 font-display text-[14px] font-bold text-ink-900">
              <Paperclip size={15} className="text-slate-400" /> Attachments ({data.attachments?.length || 0})
            </h4>
            {data.attachments?.length ? (
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
                {data.attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                    <FileText size={16} className="shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-ink-800">{a.file_name}</p>
                      <p className="text-[10.5px] text-slate-400">{Math.max(1, Math.round(Number(a.file_size || 0) / 1024))} KB · {fmtDate(a.created_at)}</p>
                    </div>
                    <button onClick={() => downloadFile(goal.id, a).catch((err) => toast.error(err.message))} className="icon-btn h-8 w-8" title="Download"><Download size={14} /></button>
                    {(canManage || canProgress) && (
                      <button onClick={() => removeAttachment(a)} className="icon-btn h-8 w-8 text-rose-400 hover:bg-rose-50 hover:text-rose-600" title="Remove"><Trash2 size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11.5px] text-slate-400">No attachments yet. Add one with a progress update.</p>
            )}
          </div>

          <div>
            <h4 className="flex items-center gap-2 font-display text-[14px] font-bold text-ink-900">
              <History size={15} className="text-slate-400" /> Progress history
            </h4>
            {data.updates?.length ? (
              <div className="mt-3 space-y-3 border-l-2 border-slate-100 pl-4">
                {data.updates.map((u) => (
                  <div key={u.id} className="relative">
                    <span className="absolute -left-[22px] top-1 grid h-3 w-3 place-items-center rounded-full border-2 border-white bg-brand-400" />
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-semibold text-ink-800">{u.updated_by_name || 'System'}</span>
                      <span>{fmtDate(u.created_at)}</span>
                      {u.previous_percentage != null && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          {Number(u.previous_percentage)}% → {Number(u.new_percentage)}%
                        </span>
                      )}
                      {u.previous_status && u.previous_status !== u.new_status && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          {GOAL_STATUS[u.previous_status]?.label || u.previous_status} → {GOAL_STATUS[u.new_status]?.label || u.new_status}
                        </span>
                      )}
                    </div>
                    {u.progress_notes && <p className="mt-1 text-[12px] text-slate-600">{u.progress_notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-slate-400">No progress updates yet.</p>
            )}
          </div>

          {data.activities?.length > 0 && (
            <div>
              <h4 className="font-display text-[14px] font-bold text-ink-900">Activity log</h4>
              <div className="mt-2 space-y-1.5">
                {data.activities.slice(0, 12).map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-[11.5px] text-slate-500">
                    <Clock3 size={13} className="mt-0.5 shrink-0 text-slate-300" />
                    <span className="min-w-0 flex-1">{a.description || a.action}</span>
                    <span className="shrink-0 text-[10.5px] text-slate-400">{fmtDate(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(confirmation)}
        onClose={() => {
          if (!actionBusy) setConfirmation(null);
        }}
        title={confirmation?.type === 'cancelGoal' ? 'Cancel goal' : 'Remove attachment'}
        subtitle={confirmation?.type === 'cancelGoal' ? 'Historical progress will be preserved.' : ''}
        icon={confirmation?.type === 'cancelGoal' ? XCircle : Trash2}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmation(null)} disabled={actionBusy}>Keep</Button>
            <Button
              variant="danger"
              onClick={confirmGoalAction}
              loading={actionBusy}
            >
              {confirmation?.type === 'cancelGoal' ? 'Confirm cancellation' : 'Remove attachment'}
            </Button>
          </>
        }
      >
        {confirmation?.type === 'cancelGoal' ? (
          <Textarea
            label="Cancellation reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            placeholder="Add a reason for the activity history."
          />
        ) : (
          <p className="text-[13px] text-slate-600">
            Remove {confirmation?.attachment?.file_name}? This cannot be undone.
          </p>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Review cycle form                                                  */
/* ------------------------------------------------------------------ */
const emptyCycle = {
  cycleName: '',
  description: '',
  reviewPeriod: 'quarterly',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  departmentId: '',
  status: 'draft',
  employeeIds: [],
};

export function ReviewCycleForm({ open, onClose, onSaved, cycle, employees = [], departments = [] }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyCycle);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(cycle?.id);

  useEffect(() => {
    if (!open) return;
    if (cycle?.id) {
      setForm({
        cycleName: cycle.cycle_name || '',
        description: cycle.description || '',
        reviewPeriod: cycle.review_period || 'quarterly',
        startDate: String(cycle.start_date || '').slice(0, 10),
        endDate: String(cycle.end_date || '').slice(0, 10),
        departmentId: cycle.department_id ? String(cycle.department_id) : '',
        status: cycle.status || 'draft',
        employeeIds: [],
      });
      api
        .get(`/performance/review-cycles/${cycle.id}`)
        .then((res) => setForm((prev) => ({ ...prev, employeeIds: (res.employees || []).map((e) => Number(e.id)) })))
        .catch(() => {});
    } else {
      setForm({ ...emptyCycle, employeeIds: [] });
    }
  }, [open, cycle]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!form.cycleName.trim()) return toast.error('Please enter a review cycle name.');
    if (!form.startDate || !form.endDate) return toast.error('Please choose start and end dates.');
    if (form.endDate < form.startDate) return toast.error('End date cannot be earlier than the start date.');
    if (!form.employeeIds.length) return toast.error('Please assign at least one employee.');
    try {
      setSaving(true);
      const payload = {
        cycleName: form.cycleName.trim(),
        description: form.description,
        reviewPeriod: form.reviewPeriod,
        startDate: form.startDate,
        endDate: form.endDate,
        departmentId: form.departmentId || null,
        employeeIds: form.employeeIds,
      };
      if (editing) {
        const res = await api.put(`/performance/review-cycles/${cycle.id}`, payload);
        toast.success('Review cycle updated.');
        onSaved?.(res.cycle);
      } else {
        const res = await api.post('/performance/review-cycles', { ...payload, status: form.status });
        toast.success('Review cycle created.');
        onSaved?.(res.cycle);
      }
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
      onClose={onClose}
      title={editing ? 'Edit review cycle' : 'Create review cycle'}
      subtitle="Organise a periodic goal review — no scoring or assessments."
      icon={CalendarDays}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Create cycle'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Review cycle name" required value={form.cycleName} maxLength={160} onChange={(e) => set({ cycleName: e.target.value })} placeholder="e.g. Q4 2026 goal review" />
        <Textarea label="Description" value={form.description} rows={3} onChange={(e) => set({ description: e.target.value })} placeholder="What is the focus of this review cycle?" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Review period" value={form.reviewPeriod} onChange={(e) => set({ reviewPeriod: e.target.value })}>
            {Object.entries(REVIEW_PERIOD).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <Select label="Applicable department" value={form.departmentId} onChange={(e) => set({ departmentId: e.target.value })}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input label="Start date" type="date" required value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          <Input label="End date" type="date" required value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          {!editing && (
            <Select label="Initial status" value={form.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
            </Select>
          )}
        </div>
        <Field label="Applicable employees" required hint="Goal completion for these employees during the review period is summarised automatically.">
          <EmployeePicker employees={employees} value={form.employeeIds} onChange={(ids) => set({ employeeIds: ids })} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Review cycle details                                               */
/* ------------------------------------------------------------------ */
const CYCLE_ACTION = {
  draft: [
    { status: 'active', label: 'Activate cycle', icon: PlayCircle, variant: 'primary', confirm: 'Activate this review cycle?' },
    { status: 'scheduled', label: 'Schedule', icon: CalendarDays, variant: 'secondary', confirm: 'Schedule this review cycle?' },
    { status: 'cancelled', label: 'Cancel', icon: XCircle, variant: 'danger', confirm: 'Cancel this review cycle? Historical data is preserved.' },
  ],
  scheduled: [
    { status: 'active', label: 'Activate cycle', icon: PlayCircle, variant: 'primary', confirm: 'Activate this review cycle?' },
    { status: 'cancelled', label: 'Cancel', icon: XCircle, variant: 'danger', confirm: 'Cancel this review cycle? Historical data is preserved.' },
  ],
  active: [
    { status: 'completed', label: 'Complete cycle', icon: CheckCircle2, variant: 'primary', confirm: 'Complete this review cycle? The record becomes read-only.' },
    { status: 'cancelled', label: 'Cancel', icon: XCircle, variant: 'danger', confirm: 'Cancel this review cycle? Historical data is preserved.' },
  ],
};

export function ReviewCycleDetailsModal({ open, onClose, cycleId, canManage, canExport, onEdit, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const load = async () => {
    if (!cycleId) return;
    try {
      setLoading(true);
      setData(await api.get(`/performance/review-cycles/${cycleId}`));
    } catch (err) {
      toast.error(err.message);
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    else setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycleId]);

  const cycle = data?.cycle;

  const changeStatus = (action) => {
    setPendingAction(action);
  };

  const confirmStatusChange = async () => {
    if (!cycle || !pendingAction) return;
    try {
      setBusy(true);
      await api.patch(`/performance/review-cycles/${cycle.id}/status`, { status: pendingAction.status });
      setPendingAction(null);
      toast.success(`Review cycle ${pendingAction.status === 'completed' ? 'completed' : pendingAction.status}.`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const actions = canManage && cycle ? CYCLE_ACTION[cycle.status] || [] : [];
  const readonly = cycle && ['completed', 'cancelled'].includes(cycle.status);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={cycle ? cycle.cycle_name : 'Review cycle'}
        subtitle={cycle ? `${REVIEW_PERIOD[cycle.review_period] || cycle.review_period} · ${fmtDate(cycle.start_date)} → ${fmtDate(cycle.end_date)}` : ''}
        icon={CalendarDays}
        size="xl"
        footer={
          cycle ? (
            <>
              {canManage && !readonly && (
                <Button variant="secondary" size="sm" onClick={() => onEdit?.(cycle)}>Edit cycle</Button>
              )}
              {actions.map((a) => (
                <Button key={a.status} variant={a.variant} size="sm" icon={a.icon} loading={busy} onClick={() => changeStatus(a)}>
                  {a.label}
                </Button>
              ))}
            </>
          ) : null
        }
      >
        {loading || !cycle ? (
          <LoadingBlock label="Loading review cycle…" />
        ) : (
          <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <CycleStatusBadge status={cycle.status} />
            <span className="text-[11px] text-slate-400">{cycle.department_name || 'All departments'} · created by {cycle.created_by_name || '—'}</span>
          </div>
          {cycle.description && <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">{cycle.description}</p>}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: 'Employees', value: cycle.employee_count, tone: 'text-ink-900' },
              { label: 'Total goals', value: cycle.total_goals, tone: 'text-ink-900' },
              { label: 'Completed', value: cycle.completed_goals, tone: 'text-emerald-600' },
              { label: 'Pending', value: cycle.pending_goals, tone: 'text-amber-600' },
              { label: 'Overdue', value: cycle.overdue_goals, tone: 'text-rose-600' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
                <p className={clsx('mt-1 font-display text-[20px] font-bold', s.tone)}>{Number(s.value || 0)}</p>
              </div>
            ))}
          </div>

          <div>
            <h4 className="font-display text-[14px] font-bold text-ink-900">Assigned employees</h4>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-left text-[12px]">
                <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 font-semibold">Department</th>
                    <th className="px-3 py-2 font-semibold">Goals</th>
                    <th className="px-3 py-2 font-semibold">Completed</th>
                    <th className="px-3 py-2 font-semibold">Pending</th>
                    <th className="px-3 py-2 font-semibold">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.employees.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar name={employeeName(e)} color={e.avatar_color || 'indigo'} size="xs" />
                          <div>
                            <p className="font-semibold text-ink-800">{employeeName(e)}</p>
                            <p className="text-[10px] text-slate-400">{e.employee_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{e.department_name || '—'}</td>
                      <td className="px-3 py-2.5 font-semibold text-ink-800">{Number(e.total_goals)}</td>
                      <td className="px-3 py-2.5 text-emerald-600">{Number(e.completed_goals)}</td>
                      <td className="px-3 py-2.5 text-amber-600">{Number(e.pending_goals)}</td>
                      <td className="px-3 py-2.5 text-rose-600">{Number(e.overdue_goals)}</td>
                    </tr>
                  ))}
                  {data.employees.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No employees assigned.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="font-display text-[14px] font-bold text-ink-900">Goals in this review period</h4>
            {data.goals.length ? (
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
                {data.goals.map((g) => (
                  <div key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <Avatar name={g.employee_name} color={g.avatar_color || 'indigo'} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-ink-800">{g.title}</p>
                      <p className="text-[10.5px] text-slate-400">{g.employee_name} · target {fmtDate(g.target_date)}</p>
                    </div>
                    <div className="w-28"><Progress value={Number(g.progress_percentage)} tone={progressTone(goalStatusOf(g))} height="h-1.5" /></div>
                    <span className="w-9 text-right text-[11px] font-semibold text-slate-500">{Number(g.progress_percentage)}%</span>
                    <GoalStatusBadge goal={g} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Target} title="No goals in this period" description="Goals with target dates inside the review window will appear here." className="py-10" />
            )}
          </div>

          {data.activities?.length > 0 && (
            <div>
              <h4 className="font-display text-[14px] font-bold text-ink-900">Cycle activity</h4>
              <div className="mt-2 space-y-1.5">
                {data.activities.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-[11.5px] text-slate-500">
                    <Clock3 size={13} className="mt-0.5 shrink-0 text-slate-300" />
                    <span className="min-w-0 flex-1">{a.description || a.action}</span>
                    <span className="shrink-0 text-[10.5px] text-slate-400">{fmtDate(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}
      </Modal>
      <Modal
        open={Boolean(pendingAction)}
        onClose={() => {
          if (!busy) setPendingAction(null);
        }}
        title={pendingAction?.label || 'Update review cycle'}
        icon={pendingAction?.icon || CalendarDays}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)} disabled={busy}>Keep cycle</Button>
            <Button
              variant={pendingAction?.status === 'cancelled' ? 'danger' : 'primary'}
              onClick={confirmStatusChange}
              loading={busy}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-slate-600">{pendingAction?.confirm}</p>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Small shared bits                                                  */
/* ------------------------------------------------------------------ */
export function GoalSummaryCards({ stats = {}, loading = false, compact = false }) {
  const items = [
    { key: 'notStarted', label: 'Not started', icon: Clock3, tone: 'text-slate-500' },
    { key: 'inProgress', label: 'In progress', icon: TrendingUp, tone: 'text-sky-600' },
    { key: 'completed', label: 'Completed', icon: CheckCircle2, tone: 'text-emerald-600' },
    { key: 'onHold', label: 'On hold', icon: PauseCircle, tone: 'text-amber-600' },
    { key: 'overdue', label: 'Overdue', icon: AlertTriangle, tone: 'text-rose-600' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((item) => (
        <Card key={item.key} className={clsx('p-3.5', compact && 'p-3')}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
            <item.icon size={14} className={item.tone} />
          </div>
          <p className="mt-1 font-display text-[20px] font-bold text-ink-900">
            {loading ? '—' : Number(stats[item.key] || 0)}
          </p>
        </Card>
      ))}
    </div>
  );
}

export function EmptyGoals({ title = 'No goals yet', description = 'Goals will appear here once assigned.', action }) {
  return <EmptyState icon={Target} title={title} description={description} action={action} />;
}

export function EmptyCycles({ title = 'No review cycles', description = 'Review cycles you create will appear here.' }) {
  return <EmptyState icon={CalendarDays} title={title} description={description} />;
}

export { UserRound, Plus };
