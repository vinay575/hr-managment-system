import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Plus,
  Receipt,
  Send,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Pagination,
  SearchInput,
  SectionTitle,
  StatCard,
  Tabs,
} from '../../components/ui';
import {
  ExpenseDetailsModal,
  ExpenseForm,
  ExpenseStatusBadge,
  NoExpenses,
  REIMBURSABLE_STATUS,
  ReimbursementStatusBadge,
  expenseMoney,
} from './expense-ui';

const STATUS_TABS = [
  { key: '', label: 'All claims' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'In review' },
  { key: 'clarification_required', label: 'Clarification' },
  { key: 'approved', label: 'Approved' },
  { key: 'reimbursement_pending', label: 'Reimbursement' },
  { key: 'reimbursed', label: 'Reimbursed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'draft', label: 'Drafts' },
];

export default function MyExpenses() {
  const toast = useToast();
  const [data, setData] = useState({ data: [], stats: {}, page: 1, pages: 0, total: 0 });
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({});
  const [currencies, setCurrencies] = useState(['USD']);
  const [departmentName, setDepartmentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editClaim, setEditClaim] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      const res = await api.get(`/expenses/my?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, status, search, categoryId, toast]);

  const loadMeta = useCallback(async () => {
    try {
      const [catRes, me] = await Promise.all([api.get('/expenses/categories'), api.get('/auth/me')]);
      setCategories(catRes.data || []);
      setSettings(catRes.settings || {});
      setCurrencies(catRes.currencies || ['USD']);
      setDepartmentName(me.employee?.department || '');
    } catch {
      /* categories are non-critical for rendering */
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const stats = data.stats || {};
  const rows = data.data || [];

  const openNew = () => {
    setEditClaim(null);
    setFormOpen(true);
  };

  const openEdit = async (claim) => {
    try {
      const res = await api.get(`/expenses/${claim.id}`);
      setEditClaim(res.claim);
      setFormOpen(true);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const submitClaim = async (claim) => {
    setActing(claim.id);
    try {
      const res = await api.post(`/expenses/${claim.id}/submit`);
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  const cancelClaim = async (claim) => {
    if (!window.confirm(`Cancel ${claim.expense_code}? This cannot be undone.`)) return;
    setActing(claim.id);
    try {
      const res = await api.post(`/expenses/${claim.id}/cancel`, { reason: 'Cancelled by employee.' });
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  const downloadStatement = async () => {
    try {
      await api.download('/expenses/reports/statement', 'expense-statement.pdf');
      toast.success('Expense statement downloaded.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Self service</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">My expenses</h1>
          <p className="mt-1 text-[13px] text-slate-500">Submit claims, attach receipts and follow every approval and reimbursement.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" icon={Download} onClick={downloadStatement}>Statement</Button>
          <Button variant="primary" icon={Plus} onClick={openNew}>Submit expense</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Pending approval" value={stats.pending ?? 0} sub="Submitted or in review" icon={Clock3} tone="amber" />
        <StatCard label="Approved claims" value={stats.approved ?? 0} sub={expenseMoney(stats.approvedAmount)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Rejected claims" value={stats.rejected ?? 0} sub="See rejection reasons" icon={XCircle} tone="rose" />
        <StatCard label="Reimbursed" value={expenseMoney(stats.reimbursedAmount)} sub="Paid to you" icon={Wallet} tone="teal" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={STATUS_TABS.map((t) => ({ ...t, count: t.key === '' ? data.total : undefined }))} />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search claims…" className="w-full sm:w-56" />
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="input w-auto min-w-[160px] py-2 text-[12.5px]">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading your expenses…" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title={status || search || categoryId ? 'No matching claims' : 'No expenses yet'}
            description={status || search || categoryId ? 'Try a different filter to see your claims.' : 'Submit your first expense claim and attach the receipt.'}
            action={<Button variant="primary" icon={Plus} onClick={openNew}>Submit expense</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <SectionTitle title="Your expense claims" description={`${data.total} claim${data.total === 1 ? '' : 's'} in this view`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-head">Expense</th>
                  <th className="table-head">Category</th>
                  <th className="table-head">Expense date</th>
                  <th className="table-head">Amount</th>
                  <th className="table-head">Approval</th>
                  <th className="table-head">Reimbursement</th>
                  <th className="table-head">Receipts</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((claim) => {
                  const editable = ['draft', 'clarification_required'].includes(claim.approval_status);
                  const cancellable = ['draft', 'submitted', 'under_review', 'clarification_required'].includes(claim.approval_status);
                  return (
                    <tr key={claim.id} className="cursor-pointer transition hover:bg-slate-50/60" onClick={() => setDetailId(claim.id)}>
                      <td className="table-cell">
                        <p className="text-[13px] font-semibold text-ink-900">{claim.title}</p>
                        <p className="text-[11px] text-slate-400">{claim.expense_code}</p>
                      </td>
                      <td className="table-cell">{claim.category_name}</td>
                      <td className="table-cell">{fmtDate(claim.expense_date)}</td>
                      <td className="table-cell"><span className="font-semibold text-ink-900">{expenseMoney(claim.amount, claim.currency)}</span></td>
                      <td className="table-cell"><ExpenseStatusBadge status={claim.approval_status} /></td>
                      <td className="table-cell">
                        {REIMBURSABLE_STATUS.includes(claim.approval_status) || claim.approval_status === 'reimbursed'
                          ? <ReimbursementStatusBadge status={claim.reimbursement_status} />
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="table-cell">
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-500"><FileText size={13} /> {claim.attachment_count || 0}</span>
                      </td>
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {claim.approval_status === 'draft' && (
                            <button className="icon-btn h-8 w-8 text-brand-600 hover:bg-brand-50" title="Submit" disabled={acting === claim.id} onClick={() => submitClaim(claim)}>
                              <Send size={14} />
                            </button>
                          )}
                          {editable && (
                            <button className="icon-btn h-8 w-8" title="Edit" onClick={() => openEdit(claim)}>
                              <FileText size={14} />
                            </button>
                          )}
                          {cancellable && (
                            <button className="icon-btn h-8 w-8 text-rose-500 hover:bg-rose-50" title="Cancel" disabled={acting === claim.id} onClick={() => cancelClaim(claim)}>
                              <XCircle size={14} />
                            </button>
                          )}
                          <button className="rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50" onClick={() => setDetailId(claim.id)}>
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-5 py-4">
            <Pagination page={data.page} pages={data.pages} total={data.total} limit={10} onChange={setPage} />
          </div>
        </Card>
      )}

      <ExpenseForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => load()}
        categories={categories}
        settings={settings}
        currencies={currencies}
        claim={editClaim}
        departmentName={departmentName}
      />

      <ExpenseDetailsModal
        open={Boolean(detailId)}
        expenseId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
        onEdit={openEdit}
        canApprove={false}
        canReimburse={false}
      />
    </div>
  );
}
