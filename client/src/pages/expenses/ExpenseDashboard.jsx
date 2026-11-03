import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  CheckCircle2,
  Clock3,
  DollarSign,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate, monthShort } from '../../lib/api';
import { Avatar, Button, Card, EmptyState, LoadingBlock, Progress, SectionTitle, StatCard } from '../../components/ui';
import { ExpenseStatusBadge, NoExpenses, ReimbursementStatusBadge, expenseMoney, RecentClaimRow } from './expense-ui';

const RANGES = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3 months' },
  { key: 'this_year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom range' },
];

const COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#14b8a6', '#f97316', '#64748b', '#a855f7'];

export default function ExpenseDashboard() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [range, setRange] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ range });
      if (range === 'custom') {
        if (custom.from) params.set('from', custom.from);
        if (custom.to) params.set('to', custom.to);
      }
      const res = await api.get(`/expenses/dashboard?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [range, custom, toast]);

  useEffect(() => {
    if (range === 'custom' && !custom.from && !custom.to) return;
    load();
  }, [load, range, custom]);

  const stats = data?.stats || {};
  const monthly = useMemo(
    () => (data?.monthly || []).map((m) => ({ ...m, label: monthShort(m.month), amount: Number(m.amount) })),
    [data]
  );
  const categories = (data?.byCategory || []).filter((c) => Number(c.amount) > 0);
  const departments = (data?.byDepartment || []).filter((d) => Number(d.amount) > 0).slice(0, 6);
  const maxDept = Math.max(1, ...departments.map((d) => Number(d.amount)));
  const statusCounts = Object.fromEntries((data?.statusBreakdown || []).map((s) => [s.status, s]));
  const statusTotal = ['submitted', 'under_review', 'clarification_required', 'approved', 'rejected'].reduce(
    (sum, key) => sum + Number(statusCounts[key]?.count || 0),
    0
  );
  const statusPie = [
    { name: 'Pending', value: ['submitted', 'under_review', 'clarification_required'].reduce((s, k) => s + Number(statusCounts[k]?.count || 0), 0), color: '#f59e0b' },
    { name: 'Approved', value: ['approved', 'reimbursement_pending', 'partially_reimbursed', 'reimbursed'].reduce((s, k) => s + Number(statusCounts[k]?.count || 0), 0), color: '#10b981' },
    { name: 'Rejected', value: Number(statusCounts.rejected?.count || 0), color: '#f43f5e' },
  ].filter((s) => s.value > 0);

  const scopeLabel = data?.scope === 'organisation' ? 'organisation' : 'personal';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Expenses</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Expense dashboard</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            A live view of {scopeLabel} spending, approvals and reimbursements.
          </p>
        </div>
        {can('expenses.self') && (
          <Button variant="primary" icon={Plus} onClick={() => navigate('/expenses/my')}>Submit expense</Button>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition',
                  range === r.key ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-ink-800'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="input w-auto py-2 text-[12.5px]" value={custom.from} onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))} />
              <span className="text-[11px] text-slate-400">to</span>
              <input type="date" className="input w-auto py-2 text-[12.5px]" value={custom.to} onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))} />
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total expenses" value={loading ? '—' : stats.totalClaims ?? 0} sub="Claims in this period" icon={Receipt} tone="indigo" loading={loading} />
        <StatCard label="Total amount claimed" value={loading ? '—' : expenseMoney(stats.totalClaimed)} sub="Across all claims" icon={DollarSign} tone="violet" loading={loading} />
        <StatCard label="Pending approvals" value={loading ? '—' : stats.pending ?? 0} sub={expenseMoney(stats.pendingAmount)} icon={Clock3} tone="amber" loading={loading} />
        <StatCard label="Approved expenses" value={loading ? '—' : stats.approved ?? 0} sub={expenseMoney(stats.approvedAmount)} icon={CheckCircle2} tone="emerald" loading={loading} />
        <StatCard label="Rejected expenses" value={loading ? '—' : stats.rejected ?? 0} sub="Declined claims" icon={XCircle} tone="rose" loading={loading} />
        <StatCard label="Reimbursements pending" value={loading ? '—' : stats.reimbursementsPending ?? 0} sub={expenseMoney(stats.reimbursementsPendingAmount)} icon={Wallet} tone="orange" loading={loading} />
        <StatCard label="Total amount reimbursed" value={loading ? '—' : expenseMoney(stats.totalReimbursed)} sub={`${stats.reimbursementsPaid ?? 0} payment(s) completed`} icon={Banknote} tone="teal" loading={loading} />
        <StatCard label="Approval rate" value={loading ? '—' : `${stats.approved + stats.rejected ? Math.round((stats.approved / (stats.approved + stats.rejected)) * 100) : 0}%`} sub="Approved vs decided" icon={TrendingUp} tone="sky" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Monthly expense trend" description="Claimed amount over time" />
          <div className="mt-5 h-[260px]">
            {loading ? (
              <div className="skeleton h-full w-full" />
            ) : monthly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip formatter={(value) => expenseMoney(value)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="amount" name="Amount" stroke="#6366f1" strokeWidth={2.5} fill="url(#expenseFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={TrendingUp} title="No expense activity" description="Claims in this period will appear here." className="py-10" />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Expense distribution" description="By category" />
          <div className="mt-4 h-[180px]">
            {loading ? (
              <div className="skeleton h-full w-full" />
            ) : categories.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categories} dataKey="amount" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                    {categories.map((entry, index) => (
                      <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => expenseMoney(value)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-slate-400">No category data</div>
            )}
          </div>
          <div className="mt-2 space-y-2">
            {categories.slice(0, 5).map((c, index) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="flex min-w-0 items-center gap-2 text-slate-500">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="font-semibold text-ink-800">{expenseMoney(c.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle title="Expenses by department" description="Top spending teams" />
          <div className="mt-4 space-y-4">
            {loading ? (
              <div className="skeleton h-40 w-full" />
            ) : departments.length ? (
              departments.map((d, index) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-ink-700">{d.name}</span>
                    <span className="font-semibold text-slate-500">{expenseMoney(d.amount)}</span>
                  </div>
                  <Progress value={(Number(d.amount) / maxDept) * 100} tone={['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose'][index % 6]} className="mt-1.5" />
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-[12px] text-slate-400">No department data for this period.</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Claim outcomes" description="Pending vs approved vs rejected" />
          {loading ? (
            <div className="skeleton mt-4 h-40 w-full" />
          ) : statusPie.length ? (
            <>
              <div className="relative mt-2 h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                      {statusPie.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="font-display text-[20px] font-bold text-ink-900">{statusTotal}</p>
                  <p className="text-[10px] text-slate-400">claims</p>
                </div>
              </div>
              <div className="mt-2 space-y-2">
                {statusPie.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-[11.5px]">
                    <span className="flex items-center gap-2 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
                    <span className="font-semibold text-ink-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-[12px] text-slate-400">No claims in this period.</p>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Recent submissions" description="Latest claims" />
          {loading ? (
            <div className="skeleton mt-4 h-40 w-full" />
          ) : data?.recentClaims?.length ? (
            <div className="mt-2 -mx-2 divide-y divide-slate-100">
              {data.recentClaims.map((claim) => (
                <RecentClaimRow key={claim.id} claim={claim} onClick={() => navigate(can('expenses.view_all') ? '/expenses/claims' : '/expenses/my')} />
              ))}
            </div>
          ) : (
            <NoExpenses title="No recent submissions" description="New expense claims will show up here." />
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <SectionTitle title="Recent reimbursement activity" description="Manual payment records" />
          <span className="text-[11px] text-slate-400">Tracking only — no payment gateway</span>
        </div>
        {loading ? (
          <LoadingBlock label="Loading activity…" />
        ) : data?.recentReimbursements?.length ? (
          <div className="divide-y divide-slate-100">
            {data.recentReimbursements.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Avatar name={r.employee_name} color={r.avatar_color || 'indigo'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-ink-900">{r.employee_name} · {r.title}</p>
                  <p className="text-[11px] text-slate-400">{r.expense_code} · {fmtDate(r.payment_date || r.created_at)}</p>
                </div>
                <p className="text-[12.5px] font-bold text-ink-900">{expenseMoney(r.amount, r.currency)}</p>
                <ReimbursementStatusBadge status={r.payment_status} />
              </div>
            ))}
          </div>
        ) : (
          <NoExpenses title="No reimbursements yet" description="Recorded payments will appear here." />
        )}
      </Card>
    </div>
  );
}
