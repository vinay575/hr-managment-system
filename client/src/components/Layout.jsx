import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarCheck2,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  GitBranch,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  PieChart,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, fmtDate } from '../lib/api';
import { Avatar } from './ui';

const NAV = [
  {
    section: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, permission: 'dashboard.view' },
      { to: '/employees', label: 'Employees', icon: Users, permission: 'employees.view' },
      { to: '/departments', label: 'Departments', icon: Building2, permission: 'departments.view' },
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck2, permission: ['attendance.view_all', 'attendance.self'] },
      { to: '/leaves', label: 'Leave requests', icon: CalendarDays, permission: ['leaves.view_all', 'leaves.self'] },
      { to: '/payroll', label: 'Payroll', icon: Wallet, permission: ['payroll.view_all', 'payroll.self'] },
    ],
  },
  {
    section: 'Recruitment',
    items: [
      { to: '/recruitment', label: 'Hiring overview', icon: Sparkles, end: true, permission: 'recruitment.view' },
      { to: '/recruitment/jobs', label: 'Job vacancies', icon: Briefcase, permission: 'recruitment.jobs.view' },
      { to: '/recruitment/candidates', label: 'Candidates', icon: Users, permission: 'recruitment.candidates.view' },
      { to: '/recruitment/pipeline', label: 'Pipeline', icon: GitBranch, permission: 'recruitment.candidates.view' },
      { to: '/recruitment/interviews', label: 'Interviews', icon: CalendarClock, permission: 'recruitment.interviews.view' },
      { to: '/recruitment/offers', label: 'Offers', icon: FileSignature, permission: 'recruitment.offers.view' },
      { to: '/recruitment/reports', label: 'Recruitment reports', icon: PieChart, permission: 'recruitment.reports.view' },
    ],
  },
  {
    section: 'Lifecycle',
    items: [
      { to: '/onboarding', label: 'Onboarding', icon: UserPlus, permission: ['onboarding.view', 'onboarding.manage', 'onboarding.self'] },
      { to: '/onboarding/templates', label: 'Onboarding templates', icon: ScrollText, permission: 'onboarding.manage' },
      { to: '/offboarding/resignations', label: 'Resignations', icon: CalendarDays, permission: ['offboarding.view', 'offboarding.manage', 'offboarding.self'] },
      { to: '/offboarding/notice-periods', label: 'Notice periods', icon: CalendarClock, permission: ['offboarding.view', 'offboarding.manage', 'offboarding.self'] },
      { to: '/offboarding/exit-documents', label: 'Exit documents', icon: FileSignature, permission: ['offboarding.view', 'offboarding.manage', 'offboarding.self'] },
    ],
  },
  {
    section: 'Expenses',
    items: [
      { to: '/expenses', label: 'Expense dashboard', icon: PieChart, end: true, permission: ['expenses.dashboard', 'expenses.self'] },
      { to: '/expenses/my', label: 'My expenses', icon: Receipt, permission: 'expenses.self' },
      { to: '/expenses/claims', label: 'All expense claims', icon: ScrollText, permission: 'expenses.view_all' },
      { to: '/expenses/approvals', label: 'Expense approvals', icon: CalendarCheck2, permission: 'expenses.approve' },
      { to: '/expenses/reimbursements', label: 'Reimbursements', icon: Wallet, permission: 'expenses.reimburse' },
      { to: '/expenses/categories', label: 'Expense categories', icon: ClipboardList, permission: 'expenses.categories.manage' },
      { to: '/expenses/reports', label: 'Expense reports', icon: BarChart3, permission: 'expenses.reports' },
      { to: '/expenses/settings', label: 'Expense settings', icon: Settings, permission: 'expenses.settings' },
    ],
  },
  {
    section: 'Performance',
    items: [
      { to: '/performance', label: 'Performance dashboard', icon: Target, end: true, permission: ['performance.dashboard', 'performance.goals.self'] },
      { to: '/performance/goals', label: 'Goal management', icon: ClipboardList, permission: ['performance.goals.view', 'performance.goals.manage', 'performance.goals.self'] },
      { to: '/performance/progress', label: 'Goal progress', icon: TrendingUp, permission: ['performance.goals.self', 'performance.goals.view', 'performance.goals.manage'] },
      { to: '/performance/review-cycles', label: 'Review cycles', icon: ClipboardCheck, permission: ['performance.reviews.view', 'performance.reviews.manage'] },
      { to: '/performance/review-history', label: 'Review history', icon: History, permission: ['performance.reviews.view', 'performance.reviews.manage'] },
      { to: '/performance/reports', label: 'Performance reports', icon: BarChart3, permission: 'performance.reports' },
    ],
  },
  {
    section: 'Insights',
    items: [{ to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.view' }],
  },
  {
    section: 'System',
    items: [
      { to: '/access', label: 'Access control', icon: ShieldCheck, permission: ['roles.manage', 'users.manage'] },
      { to: '/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.view' },
    ],
  },
  {
    section: 'Account',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell, permission: 'dashboard.view' },
      { to: '/settings', label: 'Settings', icon: Settings, permission: 'settings.self' },
    ],
  },
];

