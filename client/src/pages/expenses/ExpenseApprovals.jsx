import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileText, Receipt, Search, ShieldCheck } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  SectionTitle,
  StatCard,
  Tabs,
} from '../../components/ui';
import { ExpenseDetailsModal, ExpenseStatusBadge, expenseMoney } from './expense-ui';

const TABS = [
  { key: '', label: 'All pending' },
  { key: 'submitted', label: 'New submissions' },
  { key: 'under_review', label: 'In review' },
  { key: 'clarification_required', label: 'Clarification' },
];

export default function ExpenseApprovals() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/expenses/approvals/pending');
      setData(res.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    return data.filter((claim) => {
      if (status && claim.approval_status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          String(claim.employee_name || '').toLowerCase().includes(q) ||
          String(claim.expense_code || '').toLowerCase().includes(q) ||
          String(claim.title || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, status, search]);

  const totalAmount = data.reduce((sum, claim) => sum + Number(claim.amount || 0), 0);
  const oldesDays = data.length
    ? Math.max(...data.map((claim) => Math.floor((Date.now() - new Date(claim.submitted_at || claim.created_at).getTime()) / 86400000)))
    : 0;

  const counts = useMemo(() => {
    const map = {};
    data.forEach((claim) => { map[claim.approval_status] = (map[claim.approval_status] || 0) + 1; });
    return map;
  }, [data]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Expenses</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Expense approvals</h1>
        <p className="mt-1 text-[13px] text-slate-500">Review claims, check receipts and record a clear decision. You can never approve your own claims.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Awaiting decision" value={data.length} sub="Claims in your queue" icon={Clock3} tone="amber" />
        <StatCard label="Value in queue" value={expenseMoney(totalAmount)} sub="Total claimed" icon={Receipt} tone="indigo" />
        <StatCard label="Oldest claim" value={`${oldesDays} day${oldesDays === 1 ? '' : 's'}`} sub="Time waiting" icon={ShieldCheck} tone="rose" />
        <StatCard label="Ready to review" value={data.filter((c) => c.approval_status === 'submitted').length} sub="New submissions" icon={CheckCircle2} tone="emerald" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs
            value={status}
            onChange={setStatus}
            items={TABS.map((t) => ({ ...t, count: t.key ? counts[t.key] || 0 : data.length }))}
          />
          <div className="relative w-full sm:w-64">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input py-2 pl-10 text-[12.5px]" placeholder="Search employee or claim…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading approval queue…" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="Your queue is clear"
            description={data.length ? 'No claims match this filter.' : 'There are no expense claims waiting for a decision right now.'}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rows.map((claim) => (
            <Card key={claim.id} hover className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={claim.employee_name} color={claim.avatar_color || 'indigo'} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-ink-900">{claim.employee_name}</p>
                    <p className="text-[11.5px] text-slate-400">{claim.employee_code} · {claim.department_name || 'No department'}</p>
                  </div>
                </div>
                <ExpenseStatusBadge status={claim.approval_status} />
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-ink-900">{claim.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500">{claim.category_name} · {claim.expense_code}</p>
                  </div>
                  <p className="font-display text-[17px] font-bold text-ink-900">{expenseMoney(claim.amount, claim.currency)}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-[11.5px] text-slate-500">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Expense date</p>
                  <p className="mt-0.5 font-medium text-ink-700">{fmtDate(claim.expense_date)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Submitted</p>
                  <p className="mt-0.5 font-medium text-ink-700">{claim.submitted_at ? fmtDate(claim.submitted_at) : '—'}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-400">
                  <FileText size={13} /> {claim.attachment_count || 0} receipt(s)
                </span>
                <Button size="sm" variant="primary" onClick={() => setDetailId(claim.id)}>Review claim</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ExpenseDetailsModal
        open={Boolean(detailId)}
        expenseId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
        canApprove
        canReimburse={false}
      />
    </div>
  );
}
