import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Baby,
  CalendarDays,
  CalendarPlus,
  Check,
  CircleDollarSign,
  Clock3,
  HeartPulse,
  Palmtree,
  Plus,
  Umbrella,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtDate, fmtDateRange, todayISO } from '../lib/api';
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
  SectionTitle,
  Select,
  StatCard,
  Tabs,
  capitalize,
} from '../components/ui';

const TYPES = [
  { value: 'annual', label: 'Annual leave', icon: Palmtree, tone: 'text-emerald-600 bg-emerald-50' },
  { value: 'sick', label: 'Sick leave', icon: HeartPulse, tone: 'text-rose-600 bg-rose-50' },
  { value: 'personal', label: 'Personal leave', icon: UserRound, tone: 'text-brand-600 bg-brand-50' },
  { value: 'maternity', label: 'Parental leave', icon: Baby, tone: 'text-violet-600 bg-violet-50' },
  { value: 'unpaid', label: 'Unpaid leave', icon: CircleDollarSign, tone: 'text-amber-600 bg-amber-50' },
];

const typeMeta = (type) => TYPES.find((t) => t.value === type) || TYPES[0];

export default function Leaves() {
  const { user, can } = useAuth();
  return can('leaves.view_all') ? <ManagerLeaves user={user} /> : <EmployeeLeaves user={user} />;
}

