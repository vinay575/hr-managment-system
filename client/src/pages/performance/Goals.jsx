import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarClock, Eye, Filter, Pencil, Plus, RefreshCw, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  Avatar,
  Button,
  Card,
  Input,
  LoadingBlock,
  Pagination,
  Progress,
  SearchInput,
  Select,
} from '../../components/ui';
import {
  GoalDetailsModal,
  GoalForm,
  GoalProgressModal,
  GoalStatusBadge,
  GoalSummaryCards,
  GOAL_STATUS,
  PRIORITY,
  EmptyGoals,
  PriorityBadge,
  goalStatusOf,
  progressTone,
} from './performance-ui';

const EMPTY_FILTERS = {
  search: '',
  status: '',
  priority: '',
  departmentId: '',
  employeeId: '',
  from: '',
  to: '',
  sort: 'created',
};

export default function Goals() {
  const toast = useToast();
  const { can, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = can('performance.goals.manage');
  const canAll = can(['performance.goals.view', 'performance.goals.manage']);
  const canSelf = can('performance.goals.self');

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [progressGoal, setProgressGoal] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    if (can('employees.view')) {
      api.get('/employees/options').then((res) => setEmployees(res.data || [])).catch(() => {});
    }
    if (can('departments.view')) {
      api.get('/departments').then((res) => setDepartments(res.data || [])).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '10', sort: filters.sort });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.departmentId) params.set('departmentId', filters.departmentId);
      if (filters.employeeId) params.set('employeeId', filters.employeeId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const res = await api.get(`/performance/goals?${params}`);
      setData(res.data || []);
      setStats(res.stats || {});
      setTotal(res.total || 0);
      setPages(res.pages || 0);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, debouncedSearch, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const goalParam = searchParams.get('goal');
    const newParam = searchParams.get('new');
    if (goalParam) {
      setDetailsId(Number(goalParam));
      setSearchParams({}, { replace: true });
    } else if (newParam && canManage) {
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const activeFilters = useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) => key !== 'sort' && key !== 'search' && value).length +
      (filters.search ? 1 : 0),
    [filters]
  );

  const canProgressGoal = (goal) => canManage || (canSelf && goal.employee_id === user?.employeeId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Performance</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">
            {canAll ? 'Goal management' : 'My goals'}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {canAll ? 'Assign clear goals, set priorities and keep every deadline visible.' : 'Everything you are working towards, in one place.'}
          </p>
        </div>
        {canManage && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditGoal(null); setFormOpen(true); }}>Assign goal</Button>
        )}
      </div>

      <GoalSummaryCards stats={stats} loading={loading} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search goals or employees…" className="w-full sm:w-64" />
            <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="w-auto min-w-[132px] py-2 text-[12.5px]">
              <option value="">All statuses</option>
              {Object.entries(GOAL_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </Select>
            <Select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} className="w-auto min-w-[120px] py-2 text-[12.5px]">
              <option value="">All priorities</option>
              {Object.entries(PRIORITY).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </Select>
            {canAll && (
              <Select value={filters.departmentId} onChange={(e) => setFilter('departmentId', e.target.value)} className="w-auto min-w-[140px] py-2 text-[12.5px]">
                <option value="">All departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}
            {canAll && (
              <Select value={filters.employeeId} onChange={(e) => setFilter('employeeId', e.target.value)} className="w-auto min-w-[150px] py-2 text-[12.5px]">
                <option value="">All employees</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </Select>
            )}
            <Select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} className="w-auto min-w-[130px] py-2 text-[12.5px]">
              <option value="created">Newest first</option>
              <option value="target">Target date</option>
              <option value="progress">Progress</option>
              <option value="employee">Employee name</option>
            </Select>
            {(activeFilters > 0) && (
              <button onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-ink-800">
                <RefreshCw size={13} /> Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400"><Filter size={12} />Target date</span>
            <input type="date" className="input w-auto py-1.5 text-[12px]" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            <span className="text-[11px] text-slate-400">to</span>
            <input type="date" className="input w-auto py-1.5 text-[12px]" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
            <span className="ml-auto text-[11px] text-slate-400">{total} goal{total === 1 ? '' : 's'}</span>
          </div>
        </div>

        {loading ? (
          <LoadingBlock label="Loading goals…" />
        ) : data.length === 0 ? (
          <EmptyGoals
            title={activeFilters ? 'No goals match these filters' : 'No goals yet'}
            description={activeFilters ? 'Try a different status, priority or date range.' : canManage ? 'Assign the first goal to get started.' : 'Goals assigned to you will appear here.'}
            action={canManage ? <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Assign goal</Button> : null}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Goal</th>
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Progress</th>
                    <th className="px-4 py-3 font-semibold">Target</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((goal) => {
                    const status = goalStatusOf(goal);
                    return (
                      <tr key={goal.id} className="transition hover:bg-slate-50/60">
                        <td className="max-w-[280px] px-5 py-3">
                          <button onClick={() => setDetailsId(goal.id)} className="block max-w-full text-left">
                            <p className="truncate text-[12.5px] font-semibold text-ink-900 hover:text-brand-600">{goal.title}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-400">
                              <span className="font-mono">{goal.goal_code}</span>
                              {goal.attachment_count > 0 && <span>· {goal.attachment_count} file{Number(goal.attachment_count) === 1 ? '' : 's'}</span>}
                              {goal.update_count > 0 && <span>· {goal.update_count} update{Number(goal.update_count) === 1 ? '' : 's'}</span>}
                            </p>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={goal.employee_name} color={goal.avatar_color || 'indigo'} size="xs" />
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-ink-800">{goal.employee_name}</p>
                              <p className="text-[10px] text-slate-400">{goal.employee_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[11.5px] text-slate-500">{goal.department_name || '—'}</td>
                        <td className="px-4 py-3"><PriorityBadge priority={goal.priority} /></td>
                        <td className="px-4 py-3"><GoalStatusBadge status={status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Progress value={Number(goal.progress_percentage)} tone={progressTone(status)} height="h-1.5" className="w-20" />
                            <span className="text-[11px] font-semibold text-slate-500">{Number(goal.progress_percentage)}%</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[11.5px] text-slate-500">
                          <span className={clsx(status === 'overdue' && 'font-semibold text-rose-600')}>{fmtDate(goal.target_date)}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {canProgressGoal(goal) && goal.status !== 'cancelled' && (
                              <button onClick={() => setProgressGoal(goal)} className="icon-btn h-8 w-8 text-brand-500 hover:bg-brand-50" title="Update progress"><TrendingUp size={15} /></button>
                            )}
                            {canManage && goal.status !== 'cancelled' && (
                              <button onClick={() => { setEditGoal(goal); setFormOpen(true); }} className="icon-btn h-8 w-8" title="Edit goal"><Pencil size={14} /></button>
                            )}
                            <button onClick={() => setDetailsId(goal.id)} className="icon-btn h-8 w-8" title="View goal"><Eye size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-5 py-3">
              <Pagination page={page} pages={pages} total={total} limit={10} onChange={setPage} />
            </div>
          </>
        )}
      </Card>

      <GoalForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditGoal(null); }}
        onSaved={() => load()}
        goal={editGoal}
        employees={employees}
        departments={departments}
      />

      <GoalProgressModal
        open={Boolean(progressGoal)}
        onClose={() => setProgressGoal(null)}
        goal={progressGoal}
        onSaved={() => load()}
      />

      <GoalDetailsModal
        open={Boolean(detailsId)}
        onClose={() => setDetailsId(null)}
        goalId={detailsId}
        canManage={canManage}
        canProgress={canManage || canSelf}
        onEdit={(goal) => { setDetailsId(null); setEditGoal(goal); setFormOpen(true); }}
        onProgress={(goal) => { setDetailsId(null); setProgressGoal(goal); }}
        onChanged={() => load()}
      />
    </div>
  );
}
