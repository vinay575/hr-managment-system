import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock3,
  KeyRound,
  LayoutGrid,
  List,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtDate, fmtDateRange, fmtMoney, fmtTime } from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Pagination,
  Progress,
  SearchInput,
  Select,
  StatCard,
  Tabs,
  TONE,
  capitalize,
} from '../components/ui';

const STATUSES = ['active', 'probation', 'on-leave', 'inactive'];
const EMP_TYPES = ['full-time', 'part-time', 'contract', 'intern'];
const COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'teal', 'orange'];

const emptyForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  gender: 'other',
  date_of_birth: '',
  address: '',
  city: '',
  country: 'United States',
  department_id: '',
  designation: '',
  employment_type: 'full-time',
  status: 'active',
  join_date: '',
  salary: '',
  avatar_color: 'indigo',
  bio: '',
  create_login: false,
  password: '',
  role: 'employee',
};

export default function Employees() {
  const { can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ data: [], pagination: null, stats: null });
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [profileId, setProfileId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 9, sort });
      if (search.trim()) params.set('search', search.trim());
      if (department) params.set('department', department);
      if (status) params.set('status', status);
      const res = await api.get(`/employees?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, sort, search, department, status, toast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 320 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    api.get('/departments').then((d) => setDepartments(d.data || [])).catch(() => {});
  }, []);

  const resetFilters = () => {
    setSearch('');
    setDepartment('');
    setStatus('');
    setSort('newest');
    setPage(1);
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (emp) => {
    setEditing(emp);
    setFormOpen(true);
  };

  const remove = async () => {
    try {
      await api.del(`/employees/${deleting.id}`);
      toast.success(`${deleting.first_name} ${deleting.last_name} was removed.`);
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const stats = data.stats || {};
  const filtered = search || department || status;
  const manager = can('employees.manage');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">People directory</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Your team, all in one place</h1>
          <p className="mt-1 text-[13px] text-slate-500">Find anyone, keep records tidy, and make every new hire feel at home.</p>
        </div>
        {manager && (
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            Add employee
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total people" value={stats.total ?? 0} sub="Across all departments" icon={Users} tone="indigo" />
        <StatCard label="Active" value={stats.active ?? 0} sub="Currently working" icon={UserCheck} tone="emerald" />
        <StatCard label="On leave" value={stats.on_leave ?? 0} sub={`${stats.probation ?? 0} on probation`} icon={UserMinus} tone="amber" />
        <StatCard label="New this month" value={stats.new_this_month ?? 0} sub="Recently onboarded" icon={UserPlus} tone="violet" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, role, email or ID…" className="flex-1" />
          <div className="flex flex-wrap items-center gap-2.5">
            <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} className="input w-auto min-w-[150px] py-2.5 text-[13px]">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input w-auto min-w-[120px] py-2.5 text-[13px]">
              <option value="">Any status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{capitalize(s)}</option>)}
            </select>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="input w-auto min-w-[130px] py-2.5 text-[13px]">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
            <div className="ml-auto flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button onClick={() => setView('grid')} className={clsx('grid h-8 w-8 place-items-center rounded-lg transition', view === 'grid' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-400 hover:text-ink-700')} title="Grid view">
                <LayoutGrid size={15} />
              </button>
              <button onClick={() => setView('table')} className={clsx('grid h-8 w-8 place-items-center rounded-lg transition', view === 'table' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-400 hover:text-ink-700')} title="Table view">
                <List size={15} />
              </button>
            </div>
          </div>
        </div>
        {filtered && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-[11px] font-medium text-slate-400">Active filters:</span>
            {search && <FilterChip label={`“${search}”`} onClear={() => { setSearch(''); setPage(1); }} />}
            {department && <FilterChip label={departments.find((d) => String(d.id) === department)?.name} onClear={() => setDepartment('')} />}
            {status && <FilterChip label={capitalize(status)} onClear={() => setStatus('')} />}
            <button onClick={resetFilters} className="text-[11px] font-semibold text-brand-600 hover:text-brand-700">Clear all</button>
          </div>
        )}
      </Card>

      {loading ? (
        <LoadingBlock label="Loading your team…" />
      ) : data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={filtered ? 'No one matches those filters' : 'Your team starts here'}
            description={filtered ? 'Try a different search, department or status.' : 'Add your first employee to start building your people directory.'}
            action={filtered ? <Button onClick={resetFilters}>Clear filters</Button> : manager ? <Button variant="primary" icon={Plus} onClick={openAdd}>Add your first employee</Button> : null}
          />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.data.map((emp) => (
            <GridView
              key={emp.id}
              emp={emp}
              manager={manager}
              onView={() => setProfileId(emp.id)}
              onEdit={() => openEdit(emp)}
              onDelete={() => setDeleting(emp)}
            />
          ))}
        </div>
      ) : (
        <TableView data={data.data} manager={manager} onView={setProfileId} onEdit={openEdit} onDelete={setDeleting} />
      )}

      {data.pagination && (
        <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />
      )}

      <EmployeeForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        departments={departments}
        onSaved={() => { setFormOpen(false); load(); }}
      />

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Remove employee"
        subtitle="This permanently deletes their records."
        icon={Trash2}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} icon={Trash2}>Remove employee</Button>
          </>
        }
      >
        {deleting && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <Avatar name={`${deleting.first_name} ${deleting.last_name}`} color={deleting.avatar_color} size="md" />
            <div>
              <p className="text-sm font-semibold text-ink-900">{deleting.first_name} {deleting.last_name}</p>
              <p className="text-xs text-slate-500">{deleting.designation} · {deleting.department_name}</p>
            </div>
          </div>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
          This will remove <strong className="text-ink-700">attendance, leave and payroll history</strong> for this person. This action cannot be undone.
        </p>
      </Modal>

      {profileId && <ProfileModal id={profileId} onClose={() => setProfileId(null)} onEdit={(emp) => { setProfileId(null); openEdit(emp); }} manager={manager} />}
    </div>
  );
}

function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
      {label}
      <button onClick={onClear} className="text-brand-400 hover:text-brand-700">×</button>
    </span>
  );
}

function GridView({ emp, manager, onView, onEdit, onDelete }) {
  return (
    <Card hover className="group relative flex flex-col p-5">
      <div className="flex items-start justify-between">
        <Avatar name={`${emp.first_name} ${emp.last_name}`} color={emp.avatar_color} size="lg" />
        <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          {manager && (
            <>
              <button onClick={onEdit} className="icon-btn h-8 w-8 bg-slate-50" title="Edit employee"><Pencil size={14} /></button>
              <button onClick={onDelete} className="icon-btn h-8 w-8 bg-slate-50 hover:bg-rose-50 hover:text-rose-600" title="Remove employee"><Trash2 size={14} /></button>
            </>
          )}
        </div>
      </div>
      <button onClick={onView} className="mt-3.5 text-left">
        <h3 className="font-display text-[16px] font-bold tracking-tight text-ink-900 group-hover:text-brand-700">{emp.first_name} {emp.last_name}</h3>
        <p className="mt-0.5 text-[12px] text-slate-500">{emp.designation}</p>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={emp.department_color || 'indigo'} dot={false}>{emp.department_name || 'Unassigned'}</Badge>
        <Badge status={emp.status}>{capitalize(emp.status)}</Badge>
      </div>
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-[12px]">
        <p className="flex items-center gap-2 text-slate-500"><Mail size={13} className="text-slate-300" /><span className="truncate">{emp.email}</span></p>
        <p className="flex items-center gap-2 text-slate-500"><Phone size={13} className="text-slate-300" />{emp.phone || '—'}</p>
        <p className="flex items-center gap-2 text-slate-500"><CalendarDays size={13} className="text-slate-300" />Joined {fmtDate(emp.join_date, { month: 'short', year: 'numeric' })}</p>
      </div>
      <button onClick={onView} className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-[11.5px] font-semibold text-ink-600 transition group-hover:bg-brand-50 group-hover:text-brand-700">
        <span>View profile</span>
        <ArrowUpRight size={14} />
      </button>
    </Card>
  );
}

function TableView({ data, manager, onView, onEdit, onDelete }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className="table-head">Employee</th>
              <th className="table-head">Employee ID</th>
              <th className="table-head">Department</th>
              <th className="table-head">Type</th>
              <th className="table-head">Joined</th>
              <th className="table-head">Status</th>
              <th className="table-head text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((emp) => (
              <tr key={emp.id} className="group transition hover:bg-slate-50/60">
                <td className="table-cell">
                  <button onClick={() => onView(emp.id)} className="flex items-center gap-3 text-left">
                    <Avatar name={`${emp.first_name} ${emp.last_name}`} color={emp.avatar_color} size="sm" />
                    <div>
                      <p className="text-[13px] font-semibold text-ink-900 group-hover:text-brand-700">{emp.first_name} {emp.last_name}</p>
                      <p className="text-[11px] text-slate-400">{emp.designation}</p>
                    </div>
                  </button>
                </td>
                <td className="table-cell font-mono text-[11.5px] text-slate-500">{emp.employee_code}</td>
                <td className="table-cell"><Badge tone={emp.department_color || 'indigo'} dot={false}>{emp.department_name || '—'}</Badge></td>
                <td className="table-cell capitalize">{emp.employment_type}</td>
                <td className="table-cell">{fmtDate(emp.join_date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="table-cell"><Badge status={emp.status}>{capitalize(emp.status)}</Badge></td>
                <td className="table-cell">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onView(emp.id)} className="icon-btn h-8 w-8" title="View"><ArrowUpRight size={15} /></button>
                    {manager && (
                      <>
                        <button onClick={() => onEdit(emp)} className="icon-btn h-8 w-8" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => onDelete(emp)} className="icon-btn h-8 w-8 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Add / edit employee                                                */
/* ------------------------------------------------------------------ */
function EmployeeForm({ open, onClose, editing, departments, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editing) {
      setForm({
        ...emptyForm,
        ...Object.fromEntries(Object.keys(emptyForm).map((k) => [k, editing[k] ?? emptyForm[k]])),
        salary: editing.salary ?? '',
        department_id: editing.department_id ?? '',
      });
    } else {
      setForm({ ...emptyForm, join_date: new Date().toISOString().slice(0, 10) });
    }
  }, [open, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!form.first_name || !form.last_name || !form.email || !form.designation || !form.join_date) {
        throw new Error('Please fill in name, email, role and start date.');
      }
      const payload = { ...form, salary: Number(form.salary) || 0, department_id: form.department_id ? Number(form.department_id) : null };
      if (editing) {
        await api.put(`/employees/${editing.id}`, payload);
        toast.success('Employee details updated.');
      } else {
        await api.post('/employees', payload);
        toast.success('Employee added to your team.');
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit employee' : 'Add a new employee'}
      subtitle={editing ? `Update ${editing.first_name}’s details.` : 'Create a complete employee record in one go.'}
      icon={editing ? Pencil : UserPlus}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} icon={editing ? undefined : Plus}>
            {editing ? 'Save changes' : 'Add employee'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-6">
        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-[12.5px] font-medium text-rose-600">{error}</div>}

        <div>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Personal information</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="First name" required value={form.first_name} onChange={set('first_name')} placeholder="Sarah" />
            <Input label="Last name" required value={form.last_name} onChange={set('last_name')} placeholder="Chen" />
            <Input label="Work email" type="email" required icon={Mail} value={form.email} onChange={set('email')} placeholder="sarah@aurorahr.com" />
            <Input label="Phone" icon={Phone} value={form.phone} onChange={set('phone')} placeholder="+1 (415) 555-0100" />
            <Select label="Gender" value={form.gender} onChange={set('gender')}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
            <Input label="Date of birth" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
            <Input label="City" value={form.city} onChange={set('city')} placeholder="San Francisco" />
            <Input label="Country" value={form.country} onChange={set('country')} />
            <Input label="Address" wrapperClass="sm:col-span-2" value={form.address} onChange={set('address')} placeholder="123 Market Street" />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Role & employment</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Department" value={form.department_id} onChange={set('department_id')}>
              <option value="">Unassigned</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Input label="Job title" required value={form.designation} onChange={set('designation')} placeholder="Product Designer" />
            <Select label="Employment type" value={form.employment_type} onChange={set('employment_type')}>
              {EMP_TYPES.map((t) => <option key={t} value={t}>{capitalize(t)}</option>)}
            </Select>
            <Select label="Status" value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{capitalize(s)}</option>)}
            </Select>
            <Input label="Start date" type="date" required value={form.join_date} onChange={set('join_date')} />
            <Input label="Annual salary (USD)" type="number" min="0" step="1000" value={form.salary} onChange={set('salary')} placeholder="95000" />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">About & avatar</h3>
          <Field label="Short bio">
            <textarea className="input min-h-[84px] resize-y" value={form.bio} onChange={set('bio')} placeholder="A sentence or two about this person…" />
          </Field>
          <div className="mt-4">
            <p className="label">Avatar colour</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, avatar_color: c }))}
                  className={clsx('h-8 w-8 rounded-full bg-gradient-to-br transition', TONE[c].grad, form.avatar_color === c ? 'ring-2 ring-ink-900 ring-offset-2' : 'opacity-70 hover:opacity-100')}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        {!editing && (
          <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-600 text-white shadow-sm">
                  <KeyRound size={15} />
                </div>
                <div>
                  <h3 className="text-[12.5px] font-bold text-ink-900">Create workspace login</h3>
                  <p className="text-[11px] text-slate-500">Allow this employee to sign in with email and password</p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={Boolean(form.create_login)}
                  onChange={(e) => setForm((f) => ({ ...f, create_login: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
              </label>
            </div>

            {form.create_login && (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-violet-100/80 pt-3.5 sm:grid-cols-2">
                <div>
                  <Input
                    label="Temporary password"
                    type="password"
                    icon={Lock}
                    required={form.create_login}
                    value={form.password}
                    onChange={set('password')}
                    placeholder="Min. 8 characters"
                  />
                </div>
                <div>
                  <Field label="Workspace role">
                    <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold text-ink-800">
                      Employee (Self-service only)
                    </div>
                  </Field>
                </div>
                <p className="text-[11px] text-slate-500 sm:col-span-2">
                  Login will use their work email: <strong className="text-ink-800">{form.email || '—'}</strong>.
                </p>
              </div>
            )}
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile drawer                                                     */
/* ------------------------------------------------------------------ */
function ProfileModal({ id, onClose, onEdit, manager }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/employees/${id}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const emp = data?.employee;
  const att = data?.attendanceStats;

  return (
    <Modal open onClose={onClose} size="xl" title={emp ? `${emp.first_name} ${emp.last_name}` : 'Employee profile'} subtitle={emp ? `${emp.designation} · ${emp.department_name || 'Unassigned'}` : 'Loading…'} icon={Users}
      footer={manager && emp ? <Button variant="primary" icon={Pencil} onClick={() => onEdit(emp)}>Edit employee</Button> : null}
    >
      {loading || !emp ? (
        <LoadingBlock label="Loading profile…" className="py-16" />
      ) : (
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 p-5 text-white">
            <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-brand-500/30 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-4">
              <Avatar name={`${emp.first_name} ${emp.last_name}`} color={emp.avatar_color} size="xl" ring />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-xl font-bold">{emp.first_name} {emp.last_name}</h3>
                  <Badge status={emp.status}>{capitalize(emp.status)}</Badge>
                </div>
                <p className="mt-1 text-[12.5px] text-white/60">{emp.designation} · {emp.department_name || 'Unassigned'}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50">
                  <span className="flex items-center gap-1.5"><Mail size={12} /> {emp.email}</span>
                  <span className="flex items-center gap-1.5"><Phone size={12} /> {emp.phone || '—'}</span>
                  <span className="flex items-center gap-1.5"><MapPin size={12} /> {emp.city || '—'}, {emp.country}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Employee ID</p>
                <p className="font-mono text-[12px] font-semibold text-white/80">{emp.employee_code}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Attendance', value: `${att.attended}/${att.days}`, sub: 'days this month', icon: Clock3, tone: 'text-emerald-600 bg-emerald-50' },
              { label: 'Avg. hours', value: `${att.avg_hours}h`, sub: 'per working day', icon: BriefcaseBusiness, tone: 'text-brand-600 bg-brand-50' },
              { label: 'Annual salary', value: fmtMoney(emp.salary, true), sub: emp.employment_type, icon: Wallet, tone: 'text-violet-600 bg-violet-50' },
              { label: 'Tenure', value: `${Math.max(0, Math.floor((new Date() - new Date(emp.join_date)) / 31557600000))}y`, sub: `since ${fmtDate(emp.join_date, { month: 'short', year: 'numeric' })}`, icon: CalendarDays, tone: 'text-amber-600 bg-amber-50' },
            ].map((x) => (
              <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <div className={clsx('mb-2 grid h-8 w-8 place-items-center rounded-lg', x.tone)}><x.icon size={15} /></div>
                <p className="font-display text-[15px] font-bold text-ink-900">{x.value}</p>
                <p className="text-[10.5px] text-slate-400">{x.label} · {x.sub}</p>
              </div>
            ))}
          </div>

          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { key: 'overview', label: 'Overview' },
              { key: 'attendance', label: 'Attendance', count: data.attendance.length },
              { key: 'leaves', label: 'Leave', count: data.leaves.length },
              { key: 'payroll', label: 'Payroll', count: data.payroll.length },
            ]}
          />

          {tab === 'overview' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-3.5 rounded-xl border border-slate-100 p-4">
                <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Details</h4>
                {[
                  ['Department', emp.department_name || 'Unassigned'],
                  ['Employment', capitalize(emp.employment_type)],
                  ['Joined', fmtDate(emp.join_date)],
                  ['Date of birth', fmtDate(emp.date_of_birth)],
                  ['Gender', capitalize(emp.gender)],
                  ['Address', [emp.address, emp.city, emp.country].filter(Boolean).join(', ') || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 text-[12.5px]">
                    <span className="text-slate-400">{k}</span>
                    <span className="text-right font-medium text-ink-700">{v}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-100 p-4">
                <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-400">About</h4>
                <p className="mt-3 text-[13px] leading-relaxed text-slate-500">{emp.bio || 'No bio added yet.'}</p>
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-[11.5px]">
                    <span className="font-medium text-slate-500">Leave taken this year</span>
                    <span className="font-semibold text-ink-700">{(data.leaveTotals || []).reduce((a, b) => a + Number(b.days), 0)} days</span>
                  </div>
                  <Progress value={Math.min(100, ((data.leaveTotals || []).reduce((a, b) => a + Number(b.days), 0) / 24) * 100)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(data.leaveTotals || []).map((l) => <Badge key={l.type} tone="indigo" dot={false}>{capitalize(l.type)} · {l.days}d</Badge>)}
                </div>
              </div>
            </div>
          )}

          {tab === 'attendance' && (
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full">
                <thead className="bg-slate-50"><tr>
                  <th className="table-head">Date</th><th className="table-head">Check in</th><th className="table-head">Check out</th><th className="table-head">Hours</th><th className="table-head">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.attendance.length === 0 && <tr><td colSpan="5" className="px-5 py-8 text-center text-sm text-slate-400">No attendance recorded yet.</td></tr>}
                  {data.attendance.map((a) => (
                    <tr key={a.id}>
                      <td className="table-cell">{fmtDate(a.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="table-cell">{fmtTime(a.check_in)}</td>
                      <td className="table-cell">{fmtTime(a.check_out)}</td>
                      <td className="table-cell font-semibold text-ink-800">{a.work_hours ? `${a.work_hours}h` : '—'}</td>
                      <td className="table-cell"><Badge status={a.status}>{capitalize(a.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'leaves' && (
            <div className="space-y-2.5">
              {data.leaves.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No leave history.</p>}
              {data.leaves.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3.5">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><CalendarDays size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold capitalize text-ink-800">{l.type} leave</p>
                    <p className="text-[11px] text-slate-400">{fmtDateRange(l.start_date, l.end_date)} · {l.days}d</p>
                  </div>
                  <Badge status={l.status}>{l.status}</Badge>
                </div>
              ))}
            </div>
          )}

          {tab === 'payroll' && (
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full">
                <thead className="bg-slate-50"><tr>
                  <th className="table-head">Month</th><th className="table-head">Basic</th><th className="table-head">Allowances</th><th className="table-head">Deductions</th><th className="table-head">Net</th><th className="table-head">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.payroll.length === 0 && <tr><td colSpan="6" className="px-5 py-8 text-center text-sm text-slate-400">No payslips yet.</td></tr>}
                  {data.payroll.map((p) => (
                    <tr key={p.id}>
                      <td className="table-cell font-medium text-ink-800">{p.month}</td>
                      <td className="table-cell">{fmtMoney(p.basic)}</td>
                      <td className="table-cell text-emerald-600">+{fmtMoney(p.allowances)}</td>
                      <td className="table-cell text-rose-500">−{fmtMoney(p.deductions)}</td>
                      <td className="table-cell font-semibold text-ink-900">{fmtMoney(p.net_pay)}</td>
                      <td className="table-cell"><Badge status={p.status}>{p.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