const PAGE_META = {
  '/': { title: 'Dashboard', subtitle: 'A clear view of your people and today’s momentum.' },
  '/employees': { title: 'Employees', subtitle: 'Your whole team, organised and easy to reach.' },
  '/departments': { title: 'Departments', subtitle: 'Structure, ownership and how teams are growing.' },
  '/attendance': { title: 'Attendance', subtitle: 'Hours, presence and the rhythm of the workday.' },
  '/leaves': { title: 'Leave requests', subtitle: 'Time off, without the back-and-forth.' },
  '/payroll': { title: 'Payroll', subtitle: 'Compensation, payslips and payment status.' },
  '/reports': { title: 'Reports', subtitle: 'Executive insight across people, time and cost.' },
  '/access': { title: 'Access control', subtitle: 'Users, roles and module-level permissions.' },
  '/audit': { title: 'Audit log', subtitle: 'A record of sensitive administrative activity.' },
  '/settings': { title: 'Settings', subtitle: 'Your profile, security and workspace preferences.' },
  '/notifications': { title: 'Notifications', subtitle: 'Updates and reminders relevant to your work.' },
  '/recruitment': { title: 'Recruitment', subtitle: 'Hiring overview, vacancies and pipeline momentum.' },
  '/recruitment/jobs': { title: 'Job vacancies', subtitle: 'Open roles, requirements and application deadlines.' },
  '/recruitment/candidates': { title: 'Candidates', subtitle: 'Your talent pool, profiles and applications.' },
  '/recruitment/pipeline': { title: 'Pipeline', subtitle: 'Move candidates through every hiring stage.' },
  '/recruitment/applications': { title: 'Pipeline', subtitle: 'Move candidates through every hiring stage.' },
  '/recruitment/interviews': { title: 'Interviews', subtitle: 'Schedules, interviewers and evaluations.' },
  '/recruitment/offers': { title: 'Offers', subtitle: 'Offer letters, responses and employee conversion.' },
  '/recruitment/reports': { title: 'Recruitment reports', subtitle: 'Aggregate hiring performance and conversion.' },
  '/onboarding': { title: 'Employee onboarding', subtitle: 'Welcome new hires, track checklists and verify compliance.' },
  '/onboarding/templates': { title: 'Onboarding templates', subtitle: 'Standardized checklists and milestone tasks.' },
  '/offboarding/resignations': { title: 'Resignation management', subtitle: 'Review resignation submissions and exit timelines.' },
  '/offboarding/notice-periods': { title: 'Notice period tracking', subtitle: 'Track serving employees and last working days.' },
  '/offboarding/exit-documents': { title: 'Exit documentation', subtitle: 'Issue relieving, experience, and settlement letters.' },
  '/expenses': { title: 'Expense dashboard', subtitle: 'Spending, approvals and reimbursements at a glance.' },
  '/expenses/my': { title: 'My expenses', subtitle: 'Submit claims, attach receipts and track every status.' },
  '/expenses/claims': { title: 'All expense claims', subtitle: 'Every claim, receipt and decision across the organisation.' },
  '/expenses/approvals': { title: 'Expense approvals', subtitle: 'Review claims and record a clear decision.' },
  '/expenses/reimbursements': { title: 'Reimbursements', subtitle: 'Track manual payments against approved claims.' },
  '/expenses/categories': { title: 'Expense categories', subtitle: 'Receipt rules, claim limits and approval requirements.' },
  '/expenses/reports': { title: 'Expense reports', subtitle: 'Spending by month, team, category and employee.' },
  '/expenses/settings': { title: 'Expense settings', subtitle: 'Policy defaults, receipts and reimbursement reminders.' },
  '/performance': { title: 'Performance dashboard', subtitle: 'Goals, progress and review cycles at a glance.' },
  '/performance/goals': { title: 'Goal management', subtitle: 'Assign goals, set priorities and track every deadline.' },
  '/performance/progress': { title: 'Goal progress', subtitle: 'Update progress, add notes and preserve every step.' },
  '/performance/review-cycles': { title: 'Review cycles', subtitle: 'Organise periodic goal reviews without the assessment paperwork.' },
  '/performance/review-history': { title: 'Review history', subtitle: 'Completed and historical review cycle summaries.' },
  '/performance/reports': { title: 'Performance reports', subtitle: 'Goal, employee, department and review cycle reporting.' },
};

