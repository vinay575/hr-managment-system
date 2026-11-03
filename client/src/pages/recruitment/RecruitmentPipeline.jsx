import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Clock3,
  FileText,
  GripVertical,
  History,
  Mail,
  MoveRight,
  RefreshCw,
  SlidersHorizontal,
  User,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { STAGES, STAGE_META, STAGE_TRANSITIONS, fmtDateTime, pretty } from '../../lib/recruitment';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Modal,
  Select,
  Textarea,
} from '../../components/ui';

export default function RecruitmentPipeline() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const manage = can('recruitment.candidates.manage');

  const [data, setData] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState('');

  const load = () => {
    setLoading(true);
    const qs = jobId ? `?job_id=${jobId}` : '';
    Promise.all([
      api.get(`/recruitment/applications/pipeline${qs}`),
      jobs.length ? Promise.resolve(null) : api.get('/recruitment/jobs/options').catch(() => ({ data: [] })),
    ])
      .then(([pipeline, jobData]) => {
        setData(pipeline);
        if (jobData) setJobs(jobData.data || []);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const move = async (application, stage) => {
    if (stage === 'rejected') {
      setRejectTarget(application);
      setReason('');
      return;
    }
    try {
      await api.patch(`/recruitment/applications/${application.id}/stage`, { stage });
      toast.success(`Moved to ${pretty(stage)}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const reject = async () => {
    if (!reason.trim()) return toast.error('A rejection reason is required.');
    setSaving(true);
    try {
      await api.patch(`/recruitment/applications/${rejectTarget.id}/stage`, {
        stage: 'rejected',
        rejection_reason: reason,
      });
      toast.success('Candidate rejected.');
      setRejectTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (application) => {
    setDetail({ application });
    setDetailLoading(true);
    try {
      const res = await api.get(`/recruitment/applications/${application.id}`);
      setDetail(res);
      setNotes(res.application.recruiter_notes || '');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const saveNotes = async () => {
    try {
      await api.patch(`/recruitment/applications/${detail.application.id}`, { recruiter_notes: notes });
      toast.success('Recruiter notes saved.');
      setDetail((d) => ({ ...d, application: { ...d.application, recruiter_notes: notes } }));
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const stages = data?.stages || STAGES.map((stage) => ({ stage, label: STAGE_META[stage].label, count: 0, applications: [] }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Recruitment</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Recruitment pipeline</h1>
          <p className="mt-1 text-[13px] text-slate-500">{data?.total ?? 0} applications across {stages.length} stages.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)} className="min-w-[220px]">
            <option value="">All vacancies</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
          <Button variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
          <Button variant="primary" icon={SlidersHorizontal} onClick={() => navigate('/recruitment/applications')}>List view</Button>
        </div>
      </div>

      {loading ? (
        <LoadingBlock label="Loading pipeline…" />
      ) : (
        <div className="-mx-1 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3 px-1">
            {stages.map((column) => {
              const meta = STAGE_META[column.stage];
              return (
                <div key={column.stage} className="flex w-[272px] shrink-0 flex-col rounded-2xl bg-slate-100/60 p-2.5">
                  <div className="flex items-center justify-between px-2 pb-2.5 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: meta?.bar }} />
                      <p className="text-[12px] font-bold text-ink-800">{meta?.label || column.label}</p>
                    </div>
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 shadow-sm">{column.count}</span>
                  </div>
                  <div className="min-h-[120px] space-y-2">
                    {column.applications.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 px-3 py-6 text-center text-[11px] text-slate-400">No candidates</div>
                    )}
                    {column.applications.map((app) => {
                      const transitions = STAGE_TRANSITIONS[app.stage] || [];
                      return (
                        <div key={app.id} className="group rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:border-brand-200 hover:shadow-md">
                          <div className="flex items-start gap-2.5">
                            <Avatar name={app.candidate_name} size="xs" />
                            <button onClick={() => navigate(`/recruitment/candidates/${app.candidate_id}`)} className="min-w-0 flex-1 text-left">
                              <p className="truncate text-[12.5px] font-semibold text-ink-800 hover:text-brand-600">{app.candidate_name}</p>
                              <p className="mt-0.5 truncate text-[10.5px] text-slate-500">{app.job_title}</p>
                            </button>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                            <span className="inline-flex items-center gap-1"><Clock3 size={10} />{fmtDate(app.stage_updated_at)}</span>
                            {app.source && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">{pretty(app.source)}</span>}
                            {app.converted_employee_code && <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-600">{app.converted_employee_code}</span>}
                          </div>
                          <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-50 pt-2.5">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => openDetail(app)}>
                              <History size={12} /> Details
                            </Button>
                            {manage && transitions.length > 0 && app.stage !== 'hired' && (
                              <select
                                className="ml-auto rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10.5px] font-semibold text-slate-600 outline-none transition hover:border-brand-300"
                                value=""
                                onChange={(e) => e.target.value && move(app, e.target.value)}
                              >
                                <option value="">Move to…</option>
                                {transitions.map((t) => <option key={t} value={t}>{STAGE_META[t]?.label || pretty(t)}</option>)}
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject candidate"
        subtitle={rejectTarget ? `${rejectTarget.candidate_name} · ${rejectTarget.job_title}` : ''}
        icon={XCircle}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={saving} onClick={reject}>Reject candidate</Button>
          </>
        }
      >
        <Textarea
          label="Rejection reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this candidate is not progressing…"
        />
      </Modal>

      <Modal
        open={Boolean(detail?.application)}
        onClose={() => setDetail(null)}
        title={detail?.application?.candidate_name || 'Application'}
        subtitle={detail?.application ? `${detail.application.job_title} · ${detail.application.job_code}` : ''}
        icon={User}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
            {manage && <Button variant="primary" onClick={saveNotes}>Save notes</Button>}
          </>
        }
      >
        {detailLoading ? (
          <LoadingBlock label="Loading application…" />
        ) : detail?.application ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
              <Badge tone={STAGE_META[detail.application.stage]?.tone}>{pretty(detail.application.stage)}</Badge>
              <span className="text-[12px] text-slate-500">{detail.application.candidate_email}</span>
              {detail.application.rejection_reason && <span className="text-[12px] text-rose-600">Reason: {detail.application.rejection_reason}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div className="rounded-xl border border-slate-100 px-3.5 py-3"><p className="text-slate-400">Applied</p><p className="mt-1 font-semibold text-ink-800">{fmtDate(detail.application.applied_at)}</p></div>
              <div className="rounded-xl border border-slate-100 px-3.5 py-3"><p className="text-slate-400">Experience</p><p className="mt-1 font-semibold text-ink-800">{Number(detail.application.total_experience) || 0} years</p></div>
            </div>
            <Textarea label="Recruiter notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this candidate…" />
            <div>
              <p className="label">Stage history</p>
              <div className="mt-2 space-y-2">
                {(detail.history || []).length === 0 && <p className="text-[12px] text-slate-400">No activity recorded yet.</p>}
                {(detail.history || []).map((h) => (
                  <div key={h.id} className="flex items-start gap-2.5 rounded-lg border border-slate-100 px-3 py-2.5">
                    <MoveRight size={14} className="mt-0.5 text-brand-500" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-ink-800">{pretty(h.action)}</p>
                      <p className="text-[10.5px] text-slate-400">{h.actor_name} · {fmtDateTime(h.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
