import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, History, RefreshCw, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  Avatar,
  Button,
  Card,
  LoadingBlock,
  Pagination,
  Progress,
  SearchInput,
  Select,
} from '../../components/ui';
import {
  EmptyGoals,
  GoalDetailsModal,
  GoalProgressModal,
  GoalStatusBadge,
  GoalSummaryCards,
  GOAL_STATUS,
  PRIORITY,
  PriorityBadge,
  goalStatusOf,
  progressTone,
} from './performance-ui';

const EMPTY = { search: '', status: '', priority: '', departmentId: '', employeeId: '' };

export default function GoalProgress() {
  const toast = useToast();
  const { can, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = can('performance.goals.manage');
  const canAll = can(['performance.goals.view', 'performance.goals.manage']);

  const [filters, setFilters] = useState(EMPTY);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [progressGoal, setProgressGoal] = useState(null);
  const [detailsId, setDetailsId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    if (can('employees.view')) api.get('/employees/options').then((r) => setEmployees(r.data || [])).catch(() => {});
    if (can('departments.view')) api.get('/departments').then((r) => setDepartments(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '8', sort: 'target' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.departmentId) params.set('departmentId', filters.departmentId);
      if (filters.employeeId) params.set('employeeId', filters.employeeId);
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
    if (goalParam) {
      const goal = data.find((g) => Number(g.id) === Number(goalParam));
      if (goal) setProgressGoal(goal);
      else setDetailsId(Number(goalParam));
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, data]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const canProgressGoal = (goal) => canManage || goal.employee_id === user?.employeeId;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Performance</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Goal progress tracking</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {canAll ? 'Follow progress across the team and review every historical update.' : 'Update progress on your goals and keep a clear record of every step.'}
        </p>
      </div>

      <GoalSummaryCards stats={stats} loading={loading} />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search goals or employees…" className="w-full sm:w-64" />
          <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="w-auto min-w-[132px] py-2 text-[12.5px]">
            <option value="">All statuses</option>
            {Object.entries(GOAL_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </Select>
          <Select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} className="w-auto min-w-[122px] py-2 text-[12.5px]">
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
          <button onClick={() => { setFilters(EMPTY); setPage(1); }} className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-ink-800">
            <RefreshCw size={13} /> Reset
          </button>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading goal progress…" />
      ) : data.length === 0 ? (
        <Card><EmptyGoals title="No goals to track" description="Assigned goals will appear here with their latest progress." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.map((goal) => {
            const status = goalStatusOf(goal);
            return (
              <Card key={goal.id} hover className="p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={goal.employee_name} color={goal.avatar_color || 'indigo'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <GoalStatusBadge status={status} />
                      <PriorityBadge priority={goal.priority} />
                    </div>
                    <h3 className="mt-1.5 truncate text-[13.5px] font-bold text-ink-900">{goal.title}</h3>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">
                      {goal.goal_code} · {goal.employee_name} · {goal.department_name || 'Unassigned'}
                    </p>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-slate-500">{goal.description}</p>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-500">Progress</span>
                    <span className="font-bold text-ink-800">{Number(goal.progress_percentage)}%</span>
                  </div>
                  <Progress value={Number(goal.progress_percentage)} tone={progressTone(status)} className="mt-1.5" />
                  {goal.latest_note && <p className="mt-2 line-clamp-1 text-[11px] italic text-slate-400">“{goal.latest_note}”</p>}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <CalendarDays size={13} /> Target {fmtDate(goal.target_date)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" icon={History} onClick={() => setDetailsId(goal.id)}>History</Button>
                    {canProgressGoal(goal) && goal.status !== 'cancelled' && (
                      <Button variant="soft" size="sm" icon={TrendingUp} onClick={() => setProgressGoal(goal)}>Update</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && data.length > 0 && (
        <Pagination page={page} pages={pages} total={total} limit={8} onChange={setPage} />
      )}

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
        canProgress={canManage || can('performance.goals.self')}
        onProgress={(goal) => { setDetailsId(null); setProgressGoal(goal); }}
        onChanged={() => load()}
      />
    </div>
  );
}
