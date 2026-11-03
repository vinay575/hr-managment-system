import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Plus,
  Settings2,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { api, fmtMoney } from '../lib/api';
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
  Select,
  StatCard,
  TONE,
} from '../components/ui';

const COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'teal', 'orange'];

export default function Departments() {
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can('departments.manage');
  const canViewPay = can('payroll.view_all');
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/departments');
      setDepartments(res.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const totalMembers = departments.reduce((a, d) => a + Number(d.employee_count), 0);
  const avgSize = departments.length ? Math.round(totalMembers / departments.length) : 0;

  const remove = async () => {
    try {
      await api.del(`/departments/${deleting.id}`);
      toast.success('Department deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Organisation</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Teams & departments</h1>
          <p className="mt-1 text-[13px] text-slate-500">See how your organisation is shaped and who leads each team.</p>
        </div>
        {canManage && <Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>Add department</Button>}
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Departments" value={departments.length} sub="Across the organisation" icon={Building2} tone="indigo" />
        <StatCard label="Total members" value={totalMembers} sub="Active employees" icon={Users} tone="emerald" />
        <StatCard label="Avg. team size" value={avgSize} sub="People per department" icon={UserRound} tone="violet" />
        {canViewPay ? (
          <StatCard label="Avg. compensation" value={fmtMoney(departments.reduce((a, d) => a + Number(d.avg_salary), 0) / (departments.length || 1), true)} sub="Annual per person" icon={Wallet} tone="amber" />
        ) : (
          <StatCard label="Largest team" value={Math.max(0, ...departments.map((d) => Number(d.employee_count)))} sub="People in one department" icon={Users} tone="amber" />
        )}
      </div>

      {loading ? (
        <LoadingBlock label="Loading departments…" />
      ) : departments.length === 0 ? (
        <Card><EmptyState icon={Building2} title="No departments yet" description="Create your first department to start organising your team." action={canManage ? <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Add department</Button> : null} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => {
            const tone = TONE[d.color] || TONE.indigo;
            return (
              <Card key={d.id} hover className="group relative overflow-hidden">
                <div className={clsx('h-1.5 w-full bg-gradient-to-r', tone.grad)} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className={clsx('grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', tone.grad)}>
                      <Building2 size={19} />
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button onClick={() => { setEditing(d); setFormOpen(true); }} className="icon-btn h-8 w-8 bg-slate-50" title="Edit"><Settings2 size={14} /></button>
                        <button onClick={() => setDeleting(d)} className="icon-btn h-8 w-8 bg-slate-50 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>

                  <button onClick={() => setDetailId(d.id)} className="mt-4 block text-left">
                    <h3 className="font-display text-[17px] font-bold tracking-tight text-ink-900 group-hover:text-brand-700">{d.name}</h3>
                    <p className="mt-1 line-clamp-2 min-h-[34px] text-[12px] leading-relaxed text-slate-500">{d.description || 'No description added yet.'}</p>
                  </button>

                  <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                    {d.head_name ? (
                      <>
                        <Avatar name={d.head_name} color={d.head_color || d.color} size="xs" />
                        <div className="min-w-0">
                          <p className="truncate text-[11.5px] font-semibold text-ink-800">{d.head_name}</p>
                          <p className="text-[10px] text-slate-400">Department head</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-[11.5px] text-slate-400"><UserRound size={14} /> No head assigned</div>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 pt-4">
                    <div className="pr-3">
                      <p className="font-display text-lg font-bold text-ink-900">{d.employee_count}</p>
                      <p className="text-[10.5px] text-slate-400">Team members</p>
                    </div>
                    {canViewPay && (
                      <div className="pl-3">
                        <p className="font-display text-lg font-bold text-ink-900">{fmtMoney(d.avg_salary, true)}</p>
                        <p className="text-[10.5px] text-slate-400">Avg. salary</p>
                      </div>
                    )}
                  </div>

                  <button onClick={() => setDetailId(d.id)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-[11.5px] font-semibold text-ink-600 transition hover:border-brand-200 hover:bg-brand-50/50 hover:text-brand-700">
                    View team <ArrowUpRight size={14} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <DepartmentForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} onSaved={() => { setFormOpen(false); load(); }} />

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete department"
        subtitle="Only empty departments can be removed."
        icon={Trash2}
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}
      >
        <p className="text-[13px] leading-relaxed text-slate-500">
          Are you sure you want to delete <strong className="text-ink-700">{deleting?.name}</strong>? If it still has members you’ll need to move them first.
        </p>
      </Modal>

      {detailId && <DepartmentDetail id={detailId} onClose={() => setDetailId(null)} onEdit={(d) => { setDetailId(null); setEditing(d); setFormOpen(true); }} />}
    </div>
  );
}

function DepartmentForm({ open, onClose, editing, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '', color: 'indigo', head_id: '' });
  const [options, setOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(editing ? { name: editing.name, description: editing.description || '', color: editing.color || 'indigo', head_id: editing.head_id || '' } : { name: '', description: '', color: 'indigo', head_id: '' });
    api.get('/employees/options').then((d) => setOptions(d.data || [])).catch(() => {});
  }, [open, editing]);

  const submit = async () => {
    if (!form.name.trim()) { setError('Department name is required.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, head_id: form.head_id ? Number(form.head_id) : null };
      if (editing) await api.put(`/departments/${editing.id}`, payload);
      else await api.post('/departments', payload);
      toast.success(editing ? 'Department updated.' : 'Department created.');
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
      title={editing ? 'Edit department' : 'Create a department'}
      subtitle={editing ? 'Keep your org structure up to date.' : 'Group your people into a new team.'}
      icon={Building2}
      size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Create department'}</Button></>}
    >
      <div className="space-y-4">
        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-[12.5px] font-medium text-rose-600">{error}</div>}
        <Input label="Department name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Engineering" />
        <Field label="Description">
          <textarea className="input min-h-[90px] resize-y" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this team do?" />
        </Field>
        <Select label="Department head" value={form.head_id} onChange={(e) => setForm((f) => ({ ...f, head_id: e.target.value }))}>
          <option value="">Not assigned</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.first_name} {o.last_name} — {o.designation}</option>)}
        </Select>
        <div>
          <p className="label">Accent colour</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))} className={clsx('h-8 w-8 rounded-full bg-gradient-to-br transition', TONE[c].grad, form.color === c ? 'ring-2 ring-ink-900 ring-offset-2' : 'opacity-70 hover:opacity-100')} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function DepartmentDetail({ id, onClose, onEdit }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/departments/${id}`).then(setData).catch(() => {}); }, [id]);

  const dept = data?.department;
  return (
    <Modal open onClose={onClose} size="lg" title={dept?.name || 'Department'} subtitle={dept ? `${data.members.length} team members` : 'Loading…'} icon={Building2}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{dept && <Button variant="primary" icon={Settings2} onClick={() => onEdit(dept)}>Edit department</Button>}</>}
    >
      {!data ? <LoadingBlock label="Loading team…" /> : (
        <div className="space-y-5">
          <p className="text-[13px] leading-relaxed text-slate-500">{dept.description || 'No description for this department yet.'}</p>
          {dept.head_name && (
            <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-brand-50 to-violet-50 p-3.5">
              <Avatar name={dept.head_name} color="brand" size="sm" />
              <div>
                <p className="text-[12.5px] font-semibold text-ink-800">{dept.head_name}</p>
                <p className="text-[11px] text-slate-500">Department head</p>
              </div>
              <Badge tone="indigo" dot={false} className="ml-auto">Lead</Badge>
            </div>
          )}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {data.members.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No members yet.</p>}
            {data.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={`${m.first_name} ${m.last_name}`} color={m.avatar_color} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-ink-800">{m.first_name} {m.last_name}</p>
                  <p className="truncate text-[11px] text-slate-400">{m.designation} · {m.email}</p>
                </div>
                <Badge status={m.status}>{m.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
