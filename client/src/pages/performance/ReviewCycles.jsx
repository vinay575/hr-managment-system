import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck2, Eye, Pencil, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  Button,
  Card,
  LoadingBlock,
  Pagination,
  SearchInput,
  Select,
  SectionTitle,
} from '../../components/ui';
import {
  CYCLE_STATUS,
  CycleStatusBadge,
  EmptyCycles,
  REVIEW_PERIOD,
  ReviewCycleDetailsModal,
  ReviewCycleForm,
} from './performance-ui';

const EMPTY = { search: '', status: '', period: '', departmentId: '', from: '', to: '' };

export default function ReviewCycles() {
  const toast = useToast();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = can('performance.reviews.manage');

  const [filters, setFilters] = useState(EMPTY);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editCycle, setEditCycle] = useState(null);
  const [detailsId, setDetailsId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    if (can('departments.view')) api.get('/departments').then((r) => setDepartments(r.data || [])).catch(() => {});
    if (can('employees.view')) api.get('/employees/options').then((r) => setEmployees(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.status) params.set('status', filters.status);
      if (filters.period) params.set('period', filters.period);
      if (filters.departmentId) params.set('departmentId', filters.departmentId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const res = await api.get(`/performance/review-cycles?${params}`);
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
    const cycleParam = searchParams.get('cycle');
    if (cycleParam) {
      setDetailsId(Number(cycleParam));
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const cards = [
    { key: 'active', label: 'Active', tone: 'text-emerald-600' },
    { key: 'scheduled', label: 'Scheduled', tone: 'text-sky-600' },
    { key: 'draft', label: 'Draft', tone: 'text-slate-500' },
    { key: 'completed', label: 'Completed', tone: 'text-indigo-600' },
    { key: 'cancelled', label: 'Cancelled', tone: 'text-rose-500' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Performance</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Review cycles</h1>
          <p className="mt-1 text-[13px] text-slate-500">Organise periodic goal reviews — cycle summaries only, no scoring or assessments.</p>
        </div>
        {canManage && (
          <Button variant="primary" icon={Plus} onClick={() => { setEditCycle(null); setFormOpen(true); }}>Create review cycle</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.key} className="p-3.5">
            <p className="text-[11px] font-medium text-slate-500">{c.label}</p>
            <p className={`mt-1 font-display text-[20px] font-bold ${c.tone}`}>{loading ? '—' : Number(stats[c.key] || 0)}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search review cycles…" className="w-full sm:w-64" />
            <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="w-auto min-w-[130px] py-2 text-[12.5px]">
              <option value="">All statuses</option>
              {Object.entries(CYCLE_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </Select>
            <Select value={filters.period} onChange={(e) => setFilter('period', e.target.value)} className="w-auto min-w-[135px] py-2 text-[12.5px]">
              <option value="">All periods</option>
              {Object.entries(REVIEW_PERIOD).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
            {can('departments.view') && (
              <Select value={filters.departmentId} onChange={(e) => setFilter('departmentId', e.target.value)} className="w-auto min-w-[140px] py-2 text-[12.5px]">
                <option value="">All departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}
            <button onClick={() => { setFilters(EMPTY); setPage(1); }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-ink-800">
              <RefreshCw size={13} /> Reset
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-400">Cycle window</span>
            <input type="date" className="input w-auto py-1.5 text-[12px]" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            <span className="text-[11px] text-slate-400">to</span>
            <input type="date" className="input w-auto py-1.5 text-[12px]" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
            <span className="ml-auto text-[11px] text-slate-400">{total} cycle{total === 1 ? '' : 's'}</span>
          </div>
        </div>

        {loading ? (
          <LoadingBlock label="Loading review cycles…" />
        ) : data.length === 0 ? (
          <EmptyCycles title="No review cycles found" description={canManage ? 'Create your first review cycle to organise periodic goal reviews.' : 'Review cycles assigned to you will appear here.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Cycle</th>
                    <th className="px-4 py-3 font-semibold">Period</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Employees</th>
                    <th className="px-4 py-3 font-semibold">Goals</th>
                    <th className="px-4 py-3 font-semibold">Dates</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((cycle) => {
                    const readonly = ['completed', 'cancelled'].includes(cycle.status);
                    return (
                      <tr key={cycle.id} className="transition hover:bg-slate-50/60">
                        <td className="max-w-[260px] px-5 py-3">
                          <button onClick={() => setDetailsId(cycle.id)} className="block max-w-full text-left">
                            <p className="truncate text-[12.5px] font-semibold text-ink-900 hover:text-brand-600">{cycle.cycle_name}</p>
                            <p className="mt-0.5 truncate text-[10.5px] text-slate-400">{cycle.description || 'No description'}</p>
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[11.5px] capitalize text-slate-500">{REVIEW_PERIOD[cycle.review_period] || cycle.review_period}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-[11.5px] text-slate-500">{cycle.department_name || 'All departments'}</td>
                        <td className="px-4 py-3 text-[12px] font-medium text-ink-800">{Number(cycle.employee_count)}</td>
                        <td className="px-4 py-3 text-[11.5px] text-slate-500">
                          <span className="font-semibold text-emerald-600">{Number(cycle.completed_goals)}</span>
                          <span className="text-slate-300"> / </span>
                          <span className="font-semibold text-ink-800">{Number(cycle.total_goals)}</span>
                          <span className="ml-1 text-[10px] text-slate-400">done</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[11px] text-slate-500">
                          {fmtDate(cycle.start_date)}<br />
                          <span className="text-slate-400">to {fmtDate(cycle.end_date)}</span>
                        </td>
                        <td className="px-4 py-3"><CycleStatusBadge status={cycle.status} /></td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {canManage && !readonly && (
                              <button onClick={() => { setEditCycle(cycle); setFormOpen(true); }} className="icon-btn h-8 w-8" title="Edit cycle"><Pencil size={14} /></button>
                            )}
                            <button onClick={() => setDetailsId(cycle.id)} className="icon-btn h-8 w-8" title="View cycle"><Eye size={15} /></button>
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

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><CalendarCheck2 size={18} /></div>
        <div className="min-w-0 flex-1">
          <SectionTitle title="A review cycle summarises goals — it does not assess people." description="Cycle completion uses goal status and target dates inside the review window." />
        </div>
      </Card>

      <ReviewCycleForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditCycle(null); }}
        onSaved={() => load()}
        cycle={editCycle}
        employees={employees}
        departments={departments}
      />

      <ReviewCycleDetailsModal
        open={Boolean(detailsId)}
        onClose={() => setDetailsId(null)}
        cycleId={detailsId}
        canManage={canManage}
        onEdit={(cycle) => { setDetailsId(null); setEditCycle(cycle); setFormOpen(true); }}
        onChanged={() => load()}
      />
    </div>
  );
}
