import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  ChevronDown,
  Coins,
  GraduationCap,
  Layers,
  LayoutGrid,
  LineChart,
  Lock,
  Mail,
  Network,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Logo } from '../components/Layout';

const QUICK_ROLES = [
  { role: 'Super Admin', name: 'Amelia Hart', email: 'admin@aurorahr.com', password: 'admin123' },
  { role: 'CEO', name: 'Olivia Bennett', email: 'ceo@aurorahr.com', password: 'ceo123456' },
  { role: 'Administration', name: 'Benjamin Clarke', email: 'office@aurorahr.com', password: 'office123456' },
  { role: 'HR', name: 'Grace Kim', email: 'hr@aurorahr.com', password: 'hr123456' },
  { role: 'Employee', name: 'Sarah Chen', email: 'sarah@aurorahr.com', password: 'employee123' },
];

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError('');
  };

  const doLogin = async (email, password) => {
    setError('');
    setLoading(true);
    try {
      const u = await login(email, password, remember);
      toast.success(`Welcome back, ${u.name.split(' ')[0]}.`);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Enter your email and password to continue.');
      return;
    }
    doLogin(form.email, form.password);
  };

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------------------------------------- */}
      {/* Brand panel                                                */}
      {/* ---------------------------------------------------------- */}
      <div className="relative hidden overflow-hidden bg-[#070b1a] lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        {/* Crisp background container: cover with right-bottom positioning to keep the laptop and neon curves fully in frame without cropping or extreme zoom */}
        <div 
          className="pointer-events-none absolute inset-0 bg-no-repeat transition-all duration-500 opacity-95"
          style={{ 
            backgroundImage: "url('/login-hero-bg.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'right 20% center',
            imageRendering: '-webkit-optimize-contrast'
          }}
        />
        {/* Soft targeted vignette over text area so the image details, laptop, and curves stay ultra crisp */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#070b1a]/95 via-[#070b1a]/70 to-[#070b1a]/15" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070b1a]/85 via-transparent to-[#070b1a]/50" />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center justify-between">
          <Logo imgClassName="h-16 xl:h-20 w-auto max-w-[340px]" />
          <div className="flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3.5 py-1.5 text-[11px] font-semibold text-violet-200 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" /> Enterprise Platform
          </div>
        </div>

        {/* Hero Section styled after Kodewar Platform Mockup */}
        <div className="relative z-10 mt-8 mb-auto py-2">
          {/* Badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-gradient-to-r from-violet-600/30 to-fuchsia-600/30 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-violet-200 backdrop-blur-md shadow-sm">
            <Layers size={13} className="text-violet-300" />
            <span>Enterprise Management Platform</span>
          </div>

          {/* Heading */}
          <h1 className="font-display text-[40px] font-extrabold leading-[1.08] tracking-tight text-white xl:text-[46px]">
            One Platform.
            <br />
            Every People.
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              Greater Together.
            </span>
          </h1>

          <p className="mt-4 max-w-lg text-[13.5px] leading-relaxed text-slate-300">
            Unifying employees, students, teams and administrators with smart management, collaboration and seamless operations.
          </p>

          {/* 8 Feature Cards Grid matching the 8 cards in the reference image */}
          <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-4 max-w-xl">
            {[
              {
                icon: Users2,
                title: 'Employee & Workforce Management',
                glow: 'from-violet-500/20 to-purple-600/10 border-violet-500/30',
                iconColor: 'text-violet-300',
              },
              {
                icon: GraduationCap,
                title: 'Student & Learning Management',
                glow: 'from-indigo-500/20 to-blue-600/10 border-indigo-500/30',
                iconColor: 'text-indigo-300',
              },
              {
                icon: CalendarCheck2,
                title: 'Attendance & Leave Tracking',
                glow: 'from-fuchsia-500/20 to-pink-600/10 border-fuchsia-500/30',
                iconColor: 'text-fuchsia-300',
              },
              {
                icon: Coins,
                title: 'Payroll & Finance Management',
                glow: 'from-cyan-500/20 to-teal-600/10 border-cyan-500/30',
                iconColor: 'text-cyan-300',
              },
              {
                icon: LineChart,
                title: 'Performance & Productivity',
                glow: 'from-purple-500/20 to-pink-600/10 border-purple-500/30',
                iconColor: 'text-purple-300',
              },
              {
                icon: Layers,
                title: 'Training & Development',
                glow: 'from-blue-500/20 to-indigo-600/10 border-blue-500/30',
                iconColor: 'text-blue-300',
              },
              {
                icon: Network,
                title: 'Organization Management',
                glow: 'from-violet-500/20 to-fuchsia-600/10 border-violet-500/30',
                iconColor: 'text-violet-300',
              },
              {
                icon: ShieldCheck,
                title: 'Administration & Analytics',
                glow: 'from-teal-500/20 to-cyan-600/10 border-teal-500/30',
                iconColor: 'text-teal-300',
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className={`group relative flex flex-col items-center justify-center rounded-2xl border ${card.glow} bg-gradient-to-b bg-ink-950/70 p-3 text-center shadow-lg backdrop-blur-md transition-all hover:scale-[1.03] hover:border-violet-400/50 hover:bg-ink-900/90`}
                >
                  <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] shadow-inner group-hover:bg-white/[0.12] transition">
                    <Icon size={18} className={card.iconColor} />
                  </div>
                  <p className="text-[10.5px] font-semibold leading-snug text-slate-200">
                    {card.title}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info pill */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/[0.08] pt-4 text-[11px] text-slate-400">
          <span>Kodewar Technologies HR Platform</span>
          <span className="font-semibold text-violet-300">Unified Management</span>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Form panel                                                 */}
      {/* ---------------------------------------------------------- */}
      <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-slate-900/5 px-4 py-8 sm:px-8 lg:px-10 xl:px-14">
        {/* Modern ambient glass glow effects */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-10 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="pointer-events-none absolute right-1/4 top-1/2 h-60 w-60 rounded-full bg-fuchsia-400/15 blur-3xl" />

        <div className="relative mx-auto w-full max-w-[460px] animate-fade-up">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Logo dark />
          </div>

          {/* Frosted Glass Card Container */}
          <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-7 shadow-[0_20px_50px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-9">
            {/* Soft inner glow gradient */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/60 via-transparent to-white/40" />

            <div className="relative z-10">
              <div className="mb-6">
                <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/20 bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25">
                  <ShieldCheck size={23} />
                </div>
                <h2 className="font-display text-[28px] font-extrabold tracking-tight text-ink-900 sm:text-[32px]">
                  Welcome back
                </h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
                  Sign in to your Kodewar workspace to pick up where you left off.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="label">Work email</label>
                  <div className="relative">
                    <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      autoComplete="email"
                      className="input h-12 border-slate-200/80 bg-white/80 pl-10 shadow-sm backdrop-blur-sm transition focus:bg-white"
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={set('email')}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="input h-12 border-slate-200/80 bg-white/80 pl-10 pr-11 shadow-sm backdrop-blur-sm transition focus:bg-white"
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={set('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-ink-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Keep me signed in
                  </label>
                  <button
                    type="button"
                    onClick={() => toast.info('Password resets are handled by your People team — reach out to hr@aurorahr.com.')}
                    className="text-[12.5px] font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Forgot password?
                  </button>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/90 px-3.5 py-3 text-[12.5px] font-medium text-rose-600 animate-scale-in">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary group h-12 w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-brand-600 text-[14px] shadow-lg shadow-violet-500/20 hover:from-violet-700 hover:to-brand-700"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Signing in…
                    </span>
                  ) : (
                    <>
                      Sign in to workspace
                      <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Quick Role Fill Dropdown for Testing */}
              <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/60 p-3 backdrop-blur-md">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5 text-violet-700">
                    <UserCheck size={13} />
                    Quick Role Selector
                  </span>
                  <span className="text-[10px] text-slate-400">Auto-fill & test</span>
                </div>
                <div className="relative">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const selected = QUICK_ROLES.find((r) => r.role === e.target.value);
                      if (selected) {
                        setForm({ email: selected.email, password: selected.password });
                        setError('');
                      }
                    }}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white/90 px-3 py-2 pr-8 text-[12.5px] font-medium text-slate-700 shadow-2xs transition focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
                  >
                    <option value="" disabled>
                      Select a role to test…
                    </option>
                    {QUICK_ROLES.map((r) => (
                      <option key={r.role} value={r.role}>
                        {r.role} ({r.name})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-[11.5px] text-slate-400">
            Protected by enterprise-grade security · © {new Date().getFullYear()} Kodewar Technologies
          </p>
        </div>
      </div>
    </div>
  );
}
