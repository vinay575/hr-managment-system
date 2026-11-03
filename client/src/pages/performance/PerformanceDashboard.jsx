import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
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
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Plus,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate, monthShort } from '../../lib/api';
import { Button, Card, EmptyState, LoadingBlock, Progress, SectionTitle, StatCard } from '../../components/ui';
import { GOAL_STATUS, GoalStatusBadge, goalStatusOf } from './performance-ui';

const RANGES = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3 months' },
  { key: 'this_year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
];

const STATUS_COLORS = {
  not_started: '#94a3b8',
  in_progress: '#0ea5e9',
  completed: '#10b981',
  on_hold: '#f59e0b',
  overdue: '#f43f5e',
  cancelled: '#cbd5e1',
};

const ACTIVITY_ICON = {
  goal_created: Target,
  goal_updated: Target,
  progress_updated: TrendingUp,
  goal_completed: CheckCircle2,
  goal_on_hold: Clock3,
  goal_cancelled: AlertTriangle,
  target_extended: CalendarClock,
  target_changed: CalendarClock,
  status_changed: TrendingUp,
  cycle_created: CalendarCheck2,
  cycle_started: CalendarCheck2,
  cycle_completed: CheckCircle2,
  cycle_cancelled: AlertTriangle,
  attachment_added: ClipboardCheck,
};

