import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarClock,
  Download,
  FileText,
  Github,
  Globe2,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Star,
  User,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  INTERVIEW_STATUS_TONE,
  RECOMMENDATION_TONE,
  STAGE_META,
  downloadFile,
  fmtDateTime,
  pretty,
} from '../../lib/recruitment';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  SectionTitle,
} from '../../components/ui';

function Info({ icon: Icon, label, value, href }) {
  const content = value || '—';
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[13px] font-semibold text-brand-600 hover:underline">{content}</a>
        ) : (
          <p className="mt-0.5 break-words text-[13px] font-semibold text-ink-800">{content}</p>
        )}
      </div>
    </div>
  );
}

export default function RecruitmentCandidateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get(`/recruitment/candidates/${id}`)
      .then((d) => alive && setData(d))
      .catch((err) => toast.error(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, toast]);

  const download = async () => {
    try {
      await downloadFile(`/recruitment/candidates/${id}/resume`, data?.candidate?.resume_original_name || 'resume.pdf');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <LoadingBlock label="Loading candidate profile…" />;
  if (!data?.candidate) return <EmptyState icon={User} title="Candidate not found" action={<Button onClick={() => navigate('/recruitment/candidates')}>Back to candidates</Button>} />;

  const c = data.candidate;
  const skills = String(c.skills || '').split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Button size="icon" variant="secondary" onClick={() => navigate('/recruitment/candidates')} aria-label="Back">
          <ArrowLeft size={17} />
        </Button>
        <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Candidate profile</p>
            <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">{c.full_name}</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              {c.current_designation || 'Open to opportunities'}{c.current_company ? ` at ${c.current_company}` : ''}
            </p>
          </div>
          {c.resume_file && <Button variant="primary" icon={Download} onClick={download}>Download resume</Button>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={c.full_name} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-bold text-ink-900">{c.full_name}</h2>
                  <Badge tone="slate">{pretty(c.source)}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><Mail size={14} />{c.email}</span>
                  {c.phone && <span className="inline-flex items-center gap-1.5"><Phone size={14} />{c.phone}</span>}
                  {c.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{c.location}</span>}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-center">
                <p className="font-display text-xl font-bold text-ink-900">{Number(c.total_experience) || 0}</p>
                <p className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">Years exp.</p>
              </div>
            </div>
            {skills.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
                {skills.map((s) => <span key={s} className="badge bg-brand-50 text-brand-700">{s}</span>)}
              </div>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <SectionTitle title="Professional details" />
              <div className="mt-4 space-y-4">
                <Info icon={Building2} label="Current company" value={c.current_company} />
                <Info icon={Briefcase} label="Current designation" value={c.current_designation} />
                <Info icon={Sparkles} label="Highest qualification" value={c.highest_qualification} />
                <Info icon={CalendarClock} label="Notice period" value={c.notice_period} />
                <Info icon={Star} label="Expected salary" value={c.expected_salary ? `$${Number(c.expected_salary).toLocaleString()}` : null} />
              </div>
            </Card>
            <Card className="p-5">
              <SectionTitle title="Contact & links" />
              <div className="mt-4 space-y-4">
                <Info icon={Mail} label="Email" value={c.email} />
                <Info icon={Phone} label="Phone" value={c.phone} />
                <Info icon={Phone} label="Alternate phone" value={c.alternate_phone} />
                <Info icon={Linkedin} label="LinkedIn" value={c.linkedin_url} href={c.linkedin_url} />
                <Info icon={Globe2} label="Portfolio" value={c.portfolio_url} href={c.portfolio_url} />
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <SectionTitle
                title="Applications"
                description="Every vacancy this candidate is part of."
                action={<Button size="sm" variant="soft" onClick={() => navigate('/recruitment/pipeline')}>Open pipeline</Button>}
              />
            </div>
            {(data.applications || []).length === 0 ? (
              <EmptyState icon={Briefcase} title="No applications" description="Register this candidate against an open vacancy from the candidates page." />
            ) : (
              <div className="divide-y divide-slate-50">
                {data.applications.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink-800">{a.job_title}</p>
                      <p className="mt-0.5 text-[11.5px] text-slate-500">
                        {a.job_code} · {a.department_name || 'Unassigned'} · applied {fmtDate(a.applied_at)}
                      </p>
                    </div>
                    <Badge tone={STAGE_META[a.stage]?.tone}>{pretty(a.stage)}</Badge>
                    {a.converted_employee_code && <Badge tone="emerald">{a.converted_employee_code}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {(data.interviews || []).length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <SectionTitle title="Interview history" description="Scheduled and completed conversations." />
              </div>
              <div className="divide-y divide-slate-50">
                {data.interviews.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                      <CalendarClock size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink-800">
                        {pretty(i.interview_type)} interview · {i.job_title}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-slate-500">
                        {fmtDateTime(i.scheduled_at)} · {i.interviewer_name || 'Interviewer not assigned'}
                      </p>
                    </div>
                    <Badge tone={INTERVIEW_STATUS_TONE[i.status]}>{pretty(i.status)}</Badge>
                    {i.recommendation && <Badge tone={RECOMMENDATION_TONE[i.recommendation]}>{pretty(i.recommendation)}</Badge>}
                    {i.overall_rating && <span className="text-[12px] font-semibold text-amber-600">{i.overall_rating}/5</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle title="Resume" />
            {c.resume_file ? (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-rose-500 shadow-sm">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-ink-800">{c.resume_original_name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">Secure file · authenticated download only</p>
                  </div>
                </div>
                <Button className="mt-3 w-full" variant="secondary" icon={Download} onClick={download}>Download resume</Button>
              </div>
            ) : (
              <p className="mt-4 text-[12.5px] text-slate-400">No resume has been uploaded. Add one from the candidates page.</p>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle title="Record" />
            <div className="mt-4 space-y-3 text-[12.5px]">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Added</span><span className="font-semibold text-ink-700">{fmtDate(c.created_at)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Last updated</span><span className="font-semibold text-ink-700">{fmtDate(c.updated_at)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Applications</span><span className="font-semibold text-ink-700">{c.application_count}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Added by</span><span className="font-semibold text-ink-700">{c.created_by_name || 'System'}</span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
