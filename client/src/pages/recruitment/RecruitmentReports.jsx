import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  BarChart3,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  FileSignature,
  Printer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { api, fmtMoney, monthShort } from '../../lib/api';
import { STAGE_META, OFFER_STATUS_TONE, pretty } from '../../lib/recruitment';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Progress,
  SectionTitle,
  StatCard,
  capitalize,
} from '../../components/ui';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#94a3b8'];

export default function RecruitmentReports() {
  const toast = useToast();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get('/recruitment/reports')
      .then((d) => alive && setData(d))
      .catch((err) => toast.error(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [toast]);

  if (loading) return <LoadingBlock label="Preparing recruitment report…" />;
  if (!data) return <EmptyState icon={BarChart3} title="Reports unavailable" description="We could not load recruitment reports." />;

  const t = data.totals || {};
  const funnel = (data.funnel || []).map((f) => ({ ...f, fill: STAGE_META[f.stage]?.bar || '#6366f1' }));
  const sourceData = (data.sources || []).map((s, i) => ({ ...s, fill: COLORS[i % COLORS.length] }));
  const maxDept = Math.max(...(data.departments || []).map((d) => Number(d.applications) || 0), 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Recruitment</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Recruitment reports</h1>
          <p className="mt-1 text-[13px] text-slate-500">Aggregate hiring performance · no candidate-confidential data.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print report</Button>
          <Button variant="primary" icon={Briefcase} onClick={() => navigate('/recruitment')}>Dashboard</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Applications" value={t.applications ?? 0} sub={`${t.candidates ?? 0} candidates`} icon={Users} tone="indigo" />
        <StatCard label="Interviews" value={t.interviews ?? 0} sub={`${t.jobs ?? 0} vacancies`} icon={CalendarClock} tone="sky" />
        <StatCard label="Offers" value={t.offers ?? 0} sub={`${t.hired ?? 0} hires`} icon={FileSignature} tone="violet" />
        <StatCard label="Conversion rate" value={`${t.conversionRate ?? 0}%`} sub={`Avg ${t.averageTimeToHire ?? 0} days to hire`} icon={TrendingUp} tone="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Pipeline conversion" description="How candidates progress from application to hire." />
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef1f6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={17}>
                  {funnel.map((f) => <Cell key={f.stage} fill={f.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Source effectiveness" description="Applications and hires by source." />
          <div className="mt-2 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sourceData} dataKey="applications" nameKey="source" innerRadius={52} outerRadius={80} paddingAngle={3}>
                  {sourceData.map((s) => <Cell key={s.source} fill={s.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            {sourceData.slice(0, 5).map((s) => (
              <div key={s.source} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: s.fill }} />{capitalize(s.source)}</span>
                <span className="font-semibold text-ink-700">{s.applications} · {s.conversion}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="Hiring trend" description="Applications and hires over the last 12 months." />
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend || []} margin={{ left: -18, right: 12, top: 4 }}>
              <defs>
                <linearGradient id="repApps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="repHires" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
              <XAxis dataKey="month" tickFormatter={monthShort} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={monthShort} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Area type="monotone" dataKey="applications" stroke="#6366f1" strokeWidth={2} fill="url(#repApps)" />
              <Area type="monotone" dataKey="hires" stroke="#10b981" strokeWidth={2} fill="url(#repHires)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <SectionTitle title="Department recruitment" description="Demand and outcomes by department." />
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            <table className="table">
              <thead><tr><th>Department</th><th>Jobs</th><th>Openings</th><th>Applications</th><th>Hires</th><th>Fill</th></tr></thead>
              <tbody>
                {(data.departments || []).map((d) => (
                  <tr key={d.department}>
                    <td className="font-medium text-ink-800">{d.department}</td>
                    <td>{d.jobs}</td>
                    <td>{d.vacancies}</td>
                    <td>{d.applications}</td>
                    <td className="font-semibold text-emerald-600">{d.hires}</td>
                    <td className="w-32"><Progress value={(Number(d.applications) / maxDept) * 100} tone="indigo" /></td>
                  </tr>
                ))}
                {!data.departments?.length && <tr><td colSpan={6} className="py-10 text-center text-slate-400">No department data yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Stage conversion rates" description="Share reaching each stage, and hire rate from that stage." />
          <div className="mt-4 space-y-4">
            {(data.stageConversion || []).map((s) => (
              <div key={s.stage}>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="font-medium text-ink-700">{s.label}</span>
                  <span className="text-slate-500">{s.count} candidates · {s.fromHired}% hired</span>
                </div>
                <Progress value={s.fromApplied} tone={STAGE_META[s.stage]?.tone || 'indigo'} />
              </div>
            ))}
            {!data.stageConversion?.length && <p className="py-6 text-center text-sm text-slate-400">No pipeline activity yet.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle title="Offer outcomes" description="Offer letters by status." />
          <div className="mt-4 space-y-2.5">
            {(data.offers || []).map((o) => (
              <div key={o.status} className="flex items-center justify-between rounded-xl border border-slate-100 px-3.5 py-2.5">
                <Badge tone={OFFER_STATUS_TONE[o.status]}>{pretty(o.status)}</Badge>
                <div className="text-right">
                  <p className="text-[12.5px] font-semibold text-ink-800">{o.count}</p>
                  {can('payroll.view_all') && <p className="text-[10.5px] text-slate-400">{fmtMoney(o.averageSalary, true)} avg</p>}
                </div>
              </div>
            ))}
            {!data.offers?.length && <p className="py-6 text-center text-sm text-slate-400">No offers created yet.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Vacancy status" description="Current distribution of vacancies." />
          <div className="mt-4 space-y-2.5">
            {Object.entries(data.jobsByStatus || {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                <span className="text-[12.5px] font-medium capitalize text-slate-600">{pretty(status)}</span>
                <span className="font-display text-base font-bold text-ink-900">{count}</span>
              </div>
            ))}
            {!Object.keys(data.jobsByStatus || {}).length && <p className="py-6 text-center text-sm text-slate-400">No vacancies yet.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Report summary" />
          <div className="mt-4 space-y-3 text-[12.5px]">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><Users size={14} />Candidates</span><span className="font-semibold text-ink-800">{t.candidates}</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><CheckCircle2 size={14} />Hired</span><span className="font-semibold text-emerald-600">{t.hired}</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><Clock3 size={14} />Avg. time to hire</span><span className="font-semibold text-ink-800">{t.averageTimeToHire} days</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><Download size={14} />Rejected</span><span className="font-semibold text-rose-500">{t.rejected}</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><CalendarClock size={14} />Interviews</span><span className="font-semibold text-ink-800">{t.interviews}</span></div>
            <p className="border-t border-slate-100 pt-3 text-[10.5px] text-slate-400">
              Generated {new Date(data.generatedAt).toLocaleString()}. Aggregated data only.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
