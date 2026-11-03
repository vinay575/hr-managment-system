import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  BadgeCheck,
  BellRing,
  Building2,
  CalendarDays,
  Check,
  IdCard,
  KeyRound,
  Lock,
  Mail,
  Palette,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtDate } from '../lib/api';
import { Avatar, Badge, Button, Card, Field, Input, SectionTitle, TONE } from '../components/ui';

const COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'teal', 'orange'];

export default function Settings() {
  const { user, updateUser, refresh } = useAuth();
  const toast = useToast();
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', avatarColor: user?.avatarColor || 'indigo' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [notify, setNotify] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aurora_notify') || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    api.get('/auth/me').then(setAccount).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) setProfile({ name: user.name, email: user.email, avatarColor: user.avatarColor || 'indigo' });
  }, [user]);

  const saveProfile = async () => {
    setProfileError('');
    if (!profile.name.trim()) { setProfileError('Your name cannot be empty.'); return; }
    setProfileSaving(true);
    try {
      const res = await api.patch('/auth/profile', profile);
      updateUser(res.user);
      toast.success('Profile updated.');
      refresh();
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async () => {
    setPasswordError('');
    if (!passwords.currentPassword || !passwords.newPassword) { setPasswordError('Fill in both password fields.'); return; }
    if (passwords.newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return; }
    if (passwords.newPassword !== passwords.confirmPassword) { setPasswordError('New passwords do not match.'); return; }
    setPasswordSaving(true);
    try {
      await api.patch('/auth/password', { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed successfully.');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  const toggleNotify = (key) => {
    const next = { ...notify, [key]: !notify[key] };
    setNotify(next);
    localStorage.setItem('aurora_notify', JSON.stringify(next));
    toast.info(`Email notifications ${next[key] ? 'enabled' : 'disabled'}.`);
  };

  const employee = account?.employee;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Account</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Settings</h1>
        <p className="mt-1 text-[13px] text-slate-500">Keep your profile fresh and your account secure.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card className="overflow-hidden">
            <div className="relative h-24 bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500">
              <div className="pointer-events-none absolute inset-0 opacity-20 surface-grid" />
            </div>
            <div className="px-6 pb-6">
              <div className="-mt-9 flex flex-wrap items-end justify-between gap-4">
                <Avatar name={profile.name} color={profile.avatarColor} size="xl" className="relative z-10 ring-4 ring-white" />
                <Badge tone={user?.role === 'super_admin' ? 'violet' : user?.role === 'ceo' ? 'indigo' : user?.role === 'administration' ? 'emerald' : user?.role === 'hr' ? 'sky' : 'amber'} dot={false} className="mb-1">{user?.roleLabel || user?.role}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-[18px] font-bold text-ink-900">{profile.name || 'Your profile'}</h2>
                  <p className="text-[12.5px] text-slate-500">{employee?.designation || 'Team member'}{employee?.department ? ` · ${employee.department}` : ''}</p>
                </div>
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"><BadgeCheck size={14} /> Active account</span>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <SectionTitle title="Personal details" description="This is how you appear across Aurora." />
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Full name" icon={UserRound} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
                  <Input label="Email address" icon={Mail} type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
                  <Field label="Employee ID"><Input value={employee?.code || '—'} disabled /></Field>
                  <Field label="Department"><Input value={employee?.department || '—'} disabled /></Field>
                </div>
                <div className="mt-4">
                  <p className="label">Avatar colour</p>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setProfile((p) => ({ ...p, avatarColor: c }))}
                        className={clsx('h-8 w-8 rounded-full bg-gradient-to-br transition', TONE[c].grad, profile.avatarColor === c ? 'ring-2 ring-ink-900 ring-offset-2' : 'opacity-70 hover:opacity-100')}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
                {profileError && <p className="mt-3 text-[12px] font-medium text-rose-600">{profileError}</p>}
                <div className="mt-5 flex justify-end">
                  <Button variant="primary" onClick={saveProfile} loading={profileSaving}>Save changes</Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><ShieldCheck size={19} /></div>
              <div>
                <SectionTitle title="Security" description="Use a strong, unique password you don’t use elsewhere." />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Current password" type="password" icon={Lock} wrapperClass="sm:col-span-2" value={passwords.currentPassword} onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))} placeholder="Enter current password" />
              <Input label="New password" type="password" icon={KeyRound} value={passwords.newPassword} onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))} placeholder="At least 8 characters" />
              <Input label="Confirm new password" type="password" icon={KeyRound} value={passwords.confirmPassword} onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))} placeholder="Repeat new password" />
            </div>
            {passwordError && <p className="mt-3 text-[12px] font-medium text-rose-600">{passwordError}</p>}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400">Last sign-in {user?.lastLogin ? fmtDate(user.lastLogin, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'just now'}</p>
              <Button variant="secondary" onClick={changePassword} loading={passwordSaving} icon={KeyRound}>Update password</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-6">
            <SectionTitle title="Account overview" description="Your Aurora identity" />
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-3.5">
              <Avatar name={profile.name} color={profile.avatarColor} size="md" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink-900">{profile.name}</p>
                <p className="truncate text-[11px] text-slate-500">{profile.email}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { icon: IdCard, label: 'Employee ID', value: employee?.code || '—' },
                { icon: Building2, label: 'Department', value: employee?.department || '—' },
                { icon: CalendarDays, label: 'Joined Company', value: employee?.joinDate ? fmtDate(employee.joinDate) : '—' },
                { icon: ShieldCheck, label: 'Access level', value: user?.roleLabel || user?.role },
              ].map((x) => (
                <div key={x.label} className="flex items-center gap-3 text-[12px]">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-400"><x.icon size={15} /></div>
                  <span className="text-slate-400">{x.label}</span>
                  <span className="ml-auto max-w-[130px] truncate text-right font-semibold text-ink-800">{x.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <SectionTitle title="Notifications" description="What lands in your inbox" />
              <BellRing size={18} className="text-brand-400" />
            </div>
            <div className="mt-5 space-y-3.5">
              {[
                { key: 'leave', label: 'Leave updates', desc: 'Approvals and decisions' },
                { key: 'payroll', label: 'Payslip alerts', desc: 'When payroll is ready' },
                { key: 'team', label: 'Team news', desc: 'New hires and birthdays' },
              ].map((n) => {
                const on = Boolean(notify[n.key]);
                return (
                  <div key={n.key} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-ink-800">{n.label}</p>
                      <p className="text-[10.5px] text-slate-400">{n.desc}</p>
                    </div>
                    <button
                      onClick={() => toggleNotify(n.key)}
                      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-brand-500' : 'bg-slate-200')}
                      aria-label={`Toggle ${n.label}`}
                    >
                      <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all', on ? 'left-[22px]' : 'left-0.5')} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-ink-900 to-brand-900 p-5 text-white">
            <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-brand-500/30 blur-2xl" />
            <div className="relative">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-brand-300"><Palette size={17} /></div>
              <p className="mt-3 text-[13px] font-semibold">Kodewar Technologies · Enterprise</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/50">Modern workforce management built with care for teams that care.</p>
              <div className="mt-4 flex items-center gap-2 text-[10.5px] text-white/40"><Sparkles size={12} /> v1.0 · All systems operational</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
