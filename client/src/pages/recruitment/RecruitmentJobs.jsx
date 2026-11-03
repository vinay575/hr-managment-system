import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  CalendarDays,
  Eye,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  JOB_STATUS_TONE,
  WORK_MODES,
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
  Textarea,
} from '../../components/ui';

const emptyForm = {
  title: '',
  department_id: '',
  employment_type: 'full-time',
  work_location: '',
  work_mode: 'on-site',
  experience_min: '',
  experience_max: '',
  salary_min: '',
  salary_max: '',
  vacancies: 1,
  description: '',
  responsibilities: '',
  qualifications: '',
  skills: '',
  application_deadline: '',
  status: 'draft',
};

export default function RecruitmentJobs() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const manage = can('recruitment.jobs.manage');

  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1, limit: 10 });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 10 });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (departmentId) params.set('department_id', departmentId);
    api
      .get(`/recruitment/jobs?${params}`)
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
  }, [page, status, departmentId]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (can('departments.view')) {
      api.get('/departments').then((d) => setDepartments(d.data || [])).catch(() => {});
    }
  }, [can]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (job) => {
    setEditing(job);
    setForm({
      ...emptyForm,
      ...Object.fromEntries(Object.keys(emptyForm).map((k) => [k, job[k] ?? emptyForm[k]])),
      department_id: job.department_id ?? '',
      application_deadline: job.application_deadline ? String(job.application_deadline).slice(0, 10) : '',
    });
    setModalOpen(true);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) return toast.error('Job title is required.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        department_id: form.department_id || null,
        experience_min: form.experience_min === '' ? 0 : Number(form.experience_min),
        experience_max: form.experience_max === '' ? null : Number(form.experience_max),
        salary_min: form.salary_min === '' ? null : Number(form.salary_min),
        salary_max: form.salary_max === '' ? null : Number(form.salary_max),
        vacancies: Number(form.vacancies) || 1,
        application_deadline: form.application_deadline || null,
      };
      if (editing) await api.put(`/recruitment/jobs/${editing.id}`, payload);
      else await api.post('/recruitment/jobs', payload);
      toast.success(editing ? 'Vacancy updated.' : 'Vacancy created.');
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (job, action) => {
    try {
      await api.patch(`/recruitment/jobs/${job.id}/status`, { action });
      toast.success(`Vacancy ${action === 'publish' ? 'published' : action === 'close' ? 'closed' : 'reopened'}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/recruitment/jobs/${deleteTarget.id}`);
      toast.success('Vacancy deleted.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const stats = useMemo(
    () => ({
      open: rows.filter((r) => r.status === 'open').length,
      draft: rows.filter((r) => r.status === 'draft').length,
      closed: rows.filter((r) => r.status === 'closed').length,
    }),
    [rows]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Recruitment</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Job vacancies</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {meta.total} vacancies · {stats.open} open on this page
          </p>
        </div>
        {manage && (
          <Button variant="primary" icon={Plus} onClick={openCreate}>
            Create vacancy
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_200px]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search title, code or location…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>{pretty(s)}</option>
            ))}
          </Select>
          <Select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingBlock label="Loading vacancies…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No vacancies found"
            description="Create a vacancy to start building your hiring pipeline."
            action={manage && <Button variant="primary" icon={Plus} onClick={openCreate}>Create vacancy</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Vacancy</th>
                  <th>Department</th>
                  <th>Type / mode</th>
                  <th>Openings</th>
                  <th>Applications</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <button onClick={() => navigate(`/recruitment/jobs/${job.id}`)} className="text-left">
                        <p className="font-semibold text-ink-800 hover:text-brand-600">{job.title}</p>
                        <p className="mt-0.5 text-[11.5px] text-slate-400">{job.job_code}</p>
                      </button>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <Building2 size={14} className="text-slate-400" />
                        {job.department_name || 'Unassigned'}
                      </span>
                    </td>
                    <td className="text-slate-600">
                      {pretty(job.employment_type)}
                      <span className="mx-1 text-slate-300">·</span>
                      {pretty(job.work_mode)}
                    </td>
                    <td className="font-semibold text-ink-700">{job.vacancies}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <Users size={14} className="text-slate-400" />
                        {job.application_count}
                      </span>
                    </td>
                    <td className="text-slate-600">{job.application_deadline ? fmtDate(job.application_deadline) : '—'}</td>
                    <td><Badge tone={JOB_STATUS_TONE[job.status]}>{pretty(job.status)}</Badge></td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="icon" variant="ghost" onClick={() => navigate(`/recruitment/jobs/${job.id}`)} title="View details">
                          <Eye size={15} />
                        </Button>
                        {manage && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(job)} title="Edit vacancy">
                              <Pencil size={15} />
                            </Button>
                            {job.status === 'draft' && (
                              <Button size="sm" variant="soft" onClick={() => changeStatus(job, 'publish')}>Publish</Button>
                            )}
                            {job.status === 'open' && (
                              <Button size="sm" variant="secondary" onClick={() => changeStatus(job, 'close')}>Close</Button>
                            )}
                            {job.status === 'closed' && (
                              <Button size="sm" variant="soft" onClick={() => changeStatus(job, 'reopen')}>Reopen</Button>
                            )}
                            {job.status === 'draft' && Number(job.application_count) === 0 && (
                              <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(job)} title="Delete vacancy">
                                <Trash2 size={15} className="text-rose-500" />
                              </Button>
                            )}
                          </>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit vacancy' : 'Create vacancy'}
        subtitle="Vacancy details appear to everyone with recruitment access."
        icon={Briefcase}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>{editing ? 'Save changes' : 'Create vacancy'}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Job title" required value={form.title} onChange={set('title')} placeholder="Senior Product Designer" wrapperClass="sm:col-span-2" />
          <Select label="Department" value={form.department_id} onChange={set('department_id')}>
            <option value="">Unassigned</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select label="Employment type" value={form.employment_type} onChange={set('employment_type')}>
            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
          </Select>
          <Input label="Work location" value={form.work_location} onChange={set('work_location')} placeholder="New York, NY" icon={MapPin} />
          <Select label="Work mode" value={form.work_mode} onChange={set('work_mode')}>
            {WORK_MODES.map((m) => <option key={m} value={m}>{pretty(m)}</option>)}
          </Select>
          <Input label="Minimum experience (years)" type="number" min="0" step="0.5" value={form.experience_min} onChange={set('experience_min')} />
          <Input label="Maximum experience (years)" type="number" min="0" step="0.5" value={form.experience_max} onChange={set('experience_max')} />
          <Input label="Minimum salary" type="number" min="0" value={form.salary_min} onChange={set('salary_min')} />
          <Input label="Maximum salary" type="number" min="0" value={form.salary_max} onChange={set('salary_max')} />
          <Input label="Number of vacancies" type="number" min="1" value={form.vacancies} onChange={set('vacancies')} />
          <Input label="Application deadline" type="date" value={form.application_deadline} onChange={set('application_deadline')} icon={CalendarDays} />
          <Select label="Status" value={form.status} onChange={set('status')}>
            {JOB_STATUSES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
          </Select>
          <Textarea label="Job description" value={form.description} onChange={set('description')} className="min-h-[110px]" />
          <Textarea label="Responsibilities" value={form.responsibilities} onChange={set('responsibilities')} className="min-h-[110px]" />
          <Textarea label="Required qualifications" value={form.qualifications} onChange={set('qualifications')} className="min-h-[110px]" />
          <Textarea label="Required skills" value={form.skills} onChange={set('skills')} className="min-h-[110px]" hint="Comma-separated skills, e.g. Figma, React, SQL" />
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete vacancy"
        subtitle="This only works for draft vacancies without applications."
        icon={Trash2}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete vacancy</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold text-ink-900">{deleteTarget?.title}</span>? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
