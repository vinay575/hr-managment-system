import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Download,
  Eye,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { SOURCES, downloadFile, pretty, uploadFile } from '../../lib/recruitment';
import {
  Avatar,
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
  full_name: '',
  email: '',
  phone: '',
  alternate_phone: '',
  location: '',
  highest_qualification: '',
  total_experience: '',
  current_company: '',
  current_designation: '',
  expected_salary: '',
  notice_period: '',
  skills: '',
  linkedin_url: '',
  portfolio_url: '',
  source: 'direct',
  job_id: '',
};

export default function RecruitmentCandidates() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const manage = can('recruitment.candidates.manage');
  const canJobs = can('recruitment.jobs.view') || can('recruitment.jobs.manage');

  const [rows, setRows] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1, limit: 10 });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 10 });
    if (search) params.set('search', search);
    if (source) params.set('source', source);
    api
      .get(`/recruitment/candidates?${params}`)
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
  }, [page, source]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (canJobs) {
      api.get('/recruitment/jobs/options').then((d) => setJobs(d.data || [])).catch(() => {});
    }
  }, [canJobs]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFile(null);
    setModalOpen(true);
  };

  const openEdit = (candidate) => {
    setEditing(candidate);
    setForm({
      ...emptyForm,
      ...Object.fromEntries(Object.keys(emptyForm).map((k) => [k, candidate[k] ?? emptyForm[k]])),
      total_experience: candidate.total_experience ?? '',
      expected_salary: candidate.expected_salary ?? '',
      job_id: '',
    });
    setFile(null);
    setModalOpen(true);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.full_name.trim() || !form.email.trim()) return toast.error('Candidate name and email are required.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        total_experience: form.total_experience === '' ? 0 : Number(form.total_experience),
        expected_salary: form.expected_salary === '' ? null : Number(form.expected_salary),
      };
      let candidateId = editing?.id;
      if (editing) {
        delete payload.job_id;
        await api.put(`/recruitment/candidates/${editing.id}`, payload);
      } else {
        if (!payload.job_id) delete payload.job_id;
        const res = await api.post('/recruitment/candidates', payload);
        candidateId = res.candidate.id;
      }
      if (file && candidateId) await uploadFile(`/recruitment/candidates/${candidateId}/resume`, file);
      toast.success(editing ? 'Candidate updated.' : 'Candidate added.');
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const download = async (candidate) => {
    try {
      await downloadFile(`/recruitment/candidates/${candidate.id}/resume`, candidate.resume_original_name || 'resume.pdf');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/recruitment/candidates/${deleteTarget.id}`);
      toast.success('Candidate removed.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Recruitment</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Candidates</h1>
          <p className="mt-1 text-[13px] text-slate-500">{meta.total} candidates in your talent pool.</p>
        </div>
        {manage && (
          <Button variant="primary" icon={UserPlus} onClick={openCreate}>Add candidate</Button>
        )}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, phone or company…" />
          <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
            <option value="">All sources</option>
            {SOURCES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingBlock label="Loading candidates…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No candidates found"
            description="Add a candidate manually or register them against an open vacancy."
            action={manage && <Button variant="primary" icon={UserPlus} onClick={openCreate}>Add candidate</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Contact</th>
                  <th>Current role</th>
                  <th>Experience</th>
                  <th>Source</th>
                  <th>Applications</th>
                  <th>Resume</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button onClick={() => navigate(`/recruitment/candidates/${c.id}`)} className="flex items-center gap-2.5 text-left">
                        <Avatar name={c.full_name} size="sm" />
                        <div>
                          <p className="font-semibold text-ink-800 hover:text-brand-600">{c.full_name}</p>
                          <p className="mt-0.5 text-[11.5px] text-slate-400">{c.location || 'Location not set'}</p>
                        </div>
                      </button>
                    </td>
                    <td>
                      <p className="flex items-center gap-1.5 text-[12px] text-slate-600"><Mail size={13} className="text-slate-400" />{c.email}</p>
                      {c.phone && <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500"><Phone size={13} className="text-slate-400" />{c.phone}</p>}
                    </td>
                    <td>
                      <p className="text-[12.5px] font-medium text-ink-700">{c.current_designation || '—'}</p>
                      <p className="text-[11.5px] text-slate-400">{c.current_company || 'No company'}</p>
                    </td>
                    <td className="text-slate-600">{Number(c.total_experience) || 0} yrs</td>
                    <td><Badge tone="slate">{pretty(c.source)}</Badge></td>
                    <td className="font-semibold text-ink-700">{c.application_count}</td>
                    <td>
                      {c.resume_file ? (
                        <Button size="sm" variant="soft" icon={Download} onClick={() => download(c)}>Resume</Button>
                      ) : (
                        <span className="text-[11.5px] text-slate-400">Not uploaded</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="icon" variant="ghost" onClick={() => navigate(`/recruitment/candidates/${c.id}`)} title="View profile">
                          <Eye size={15} />
                        </Button>
                        {manage && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(c)} title="Edit candidate">
                              <Pencil size={15} />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(c)} title="Remove candidate">
                              <Trash2 size={15} className="text-rose-500" />
                            </Button>
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
        title={editing ? 'Edit candidate' : 'Add candidate'}
        subtitle={editing ? 'Update the candidate profile.' : 'Register a candidate and optionally add them to an open vacancy.'}
        icon={UserPlus}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>{editing ? 'Save changes' : 'Add candidate'}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" required value={form.full_name} onChange={set('full_name')} />
          <Input label="Email" required type="email" value={form.email} onChange={set('email')} icon={Mail} />
          <Input label="Phone" value={form.phone} onChange={set('phone')} icon={Phone} />
          <Input label="Alternate phone" value={form.alternate_phone} onChange={set('alternate_phone')} />
          <Input label="Location" value={form.location} onChange={set('location')} icon={MapPin} />
          <Input label="Highest qualification" value={form.highest_qualification} onChange={set('highest_qualification')} />
          <Input label="Total experience (years)" type="number" min="0" step="0.5" value={form.total_experience} onChange={set('total_experience')} />
          <Input label="Expected salary" type="number" min="0" value={form.expected_salary} onChange={set('expected_salary')} />
          <Input label="Current company" value={form.current_company} onChange={set('current_company')} />
          <Input label="Current designation" value={form.current_designation} onChange={set('current_designation')} />
          <Input label="Notice period" value={form.notice_period} onChange={set('notice_period')} placeholder="30 days" />
          <Select label="Candidate source" value={form.source} onChange={set('source')}>
            {SOURCES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
          </Select>
          <Input label="LinkedIn URL" value={form.linkedin_url} onChange={set('linkedin_url')} placeholder="https://linkedin.com/in/…" />
          <Input label="Portfolio URL" value={form.portfolio_url} onChange={set('portfolio_url')} placeholder="https://…" />
          <Textarea label="Skills" value={form.skills} onChange={set('skills')} hint="Comma-separated skills." />
          {!editing && (
            <Select label="Register for vacancy" value={form.job_id} onChange={set('job_id')} hint="Only open vacancies are available.">
              <option value="">Add to talent pool only</option>
              {jobs.filter((j) => j.status === 'open').map((j) => (
                <option key={j.id} value={j.id}>{j.title} · {j.department_name || 'Unassigned'}</option>
              ))}
            </Select>
          )}
          <div className="sm:col-span-2">
            <label className="label">Resume <span className="font-normal text-slate-400">(PDF, DOC or DOCX · max 5 MB)</span></label>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/30">
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-slate-600">
                <FileText size={16} className="shrink-0 text-slate-400" />
                <span className="truncate">{file ? file.name : editing?.resume_original_name || 'Choose a resume file'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-600"><Upload size={14} /> Browse</span>
              <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove candidate"
        subtitle="Candidates converted to employees cannot be removed."
        icon={Trash2}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Remove candidate</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove <span className="font-semibold text-ink-900">{deleteTarget?.full_name}</span> and their applications? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