export default function PerformanceDashboard() {
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
      setData(await api.get(`/performance/dashboard?${params}`));
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
  const scopeLabel = data?.scope === 'organisation' ? 'organisation' : 'personal';
  const personalView = data
    ? data.scope !== 'organisation'
    : !can(['performance.goals.view', 'performance.goals.manage']);
  const distribution = useMemo(
    () => (data?.statusBreakdown || []).filter((s) => Number(s.count) > 0),
    [data]
  );
  const distributionTotal = distribution.reduce((sum, s) => sum + Number(s.count), 0);

  const monthly = useMemo(() => {
    const map = new Map((data?.monthly || []).map((m) => [m.month, Number(m.count)]));
    const now = new Date();
    return Array.from({ length: 12 }, (_, index) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { month: key, label: monthShort(key), count: map.get(key) || 0 };
    });
  }, [data]);

  const departments = (data?.byDepartment || []).slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Performance</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Performance dashboard</h1>
          <p className="mt-1 text-[13px] text-slate-500">A live view of {scopeLabel} goals, progress and review cycles.</p>
        </div>
        {can('performance.goals.manage') && (
          <Button variant="primary" icon={Plus} onClick={() => navigate('/performance/goals?new=1')}>Assign goal</Button>
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
        {!personalView && (
          <StatCard label="Total employees" value={loading ? '—' : stats.totalEmployees ?? 0} sub="Active employees" icon={Users} tone="indigo" loading={loading} />
        )}
        <StatCard
          label={personalView ? 'My assigned goals' : 'Goals assigned'}
          value={loading ? '—' : stats.totalGoals ?? 0}
          sub={personalView ? 'Assigned to me' : 'Created in this period'}
          icon={Target}
          tone="violet"
          loading={loading}
        />
        <StatCard label="Goals in progress" value={loading ? '—' : stats.inProgress ?? 0} sub="Actively being worked on" icon={TrendingUp} tone="sky" loading={loading} />
        <StatCard label="Goals completed" value={loading ? '—' : stats.completed ?? 0} sub="Reached 100%" icon={CheckCircle2} tone="emerald" loading={loading} />
        <StatCard label="Goals pending" value={loading ? '—' : stats.pending ?? 0} sub="Not started or on hold" icon={Clock3} tone="amber" loading={loading} />
        <StatCard label="Overdue goals" value={loading ? '—' : stats.overdue ?? 0} sub="Past target date" icon={AlertTriangle} tone="rose" loading={loading} />
        <StatCard label={personalView ? 'My active review cycles' : 'Active review cycles'} value={loading ? '—' : stats.activeReviewCycles ?? 0} sub="Currently running" icon={CalendarCheck2} tone="teal" loading={loading} />
        <StatCard label={personalView ? 'My completed review cycles' : 'Completed review cycles'} value={loading ? '—' : stats.completedReviewCycles ?? 0} sub="Historical records" icon={ClipboardCheck} tone="orange" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title={personalView ? 'My monthly goal completion' : 'Monthly goal completion'} description="Goals completed over the last 12 months" />
          <div className="mt-5 h-[260px]">
            {loading ? (
              <div className="skeleton h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} interval={1} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="count" name="Goals completed" fill="#6366f1" radius={[5, 5, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title={personalView ? 'My goal status distribution' : 'Goal status distribution'} description="Every goal in this period" />
          {loading ? (
            <div className="skeleton mt-4 h-60 w-full" />
          ) : distribution.length ? (
            <>
              <div className="relative mt-2 h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} dataKey="count" nameKey="status" innerRadius={52} outerRadius={80} paddingAngle={2}>
                      {distribution.map((entry) => <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [value, GOAL_STATUS[name]?.label || name]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="font-display text-[22px] font-bold text-ink-900">{distributionTotal}</p>
                  <p className="text-[10px] text-slate-400">goals</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {data.statusBreakdown.map((s) => (
                  <div key={s.status} className="flex items-center justify-between text-[11.5px]">
                    <span className="flex items-center gap-2 text-slate-500">
                      <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s.status] || '#94a3b8' }} />
                      {GOAL_STATUS[s.status]?.label || s.status}
                    </span>
                    <span className="font-semibold text-ink-800">{Number(s.count)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={Target} title="No goals in this period" description="Assign a goal to see the distribution." className="py-14" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {!personalView && (
          <Card className="p-5">
            <SectionTitle title="Department-wise goal progress" description="Completion by team" />
            <div className="mt-4 space-y-4">
              {loading ? (
                <div className="skeleton h-40 w-full" />
              ) : departments.length ? (
                departments.map((d) => {
                  const percent = Number(d.total) ? Math.round((Number(d.completed) / Number(d.total)) * 100) : 0;
                  return (
                    <div key={d.name}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-medium text-ink-700">{d.name}</span>
                        <span className="font-semibold text-slate-500">{Number(d.completed)}/{Number(d.total)} · {percent}%</span>
                      </div>
                      <Progress value={percent} tone={percent >= 70 ? 'emerald' : percent >= 35 ? 'sky' : 'amber'} className="mt-1.5" />
                    </div>
                  );
                })
              ) : (
                <p className="py-10 text-center text-[12px] text-slate-400">No department data for this period.</p>
              )}
            </div>
          </Card>
        )}

        <Card className={personalView ? 'p-5 xl:col-span-3' : 'p-5 xl:col-span-2'}>
          <SectionTitle title={personalView ? 'My recent activity' : 'Recent activity'} description="Goal and review cycle events" />
          {loading ? (
            <div className="skeleton mt-4 h-52 w-full" />
          ) : data?.recentActivities?.length ? (
            <div className="mt-2 -mx-2 divide-y divide-slate-100">
              {data.recentActivities.map((a) => {
                const Icon = ACTIVITY_ICON[a.action] || Target;
                return (
                  <div key={a.id} className="flex items-start gap-3 px-2 py-3">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink-800">
                        {a.goal_title || a.cycle_name || 'Performance activity'}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{a.description || a.action}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10.5px] text-slate-400">{fmtDate(a.created_at)}</p>
                      <p className="text-[10.5px] text-slate-400">{a.user_name || 'System'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={TrendingUp} title="No recent activity" description="Goal and cycle updates will appear here." className="py-12" />
          )}
        </Card>
      </div>

      {loading && !data && <LoadingBlock label="Loading performance data…" />}
    </div>
  );
}
