import { useCallback, useEffect, useState } from 'react';
import { Download, FileDown, Filter, RefreshCw, Target } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Progress,
  SearchInput,
  Select,
  Tabs,
} from '../../components/ui';
import {
  CYCLE_STATUS,
  CycleStatusBadge,
  GOAL_STATUS,
  GoalStatusBadge,
  PRIORITY,
  PriorityBadge,
  REVIEW_PERIOD,
  goalStatusOf,
  progressTone,
} from './performance-ui';

const TABS = [
  { key: 'goals', label: 'Goal reports' },
  { key: 'employees', label: 'Employee reports' },
  { key: 'departments', label: 'Department reports' },
  { key: 'review-cycles', label: 'Review cycle reports' },
];

const EMPTY = { search: '', employeeId: '', departmentId: '', status: '', priority: '', period: '', from: '', to: '' };

function Stat({ label, value, tone = 'text-ink-900', loading }) {
  return (
    <Card className="p-4">
      <p className="text-[11.5px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 font-display text-[24px] font-bold leading-none ${tone}`}>{loading ? '—' : Number(value || 0)}</p>
    </Card>
  );
}

export default function PerformanceReports() {
  const toast = useToast();
  const { can } = useAuth();
  const [tab, setTab] = useState('goals');
  const [filters, setFilters] = useState(EMPTY);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    if (can('employees.view')) api.get('/employees/options').then((r) => setEmployees(r.data || [])).catch(() => {});
    if (can('departments.view')) api.get('/departments').then((r) => setDepartments(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildParams = useCallback(
    (extra = {}) => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.employeeId) params.set('employeeId', filters.employeeId);
      if (filters.departmentId) params.set('departmentId', filters.departmentId);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.period) params.set('period', filters.period);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      for (const [key, value] of Object.entries(extra)) params.set(key, value);
      return params;
    },
    [debouncedSearch, filters]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/performance/reports/${tab}?${buildParams()}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tab, buildParams, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const exportReport = async (format) => {
    try {
      setExporting(format);
      const params = buildParams({ type: tab, format });
      const filename = await api.download(
        `/performance/reports/export?${params}`,
        `aurora-performance-${tab}.${format}`
      );
      toast.success(`Downloaded ${filename}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting('');
    }
  };

  const summary = data?.summary || {};
  const rows = data?.rows || data?.data || [];
  const showPriority = tab === 'goals';
  const showGoalStatus = tab === 'goals';
  const showCycleStatus = tab === 'review-cycles';
  const showPeriod = tab === 'review-cycles';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Performance</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Performance reports</h1>
          <p className="mt-1 text-[13px] text-slate-500">Goal progress and review cycle reporting from live records.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Download} loading={exporting === 'csv'} onClick={() => exportReport('csv')}>Export CSV</Button>
          <Button variant="secondary" size="sm" icon={FileDown} loading={exporting === 'pdf'} onClick={() => exportReport('pdf')}>Export PDF</Button>
        </div>
      </div>

      <Tabs items={TABS} value={tab} onChange={(next) => { setTab(next); setData(null); }} />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search reports…" className="w-full sm:w-60" />
          <Select value={filters.departmentId} onChange={(e) => setFilter('departmentId', e.target.value)} className="w-auto min-w-[140px] py-2 text-[12.5px]">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          {tab !== 'departments' && (
            <Select value={filters.employeeId} onChange={(e) => setFilter('employeeId', e.target.value)} className="w-auto min-w-[150px] py-2 text-[12.5px]">
              <option value="">All employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </Select>
          )}
          {(tab === 'goals' || tab === 'review-cycles') && (
            <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="w-auto min-w-[128px] py-2 text-[12.5px]">
              <option value="">All statuses</option>
              {(tab === 'goals' ? Object.entries(GOAL_STATUS) : Object.entries(CYCLE_STATUS)).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </Select>
          )}
          {showPriority && (
            <Select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} className="w-auto min-w-[120px] py-2 text-[12.5px]">
              <option value="">All priorities</option>
              {Object.entries(PRIORITY).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </Select>
          )}
          {showPeriod && (
            <Select value={filters.period} onChange={(e) => setFilter('period', e.target.value)} className="w-auto min-w-[135px] py-2 text-[12.5px]">
              <option value="">All periods</option>
              {Object.entries(REVIEW_PERIOD).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          )}
          <button onClick={() => setFilters(EMPTY)} className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-ink-800">
            <RefreshCw size={13} /> Reset
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400"><Filter size={12} />{tab === 'review-cycles' ? 'Cycle window' : 'Target date'}</span>
          <input type="date" className="input w-auto py-1.5 text-[12px]" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
          <span className="text-[11px] text-slate-400">to</span>
          <input type="date" className="input w-auto py-1.5 text-[12px]" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Building report…" />
      ) : !data ? (
        <Card><EmptyState icon={Target} title="Report unavailable" description="Adjust the filters and try again." /></Card>
      ) : (
        <>
          {tab === 'goals' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Total goals" value={summary.totalGoals} />
                <Stat label="Completed" value={summary.completed} tone="text-emerald-600" />
                <Stat label="In progress" value={summary.inProgress} tone="text-sky-600" />
                <Stat label="Pending" value={summary.pending} tone="text-amber-600" />
                <Stat label="Overdue" value={summary.overdue} tone="text-rose-600" />
                <Stat label="Cancelled" value={summary.cancelled} tone="text-slate-500" />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="p-4">
                  <p className="text-[12px] font-semibold text-ink-800">Goals by priority</p>
                  <div className="mt-3 space-y-2">
                    {(data.byPriority || []).map((p) => (
                      <div key={p.priority} className="flex items-center justify-between text-[11.5px]">
                        <PriorityBadge priority={p.priority} />
                        <span className="font-semibold text-slate-500">{Number(p.count)} <span className="text-[10px] font-normal text-slate-400">({Number(p.completed)} done)</span></span>
                      </div>
                    ))}
                    {(data.byPriority || []).length === 0 && <p className="py-4 text-center text-[11.5px] text-slate-400">No goals in this range.</p>}
                  </div>
                </Card>
                <Card className="p-4">
                  <p className="text-[12px] font-semibold text-ink-800">Goals by status</p>
                  <div className="mt-3 space-y-2">
                    {(data.byStatus || []).map((s) => (
                      <div key={s.status} className="flex items-center justify-between text-[11.5px]">
                        <GoalStatusBadge status={s.status} />
                        <span className="font-semibold text-slate-500">{Number(s.count)}</span>
                      </div>
                    ))}
                    {(data.byStatus || []).length === 0 && <p className="py-4 text-center text-[11.5px] text-slate-400">No goals in this range.</p>}
                  </div>
                </Card>
                <Card className="p-4">
                  <p className="text-[12px] font-semibold text-ink-800">Goals by department</p>
                  <div className="mt-3 space-y-2">
                    {(data.byDepartment || []).slice(0, 8).map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-[11.5px]">
                        <span className="truncate text-slate-600">{d.name}</span>
                        <span className="font-semibold text-slate-500">{Number(d.completed)}/{Number(d.total)}</span>
                      </div>
                    ))}
                    {(data.byDepartment || []).length === 0 && <p className="py-4 text-center text-[11.5px] text-slate-400">No department data.</p>}
                  </div>
                </Card>
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-3.5 text-[12.5px] font-bold text-ink-900">Goal report</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Code</th>
                        <th className="px-4 py-3 font-semibold">Employee</th>
                        <th className="px-4 py-3 font-semibold">Department</th>
                        <th className="px-4 py-3 font-semibold">Goal</th>
                        <th className="px-4 py-3 font-semibold">Priority</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Target</th>
                        <th className="px-5 py-3 font-semibold">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => (
                        <tr key={r.goal_code} className="hover:bg-slate-50/60">
                          <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[10.5px] text-slate-500">{r.goal_code}</td>
                          <td className="px-4 py-2.5">
                            <p className="text-[12px] font-medium text-ink-800">{r.employee}</p>
                            <p className="text-[10px] text-slate-400">{r.employee_code}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-slate-500">{r.department || '—'}</td>
                          <td className="max-w-[260px] truncate px-4 py-2.5 text-[12px] text-ink-800">{r.title}</td>
                          <td className="px-4 py-2.5"><PriorityBadge priority={r.priority} /></td>
                          <td className="px-4 py-2.5"><GoalStatusBadge status={r.status} /></td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[11px] text-slate-500">{fmtDate(r.target_date)}</td>
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <Progress value={Number(r.progress_percentage)} tone={progressTone(r.status)} height="h-1.5" className="w-20" />
                              <span className="text-[11px] font-semibold text-slate-500">{Number(r.progress_percentage)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-[12px] text-slate-400">No goals match these filters.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {tab === 'employees' && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3.5">
                <p className="text-[12.5px] font-bold text-ink-900">Employee-wise goals</p>
                <p className="text-[11px] text-slate-400">Assigned, completed, in progress, pending and overdue goals per employee.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Employee</th>
                      <th className="px-4 py-3 font-semibold">Employee ID</th>
                      <th className="px-4 py-3 font-semibold">Department</th>
                      <th className="px-4 py-3 font-semibold">Assigned</th>
                      <th className="px-4 py-3 font-semibold">Completed</th>
                      <th className="px-4 py-3 font-semibold">In progress</th>
                      <th className="px-4 py-3 font-semibold">Pending</th>
                      <th className="px-5 py-3 font-semibold">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar name={r.name} color={r.avatar_color || 'indigo'} size="xs" />
                            <span className="text-[12px] font-medium text-ink-800">{r.name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-[11px] text-slate-500">{r.employee_code}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-slate-500">{r.department_name}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-ink-800">{Number(r.total_goals)}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-emerald-600">{Number(r.completed)}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-sky-600">{Number(r.in_progress)}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-amber-600">{Number(r.pending)}</td>
                        <td className="px-5 py-2.5 text-[12px] font-semibold text-rose-600">{Number(r.overdue)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-[12px] text-slate-400">No employee goals match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'departments' && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3.5">
                <p className="text-[12.5px] font-bold text-ink-900">Department-wise goals</p>
                <p className="text-[11px] text-slate-400">Goal distribution and completion by department.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Department</th>
                      <th className="px-4 py-3 font-semibold">Employees</th>
                      <th className="px-4 py-3 font-semibold">Goals</th>
                      <th className="px-4 py-3 font-semibold">Completed</th>
                      <th className="px-4 py-3 font-semibold">In progress</th>
                      <th className="px-4 py-3 font-semibold">Pending</th>
                      <th className="px-5 py-3 font-semibold">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.name} className="hover:bg-slate-50/60">
                        <td className="px-5 py-2.5 text-[12px] font-medium text-ink-800">{r.name}</td>
                        <td className="px-4 py-2.5 text-[12px] text-slate-500">{Number(r.total_employees)}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-ink-800">{Number(r.total_goals)}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-emerald-600">{Number(r.completed)}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-sky-600">{Number(r.in_progress)}</td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-amber-600">{Number(r.pending)}</td>
                        <td className="px-5 py-2.5 text-[12px] font-semibold text-rose-600">{Number(r.overdue)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-[12px] text-slate-400">No department goals match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'review-cycles' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Total cycles" value={summary.totalCycles} />
                <Stat label="Active" value={summary.active} tone="text-sky-600" />
                <Stat label="Completed" value={summary.completed} tone="text-emerald-600" />
                <Stat label="Cancelled" value={summary.cancelled} tone="text-rose-600" />
                <Stat label="Goals covered" value={summary.goalsCovered} />
                <Stat label="Goals completed" value={summary.goalsCompleted} tone="text-emerald-600" />
              </div>
              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-3.5">
                  <p className="text-[12.5px] font-bold text-ink-900">Review cycle report</p>
                  <p className="text-[11px] text-slate-400">Goals covered by each cycle and completion during the review period.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Cycle</th>
                        <th className="px-4 py-3 font-semibold">Period</th>
                        <th className="px-4 py-3 font-semibold">Department</th>
                        <th className="px-4 py-3 font-semibold">Employees</th>
                        <th className="px-4 py-3 font-semibold">Goals</th>
                        <th className="px-4 py-3 font-semibold">Completed</th>
                        <th className="px-4 py-3 font-semibold">Pending</th>
                        <th className="px-4 py-3 font-semibold">Overdue</th>
                        <th className="px-4 py-3 font-semibold">Dates</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="max-w-[220px] truncate px-5 py-2.5 text-[12px] font-medium text-ink-800">{r.cycle_name}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-slate-500">{REVIEW_PERIOD[r.review_period] || r.review_period}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-slate-500">{r.department_name || 'All departments'}</td>
                          <td className="px-4 py-2.5 text-[12px] text-ink-800">{Number(r.employee_count)}</td>
                          <td className="px-4 py-2.5 text-[12px] text-ink-800">{Number(r.total_goals)}</td>
                          <td className="px-4 py-2.5 text-[12px] font-semibold text-emerald-600">{Number(r.completed_goals)}</td>
                          <td className="px-4 py-2.5 text-[12px] font-semibold text-amber-600">{Number(r.pending_goals)}</td>
                          <td className="px-4 py-2.5 text-[12px] font-semibold text-rose-600">{Number(r.overdue_goals)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[11px] text-slate-500">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                          <td className="px-5 py-2.5"><CycleStatusBadge status={r.status} /></td>
                        </tr>
                      ))}
                      {rows.length === 0 && <tr><td colSpan={10} className="px-5 py-10 text-center text-[12px] text-slate-400">No review cycles match these filters.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      <p className="text-[11px] text-slate-400">
        All values are generated from live database records. Exports reflect the current filters.
      </p>
    </div>
  );
}
