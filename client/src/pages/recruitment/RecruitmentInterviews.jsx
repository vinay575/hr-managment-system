import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Link2,
  MapPin,
  Plus,
  RefreshCw,
  Star,
  UserCheck,
  Video,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate, fmtTime } from '../../lib/api';
import {
  INTERVIEW_MODES,
  INTERVIEW_STATUS_TONE,
  INTERVIEW_TYPES,
  RECOMMENDATION_TONE,
  fmtDateTime,
  pretty,
} from '../../lib/recruitment';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  Pagination,
  SearchInput,
  Select,
  Tabs,
  Textarea,
} from '../../components/ui';

const emptyForm = {
  application_id: '',
  interviewer_id: '',
  scheduled_at: '',
  duration_minutes: 60,
  interview_type: 'technical',
  mode: 'online',
  meeting_link: '',
  location: '',
  notes: '',
};

const emptyFeedback = {
  technical_rating: '',
  communication_rating: '',
  problem_solving_rating: '',
  overall_rating: '',
  strengths: '',
  weaknesses: '',
  notes: '',
  recommendation: 'hire',
};

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function RecruitmentInterviews() {
  const { can } = useAuth();
  const toast = useToast();
  const manage = can('recruitment.interviews.manage');
  const canFeedback = can('recruitment.feedback.manage');
  const canViewFeedback = can('recruitment.feedback.view') || canFeedback;

  const [tab, setTab] = useState('list');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1, limit: 20 });

  const [applications, setApplications] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [feedback, setFeedback] = useState(emptyFeedback);
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  const [month, setMonth] = useState(startOfMonth(new Date()));

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    api
      .get(`/recruitment/interviews?${params}`)
      .then((d) => {
        setRows(d.data || []);
        setMeta({ total: d.total, pages: d.pages, limit: d.limit });
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadOptions = () => {
    Promise.all([
      api.get('/recruitment/interviews/interviewers').then((d) => setInterviewers(d.data || [])).catch(() => {}),
      api.get('/recruitment/applications?limit=100').then((d) => {
        setApplications((d.data || []).filter((a) => ['shortlisted', 'interview_scheduled', 'interview_completed'].includes(a.stage)));
      }).catch(() => {}),
    ]);
  };

  const openCreate = () => {
    if (!applications.length) loadOptions();
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (interview) => {
    setEditing(interview);
    setForm({
      application_id: interview.application_id,
      interviewer_id: interview.interviewer_id || '',
      scheduled_at: String(interview.scheduled_at).replace(' ', 'T').slice(0, 16),
      duration_minutes: interview.duration_minutes || 60,
      interview_type: interview.interview_type,
      mode: interview.mode,
      meeting_link: interview.meeting_link || '',
      location: interview.location || '',
      notes: interview.notes || '',
    });
    setFormOpen(true);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.application_id || !form.scheduled_at) return toast.error('Select a candidate application and a date/time.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        interviewer_id: form.interviewer_id || null,
        duration_minutes: Number(form.duration_minutes) || 60,
      };
      if (editing) {
        await api.put(`/recruitment/interviews/${editing.id}`, { ...payload, action: 'reschedule' });
        toast.success('Interview rescheduled.');
      } else {
        await api.post('/recruitment/interviews', payload);
        toast.success('Interview scheduled.');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.put(`/recruitment/interviews/${cancelTarget.id}`, { action: 'cancel' });
      toast.success('Interview cancelled.');
      setCancelTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openFeedback = async (interview) => {
    setFeedbackTarget(interview);
    setFeedback(emptyFeedback);
    try {
      const res = await api.get(`/recruitment/interviews/${interview.id}/feedback`);
      if (res.feedback) {
        setFeedback({
          technical_rating: res.feedback.technical_rating || '',
          communication_rating: res.feedback.communication_rating || '',
          problem_solving_rating: res.feedback.problem_solving_rating || '',
          overall_rating: res.feedback.overall_rating || '',
          strengths: res.feedback.strengths || '',
          weaknesses: res.feedback.weaknesses || '',
          notes: res.feedback.notes || '',
          recommendation: res.feedback.recommendation || 'hire',
        });
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const saveFeedback = async () => {
    if (!feedback.overall_rating) return toast.error('An overall rating is required.');
    setFeedbackSaving(true);
    try {
      await api.post(`/recruitment/interviews/${feedbackTarget.id}/feedback`, feedback);
      toast.success('Interview feedback saved.');
      setFeedbackTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFeedbackSaving(false);
    }
  };

  const calendarDays = useMemo(() => {
    const first = startOfMonth(month);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      return day;
    });
  }, [month]);

  const interviewsForDay = (day) =>
    rows.filter((i) => {
      const d = new Date(String(i.scheduled_at).replace(' ', 'T'));
      return sameDay(d, day);
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Recruitment</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Interviews</h1>
          <p className="mt-1 text-[13px] text-slate-500">Schedule conversations, assign interviewers and capture evaluations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
          {manage && <Button variant="primary" icon={Plus} onClick={openCreate}>Schedule interview</Button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { key: 'list', label: 'Interview list' },
            { key: 'calendar', label: 'Calendar' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search candidate or job…" className="w-56" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="min-w-[150px]">
            <option value="">All statuses</option>
            {['scheduled', 'rescheduled', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
          </Select>
        </div>
      </div>

      {tab === 'calendar' && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-ink-900">
              {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></Button>
              <Button size="sm" variant="secondary" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
              <Button size="icon" variant="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="bg-slate-50 px-2 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{d}</div>
            ))}
            {calendarDays.map((day) => {
              const inMonth = day.getMonth() === month.getMonth();
              const today = sameDay(day, new Date());
              const dayItems = interviewsForDay(day);
              return (
                <div key={day.toISOString()} className={`min-h-[96px] bg-white p-1.5 ${inMonth ? '' : 'opacity-40'}`}>
                  <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${today ? 'bg-brand-500 text-white' : 'text-slate-500'}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 2).map((i) => (
                      <button
                        key={i.id}
                        onClick={() => openEdit(i)}
                        className="block w-full truncate rounded-md bg-brand-50 px-1.5 py-1 text-left text-[10px] font-medium text-brand-700 hover:bg-brand-100"
                        title={`${i.candidate_name} · ${fmtDateTime(i.scheduled_at)}`}
                      >
                        {fmtTime(String(i.scheduled_at).slice(11, 16))} {i.candidate_name}
                      </button>
                    ))}
                    {dayItems.length > 2 && <p className="px-1 text-[9.5px] text-slate-400">+{dayItems.length - 2} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === 'list' && (
        <Card className="overflow-hidden">
          {loading ? (
            <LoadingBlock label="Loading interviews…" />
          ) : rows.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No interviews yet" description="Schedule an interview with a shortlisted candidate." action={manage && <Button variant="primary" icon={Plus} onClick={openCreate}>Schedule interview</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Schedule</th>
                    <th>Type / mode</th>
                    <th>Interviewer</th>
                    <th>Status</th>
                    <th>Feedback</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <p className="font-semibold text-ink-800">{i.candidate_name}</p>
                        <p className="mt-0.5 text-[11.5px] text-slate-400">{i.job_title}</p>
                      </td>
                      <td>
                        <p className="text-[12.5px] font-medium text-ink-700">{fmtDate(i.scheduled_at)}</p>
                        <p className="mt-0.5 text-[11.5px] text-slate-400">{fmtTime(String(i.scheduled_at).slice(11, 16))} · {i.duration_minutes} min</p>
                      </td>
                      <td>
                        <p className="text-[12.5px] text-slate-600">{pretty(i.interview_type)}</p>
                        <p className="mt-0.5 text-[11.5px] text-slate-400">{pretty(i.mode)}</p>
                      </td>
                      <td className="text-[12.5px] text-slate-600">{i.interviewer_name || <span className="text-slate-400">Unassigned</span>}</td>
                      <td><Badge tone={INTERVIEW_STATUS_TONE[i.status]}>{pretty(i.status)}</Badge></td>
                      <td>
                        {i.feedback_id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-semibold text-amber-600">{i.overall_rating}/5</span>
                            <Badge tone={RECOMMENDATION_TONE[i.recommendation]}>{pretty(i.recommendation)}</Badge>
                          </div>
                        ) : (
                          <span className="text-[11.5px] text-slate-400">Pending</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {manage && ['scheduled', 'rescheduled'].includes(i.status) && (
                            <>
                              <Button size="sm" variant="soft" onClick={() => openEdit(i)}>Reschedule</Button>
                              <Button size="icon" variant="ghost" onClick={() => setCancelTarget(i)} title="Cancel interview">
                                <XCircle size={15} className="text-rose-500" />
                              </Button>
                            </>
                          )}
                          {canFeedback && i.status !== 'cancelled' && (
                            <Button size="sm" variant="secondary" icon={ClipboardCheck} onClick={() => openFeedback(i)}>
                              {i.feedback_id ? 'Edit feedback' : 'Feedback'}
                            </Button>
                          )}
                          {!canFeedback && canViewFeedback && i.feedback_id && (
                            <Button size="sm" variant="ghost" onClick={() => openFeedback(i)}>View</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-5 pb-5">
            <Pagination page={page} pages={meta.pages} total={meta.total} limit={meta.limit} onChange={setPage} />
          </div>
        </Card>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Reschedule interview' : 'Schedule interview'}
        subtitle="Only shortlisted candidates can be scheduled."
        icon={CalendarClock}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>{editing ? 'Reschedule' : 'Schedule interview'}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Candidate application" required value={form.application_id} onChange={set('application_id')} wrapperClass="sm:col-span-2" disabled={Boolean(editing)}>
            <option value="">Select a shortlisted candidate</option>
            {applications.map((a) => <option key={a.id} value={a.id}>{a.candidate_name} · {a.job_title} · {pretty(a.stage)}</option>)}
          </Select>
          <Input label="Date & time" required type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
          <Input label="Duration (minutes)" type="number" min="15" step="15" value={form.duration_minutes} onChange={set('duration_minutes')} />
          <Select label="Interview type" value={form.interview_type} onChange={set('interview_type')}>
            {INTERVIEW_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
          </Select>
          <Select label="Interview mode" value={form.mode} onChange={set('mode')}>
            {INTERVIEW_MODES.map((m) => <option key={m} value={m}>{pretty(m)}</option>)}
          </Select>
          <Select label="Interviewer" value={form.interviewer_id} onChange={set('interviewer_id')}>
            <option value="">Unassigned</option>
            {interviewers.map((u) => <option key={u.id} value={u.id}>{u.name} · {pretty(u.role)}</option>)}
          </Select>
          {form.mode === 'online' ? (
            <Input label="Meeting link" value={form.meeting_link} onChange={set('meeting_link')} placeholder="https://meet.google.com/…" icon={Link2} />
          ) : (
            <Input label="Interview location" value={form.location} onChange={set('location')} placeholder="Room 4B, HQ" icon={MapPin} />
          )}
          <Textarea label="Internal notes" value={form.notes} onChange={set('notes')} wrapperClass="sm:col-span-2" placeholder="Anything the interviewer should know…" />
        </div>
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel interview"
        subtitle={cancelTarget ? `${cancelTarget.candidate_name} · ${fmtDateTime(cancelTarget.scheduled_at)}` : ''}
        icon={XCircle}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>Keep interview</Button>
            <Button variant="danger" onClick={cancel}>Cancel interview</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">The candidate stays in the pipeline and can be rescheduled later.</p>
      </Modal>

      <Modal
        open={Boolean(feedbackTarget)}
        onClose={() => setFeedbackTarget(null)}
        title="Interview evaluation"
        subtitle={feedbackTarget ? `${feedbackTarget.candidate_name} · ${feedbackTarget.job_title}` : ''}
        icon={Star}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFeedbackTarget(null)}>Close</Button>
            {canFeedback && <Button variant="primary" loading={feedbackSaving} onClick={saveFeedback}>Save feedback</Button>}
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['technical_rating', 'Technical skills'],
            ['communication_rating', 'Communication'],
            ['problem_solving_rating', 'Problem-solving'],
            ['overall_rating', 'Overall rating'],
          ].map(([key, label]) => (
            <Select key={key} label={label} required={key === 'overall_rating'} value={feedback[key]} onChange={(e) => setFeedback((f) => ({ ...f, [key]: e.target.value }))} disabled={!canFeedback}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
            </Select>
          ))}
          <Select label="Recommendation" value={feedback.recommendation} onChange={(e) => setFeedback((f) => ({ ...f, recommendation: e.target.value }))} disabled={!canFeedback}>
            {['strong_hire', 'hire', 'hold', 'reject'].map((r) => <option key={r} value={r}>{pretty(r)}</option>)}
          </Select>
          <Textarea label="Strengths" value={feedback.strengths} onChange={(e) => setFeedback((f) => ({ ...f, strengths: e.target.value }))} disabled={!canFeedback} wrapperClass="sm:col-span-2" />
          <Textarea label="Weaknesses" value={feedback.weaknesses} onChange={(e) => setFeedback((f) => ({ ...f, weaknesses: e.target.value }))} disabled={!canFeedback} wrapperClass="sm:col-span-2" />
          <Textarea label="Interview notes" value={feedback.notes} onChange={(e) => setFeedback((f) => ({ ...f, notes: e.target.value }))} disabled={!canFeedback} wrapperClass="sm:col-span-2" />
        </div>
      </Modal>
    </div>
  );
}
