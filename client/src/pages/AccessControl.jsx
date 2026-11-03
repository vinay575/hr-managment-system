import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  KeyRound,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtDate } from '../lib/api';
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
  SearchInput,
  Select,
  SectionTitle,
  Tabs,
  TONE,
} from '../components/ui';

const ROLE_TONE = {
  super_admin: 'violet',
  ceo: 'indigo',
  administration: 'emerald',
  hr: 'sky',
  employee: 'amber',
};

const emptyUser = { name: '', email: '', password: '', role: 'employee', employee_id: '', avatar_color: 'indigo' };

export default function AccessControl() {
  const toast = useToast();
  const { user: me, can } = useAuth();
  const canManageRoles = can('roles.manage');
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState('');
  const [search, setSearch] = useState('');

  const [options, setOptions] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyUser);
  const [savingUser, setSavingUser] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState(null);

  const loadUsers = useCallback(async () => {
    const res = await api.get('/users');
    setUsers(res.data || []);
    setRoles(res.roles || []);
  }, []);

  const loadAccess = useCallback(async () => {
    if (!canManageRoles) return;
    try {
      const res = await api.get('/access');
      setRoles(res.roles || []);
      setPermissions(res.permissions || []);
      setMatrix(res.matrix || {});
    } catch {
      // HR does not have roles.manage
    }
  }, [canManageRoles]);

  useEffect(() => {
    Promise.all([
      loadUsers(),
      canManageRoles ? loadAccess() : Promise.resolve(),
      api.get('/employees/options').then((r) => setOptions(r.data || [])).catch(() => {})
    ])
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [loadUsers, loadAccess, canManageRoles, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.name, u.email, u.role_label, u.employee_name, u.department_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [users, search]);

  const modules = useMemo(() => {
    const map = new Map();
    for (const p of permissions) {
      if (!map.has(p.module)) map.set(p.module, []);
      map.get(p.module).push(p);
    }
    return [...map.entries()];
  }, [permissions]);

  const editableRoles = roles.filter((r) => r.key !== 'super_admin');

  const togglePermission = (role, key) => {
    setMatrix((prev) => {
      const current = prev[role] || [];
      return {
        ...prev,
        [role]: current.includes(key) ? current.filter((p) => p !== key) : [...current, key],
      };
    });
  };

  const saveRole = async (role) => {
    setSavingRole(role);
    try {
      const res = await api.put(`/access/${role}`, { permissions: matrix[role] || [] });
      setMatrix(res.matrix || matrix);
      toast.success(`${roles.find((r) => r.key === role)?.label || role} permissions saved.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingRole('');
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      await api.post('/users', {
        ...form,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
      });
      toast.success('User account created.');
      setFormOpen(false);
      setForm(emptyUser);
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const patchUser = async (u, patch) => {
    try {
      await api.patch(`/users/${u.id}`, patch);
      toast.success('User updated.');
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const resetPassword = async () => {
    try {
      await api.post(`/users/${resetFor.id}/reset-password`, { newPassword });
      toast.success(`Password reset for ${resetFor.name}.`);
      setResetFor(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeUser = async () => {
    try {
      await api.del(`/users/${deleting.id}`);
      toast.success('User account deleted.');
      setDeleting(null);
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <LoadingBlock label="Loading access control…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">System</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Access control</h1>
          <p className="mt-1 text-[13px] text-slate-500">Manage accounts, assign roles and fine-tune module permissions.</p>
        </div>
        <Button variant="primary" icon={UserPlus} onClick={() => { setForm(emptyUser); setFormOpen(true); }}>Add user</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {roles.map((r) => {
          const count = users.filter((u) => u.role === r.key).length;
          return (
            <Card key={r.key} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className={clsx('grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br text-white', (TONE[ROLE_TONE[r.key]] || TONE.indigo).grad)}>
                  <ShieldCheck size={16} />
                </div>
                <Badge tone={ROLE_TONE[r.key]} dot={false}>{count} user{count === 1 ? '' : 's'}</Badge>
              </div>
              <p className="mt-3 text-[13px] font-bold text-ink-900">{r.label}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{r.description}</p>
              <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                {(matrix[r.key] || []).length} permissions
              </p>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { key: 'users', label: 'Users', count: users.length },
              ...(canManageRoles ? [{ key: 'roles', label: 'Roles & permissions' }] : []),
            ]}
          />
          {tab === 'users' && (
            <SearchInput value={search} onChange={setSearch} placeholder="Search users, roles or departments…" className="lg:max-w-xs" />
          )}
        </div>
      </Card>

      {tab === 'users' ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <SectionTitle title="User accounts" description={`${filtered.length} of ${users.length} accounts`} />
            <span className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-600">
              <Users size={12} /> Workspace
            </span>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="No users found" description="Try a different search, or add a new user account." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead className="border-y border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-head">User</th>
                    <th className="table-head">Linked employee</th>
                    <th className="table-head">Role</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Last sign-in</th>
                    <th className="table-head text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((u) => (
                    <tr key={u.id} className="transition hover:bg-slate-50/60">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} color={u.avatar_color} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-ink-900">{u.name}{u.id === me?.id ? ' (you)' : ''}</p>
                            <p className="truncate text-[11px] text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        {u.employee_name ? (
                          <div>
                            <p className="text-[12.5px] font-medium text-ink-700">{u.employee_name}</p>
                            <p className="text-[11px] text-slate-400">{u.employee_code} · {u.department_name || 'No department'}</p>
                          </div>
                        ) : (
                          <span className="text-[11.5px] text-slate-400">Not linked</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <select
                          value={u.role}
                          onChange={(e) => patchUser(u, { role: e.target.value })}
                          disabled={u.id === me?.id}
                          className="input w-auto min-w-[140px] py-1.5 text-[12px]"
                        >
                          {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                      </td>
                      <td className="table-cell">
                        <Badge status={u.is_active ? 'active' : 'inactive'} dot>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="table-cell text-[12px]">
                        {u.last_login ? fmtDate(u.last_login, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}
                      </td>
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => patchUser(u, { is_active: !u.is_active })}
                            disabled={u.id === me?.id}
                            className="icon-btn h-8 w-8 disabled:opacity-40"
                            title={u.is_active ? 'Deactivate account' : 'Activate account'}
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button onClick={() => { setResetFor(u); setNewPassword(''); }} className="icon-btn h-8 w-8" title="Reset password">
                            <KeyRound size={14} />
                          </button>
                          <button
                            onClick={() => setDeleting(u)}
                            disabled={u.id === me?.id}
                            className="icon-btn h-8 w-8 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                            title="Delete account"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><UserCog size={17} /></div>
              <div>
                <p className="text-[12.5px] font-semibold text-ink-800">Super Admin always has every permission</p>
                <p className="mt-0.5 text-[11.5px] text-slate-500">The Super Admin role is locked. Changes to other roles apply immediately to all of their users.</p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <SectionTitle title="Permission matrix" description="Configure module-level access for each role" />
              <span className="hidden items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-600 sm:flex">
                <Check size={12} /> Live access
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-y border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-head min-w-[230px]">Permission</th>
                    {editableRoles.map((r) => (
                      <th key={r.key} className="table-head text-center">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modules.map(([module, items]) => (
                    <Fragment key={`module-${module}`}>
                      <tr className="bg-slate-50/70">
                        <td colSpan={editableRoles.length + 1} className="px-5 py-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{module}</td>
                      </tr>
                      {items.map((p) => (
                        <tr key={p.key} className="transition hover:bg-slate-50/60">
                          <td className="table-cell">
                            <p className="text-[12.5px] font-semibold text-ink-800">{p.label}</p>
                            <p className="text-[10.5px] text-slate-400">{p.key} · {p.description}</p>
                          </td>
                          {editableRoles.map((r) => (
                            <td key={r.key} className="table-cell text-center">
                              <input
                                type="checkbox"
                                checked={(matrix[r.key] || []).includes(p.key)}
                                onChange={() => togglePermission(r.key, p.key)}
                                className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                                aria-label={`${r.label}: ${p.label}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              {editableRoles.map((r) => (
                <Button key={r.key} variant="secondary" size="sm" loading={savingRole === r.key} onClick={() => saveRole(r.key)}>
                  Save {r.label}
                </Button>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Add user"
        subtitle="Create a workspace account and assign a role."
        icon={UserPlus}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={savingUser} onClick={createUser} icon={Plus}>Create user</Button>
          </>
        }
      >
        <form onSubmit={createUser} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jordan Lee" required />
          <Input label="Email address" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jordan@aurorahr.com" required />
          <Input label="Temporary password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" required />
          {canManageRoles ? (
            <Select label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          ) : (
            <Field label="Role">
              <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold text-ink-800">
                Employee
              </div>
            </Field>
          )}
          <Field label="Linked employee" hint="Optional — links this account to an employee record." className="sm:col-span-2">
            <select value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))} className="input">
              <option value="">No linked employee</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.first_name} {o.last_name} · {o.designation}</option>
              ))}
            </select>
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetFor)}
        onClose={() => setResetFor(null)}
        title="Reset password"
        subtitle={resetFor ? `Set a new password for ${resetFor.name}.` : ''}
        icon={KeyRound}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetFor(null)}>Cancel</Button>
            <Button variant="primary" onClick={resetPassword} icon={KeyRound}>Reset password</Button>
          </>
        }
      >
        <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete user account"
        subtitle="This removes their workspace login."
        icon={Trash2}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={removeUser} icon={Trash2}>Delete account</Button>
          </>
        }
      >
        {deleting && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <Avatar name={deleting.name} color={deleting.avatar_color} size="md" />
            <div>
              <p className="text-sm font-semibold text-ink-900">{deleting.name}</p>
              <p className="text-xs text-slate-500">{deleting.email} · {deleting.role_label}</p>
            </div>
          </div>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
          Their employee record and HR history are kept. Only the login account is removed.
        </p>
      </Modal>
    </div>
  );
}
