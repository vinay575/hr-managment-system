import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  BadgeCheck,
  Banknote,
  Check,
  CircleDollarSign,
  Clock3,
  FileText,
  Plus,
  Receipt,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, currentMonth, fmtDate, fmtMoney, fmtTime, monthLabel } from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Modal,
  SectionTitle,
  StatCard,
  capitalize,
} from '../components/ui';

export default function Payroll() {
  const { can } = useAuth();
  return can('payroll.view_all') ? <ManagerPayroll /> : <EmployeePayroll />;
}

/* ------------------------------------------------------------------ */
/*  Manager                                                            */
/* ------------------------------------------------------------------ */
function ManagerPayroll() {
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can('payroll.manage');
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState({ data: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [paying, setPaying] = useState(null);
  const [slipId, setSlipId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ month });
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/payroll?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const totals = data.totals || {};
  const rows = data.data || [];

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await api.post('/payroll/generate', { month });
      toast.success(res.message);
      setGenerateOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const pay = async (row) => {
    setPaying(row.id);
    try {
      await api.patch(`/payroll/${row.id}/pay`);
      toast.success(`Payslip for ${row.first_name} marked as paid.`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Compensation</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Payroll</h1>
          <p className="mt-1 text-[13px] text-slate-500">Generate payslips, track payments and keep compensation crystal clear.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto py-2.5 text-[13px]" />
          {canManage && <Button variant="primary" icon={Plus} onClick={() => setGenerateOpen(true)}>Generate payroll</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total payroll" value={fmtMoney(totals.net, true)} sub={`${monthLabel(month)} · net`} icon={Wallet} tone="indigo" />
        <StatCard label="Gross pay" value={fmtMoney(totals.gross, true)} sub={`${totals.count || 0} employees`} icon={Banknote} tone="emerald" />
        <StatCard label="Paid" value={totals.paid || 0} sub="Payslips completed" icon={BadgeCheck} tone="sky" />
        <StatCard label="Pending" value={totals.pending || 0} sub="Awaiting payment" icon={Clock3} tone="amber" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: '', label: 'All payslips' },
              { key: 'paid', label: 'Paid' },
              { key: 'pending', label: 'Pending' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={clsx('rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition', statusFilter === f.key ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-ink-800')}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-slate-400">
            Deductions this month <span className="ml-1 font-semibold text-ink-700">{fmtMoney(totals.deductions)}</span>
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <SectionTitle title={`${monthLabel(month)} payslips`} description={`${rows.length} employee${rows.length === 1 ? '' : 's'} on this run`} />
          <div className="hidden items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-600 sm:flex">
            <TrendingUp size={12} /> {totals.count ? Math.round((totals.paid / totals.count) * 100) : 0}% paid
          </div>
        </div>
        {loading ? (
          <LoadingBlock label="Loading payroll…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payroll for this month"
            description={`Payroll hasn’t been generated for ${monthLabel(month)} yet. Create it in one click based on current salaries.`}
            action={canManage ? <Button variant="primary" icon={Sparkles} onClick={() => setGenerateOpen(true)}>Generate payroll</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1030px]">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-head">Employee</th>
                  <th className="table-head">Department</th>
                  <th className="table-head">Basic</th>
                  <th className="table-head">Allowances</th>
                  <th className="table-head">Bonus</th>
                  <th className="table-head">Deductions</th>
                  <th className="table-head">Net pay</th>
                  <th className="table-head">Status</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr key={p.id} className="group transition hover:bg-slate-50/60">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <Avatar name={`${p.first_name} ${p.last_name}`} color={p.avatar_color} size="sm" />
                        <div>
                          <p className="text-[13px] font-semibold text-ink-900">{p.first_name} {p.last_name}</p>
                          <p className="text-[11px] text-slate-400">{p.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">{p.department_name || '—'}</td>
                    <td className="table-cell">{fmtMoney(p.basic)}</td>
                    <td className="table-cell text-emerald-600">+{fmtMoney(p.allowances)}</td>
                    <td className="table-cell text-emerald-600">{Number(p.bonus) ? `+${fmtMoney(p.bonus)}` : '—'}</td>
                    <td className="table-cell text-rose-500">−{fmtMoney(p.deductions)}</td>
                    <td className="table-cell"><span className="font-display text-[14px] font-bold text-ink-900">{fmtMoney(p.net_pay)}</span></td>
                    <td className="table-cell"><Badge status={p.status}>{capitalize(p.status)}</Badge></td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setSlipId(p.id)} className="icon-btn h-8 w-8" title="View payslip"><FileText size={14} /></button>
                        {p.status === 'pending' && canManage && (
                          <button
                            onClick={() => pay(p)}
                            disabled={paying === p.id}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                            title="Mark as paid"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate payroll"
        subtitle={`Create payslips for ${monthLabel(month)}`}
        icon={Sparkles}
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setGenerateOpen(false)}>Cancel</Button><Button variant="primary" loading={generating} onClick={generate} icon={Sparkles}>Generate payslips</Button></>}
      >
        <p className="text-[13px] leading-relaxed text-slate-500">
          The system will calculate basic pay, allowances and deductions for every eligible employee using their current annual salary. Existing payslips are never overwritten.
        </p>
        <div className="mt-4 rounded-xl bg-brand-50 p-4">
          <div className="flex items-center justify-between text-[12px]"><span className="text-brand-700">Payroll month</span><span className="font-bold text-brand-800">{monthLabel(month)}</span></div>
          <div className="mt-2 flex items-center justify-between text-[12px]"><span className="text-brand-700">Eligible employees</span><span className="font-bold text-brand-800">{totals.count ?? '—'}</span></div>
        </div>
      </Modal>

      {slipId && <PayslipModal id={slipId} onClose={() => setSlipId(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Employee                                                           */
/* ------------------------------------------------------------------ */
function EmployeePayroll() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState({ data: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [slipId, setSlipId] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/payroll?month=${month}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [month]);

  const slip = data.data?.[0];
  const gross = slip ? Number(slip.basic) + Number(slip.allowances) + Number(slip.bonus) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Compensation</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">My payroll</h1>
          <p className="mt-1 text-[13px] text-slate-500">Your earnings, allowances and payslips — clear and simple.</p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto py-2.5 text-[13px]" />
      </div>

      {loading ? (
        <LoadingBlock label="Loading your payslip…" />
      ) : !slip ? (
        <Card><EmptyState icon={Receipt} title="No payslip for this month" description={`Payroll for ${monthLabel(month)} hasn’t been processed yet. Check back soon.`} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="relative overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 p-6 text-white lg:col-span-2">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 opacity-[0.05] surface-grid" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">{monthLabel(slip.month)} payslip</p>
                    <p className="mt-3 font-display text-[38px] font-extrabold leading-none">{fmtMoney(slip.net_pay)}</p>
                    <p className="mt-2 text-[12px] text-white/50">Net pay · {slip.status === 'paid' ? `paid ${fmtDate(slip.paid_at, { month: 'short', day: 'numeric' })}` : 'payment pending'}</p>
                  </div>
                  <div className={clsx('rounded-xl px-3 py-1.5 text-[11px] font-bold', slip.status === 'paid' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300')}>
                    {capitalize(slip.status)}
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
                  <div><p className="text-[10px] uppercase tracking-wider text-white/35">Gross</p><p className="mt-1 font-display text-[15px] font-bold">{fmtMoney(gross)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-white/35">Deductions</p><p className="mt-1 font-display text-[15px] font-bold">{fmtMoney(slip.deductions)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-white/35">Employee</p><p className="mt-1 font-display text-[15px] font-bold">{slip.employee_code}</p></div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle title="Breakdown" description="How this month adds up" />
              <div className="mt-5 space-y-4">
                {[
                  { label: 'Basic salary', value: slip.basic, color: '#6366f1' },
                  { label: 'Allowances', value: slip.allowances, color: '#10b981' },
                  { label: 'Bonus', value: slip.bonus, color: '#8b5cf6' },
                  { label: 'Deductions', value: -slip.deductions, color: '#fb7185' },
                ].map((b) => (
                  <div key={b.label}>
                    <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
                      <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: b.color }} />{b.label}</span>
                      <span className={clsx('font-semibold', Number(b.value) < 0 ? 'text-rose-500' : 'text-ink-800')}>{Number(b.value) < 0 ? '−' : ''}{fmtMoney(Math.abs(Number(b.value)))}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (Math.abs(Number(b.value)) / (gross || 1)) * 100)}%`, background: b.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="primary" className="mt-6 w-full" icon={FileText} onClick={() => setSlipId(slip.id)}>View full payslip</Button>
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <SectionTitle title="Payment details" description="Everything on this run" />
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { icon: Wallet, label: 'Net pay', value: fmtMoney(slip.net_pay) },
                { icon: Banknote, label: 'Basic', value: fmtMoney(slip.basic) },
                { icon: CircleDollarSign, label: 'Allowances', value: fmtMoney(slip.allowances) },
                { icon: Clock3, label: 'Payment date', value: slip.paid_at ? fmtDate(slip.paid_at) : 'Pending' },
              ].map((x) => (
                <div key={x.label} className="rounded-xl bg-slate-50 p-3.5">
                  <x.icon size={16} className="text-brand-500" />
                  <p className="mt-2 font-display text-[14px] font-bold text-ink-900">{x.value}</p>
                  <p className="text-[10.5px] text-slate-400">{x.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {slipId && <PayslipModal id={slipId} onClose={() => setSlipId(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Payslip                                                            */
/* ------------------------------------------------------------------ */
function PayslipModal({ id, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/payroll/${id}/payslip`).then(setData).catch(() => {});
  }, [id]);

  const slip = data?.payslip;
  const emp = data?.employee;
  const gross = slip ? Number(slip.basic) + Number(slip.allowances) + Number(slip.bonus) : 0;

  return (
    <Modal open onClose={onClose} size="md" title="Payslip" subtitle={slip ? `${monthLabel(slip.month)} · ${emp?.first_name} ${emp?.last_name}` : 'Loading…'} icon={Receipt}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{slip && <Button variant="primary" icon={FileText} onClick={() => window.print()}>Print payslip</Button>}</>}
    >
      {!data ? (
        <LoadingBlock label="Preparing payslip…" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 print-area">
          <div className="relative bg-ink-900 px-6 py-5 text-white">
            <div className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-brand-500/30 blur-2xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="font-display text-[17px] font-extrabold">Kodewar <span className="text-brand-400">Technologies</span></p>
                <p className="mt-0.5 text-[10.5px] text-white/40">Kodewar Technologies · HR Workspace</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Payslip</p>
                <p className="mt-0.5 text-[12px] font-semibold">{monthLabel(slip.month)}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 border-b border-slate-100 px-6 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Employee</p>
              <p className="mt-0.5 text-[13px] font-semibold text-ink-900">{emp?.first_name} {emp?.last_name}</p>
              <p className="text-[11px] text-slate-500">{emp?.designation} · {emp?.employee_code}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Period</p>
              <p className="mt-0.5 text-[13px] font-semibold text-ink-900">{monthLabel(slip.month)}</p>
              <p className="text-[11px] capitalize text-slate-500">{slip.status}{slip.paid_at ? ` · ${fmtDate(slip.paid_at)}` : ''}</p>
            </div>
          </div>
          <div className="px-6 py-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Earnings</p>
            <div className="space-y-2.5">
              {[
                ['Basic salary', slip.basic],
                ['Allowances', slip.allowances],
                ['Bonus', slip.bonus],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-ink-800">{fmtMoney(value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2.5 text-[12.5px]">
                <span className="font-semibold text-ink-700">Gross earnings</span>
                <span className="font-bold text-ink-900">{fmtMoney(gross)}</span>
              </div>
            </div>
            <p className="mb-3 mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Deductions</p>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-slate-500">Tax & benefits</span>
              <span className="font-semibold text-rose-500">−{fmtMoney(slip.deductions)}</span>
            </div>
            <div className="mt-5 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
              <span className="text-[12.5px] font-semibold text-brand-800">Net pay</span>
              <span className="font-display text-[19px] font-extrabold text-brand-900">{fmtMoney(slip.net_pay)}</span>
            </div>
            <p className="mt-4 text-center text-[9.5px] text-slate-400">This is a system-generated payslip from Kodewar Technologies HR. No signature required.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
