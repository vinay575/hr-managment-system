import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  FileSignature,
  Plus,
  Search,
  Send,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate, fmtMoney } from '../../lib/api';
import { OFFER_STATUSES, OFFER_STATUS_TONE, pretty } from '../../lib/recruitment';
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
  application_id: '',
  job_title: '',
  department_id: '',
  annual_salary: '',
  salary_structure: '',
  joining_date: '',
  probation_months: 3,
  employment_type: 'full-time',
  expiry_date: '',
  terms: 'This offer is subject to successful background verification and acceptance of Aurora Labs company policies.',
};

export default function RecruitmentOffers() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const manage = can('recruitment.offers.manage');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1, limit: 10 });

  const [applications, setApplications] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 10 });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    api
      .get(`/recruitment/offers?${params}`)
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

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
    api
      .get('/recruitment/applications?limit=100')
      .then((d) => setApplications((d.data || []).filter((a) => ['selected', 'offer_sent'].includes(a.stage))))
      .catch((err) => toast.error(err.message));
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickApplication = (id) => {
    const app = applications.find((a) => String(a.id) === String(id));
    setForm((f) => ({
      ...f,
      application_id: id,
      job_title: app?.job_title || '',
      department_id: app?.department_id || '',
      employment_type: app?.employment_type || 'full-time',
    }));
  };

  const save = async () => {
    if (!form.application_id || !form.annual_salary || !form.joining_date)
      return toast.error('Application, annual salary and joining date are required.');
    setSaving(true);
    try {
      const res = await api.post('/recruitment/offers', {
        ...form,
        department_id: form.department_id || null,
        annual_salary: Number(form.annual_salary),
        probation_months: Number(form.probation_months) || 0,
      });
      toast.success('Offer letter created.');
      setModalOpen(false);
      navigate(`/recruitment/offers/${res.offer.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const action = async (offer, act, label) => {
    if (act === 'reject' && !window.confirm('Mark this offer as rejected? The application will be closed.')) return;
    try {
      await api.patch(`/recruitment/offers/${offer.id}/status`, { action: act });
      toast.success(label);
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
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Offers</h1>
          <p className="mt-1 text-[13px] text-slate-500">{meta.total} offer letters · generate, track and convert hires.</p>
        </div>
        {manage && <Button variant="primary" icon={Plus} onClick={openCreate}>Create offer</Button>}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search candidate, offer number or role…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {OFFER_STATUSES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingBlock label="Loading offers…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="No offers yet"
            description="Select a candidate and create their offer letter to get started."
            action={manage && <Button variant="primary" icon={Plus} onClick={openCreate}>Create offer</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Offer</th>
                  <th>Role</th>
                  <th>Annual salary</th>
                  <th>Joining</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button onClick={() => navigate(`/recruitment/offers/${o.id}`)} className="flex items-center gap-2.5 text-left">
                        <Avatar name={o.candidate_name} size="sm" />
                        <div>
                          <p className="font-semibold text-ink-800 hover:text-brand-600">{o.candidate_name}</p>
                          <p className="mt-0.5 text-[11.5px] text-slate-400">{o.candidate_email}</p>
                        </div>
                      </button>
                    </td>
                    <td className="text-[12px] font-medium text-slate-600">{o.offer_number}</td>
                    <td>
                      <p className="text-[12.5px] font-medium text-ink-700">{o.job_title}</p>
                      <p className="mt-0.5 text-[11.5px] text-slate-400">{o.department_name || 'Unassigned'}</p>
                    </td>
                    <td className="font-semibold text-ink-800">{fmtMoney(o.annual_salary)}</td>
                    <td className="text-slate-600">{fmtDate(o.joining_date)}</td>
                    <td className="text-slate-600">{o.expiry_date ? fmtDate(o.expiry_date) : '—'}</td>
                    <td><Badge tone={OFFER_STATUS_TONE[o.status]}>{pretty(o.status)}</Badge></td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="icon" variant="ghost" onClick={() => navigate(`/recruitment/offers/${o.id}`)} title="View offer">
                          <Eye size={15} />
                        </Button>
                        {manage && o.status === 'draft' && (
                          <Button size="sm" variant="soft" icon={Send} onClick={() => action(o, 'send', 'Offer marked as sent.')}>Send</Button>
                        )}
                        {manage && o.status === 'sent' && (
                          <>
                            <Button size="sm" variant="soft" icon={CheckCircle2} onClick={() => action(o, 'accept', 'Offer accepted.')}>Accept</Button>
                            <Button size="icon" variant="ghost" onClick={() => action(o, 'reject', 'Offer rejected.')} title="Reject offer">
                              <XCircle size={15} className="text-rose-500" />
                            </Button>
                          </>
                        )}
                        {manage && o.status === 'accepted' && o.application_stage === 'offer_sent' && (
                          <Button size="sm" variant="primary" icon={UserCheck} onClick={() => navigate(`/recruitment/offers/${o.id}`)}>Convert</Button>
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
        title="Create offer letter"
        subtitle="Only selected candidates can receive an offer."
        icon={FileSignature}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>Create offer</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Candidate application" required value={form.application_id} onChange={(e) => pickApplication(e.target.value)} wrapperClass="sm:col-span-2">
            <option value="">Select a selected candidate</option>
            {applications.map((a) => <option key={a.id} value={a.id}>{a.candidate_name} · {a.job_title} · {pretty(a.stage)}</option>)}
          </Select>
          <Input label="Job title" required value={form.job_title} onChange={set('job_title')} />
          <Input label="Department ID" value={form.department_id} onChange={set('department_id')} placeholder="Optional" />
          <Input label="Annual salary" required type="number" min="1" value={form.annual_salary} onChange={set('annual_salary')} />
          <Input label="Joining date" required type="date" value={form.joining_date} onChange={set('joining_date')} />
          <Input label="Probation period (months)" type="number" min="0" max="24" value={form.probation_months} onChange={set('probation_months')} />
          <Select label="Employment type" value={form.employment_type} onChange={set('employment_type')}>
            {['full-time', 'part-time', 'contract', 'intern'].map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
          </Select>
          <Input label="Offer expiry date" type="date" value={form.expiry_date} onChange={set('expiry_date')} />
          <Textarea label="Salary structure" value={form.salary_structure} onChange={set('salary_structure')} placeholder="Base, bonus, benefits…" wrapperClass="sm:col-span-2" />
          <Textarea label="Terms & conditions" value={form.terms} onChange={set('terms')} wrapperClass="sm:col-span-2" />
        </div>
      </Modal>
    </div>
  );
}