const resolveMeta = (pathname) => {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const match = Object.keys(PAGE_META)
    .filter((path) => path !== '/' && pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_META[match] : PAGE_META['/'];
};

export function Logo({ dark = false, compact = false, className, imgClassName, tagline = null }) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <img
        src="/kodewar-logo.png"
        alt="Kodewar Technologies"
        className={clsx(
          'object-contain select-none transition-all',
          imgClassName || (compact ? 'h-9 max-w-[170px]' : 'h-14 w-auto max-w-[280px]')
        )}
      />
      {tagline && (
        <span className={clsx('text-[10px] font-medium uppercase tracking-[0.16em]', dark ? 'text-slate-400' : 'text-slate-500')}>
          {tagline}
        </span>
      )}
    </div>
  );
}

function useClickOutside(onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

function Sidebar({ open, onClose }) {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    toast.info('You have been signed out.');
    navigate('/login');
  };

  return (
    <>
      <div
        className={clsx('fixed inset-0 z-40 bg-ink-900/50 backdrop-blur-sm transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
      />
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col overflow-hidden bg-ink-900 transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-brand-600/25 blur-[80px]" />
        <div className="pointer-events-none absolute -right-20 bottom-24 h-52 w-52 rounded-full bg-violet-600/20 blur-[80px]" />

        <div className="relative flex items-center justify-between px-6 pb-6 pt-6">
          <Logo tagline={null} />
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        <div className="relative mx-4 mb-6 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">KT</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-white">Kodewar Technologies</p>
            <p className="text-[10.5px] text-slate-500">Enterprise workspace</p>
          </div>
          <ChevronDown size={14} className="text-slate-500" />
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 no-scrollbar">
          {NAV.map((group) => {
            const items = group.items.filter((item) => !item.permission || can(item.permission));
            if (!items.length) return null;
            return (
              <div key={group.section} className="mb-6">
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{group.section}</p>
                <div className="space-y-1">
                  {items.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) => clsx('sidebar-link group', isActive && 'sidebar-link-active')}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-400 to-violet-500" />}
                          <Icon size={18} strokeWidth={isActive ? 2.2 : 1.9} className={clsx('transition-colors', isActive ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300')} />
                          <span>{label}</span>
                          {label === 'Leave requests' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" />}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="mx-1 mb-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-4">
            <div className="mb-2 grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
              <LifeBuoy size={16} />
            </div>
            <p className="text-[12.5px] font-semibold text-white">Need a hand?</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">Our people team is here to help you get the most from Kodewar HR.</p>
            <button
              onClick={() => toast.info('Help centre is coming soon. In the meantime, email support@kodewar.com.')}
              className="mt-3 text-[11.5px] font-semibold text-brand-300 hover:text-brand-200"
            >
              Visit help centre →
            </button>
          </div>
        </nav>

        <div className="relative border-t border-white/[0.06] p-4">
          <div className="flex items-center gap-3 rounded-xl px-1 py-1.5">
            <Avatar name={user?.name} color={user?.avatarColor || 'indigo'} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-white">{user?.name}</p>
              <p className="truncate text-[10.5px] capitalize text-slate-500">{user?.roleLabel || user?.role}</p>
            </div>
            <button onClick={handleLogout} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-rose-300" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const ref = useClickOutside(() => setOpen(false));

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/notifications?limit=8');
      setItems(data.items || []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch (error) {
      toast.error(error.message);
    }
  }, [toast]);

  useEffect(() => {
    if (user) refresh();
  }, [user?.id, refresh]);

  const icons = {
    leave: CalendarDays,
    payroll: Wallet,
    success: UserPlus,
    recruitment: Briefcase,
    interview: CalendarClock,
    offer: FileSignature,
    expense: Receipt,
    performance: Target,
  };
  const tones = {
    leave: 'bg-amber-50 text-amber-600',
    payroll: 'bg-brand-50 text-brand-600',
    success: 'bg-emerald-50 text-emerald-600',
    recruitment: 'bg-violet-50 text-violet-600',
    interview: 'bg-sky-50 text-sky-600',
    offer: 'bg-orange-50 text-orange-600',
    expense: 'bg-violet-50 text-violet-600',
    performance: 'bg-teal-50 text-teal-600',
  };

  const openItem = async (item) => {
    try {
      if (!item.readAt) {
        await api.patch(`/notifications/${item.id}/read`);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      setOpen(false);
      const path = typeof item.to === 'string' && item.to.startsWith('/') && !item.to.startsWith('//')
        ? item.to
        : '/notifications';
      navigate(path);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((value) => !value);
          if (!open) refresh();
        }}
        className={clsx('relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-ink-800', open && 'bg-slate-50 text-ink-800')}
        aria-label={`Notifications, ${unreadCount} unread`}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <p className="text-sm font-bold text-ink-900">Notifications</p>
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">{unreadCount} unread</span>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">You’re all caught up.</p>}
            {items.map((n) => {
              const Icon = icons[n.type] || Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={clsx('flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3.5 text-left transition hover:bg-slate-50/80', !n.readAt && 'bg-brand-50/30')}
                >
                  <div className={clsx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', tones[n.type] || 'bg-slate-100 text-slate-500')}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-ink-800">{n.title}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{n.body}</p>
                    {!n.readAt && <span className="mt-1 inline-block text-[10px] font-semibold text-brand-600">Unread</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="w-full px-4 py-3 text-center text-[12px] font-semibold text-brand-600 hover:bg-brand-50/50"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useClickOutside(() => setMenuOpen(false));
  const meta = resolveMeta(location.pathname);

  const handleLogout = () => {
    logout();
    toast.info('You have been signed out.');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="flex h-[72px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button onClick={onMenu} className="icon-btn lg:hidden" aria-label="Open menu">
          <Menu size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span className="hidden sm:inline">Kodewar Technologies</span>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span className="text-slate-500">{meta.title}</span>
          </div>
          <h1 className="truncate font-display text-[19px] font-bold tracking-tight text-ink-900">{meta.title}</h1>
        </div>

        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-medium text-slate-500 xl:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>

        <Notifications />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 transition hover:bg-slate-50"
          >
            <Avatar name={user?.name} color={user?.avatarColor || 'indigo'} size="sm" />
            <div className="hidden text-left sm:block">
              <p className="max-w-[120px] truncate text-[12px] font-semibold leading-tight text-ink-800">{user?.name}</p>
              <p className="text-[10px] capitalize leading-tight text-slate-400">{user?.roleLabel || user?.role}</p>
            </div>
            <ChevronDown size={14} className={clsx('text-slate-400 transition', menuOpen && 'rotate-180')} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-14 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xl shadow-slate-900/10 animate-scale-in">
              <div className="border-b border-slate-100 px-3 py-3">
                <p className="truncate text-[13px] font-bold text-ink-900">{user?.name}</p>
                <p className="truncate text-[11.5px] text-slate-500">{user?.email}</p>
              </div>
              <div className="pt-1.5">
                <button onClick={() => { setMenuOpen(false); navigate('/settings'); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-ink-900">
                  <Settings size={16} /> Account settings
                </button>
                <button onClick={handleLogout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50">
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f5f6fb]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-[268px]">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1480px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
