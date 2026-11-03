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
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Filter,
  MailCheck,
  Send,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { api, fmtDate, monthShort } from '../../lib/api';
import { STAGE_META, fmtDateTime, pretty } from '../../lib/recruitment';
import {
  Avatar,
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

const PIE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#94a3b8'];

export default function RecruitmentDashboard() {
  const toast = useToast();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get('/recruitment/dashboard')
      .then((d) => alive && setData(d))
      .catch((err) => toast.error(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [toast]);

  if (loading) return <LoadingBlock label="Loading recruitment dashboard…" />;
  if (!data) return <EmptyState icon={Briefcase} title="Recruitment unavailable" description="We could not load recruitment data." />;

  const s = data.stats || {};
  const vis = data.visibility || {};
  const funnel = (data.funnel || []).map((f) => ({ ...f, fill: STAGE_META[f.stage]?.bar || '#6366f1' }));
  const sources = (data.sources || []).map((x, i) => ({ ...x, fill: PIE_COLORS[i % PIE_COLORS.length] }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Recruitment</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Hiring overview</h1>
          <p className="mt-1 text-[13px] text-slate-500">Vacancies, pipeline health and hiring momentum in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('recruitment.candidates.view') && (
            <Button variant="secondary" icon={Filter} onClick={() => navigate('/recruitment/pipeline')}>
              Open pipeline
            </Button>
          )}
          {can(['recruitment.jobs.view', 'recruitment.jobs.manage']) && (
            <Button
              variant="primary"
              icon={Briefcase}
              onClick={() => navigate('/recruitment/jobs')}
            >
              {can('recruitment.jobs.manage') ? 'Manage vacancies' : 'View vacancies'}
            </Button>
          )}
          {can('recruitment.reports.view') && (
            <Button variant="secondary" icon={TrendingUp} onClick={() => navigate('/recruitment/reports')}>
              Recruitment reports
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Job vacancies" value={s.totalJobs ?? 0} sub={`${s.openJobs ?? 0} open · ${s.draftJobs ?? 0} draft`} icon={Briefcase} tone="indigo" />
        <StatCard label="Open positions" value={s.openPositions ?? 0} sub="Across open vacancies" icon={UserPlus} tone="sky" />
        <StatCard label="Total candidates" value={s.totalCandidates ?? 0} sub={`${s.applications ?? 0} applications`} icon={Users} tone="violet" />
        <StatCard label="In screening" value={s.screening ?? 0} sub={`${s.shortlisted ?? 0} shortlisted`} icon={ClipboardList} tone="amber" />
        <StatCard label="Upcoming interviews" value={s.upcomingInterviews ?? 0} sub={`${s.completedInterviews ?? 0} completed`} icon={CalendarClock} tone="teal" />
        <StatCard label="Selected" value={s.selected ?? 0} sub="Ready for offers" icon={UserCheck} tone="emerald" />
        <StatCard label="Offers sent" value={s.offersSent ?? 0} sub={`${s.offersAccepted ?? 0} accepted`} icon={Send} tone="orange" />
        <StatCard label="Hired" value={s.hired ?? 0} sub={`${s.conversionRate ?? 0}% conversion`} icon={CheckCircle2} tone="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Recruitment funnel" description="Candidates currently at each stage of the pipeline." />
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef1f6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                  {funnel.map((f) => (
                    <Cell key={f.stage} fill={f.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Candidate sources" description="Where applications come from." />
          <div className="mt-2 h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="applications" nameKey="source" innerRadius={55} outerRadius={82} paddingAngle={3}>
                  {sources.map((x) => (
                    <Cell key={x.source} fill={x.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            {sources.slice(0, 5).map((x) => (
              <div key={x.source} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2 text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: x.fill }} />
                  {capitalize(x.source)}
                </span>
                <span className="font-semibold text-ink-700">{x.applications}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Monthly hiring trends" description="Applications received and candidates hired over the last 12 months." />
          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyTrends || []} margin={{ left: -18, right: 10, top: 4 }}>
                <defs>
                  <linearGradient id="recApps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="recHires" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="month" tickFormatter={monthShort} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={monthShort} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="applications" stroke="#6366f1" strokeWidth={2} fill="url(#recApps)" />
                <Area type="monotone" dataKey="hires" stroke="#10b981" strokeWidth={2} fill="url(#recHires)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Department vacancies" description="Open and on-hold demand by team." />
          <div className="mt-4 space-y-4">
            {(data.departmentVacancies || []).length === 0 && <p className="py-8 text-center text-sm text-slate-400">No open vacancies yet.</p>}
            {(data.departmentVacancies || []).map((d, i) => {
              const max = Math.max(...(data.departmentVacancies || []).map((x) => Number(x.vacancies) || 0), 1);
              return (
                <div key={d.department}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="font-medium text-ink-700">{d.department}</span>
                    <span className="text-slate-500">
                      {d.vacancies} position{Number(d.vacancies) === 1 ? '' : 's'} · {d.jobs} job{Number(d.jobs) === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Progress value={((Number(d.vacancies) || 0) / max) * 100} tone={['indigo', 'sky', 'emerald', 'amber', 'violet'][i % 5]} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {vis.candidates && (
          <Card className="overflow-hidden xl:col-span-1">
            <div className="border-b border-slate-100 px-5 py-4">
              <SectionTitle title="Recent applications" description="Latest candidates entering the pipeline." />
            </div>
            {(data.recentApplications || []).length === 0 ? (
              <EmptyState icon={Users} title="No applications yet" />
            ) : (
              <div className="divide-y divide-slate-50">
                {data.recentApplications.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/recruitment/candidates/${a.candidate_id}`)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50/70"
                  >
                    <Avatar name={a.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink-800">{a.full_name}</p>
                      <p className="truncate text-[11.5px] text-slate-500">{a.job_title}</p>
                    </div>
                    <Badge tone={STAGE_META[a.stage]?.tone}>{pretty(a.stage)}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        {vis.interviews && (
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <SectionTitle title="Upcoming interviews" description="The next conversations on the calendar." />
            </div>
            {(data.upcomingInterviews || []).length === 0 ? (
              <EmptyState icon={CalendarClock} title="No interviews scheduled" />
            ) : (
              <div className="divide-y divide-slate-50">
                {data.upcomingInterviews.map((i) => (
                  <div key={i.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                      <CalendarClock size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink-800">{i.candidate_name}</p>
                      <p className="truncate text-[11.5px] text-slate-500">
                        {pretty(i.interview_type)} · {fmtDateTime(i.scheduled_at)}
                      </p>
                    </div>
                    <Badge tone={i.mode === 'online' ? 'sky' : 'slate'}>{pretty(i.mode)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {(vis.candidates || vis.offers) && (
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <SectionTitle title="Recently hired" description="Candidates who joined the team." />
            </div>
            {(data.recentHires || []).length === 0 ? (
              <EmptyState icon={UserCheck} title="No hires yet" />
            ) : (
              <div className="divide-y divide-slate-50">
                {data.recentHires.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => h.employee_id && navigate('/employees')}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50/70"
                  >
                    <Avatar name={h.employee_name || h.candidate_name} size="sm" tone="emerald" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink-800">{h.employee_name || h.candidate_name}</p>
                      <p className="truncate text-[11.5px] text-slate-500">
                        {h.employee_code || 'Conversion pending'} · {h.job_title}
                      </p>
                    </div>
                    <ArrowRight size={15} className="text-slate-300" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {vis.candidates && (data.activities || []).length > 0 && (
        <Card className="p-5">
          <SectionTitle title="Latest recruitment activity" description="A trail of the most recent actions across the module." action={<span className="badge bg-brand-50 text-brand-600"><Sparkles size={13} /> Live</span>} />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.activities.map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-brand-500 shadow-sm">
                  <TrendingUp size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-ink-800">
                    {pretty(a.action)}
                    {a.candidate_name ? ` · ${a.candidate_name}` : ''}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-slate-500">
                    {a.job_title ? `${a.job_title} · ` : ''}
                    {a.actor_name || 'System'} · {fmtDateTime(a.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
