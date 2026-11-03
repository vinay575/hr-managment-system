import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowDownToLine,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  MapPin,
  Timer,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, currentMonth, fmtDate, fmtTime, monthLabel, todayISO } from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Pagination,
  SectionTitle,
  Segmented,
  StatCard,
  capitalize,
} from '../components/ui';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'remote', label: 'Remote' },
  { value: 'absent', label: 'Absent' },
];

export default function Attendance() {
  const { user, can } = useAuth();
  return can('attendance.view_all') ? <ManagerAttendance /> : <EmployeeAttendance user={user} />;
}

/* ------------------------------------------------------------------ */
/*  Manager                                                            */
/* ------------------------------------------------------------------ */
function ManagerAttendance() {
  const toast = useToast();
  const [mode, setMode] = useState('today');
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState({ data: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/departments').then((d) => setDepartments(d.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (mode === 'today') params.set('date', date);
      else params.set('month', month);
      if (status) params.set('status', status);
      if (department) params.set('departmentId', department);
      const res = await api.get(`/attendance?${params}`);
      setData(res);
      setPage(1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, date, month, status, department, toast]);

  useEffect(() => { load(); }, [load]);

  const summary = data.summary || {};
  const rows = data.data || [];
  const perPage = 10;
  const pages = Math.ceil(rows.length / perPage) || 1;
  const visible = rows.slice((page - 1) * perPage, page * perPage);

  const exportCsv = () => {
    const header = ['Employee', 'Employee ID', 'Department', 'Date', 'Check in', 'Check out', 'Hours', 'Status'];
    const lines = rows.map((r) => [r.first_name + ' ' + r.last_name, r.employee_code, r.department_name || '', r.date, r.check_in || '', r.check_out || '', r.work_hours, r.status]);
    const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurora-attendance-${mode === 'today' ? date : month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Attendance exported to CSV.');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Time & presence</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Attendance overview</h1>
          <p className="mt-1 text-[13px] text-slate-500">Track who’s in, working remotely, or taking a well-earned break.</p>
        </div>
        <Button variant="secondary" icon={ArrowDownToLine} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Present" value={summary.present || 0} sub="On time today" icon={CheckCircle2} tone="emerald" />
        <StatCard label="Late arrivals" value={summary.late || 0} sub="After 9:15 AM" icon={Clock3} tone="amber" />
        <StatCard label="Remote" value={summary.remote || 0} sub="Working off-site" icon={MapPin} tone="sky" />
        <StatCard label="Absent" value={summary.absent || 0} sub={`${rows.length} records logged`} icon={XCircle} tone="rose" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Segmented options={[{ value: 'today', label: 'Daily view' }, { value: 'month', label: 'Monthly view' }]} value={mode} onChange={setMode} />
          {mode === 'today' ? (
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-auto py-2.5 text-[13px]" />
          ) : (
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto py-2.5 text-[13px]" />
          )}
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input w-auto min-w-[155px] py-2.5 text-[13px]">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5 lg:ml-auto">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                className={clsx('rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition', status === f.value ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-ink-800')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <SectionTitle title={mode === 'today' ? 'Today’s records' : `${monthLabel(month)} records`} description={`${rows.length} attendance ${rows.length === 1 ? 'entry' : 'entries'}`} />
          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
          </span>
        </div>
        {loading ? (
          <LoadingBlock label="Loading attendance…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarCheck2} title="No attendance records" description="No one has clocked in for this period yet, or your filters are too narrow." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="border-y border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-head">Employee</th>
                    <th className="table-head">Department</th>
                    <th className="table-head">Date</th>
                    <th className="table-head">Check in</th>
                    <th className="table-head">Check out</th>
                    <th className="table-head">Hours</th>
                    <th className="table-head">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((r) => (
                    <tr key={r.id} className="transition hover:bg-slate-50/60">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <Avatar name={`${r.first_name} ${r.last_name}`} color={r.avatar_color} size="sm" />
                          <div>
                            <p className="text-[13px] font-semibold text-ink-900">{r.first_name} {r.last_name}</p>
                            <p className="text-[11px] text-slate-400">{r.designation}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">{r.department_name || '—'}</td>
                      <td className="table-cell">{fmtDate(r.date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="table-cell">{fmtTime(r.check_in)}</td>
                      <td className="table-cell">{fmtTime(r.check_out)}</td>
                      <td className="table-cell">
                        <span className="font-semibold text-ink-800">{Number(r.work_hours) ? `${r.work_hours}h` : '—'}</span>
                      </td>
                      <td className="table-cell"><Badge status={r.status}>{capitalize(r.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-5 py-3.5">
              <Pagination page={page} pages={pages} total={rows.length} limit={perPage} onChange={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Employee                                                           */
/* ------------------------------------------------------------------ */
function EmployeeAttendance({ user }) {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [today, setToday] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [t, list] = await Promise.all([
        api.get('/attendance/me/today'),
        api.get(`/attendance?month=${month}`),
      ]);
      setToday(t.record);
      setRows(list.data || []);
      setPage(1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => { load(); }, [load]);

  const checkedIn = Boolean(today?.check_in);
  const checkedOut = Boolean(today?.check_out);

  const clock = async () => {
    setBusy(true);
    try {
      const res = await api.post(checkedIn ? '/attendance/check-out' : '/attendance/check-in');
      setToday(res.record);
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    const attended = (counts.present || 0) + (counts.late || 0) + (counts.remote || 0) + (counts['half-day'] || 0);
    const hours = rows.reduce((a, r) => a + Number(r.work_hours || 0), 0);
    return {
      rate: rows.length ? Math.round((attended / rows.length) * 100) : 100,
      attended,
      late: counts.late || 0,
      absent: counts.absent || 0,
      avg: rows.length ? (hours / rows.length).toFixed(1) : '0.0',
      total: rows.length,
    };
  }, [rows]);

  const perPage = 8;
  const pages = Math.ceil(rows.length / perPage) || 1;
  const visible = rows.slice((page - 1) * perPage, page * perPage);
  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Time & presence</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">My attendance</h1>
        <p className="mt-1 text-[13px] text-slate-500">Clock in, clock out, and keep an eye on your month at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="relative overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 p-6 text-white lg:col-span-2">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">{fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              <p className="mt-2 font-display text-[40px] font-extrabold leading-none tabular">
                {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                <span className="ml-2 text-[15px] font-medium text-white/40">{now.getSeconds().toString().padStart(2, '0')}s</span>
              </p>
              <p className="mt-2 text-[12.5px] text-white/55">Hi {firstName}, ready when you are.</p>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <span className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-[11.5px]">
                  In <span className="ml-1 font-semibold text-white">{fmtTime(today?.check_in)}</span>
                </span>
                <span className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-[11.5px]">
                  Out <span className="ml-1 font-semibold text-white">{fmtTime(today?.check_out)}</span>
                </span>
                <span className={clsx('rounded-lg px-3 py-2 text-[11.5px] font-semibold', checkedOut ? 'bg-slate-500/20 text-slate-300' : checkedIn ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300')}>
                  {checkedOut ? 'Day complete' : checkedIn ? 'Currently clocked in' : 'Not clocked in yet'}
                </span>
              </div>
            </div>
            <button
              onClick={clock}
              disabled={busy || checkedOut}
              className={clsx(
                'flex h-[124px] w-[124px] shrink-0 flex-col items-center justify-center gap-2 self-start rounded-full border border-white/10 text-white transition active:scale-[0.97] disabled:opacity-50 sm:self-center',
                checkedIn ? 'bg-gradient-to-br from-rose-500 to-orange-500 shadow-lg shadow-rose-500/20' : 'bg-white/10 backdrop-blur hover:bg-white/15'
              )}
            >
              {busy ? <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : checkedIn ? <LogOut size={24} /> : <LogIn size={24} />}
              <span className="text-[13px] font-bold">{checkedOut ? 'Completed' : checkedIn ? 'Clock out' : 'Clock in'}</span>
              <span className="text-[10px] text-white/50">{today?.status ? capitalize(today.status) : 'Tap to begin'}</span>
            </button>
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle title="This month" description={monthLabel(currentMonth())} action={<Timer size={18} className="text-brand-400" />} />
          <div className="mt-5 grid grid-cols-2 gap-4">
            {[
              { label: 'Attendance', value: `${stats.rate}%`, tone: 'text-emerald-600' },
              { label: 'Days present', value: stats.attended, tone: 'text-ink-900' },
              { label: 'Late arrivals', value: stats.late, tone: 'text-amber-600' },
              { label: 'Avg. hours', value: `${stats.avg}h`, tone: 'text-brand-600' },
            ].map((x) => (
              <div key={x.label} className="rounded-xl bg-slate-50 p-3.5">
                <p className={clsx('font-display text-xl font-bold', x.tone)}>{x.value}</p>
                <p className="mt-0.5 text-[10.5px] text-slate-400">{x.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-100 p-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><Users size={16} /></div>
            <div>
              <p className="text-[11.5px] font-semibold text-ink-800">{stats.total} days recorded</p>
              <p className="text-[10.5px] text-slate-400">{stats.absent} absences this month</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <SectionTitle title="Attendance history" description="Your recent days at Kodewar Technologies" />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto py-2 text-[12.5px]" />
        </div>
        {loading ? (
          <LoadingBlock label="Loading your attendance…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarDays} title="A quiet month" description="No attendance records for this month yet." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead className="border-y border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-head">Date</th>
                    <th className="table-head">Check in</th>
                    <th className="table-head">Check out</th>
                    <th className="table-head">Work hours</th>
                    <th className="table-head">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((r) => (
                    <tr key={r.id} className="transition hover:bg-slate-50/60">
                      <td className="table-cell font-medium text-ink-800">{fmtDate(r.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="table-cell">{fmtTime(r.check_in)}</td>
                      <td className="table-cell">{fmtTime(r.check_out)}</td>
                      <td className="table-cell font-semibold text-ink-800">{Number(r.work_hours) ? `${r.work_hours}h` : '—'}</td>
                      <td className="table-cell"><Badge status={r.status}>{capitalize(r.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-5 py-3.5">
              <Pagination page={page} pages={pages} total={rows.length} limit={perPage} onChange={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
