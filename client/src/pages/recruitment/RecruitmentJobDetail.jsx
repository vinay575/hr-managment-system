import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Pencil,
  Send,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate, fmtMoney } from '../../lib/api';
import { JOB_STATUS_TONE, STAGE_META, pretty } from '../../lib/recruitment';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  SectionTitle,
} from '../../components/ui';

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-800">{value || '—'}</p>
      </div>
    </div>
  );
}

function Prose({ title, text }) {
  if (!text) return null;
  return (
    <div>
      <h3 className="font-display text-sm font-bold text-ink-900">{title}</h3>
      <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

export default function RecruitmentJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const manage = can('recruitment.jobs.manage');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get(`/recruitment/jobs/${id}`)
      .then(setData)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changeStatus = async (action) => {
    try {
      await api.patch(`/recruitment/jobs/${id}/status`, { action });
      toast.success('Vacancy status updated.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <LoadingBlock label="Loading vacancy…" />;
  if (!data?.job) return <EmptyState icon={Briefcase} title="Vacancy not found" action={<Button onClick={() => navigate('/recruitment/jobs')}>Back to vacancies</Button>} />;

  const job = data.job;
  const salary =
    job.salary_min || job.salary_max
      ? `${job.salary_min ? fmtMoney(job.salary_min) : '—'} – ${job.salary_max ? fmtMoney(job.salary_max) : '—'}`
      : 'Not disclosed';
  const experience =
    job.experience_min || job.experience_max
      ? `${Number(job.experience_min) || 0}${job.experience_max ? `–${Number(job.experience_max)}` : '+'} years`
      : 'Any experience';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button size="icon" variant="secondary" onClick={() => navigate('/recruitment/jobs')} aria-label="Back">
            <ArrowLeft size={17} />
          </Button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">{job.job_code}</p>
            <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">{job.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={JOB_STATUS_TONE[job.status]}>{pretty(job.status)}</Badge>
              <Badge tone="slate">{pretty(job.employment_type)}</Badge>
              <Badge tone="sky">{pretty(job.work_mode)}</Badge>
            </div>
          </div>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => navigate('/recruitment/jobs')}>Edit in list</Button>
            {job.status === 'draft' && <Button variant="primary" icon={Send} onClick={() => changeStatus('publish')}>Publish vacancy</Button>}
            {job.status === 'open' && <Button variant="secondary" icon={XCircle} onClick={() => changeStatus('close')}>Close vacancy</Button>}
            {job.status === 'closed' && <Button variant="primary" icon={CheckCircle2} onClick={() => changeStatus('reopen')}>Reopen vacancy</Button>}
            {job.status === 'on-hold' && <Button variant="primary" icon={Send} onClick={() => changeStatus('publish')}>Publish vacancy</Button>}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle title="Role overview" description="What this vacancy looks like day to day." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Detail icon={Building2} label="Department" value={job.department_name || 'Unassigned'} />
              <Detail icon={MapPin} label="Location" value={job.work_location} />
              <Detail icon={Briefcase} label="Experience" value={experience} />
              <Detail icon={Sparkles} label="Compensation" value={salary} />
              <Detail icon={CalendarDays} label="Application deadline" value={job.application_deadline ? fmtDate(job.application_deadline) : 'Rolling'} />
              <Detail icon={Users} label="Openings" value={`${job.vacancies} position${Number(job.vacancies) === 1 ? '' : 's'}`} />
            </div>
            <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
              <Prose title="Job description" text={job.description} />
              <Prose title="Responsibilities" text={job.responsibilities} />
              <Prose title="Required qualifications" text={job.qualifications} />
              <Prose title="Required skills" text={job.skills} />
              {!job.description && !job.responsibilities && !job.qualifications && !job.skills && (
                <p className="text-sm text-slate-400">No detailed description has been added yet.</p>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <SectionTitle
                title="Applications"
                description={`${data.applications.length} candidate${data.applications.length === 1 ? '' : 's'} linked to this vacancy.`}
                action={<Button size="sm" variant="soft" onClick={() => navigate('/recruitment/pipeline')}>Open pipeline</Button>}
              />
            </div>
            {data.applications.length === 0 ? (
              <EmptyState icon={Users} title="No applications yet" description="Candidates registered for this vacancy will appear here." />
            ) : (
              <div className="divide-y divide-slate-50">
                {data.applications.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/recruitment/candidates/${a.candidate_id}`)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50/70"
                  >
                    <Avatar name={a.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink-800">{a.full_name}</p>
                      <p className="truncate text-[11.5px] text-slate-500">{a.email} · {pretty(a.source)}</p>
                    </div>
                    <Badge tone={STAGE_META[a.stage]?.tone}>{pretty(a.stage)}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle title="Vacancy health" />
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-[12.5px] text-slate-500">Total applications</span>
                <span className="font-display text-lg font-bold text-ink-900">{job.application_count}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
                <span className="text-[12.5px] text-emerald-700">Hired</span>
                <span className="font-display text-lg font-bold text-emerald-700">{job.hired_count}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
                <span className="text-[12.5px] text-brand-700">Openings</span>
                <span className="font-display text-lg font-bold text-brand-700">{job.vacancies}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Ownership" />
            <div className="mt-4 space-y-3 text-[12.5px]">
              <div className="flex items-center gap-2 text-slate-500"><Clock3 size={14} /> Created {fmtDate(job.created_at)}</div>
              <div className="flex items-center gap-2 text-slate-500"><Sparkles size={14} /> Updated {fmtDate(job.updated_at)}</div>
              <div className="flex items-center gap-2 text-slate-500"><Users size={14} /> Created by {job.created_by_name || 'System'}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
