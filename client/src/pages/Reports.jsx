import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock3,
  Download,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtMoney } from '../lib/api';
import { Card, LoadingBlock, SectionTitle, StatCard, TONE } from '../components/ui';
import clsx from 'clsx';

export default function Reports() {
  const { can } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/dashboard'),
      can('departments.view') ? api.get('/departments') : Promise.resolve({ data: [] }),
    ])
      .then(([dash, depts]) => {
        if (!alive) return;
        setData(dash);
        setDepartments(depts.data || []);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [can, toast]);

  const stats = data?.stats || {};
  const headcount = useMemo(() => {
    const t = data?.headcountTrend || [];
    if (t.length < 2) return 0;
    return t[t.length - 1].count - t[0].count;
  }, [data]);

  const departmentRows = useMemo(() => {
    const total = departments.reduce((a, d) => a + Number(d.employee_count || 0), 0) || 1;
    return [...departments]
      .sort((a, b) => Number(b.employee_count) - Number(a.employee_count))
      .map((d) => ({ ...d, pct: Math.round((Number(d.employee_count) / total) * 100) }));
  }, [departments]);

  if (loading) return <LoadingBlock label="Preparing executive report…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Insights</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Executive reports</h1>
          <p className="mt-1 text-[13px] text-slate-500">A company-wide view of people, time, departments and cost.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-medium text-slate-500">
          <Download size={14} /> Read-only insights
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total employees" value={stats.totalEmployees ?? 0} sub={`${stats.newHires ?? 0} new this month`} icon={Users} tone="indigo" trend={`+${headcount} in 6 months`} />
        <StatCard label="Attendance rate" value={`${stats.attendanceRate ?? 0}%`} sub={`${stats.presentToday ?? 0} present today`} icon={Clock3} tone="emerald" />
        <StatCard label="Pending leave" value={stats.pendingLeaves ?? 0} sub={`${stats.approvedLeaves ?? 0} approved this month`} icon={CalendarDays} tone="amber" />
        {can('payroll.view_all') ? (
          <StatCard label="Monthly payroll" value={fmtMoney(stats.monthlyPayroll, true)} sub={`${stats.payrollPaid ?? 0} paid · ${stats.payrollPending ?? 0} pending`} icon={Wallet} tone="violet" />
        ) : (
          <StatCard label="Departments" value={departmentRows.length} sub="Across the organisation" icon={Building2} tone="violet" />
        )}
      </div>

      <Card className="p-5 sm:p-6">
        <SectionTitle
          title="Headcount trend"
          description="Company growth across the last six months"
          action={
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-600">
              <TrendingUp size={13} /> +{headcount} people
            </div>
          }
        />
        <div className="mt-6 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.headcountTrend || []} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="reportHeadcount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#eef1f6" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} dy={8} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} domain={['dataMin - 4', 'dataMax + 2']} width={48} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Area type="monotone" dataKey="count" name="Employees" stroke="#6366f1" strokeWidth={2.6} fill="url(#reportHeadcount)" dot={{ r: 3, fill: '#fff', stroke: '#6366f1', strokeWidth: 2 }} activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Department distribution" description="Where the organisation sits today" />
          <div className="mt-5 space-y-4">
            {departmentRows.map((d) => {
              const tone = TONE[d.color] || TONE.indigo;
              return (
                <div key={d.id}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className={clsx('h-2 w-2 rounded-full', tone.dot)} />
                      <span className="font-medium text-ink-700">{d.name}</span>
                    </div>
                    <span className="text-slate-400"><span className="font-semibold text-ink-800">{d.employee_count}</span> · {d.pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={clsx('h-full rounded-full', tone.bar)} style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
              );
            })}
            {!departmentRows.length && <p className="py-6 text-center text-xs text-slate-400">No department data available.</p>}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Workforce health" description="Signals worth watching this month" />
          <div className="mt-5 space-y-3">
            {[
              { label: 'Active employees', value: stats.activeEmployees ?? 0, hint: 'Currently working' },
              { label: 'On leave', value: stats.onLeave ?? 0, hint: 'Approved or upcoming' },
              { label: 'New hires', value: stats.newHires ?? 0, hint: 'Joined this month' },
              { label: 'Absent today', value: stats.notMarked ?? 0, hint: 'Yet to check in' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
                <div className="flex-1">
                  <p className="text-[12.5px] font-semibold text-ink-800">{row.label}</p>
                  <p className="text-[11px] text-slate-400">{row.hint}</p>
                </div>
                <span className="font-display text-lg font-bold text-ink-900">{row.value}</span>
                <ArrowUpRight size={15} className="text-slate-300" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