function StatusTabs({ value, onChange, manager, stats }) {
  return (
    <Tabs
      value={value}
      onChange={onChange}
      items={[
        { key: '', label: 'All requests', count: manager ? stats?._total : undefined },
        { key: 'pending', label: 'Pending', count: manager ? stats?.pending : undefined },
        { key: 'approved', label: 'Approved', count: manager ? stats?.approved : undefined },
        { key: 'rejected', label: 'Rejected', count: manager ? stats?.rejected : undefined },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Manager                                                            */
/* ------------------------------------------------------------------ */
function ManagerLeaves({ user }) {
  const toast = useToast();
  const { can } = useAuth();
  const canReview = can('leaves.manage');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [data, setData] = useState({ data: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      const res = await api.get(`/leaves?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, type, refreshKey, toast]);

  useEffect(() => { load(); }, [load]);

  const review = async (leave, next) => {
    setActing(leave.id);
    try {
      await api.patch(`/leaves/${leave.id}/status`, { status: next });
      toast.success(`${leave.first_name}’s request was ${next}.`);
      setSelected((s) => (s && s.id === leave.id ? { ...s, status: next } : s));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  const stats = useMemo(() => {
    const s = data.stats || {};
    return { ...s, _total: Number(s.total || 0) };
  }, [data.stats]);
  const rows = data.data || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Time off</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Leave requests</h1>
          <p className="mt-1 text-[13px] text-slate-500">Review requests, keep plans clear, and give people room to recharge.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>New request</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Awaiting review" value={stats.pending ?? 0} sub="Needs your attention" icon={Clock3} tone="amber" />
        <StatCard label="Approved" value={stats.approved ?? 0} sub="All-time approvals" icon={Check} tone="emerald" />
        <StatCard label="Rejected" value={stats.rejected ?? 0} sub="All-time rejections" icon={X} tone="rose" />
        <StatCard label="Total requests" value={stats.total ?? 0} sub="Across the workspace" icon={CalendarDays} tone="indigo" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <StatusTabs value={status} onChange={setStatus} manager stats={stats} />
          <select value={type} onChange={(e) => setType(e.target.value)} className="input w-auto min-w-[160px] py-2 text-[12.5px]">
            <option value="">All leave types</option>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading leave requests…" />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Umbrella} title="No requests here" description="There are no leave requests matching this filter. Everyone is hard at work." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px]">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-head">Employee</th>
                  <th className="table-head">Type</th>
                  <th className="table-head">Dates</th>
                  <th className="table-head">Duration</th>
                  <th className="table-head">Requested</th>
                  <th className="table-head">Status</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((l) => {
                  const meta = typeMeta(l.type);
                  return (
                    <tr key={l.id} className="group cursor-pointer transition hover:bg-slate-50/60" onClick={() => setSelected(l)}>
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <Avatar name={`${l.first_name} ${l.last_name}`} color={l.avatar_color} size="sm" />
                          <div>
                            <p className="text-[13px] font-semibold text-ink-900">{l.first_name} {l.last_name}</p>
                            <p className="text-[11px] text-slate-400">{l.department_name || 'No department'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={clsx('flex items-center gap-1.5 text-[12px] font-medium capitalize', meta.tone.split(' ')[0])}>
                          <span className={clsx('grid h-6 w-6 place-items-center rounded-md', meta.tone)}><meta.icon size={13} /></span>
                          {l.type}
                        </span>
                      </td>
                      <td className="table-cell">
                        <p className="text-[12px] font-medium text-ink-700">{fmtDateRange(l.start_date, l.end_date)}</p>
                      </td>
                      <td className="table-cell">{l.days} day{Number(l.days) === 1 ? '' : 's'}</td>
                      <td className="table-cell text-[12px]">{fmtDate(l.created_at, { month: 'short', day: 'numeric' })}</td>
                      <td className="table-cell"><Badge status={l.status}>{capitalize(l.status)}</Badge></td>
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        {l.status === 'pending' && canReview ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button disabled={acting === l.id} onClick={() => review(l, 'approved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                              <Check size={13} /> Approve
                            </button>
                            <button disabled={acting === l.id} onClick={() => review(l, 'rejected')} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                              <X size={13} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="block text-right text-[11px] text-slate-400">{l.reviewer_name ? `by ${l.reviewer_name}` : '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LeaveForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setRefreshKey((k) => k + 1); }} manager />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Leave request"
        subtitle={selected ? `Submitted by ${selected.first_name} ${selected.last_name}` : ''}
        icon={CalendarDays}
        size="md"
        footer={selected ? (
          selected.status === 'pending' && canReview ? (
            <>
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
              <Button variant="danger" icon={X} loading={acting === selected.id} onClick={() => review(selected, 'rejected')}>Reject</Button>
              <Button variant="primary" icon={Check} loading={acting === selected.id} onClick={() => review(selected, 'approved')}>Approve</Button>
            </>
          ) : <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
        ) : null}
      >
        {selected && <LeaveDetail leave={selected} />}
      </Modal>
    </div>
  );
}

function LeaveDetail({ leave }) {
  const meta = typeMeta(leave.type);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
        <Avatar name={`${leave.first_name} ${leave.last_name}`} color={leave.avatar_color} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink-900">{leave.first_name} {leave.last_name}</p>
          <p className="text-[11.5px] text-slate-500">{leave.designation} · {leave.department_name}</p>
        </div>
        <Badge status={leave.status}>{capitalize(leave.status)}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-100 p-3.5">
          <p className="text-[10.5px] uppercase tracking-wide text-slate-400">Leave type</p>
          <p className={clsx('mt-1 flex items-center gap-1.5 text-[13px] font-semibold capitalize', meta.tone.split(' ')[0])}><meta.icon size={14} /> {leave.type}</p>
        </div>
        <div className="rounded-xl border border-slate-100 p-3.5">
          <p className="text-[10.5px] uppercase tracking-wide text-slate-400">Duration</p>
          <p className="mt-1 text-[13px] font-semibold text-ink-800">{leave.days} day{Number(leave.days) === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-xl border border-slate-100 p-3.5">
          <p className="text-[10.5px] uppercase tracking-wide text-slate-400">From</p>
          <p className="mt-1 text-[13px] font-semibold text-ink-800">{fmtDate(leave.start_date)}</p>
        </div>
        <div className="rounded-xl border border-slate-100 p-3.5">
          <p className="text-[10.5px] uppercase tracking-wide text-slate-400">To</p>
          <p className="mt-1 text-[13px] font-semibold text-ink-800">{fmtDate(leave.end_date)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-100 p-4">
        <p className="text-[10.5px] uppercase tracking-wide text-slate-400">Reason</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{leave.reason || 'No reason provided.'}</p>
      </div>
      {leave.reviewed_at && (
        <p className="text-[11.5px] text-slate-400">Reviewed by {leave.reviewer_name || 'management'} on {fmtDate(leave.reviewed_at)}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Employee                                                           */
/* ------------------------------------------------------------------ */
function EmployeeLeaves({ user }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ data: [], balance: null });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = status ? `?status=${status}` : '';
      const res = await api.get(`/leaves${params}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, refreshKey, toast]);

  useEffect(() => { load(); }, [load]);

  const balance = data.balance || {};
  const rows = data.data || [];

  const cancel = async (leave) => {
    setCancelling(leave.id);
    try {
      await api.del(`/leaves/${leave.id}`);
      toast.success('Leave request cancelled.');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Time off</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">My leave</h1>
          <p className="mt-1 text-[13px] text-slate-500">Plan a break, request time off, and track everything in one place.</p>
        </div>
        <Button variant="primary" icon={CalendarPlus} onClick={() => setFormOpen(true)}>Request leave</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card className="overflow-hidden p-5 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium text-slate-400">Annual leave allowance</p>
              <p className="mt-1 font-display text-[30px] font-extrabold leading-none text-ink-900">
                {balance.annualRemaining ?? 0} <span className="text-[15px] font-semibold text-slate-400">days left</span>
              </p>
              <p className="mt-1.5 text-[11.5px] text-slate-400">{balance.annualUsed ?? 0} of {balance.annualTotal ?? 24} days used in {new Date().getFullYear()}</p>
            </div>
            <div className="w-24">
              <div className="relative h-24 w-24 rounded-full" style={{ background: `conic-gradient(#6366f1 ${((balance.annualRemaining || 0) / (balance.annualTotal || 24)) * 360}deg, #eef1f6 0deg)` }}>
                <div className="absolute inset-[7px] grid place-items-center rounded-full bg-white">
                  <Umbrella size={22} className="text-brand-500" />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <Progress value={((balance.annualUsed || 0) / (balance.annualTotal || 24)) * 100} tone="indigo" />
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full bg-brand-500" /> Used {balance.annualUsed ?? 0}d</span>
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full bg-slate-200" /> Remaining {balance.annualRemaining ?? 0}d</span>
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-violet-600 p-5 text-white">
          <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
          <div className="relative">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><HeartPulse size={18} /></div>
            <p className="mt-4 text-[12px] text-white/70">Sick leave used</p>
            <p className="mt-1 font-display text-[30px] font-extrabold leading-none">{balance.sickUsed ?? 0} <span className="text-[14px] font-medium text-white/60">days</span></p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/60">Take care of yourself. Your health always comes first.</p>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-[10.5px] font-medium text-white/80">
              <Clock3 size={12} /> {rows.filter((r) => r.status === 'pending').length} request(s) awaiting review
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <SectionTitle title="My requests" description={`${rows.length} request${rows.length === 1 ? '' : 's'} shown`} />
          <StatusTabs value={status} onChange={setStatus} />
        </div>
        {loading ? (
          <LoadingBlock label="Loading your requests…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Umbrella} title="No leave requests" description="You haven’t requested any time off yet. When you do, it’ll show up here." action={<Button variant="primary" icon={CalendarPlus} onClick={() => setFormOpen(true)}>Request leave</Button>} />
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((l) => {
              const meta = typeMeta(l.type);
              return (
                <div key={l.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/60 sm:flex-row sm:items-center">
                  <div className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', meta.tone)}><meta.icon size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold capitalize text-ink-900">{l.type} leave</p>
                      <Badge status={l.status}>{capitalize(l.status)}</Badge>
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-500">{fmtDateRange(l.start_date, l.end_date)} · {l.days} day{Number(l.days) === 1 ? '' : 's'}</p>
                    {l.reason && <p className="mt-1 truncate text-[11.5px] text-slate-400">“{l.reason}”</p>}
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <p className="text-[10.5px] text-slate-400">Requested {fmtDate(l.created_at, { month: 'short', day: 'numeric' })}</p>
                    {l.status === 'pending' && (
                      <button onClick={() => cancel(l)} disabled={cancelling === l.id} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-500 transition hover:bg-rose-50 disabled:opacity-50">
                        {cancelling === l.id ? 'Cancelling…' : 'Cancel request'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <LeaveForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setRefreshKey((k) => k + 1); }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Leave form                                                         */
/* ------------------------------------------------------------------ */
function LeaveForm({ open, onClose, onSaved, manager = false }) {
  const toast = useToast();
  const [form, setForm] = useState({ employeeId: '', type: 'annual', startDate: todayISO(), endDate: todayISO(), reason: '' });
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({ employeeId: '', type: 'annual', startDate: todayISO(), endDate: todayISO(), reason: '' });
    if (manager) api.get('/employees/options').then((d) => setEmployees(d.data || [])).catch(() => {});
  }, [open, manager]);

  const days = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const d = Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1;
    return d > 0 ? d : 0;
  }, [form.startDate, form.endDate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.startDate || !form.endDate) { setError('Please choose your dates.'); return; }
    if (new Date(form.endDate) < new Date(form.startDate)) { setError('End date cannot be before the start date.'); return; }
    if (manager && !form.employeeId) { setError('Please choose an employee.'); return; }
    setSaving(true);
    try {
      await api.post('/leaves', {
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        ...(manager ? { employeeId: Number(form.employeeId) } : {}),
      });
      toast.success('Leave request submitted for approval.');
      onSaved();
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
      title={manager ? 'New leave request' : 'Request time off'}
      subtitle={manager ? 'Submit a request on behalf of a team member.' : 'Tell us when you need a break — we’ll handle the rest.'}
      icon={CalendarPlus}
      size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} loading={saving}>Submit request</Button></>}
    >
      <div className="space-y-4">
        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-[12.5px] font-medium text-rose-600">{error}</div>}
        {manager && (
          <Select label="Employee" required value={form.employeeId} onChange={set('employeeId')}>
            <option value="">Choose a team member</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.designation}</option>)}
          </Select>
        )}
        <div>
          <p className="label">Leave type</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                className={clsx(
                  'flex items-center gap-2 rounded-xl border p-2.5 text-left text-[11.5px] font-semibold transition',
                  form.type === t.value ? 'border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-500/10' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                )}
              >
                <span className={clsx('grid h-7 w-7 place-items-center rounded-lg', t.tone)}><t.icon size={14} /></span>
                {t.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="From" type="date" min={todayISO()} value={form.startDate} onChange={set('startDate')} />
          <Input label="To" type="date" min={form.startDate} value={form.endDate} onChange={set('endDate')} />
        </div>
        {days > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3.5 py-2.5 text-[12px]">
            <span className="font-medium text-brand-700">Total duration</span>
            <span className="font-bold text-brand-700">{days} day{days === 1 ? '' : 's'}</span>
          </div>
        )}
        <Field label="Reason" hint="A short note helps your manager plan coverage.">
          <textarea className="input min-h-[90px] resize-y" value={form.reason} onChange={set('reason')} placeholder="A little context about your time off…" />
        </Field>
      </div>
    </Modal>
  );
}
