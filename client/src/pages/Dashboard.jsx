import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Cake,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock3,
  Coffee,
  LogIn,
  LogOut,
  Plus,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtDate, fmtDateRange, fmtMoney, fmtTime, todayISO } from '../lib/api';
import { Avatar, Badge, Button, Card, EmptyState, Progress, SectionTitle, StatCard, Tabs, TONE } from '../components/ui';

/* ------------------------------------------------------------------ */
/*  Chart primitives                                                   */
/* ------------------------------------------------------------------ */
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-lg shadow-slate-900/10">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5 text-[12px]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-slate-500">{p.name}</span>
          <span className="ml-auto pl-3 font-bold text-ink-900">{formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const { user, isManager } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/dashboard');
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;
  if (error)
    return (
      <Card className="p-10 text-center">
        <p className="font-display text-lg font-bold text-ink-900">We couldn’t load your dashboard</p>
        <p className="mt-1 text-sm text-slate-500">{error}</p>
        <Button variant="primary" className="mt-5" onClick={() => { setLoading(true); load(); }}>
          Try again
        </Button>
      </Card>
    );

  return isManager ? <ManagerDashboard data={data} user={user} refresh={load} /> : <EmployeeDashboard data={data} user={user} refresh={load} />;
}

/* ------------------------------------------------------------------ */
/*  Manager view                                                       */
/* ------------------------------------------------------------------ */
function ManagerDashboard({ data, user, refresh }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [leaves, setLeaves] = useState(data.pendingLeaves || []);
  const [acting, setActing] = useState(null);

  useEffect(() => setLeaves(data.pendingLeaves || []), [data.pendingLeaves]);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const s = data.stats;
  const headcountChange = useMemo(() => {
    const t = data.headcountTrend || [];
    if (t.length < 2) return 0;
    return t[t.length - 1].count - t[0].count;
  }, [data.headcountTrend]);

  const review = async (leave, status) => {
    setActing(leave.id);
    try {
      await api.patch(`/leaves/${leave.id}/status`, { status });
      setLeaves((prev) => prev.map((l) => (l.id === leave.id ? { ...l, status } : l)));
      toast.success(`${leave.first_name}’s leave was ${status}.`);
      setTimeout(() => refresh(), 700);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  const attendanceData = [
    { name: 'On time', value: data.attendanceToday.present, color: '#10b981' },
    { name: 'Late', value: data.attendanceToday.late, color: '#f59e0b' },
    { name: 'Remote', value: data.attendanceToday.remote, color: '#0ea5e9' },
    { name: 'Half day', value: data.attendanceToday.halfDay, color: '#f97316' },
    { name: 'Not marked', value: data.attendanceToday.notMarked, color: '#e2e8f0' },
  ].filter((d) => d.value > 0);
  const markedTotal = attendanceData.reduce((a, b) => a + b.value, 0);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 p-6 text-white shadow-glow sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-32 h-72 w-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] surface-grid" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11.5px] font-medium text-white/90 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              {fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <h2 className="font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">
              {greeting()}, {firstName} <span className="inline-block animate-float">👋</span>
            </h2>
            <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-white/70">
              Your team is {s.attendanceRate}% present today, with {s.pendingLeaves} leave request{s.pendingLeaves === 1 ? '' : 's'} waiting for you.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {can('employees.manage') && (
              <button onClick={() => navigate('/employees')} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50">
                <UserPlus size={16} /> Add employee
              </button>
            )}
            <button onClick={() => navigate('/leaves')} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/15">
              <CalendarDays size={16} /> {can('leaves.manage') ? 'Review leaves' : 'View leave requests'}
              {s.pendingLeaves > 0 && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">{s.pendingLeaves}</span>}
            </button>
            {can('payroll.manage') && (
              <button onClick={() => navigate('/payroll')} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/15">
                <Wallet size={16} /> Run payroll
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total employees" value={s.totalEmployees} sub={`${s.newHires} new hire${s.newHires === 1 ? '' : 's'} this month`} icon={Users} tone="indigo" trend={`+${headcountChange} in 6 months`} />
        <StatCard label="Present today" value={s.presentToday} sub={`${s.lateToday} late · ${s.remoteToday} remote · ${s.notMarked} yet to check in`} icon={Clock3} tone="emerald" />
        <StatCard label="Pending leave" value={s.pendingLeaves} sub={`${s.approvedLeaves} approved this month`} icon={CalendarDays} tone="amber" />
        {can('payroll.view_all') ? (
          <StatCard label="Monthly payroll" value={fmtMoney(s.monthlyPayroll, true)} sub={`${s.payrollPaid} paid · ${s.payrollPending} pending payslips`} icon={Wallet} tone="violet" />
        ) : (
          <StatCard label="Departments" value={(data.departmentDistribution || []).length} sub="Teams across the organisation" icon={Users} tone="violet" />
        )}
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 sm:p-6 xl:col-span-2">
          <SectionTitle
            title="Team growth"
            description="Headcount over the last six months"
            action={
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-600">
                <TrendingUp size={13} /> +{headcountChange} people
              </div>
            }
          />
          <div className="mt-6 h-[248px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.headcountTrend} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="headcountFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} dy={8} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} domain={['dataMin - 4', 'dataMax + 2']} width={48} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#c7d2fe', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="count" name="Employees" stroke="#6366f1" strokeWidth={2.6} fill="url(#headcountFill)" dot={{ r: 3, fill: '#fff', stroke: '#6366f1', strokeWidth: 2 }} activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Attendance today" description="Live clock-in overview" />
          <div className="relative mx-auto mt-3 h-[180px] w-full max-w-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={attendanceData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={82} paddingAngle={3} cornerRadius={6} stroke="none">
                  {attendanceData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-display text-[28px] font-extrabold leading-none text-ink-900">{s.attendanceRate}%</p>
              <p className="mt-1 text-[10.5px] font-medium text-slate-400">{markedTotal} of {s.activeEmployees}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {attendanceData.map((d) => (
              <div key={d.name} className="flex items-center gap-2.5 text-[12px]">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                <span className="text-slate-500">{d.name}</span>
                <span className="ml-auto font-bold text-ink-800 tabular">{d.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Second row */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Departments" description="Team distribution" />
          <div className="mt-5 space-y-4">
            {(data.departmentDistribution || []).slice(0, 6).map((d) => {
              const tone = TONE[d.color] || TONE.indigo;
              const pct = s.totalEmployees ? Math.round((d.count / s.totalEmployees) * 100) : 0;
              return (
                <div key={d.name}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className={clsx('h-2 w-2 rounded-full', tone.dot)} />
                      <span className="font-medium text-ink-700">{d.name}</span>
                    </div>
                    <span className="text-slate-400"><span className="font-semibold text-ink-800">{d.count}</span> · {pct}%</span>
                  </div>
                  <Progress value={pct} tone={d.color} height="h-1.5" />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 sm:p-6 xl:col-span-2">
          <SectionTitle
            title="Weekly attendance"
            description="Presence across the last seven days"
            action={<Badge tone="emerald">Live</Badge>}
          />
          <div className="mt-6 h-[236px] w-full">
            {data.weeklyAttendance.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyAttendance} margin={{ top: 4, right: 4, left: -26, bottom: 0 }} barSize={18}>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#eef1f6" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} dy={8} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
                  <Bar dataKey="present" name="On time" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="late" name="Late" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="remote" name="Remote" stackId="a" fill="#38bdf8" />
                  <Bar dataKey="absent" name="Absent" stackId="a" fill="#fb7185" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={CalendarDays} title="No attendance yet" description="Attendance records will appear here." className="py-10" />
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3.5">
            {[['On time', '#10b981'], ['Late', '#f59e0b'], ['Remote', '#38bdf8'], ['Absent', '#fb7185']].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
              </span>
            ))}
          </div>
        </Card>
      </section>

      {/* Third row */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between px-5 pb-3 pt-5 sm:px-6">
            <SectionTitle title="Leave requests" description="Pending your review" />
            <Button size="sm" variant="ghost" onClick={() => navigate('/leaves')} className="shrink-0">
              View all <ArrowRight size={14} />
            </Button>
          </div>
          <div className="divide-y divide-slate-100">
            {leaves.length === 0 && (
              <EmptyState icon={CheckCircle2} title="All caught up" description="Every leave request has been reviewed. Nice work." className="py-12" />
            )}
            {leaves.map((l) => (
              <div key={l.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/60 sm:flex-row sm:items-center sm:px-6">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={`${l.first_name} ${l.last_name}`} color={l.avatar_color} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink-900">{l.first_name} {l.last_name}</p>
                    <p className="text-[11px] text-slate-400">
                      {l.department_name} · <span className="capitalize">{l.type}</span> leave
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:w-[236px]">
                  <div className="text-left sm:text-right">
                    <p className="whitespace-nowrap text-[12px] font-semibold text-ink-700">{fmtDateRange(l.start_date, l.end_date)}</p>
                    <p className="text-[11px] text-slate-400">{l.days} day{Number(l.days) === 1 ? '' : 's'}</p>
                  </div>
                  {l.status === 'pending' && can('leaves.manage') ? (
                    <div className="ml-auto flex gap-1.5">
                      <button
                        disabled={acting === l.id}
                        onClick={() => review(l, 'approved')}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-50"
                        title="Approve"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        disabled={acting === l.id}
                        onClick={() => review(l, 'rejected')}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                        title="Reject"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <Badge status={l.status}>{l.status}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <SectionTitle
              title="New teammates"
              description="Recently joined"
              action={<button onClick={() => navigate('/employees')} className="text-slate-400 transition hover:text-brand-600"><ArrowUpRight size={17} /></button>}
            />
            <div className="mt-4 space-y-3.5">
              {(data.recentHires || []).slice(0, 4).map((h) => (
                <div key={h.id} className="flex items-center gap-3">
                  <Avatar name={`${h.first_name} ${h.last_name}`} color={h.avatar_color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink-800">{h.first_name} {h.last_name}</p>
                    <p className="truncate text-[11px] text-slate-400">{h.designation}</p>
                  </div>
                  <span className="shrink-0 text-[10.5px] font-medium text-slate-400">{fmtDate(h.join_date, { month: 'short', day: 'numeric' })}</span>
                </div>
              ))}
              {!(data.recentHires || []).length && <p className="py-4 text-center text-xs text-slate-400">No recent hires.</p>}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <SectionTitle title="Birthdays" description="Celebrate this month" action={<Cake size={18} className="text-rose-400" />} />
            <div className="mt-4 space-y-3">
              {(data.birthdays || []).map((b) => (
                <div key={b.id} className="flex items-center gap-3">
                  <Avatar name={`${b.first_name} ${b.last_name}`} color={b.avatar_color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink-800">{b.first_name} {b.last_name}</p>
                    <p className="truncate text-[11px] text-slate-400">{b.department_name}</p>
                  </div>
                  <span className="rounded-lg bg-rose-50 px-2 py-1 text-[10.5px] font-bold text-rose-500">
                    {fmtDate(b.date_of_birth, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
              {!(data.birthdays || []).length && (
                <div className="flex flex-col items-center py-5 text-center">
                  <Cake size={22} className="text-slate-300" />
                  <p className="mt-2 text-xs text-slate-400">No birthdays this month.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Employee view                                                      */
/* ------------------------------------------------------------------ */
function EmployeeDashboard({ data, user }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [my, setMy] = useState(data.my);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setMy(data.my), [data.my]);

  const today = my?.today;
  const checkedIn = Boolean(today?.check_in);
  const checkedOut = Boolean(today?.check_out);
  const firstName = user?.name?.split(' ')[0] || 'there';
  const employee = data.employee || {};
  const leave = my?.leave || {};
  const attendanceRate = my?.attendanceRate ?? 0;

  const clock = async () => {
    setBusy(true);
    try {
      const res = await api.post(checkedIn ? '/attendance/check-out' : '/attendance/check-in');
      setMy((prev) => ({ ...prev, today: res.record }));
      toast.success(res.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-10 top-0 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.05] surface-grid" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={user?.name} color={user?.avatarColor || 'indigo'} size="xl" className="hidden ring-4 ring-white/10 sm:flex" />
            <div>
              <p className="text-[11.5px] font-medium text-white/50">{fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              <h2 className="mt-1 font-display text-[27px] font-extrabold tracking-tight sm:text-[32px]">
                {greeting()}, {firstName} <span className="inline-block animate-float">✨</span>
              </h2>
              <p className="mt-1 text-[13px] text-white/60">{[employee.designation, employee.department_name].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[10.5px] uppercase tracking-[0.14em] text-white/45">Local time</p>
                <p className="mt-1 font-display text-[26px] font-bold leading-none tabular">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
                <p className="mt-1 text-[10.5px] text-white/40">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
              </div>
              <div className="h-12 w-px bg-white/10" />
              <div>
                <p className="text-[10.5px] uppercase tracking-[0.14em] text-white/45">Today</p>
                <p className={clsx('mt-1 text-[13px] font-semibold', checkedIn ? 'text-emerald-300' : 'text-amber-300')}>
                  {checkedOut ? 'Day complete' : checkedIn ? 'Clocked in' : 'Not clocked in'}
                </p>
                {today?.check_in && <p className="mt-1 text-[10.5px] text-white/40">Since {fmtTime(today.check_in)}</p>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Attendance rate" value={`${attendanceRate}%`} sub={`${my.attended} of ${my.daysRecorded} days this month`} icon={Clock3} tone="emerald" />
        <StatCard label="Leave remaining" value={`${leave.annualRemaining ?? 0} days`} sub={`${leave.annualUsed ?? 0} used of ${leave.annualTotal ?? 24}`} icon={CalendarDays} tone="indigo" />
        <StatCard label="Pending requests" value={leave.pending ?? 0} sub="Awaiting approval" icon={CalendarPlus} tone="amber" />
        <StatCard label="Latest payslip" value={my.latestPayroll ? fmtMoney(my.latestPayroll.net_pay, true) : '—'} sub={my.latestPayroll ? `${my.latestPayroll.month} · ${my.latestPayroll.status}` : 'No payslips yet'} icon={Wallet} tone="violet" />
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="relative overflow-hidden p-6 lg:col-span-2">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <SectionTitle title="Today’s attendance" description="Clock in when you start, and out when you’re done." />
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Check in</p>
                  <p className="mt-1 font-display text-[15px] font-bold text-ink-900">{fmtTime(today?.check_in)}</p>
                </div>
                <ArrowRight size={16} className="hidden text-slate-300 sm:block" />
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Check out</p>
                  <p className="mt-1 font-display text-[15px] font-bold text-ink-900">{fmtTime(today?.check_out)}</p>
                </div>
                <span className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Work hours</span>
                  <span className="mt-1 block font-display text-[15px] font-bold text-ink-900">{today?.work_hours ? `${today.work_hours}h` : '—'}</span>
                </span>
              </div>
            </div>
            <button
              onClick={clock}
              disabled={busy || checkedOut}
              className={clsx(
                'group flex shrink-0 flex-col items-center justify-center gap-2 rounded-2xl px-7 py-5 text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed',
                checkedOut ? 'bg-slate-300 shadow-none' : checkedIn ? 'bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-500/25' : 'bg-gradient-to-br from-brand-500 to-violet-600 shadow-brand-500/30 hover:shadow-glow'
              )}
            >
              {busy ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : checkedIn ? <LogOut size={22} /> : <LogIn size={22} />}
              <span className="text-[12.5px] font-bold">{checkedOut ? 'All done' : checkedIn ? 'Check out' : 'Check in'}</span>
              <span className="text-[10px] text-white/70">{today?.status ? today.status.replace('-', ' ') : 'Start your day'}</span>
            </button>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
            {[
              { label: 'On time', value: my.daysRecorded - my.late - my.absent, tone: 'text-emerald-600' },
              { label: 'Late', value: my.late, tone: 'text-amber-600' },
              { label: 'Avg. hours', value: `${my.avgHours}h`, tone: 'text-brand-600' },
            ].map((x) => (
              <div key={x.label}>
                <p className={clsx('font-display text-lg font-bold', x.tone)}>{x.value}</p>
                <p className="text-[11px] text-slate-400">{x.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle title="Leave balance" description={`${new Date().getFullYear()} allowance`} />
          <div className="mt-5 flex items-center gap-5">
            <div className="relative grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#6366f1 ${(leave.annualRemaining / (leave.annualTotal || 24)) * 360}deg, #eef1f6 0deg)` }}>
              <div className="grid h-[74px] w-[74px] place-items-center rounded-full bg-white text-center">
                <div>
                  <p className="font-display text-xl font-extrabold leading-none text-ink-900">{leave.annualRemaining}</p>
                  <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">days left</p>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-[12px]">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-500" /><span className="text-slate-500">Annual</span><span className="ml-auto font-bold text-ink-800">{leave.annualUsed} used</span></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /><span className="text-slate-500">Sick</span><span className="ml-auto font-bold text-ink-800">{leave.sickUsed} used</span></div>
            </div>
          </div>
          <Button variant="soft" size="sm" className="mt-5 w-full" icon={CalendarPlus} onClick={() => navigate('/leaves')}>
            Request time off
          </Button>
        </Card>
      </section>

      <section className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 pb-1 pt-5 sm:px-6">
            <SectionTitle title="Upcoming time off" description="Your next few days away" />
            <Button size="sm" variant="ghost" onClick={() => navigate('/leaves')}>Manage <ArrowRight size={14} /></Button>
          </div>
          <div className="divide-y divide-slate-100 px-5 pb-2 sm:px-6">
            {(my.upcomingLeaves || []).length === 0 && (
              <EmptyState icon={Coffee} title="Nothing scheduled" description="Your calendar is clear. Request leave whenever you need a break." className="py-10" />
            )}
            {(my.upcomingLeaves || []).map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-3.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <CalendarDays size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold capitalize text-ink-800">{l.type} leave</p>
                  <p className="text-[11.5px] text-slate-400">{fmtDateRange(l.start_date, l.end_date)} · {l.days} day{Number(l.days) === 1 ? '' : 's'}</p>
                </div>
                <Badge status={l.status}>{l.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle title="Your workspace" description="A little about your team" />
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-600 shadow-sm"><Users size={17} /></div>
              <div className="flex-1">
                <p className="text-[11px] text-slate-400">Your department</p>
                <p className="text-[12.5px] font-semibold text-ink-800">{employee.department_name || '—'}</p>
              </div>
              <Badge tone={employee.department_color || 'indigo'} dot={false}>{my.teamSize} peers</Badge>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-rose-500 shadow-sm"><Cake size={17} /></div>
              <div className="flex-1">
                <p className="text-[11px] text-slate-400">Team birthdays</p>
                <p className="text-[12.5px] font-semibold text-ink-800">{my.birthdays ? `${my.birthdays} this month` : 'None this month'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-violet-500 shadow-sm"><BriefcaseBusiness size={17} /></div>
              <div className="flex-1">
                <p className="text-[11px] text-slate-400">Employee ID</p>
                <p className="text-[12.5px] font-semibold text-ink-800">{employee.employee_code || employee.code || '—'}</p>
              </div>
            </div>
          </div>
          {my.latestPayroll && (
            <div className="mt-5 rounded-2xl bg-gradient-to-br from-ink-900 to-brand-900 p-4 text-white">
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] uppercase tracking-wider text-white/50">Latest payslip</p>
                <Wallet size={15} className="text-brand-300" />
              </div>
              <p className="mt-2 font-display text-xl font-bold">{fmtMoney(my.latestPayroll.net_pay)}</p>
              <p className="mt-0.5 text-[10.5px] text-white/50">{my.latestPayroll.month} · <span className="capitalize">{my.latestPayroll.status}</span></p>
              <button onClick={() => navigate('/payroll')} className="mt-3 flex items-center gap-1 text-[11.5px] font-semibold text-brand-300 hover:text-brand-200">
                View payslip <ArrowRight size={12} />
              </button>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-[168px] rounded-3xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="skeleton h-[340px] rounded-2xl xl:col-span-2" />
        <div className="skeleton h-[340px] rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="skeleton h-[300px] rounded-2xl" />
        <div className="skeleton h-[300px] rounded-2xl xl:col-span-2" />
      </div>
    </div>
  );
}
