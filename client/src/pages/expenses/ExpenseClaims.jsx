import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Download, FileText, Receipt, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Pagination,
  SearchInput,
  SectionTitle,
} from '../../components/ui';
import {
  EXPENSE_STATUS,
  ExpenseDetailsModal,
  ExpenseStatusBadge,
  REIMBURSABLE_STATUS,
  REIMBURSEMENT_STATUS,
  ReimbursementStatusBadge,
  expenseMoney,
} from './expense-ui';

const SORTABLE = [
  { key: 'expense_date', label: 'Expense date' },
  { key: 'submitted_at', label: 'Submitted' },
  { key: 'amount', label: 'Amount' },
  { key: 'employee', label: 'Employee' },
  { key: 'approval_status', label: 'Approval' },
  { key: 'reimbursement_status', label: 'Reimbursement' },
];

export default function ExpenseClaims() {
  const toast = useToast();
  const { can } = useAuth();
  const [data, setData] = useState({ data: [], total: 0, page: 1, pages: 0 });
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    reimbursementStatus: '',
    categoryId: '',
    departmentId: '',
    from: '',
    to: '',
    sort: 'created_at',
    dir: 'desc',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const res = await api.get(`/expenses?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/expenses/categories').then((res) => setCategories(res.data || [])).catch(() => {});
    if (can('departments.view')) {
      api.get('/departments').then((res) => setDepartments(res.data || res.departments || [])).catch(() => {});
    }
  }, [can]);

  const update = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const sortBy = (key) => {
    setFilters((prev) => ({ ...prev, sort: key, dir: prev.sort === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
    setPage(1);
  };

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams({ type: 'claims' });
      Object.entries(filters).forEach(([key, value]) => {
        if (value && !['sort', 'dir'].includes(key)) params.set(key, value);
      });
      await api.download(`/expenses/reports/export?${params}`, 'expense-claims.csv');
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const clearFilters = () => {
    setFilters({ search: '', status: '', reimbursementStatus: '', categoryId: '', departmentId: '', from: '', to: '', sort: 'created_at', dir: 'desc' });
    setPage(1);
  };

  const SortHead = ({ field, children, className }) => (
    <th className={clsx('table-head', className)}>
      <button onClick={() => sortBy(field)} className="inline-flex items-center gap-1 transition hover:text-ink-700">
        {children}
        {filters.sort === field ? (filters.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : null}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Expenses</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">All expense claims</h1>
          <p className="mt-1 text-[13px] text-slate-500">Every claim, receipt and decision across the organisation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? 'Hide filters' : 'Filters'}
          </Button>
          {can('expenses.reports') && <Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>}
        </div>
      </div>

      {showFilters && (
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SearchInput value={filters.search} onChange={(v) => update('search', v)} placeholder="Search employee, claim ID…" />
            <select className="input py-2 text-[12.5px]" value={filters.status} onChange={(e) => update('status', e.target.value)}>
              <option value="">All approval statuses</option>
              {Object.entries(EXPENSE_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </select>
            <select className="input py-2 text-[12.5px]" value={filters.reimbursementStatus} onChange={(e) => update('reimbursementStatus', e.target.value)}>
              <option value="">All reimbursement statuses</option>
              {Object.entries(REIMBURSEMENT_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </select>
            <select className="input py-2 text-[12.5px]" value={filters.categoryId} onChange={(e) => update('categoryId', e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {departments.length > 0 && (
              <select className="input py-2 text-[12.5px]" value={filters.departmentId} onChange={(e) => update('departmentId', e.target.value)}>
                <option value="">All departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <select className="input py-2 text-[12.5px]" value={`${filters.sort}:${filters.dir}`} onChange={(e) => {
              const [sort, dir] = e.target.value.split(':');
              setFilters((prev) => ({ ...prev, sort, dir }));
              setPage(1);
            }}>
              {SORTABLE.map((s) => (
                <optgroup key={s.key} label={s.label}>
                  <option value={`${s.key}:desc`}>{s.label} ↓</option>
                  <option value={`${s.key}:asc`}>{s.label} ↑</option>
                </optgroup>
              ))}
              <option value="created_at:desc">Newest first</option>
            </select>
            <input type="date" className="input py-2 text-[12.5px]" value={filters.from} onChange={(e) => update('from', e.target.value)} title="From date" />
            <div className="flex items-center gap-2">
              <input type="date" className="input py-2 text-[12.5px]" value={filters.to} onChange={(e) => update('to', e.target.value)} title="To date" />
              <button onClick={clearFilters} className="whitespace-nowrap text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">Clear</button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <LoadingBlock label="Loading expense claims…" />
      ) : data.data.length === 0 ? (
        <Card>
          <EmptyState icon={Receipt} title="No claims found" description="Try changing the filters above to see more expense claims." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <SectionTitle title="Expense register" description={`${data.total} claim${data.total === 1 ? '' : 's'} matched`} />
            <span className="text-[11px] text-slate-400">Private receipts · authorized access only</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1260px]">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-head">Expense ID</th>
                  <SortHead field="employee">Employee</SortHead>
                  <th className="table-head">Department</th>
                  <th className="table-head">Title</th>
                  <th className="table-head">Category</th>
                  <SortHead field="expense_date">Expense date</SortHead>
                  <SortHead field="submitted_at">Submitted</SortHead>
                  <SortHead field="amount">Amount</SortHead>
                  <SortHead field="approval_status">Approval</SortHead>
                  <SortHead field="reimbursement_status">Reimbursement</SortHead>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((claim) => (
                  <tr key={claim.id} className="cursor-pointer transition hover:bg-slate-50/60" onClick={() => setDetailId(claim.id)}>
                    <td className="table-cell"><span className="font-mono text-[11.5px] font-semibold text-brand-600">{claim.expense_code}</span></td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <Avatar name={claim.employee_name} color={claim.avatar_color || 'indigo'} size="sm" />
                        <div>
                          <p className="text-[13px] font-semibold text-ink-900">{claim.employee_name}</p>
                          <p className="text-[11px] text-slate-400">{claim.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">{claim.department_name || '—'}</td>
                    <td className="table-cell"><span className="block max-w-[190px] truncate">{claim.title}</span></td>
                    <td className="table-cell">{claim.category_name}</td>
                    <td className="table-cell">{fmtDate(claim.expense_date)}</td>
                    <td className="table-cell">{claim.submitted_at ? fmtDate(claim.submitted_at) : '—'}</td>
                    <td className="table-cell"><span className="font-semibold text-ink-900">{expenseMoney(claim.amount, claim.currency)}</span></td>
                    <td className="table-cell"><ExpenseStatusBadge status={claim.approval_status} /></td>
                    <td className="table-cell">
                      {REIMBURSABLE_STATUS.includes(claim.approval_status) || claim.approval_status === 'reimbursed'
                        ? <ReimbursementStatusBadge status={claim.reimbursement_status} />
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="icon-btn h-8 w-8" title="View details" onClick={() => setDetailId(claim.id)}>
                          <FileText size={14} />
                        </button>
                        {Number(claim.attachment_count) > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10.5px] font-semibold text-slate-500">
                            <Receipt size={11} /> {claim.attachment_count}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-5 py-4">
            <Pagination page={data.page} pages={data.pages} total={data.total} limit={10} onChange={setPage} />
          </div>
        </Card>
      )}

      <ExpenseDetailsModal
        open={Boolean(detailId)}
        expenseId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
        canApprove={can('expenses.approve')}
        canReimburse={false}
      />
    </div>
  );
}
