import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Banknote, CheckCircle2, Clock3, Download, RefreshCw, Search, Wallet } from 'lucide-react';
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
import {
  ExpenseDetailsModal,
  NoExpenses,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  REIMBURSEMENT_STATUS,
  ReimbursementModal,
  ReimbursementStatusBadge,
  expenseMoney,
  outstandingAmount,
} from './expense-ui';

const STATUS_OPTIONS = ['pending', 'processing', 'partially_paid', 'paid', 'failed', 'on_hold'];

export default function Reimbursements() {
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [updating, setUpdating] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const [pendingRes, historyRes] = await Promise.all([
        api.get('/expenses/reimbursements/pending'),
        api.get(`/expenses/reimbursements?${params}`),
      ]);
      setPending(pendingRes.data || []);
      setHistory(historyRes.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, search, toast]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const pendingAmount = pending.reduce((sum, c) => sum + outstandingAmount(c), 0);
    const paidAmount = history.filter((r) => r.payment_status === 'paid').reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const processing = history.filter((r) => ['pending', 'processing'].includes(r.payment_status)).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return { pendingAmount, paidAmount, processing };
  }, [pending, history]);

  const updateStatus = async (record, next) => {
    if (next === 'paid' && !window.confirm(`Mark ${record.expense_code} reimbursement of ${expenseMoney(record.amount, record.currency)} as paid?`)) return;
    setUpdating(record.id);
    try {
      const res = await api.patch(`/expenses/reimbursements/${record.id}/status`, { paymentStatus: next });
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams({ type: 'reimbursements' });
      if (status) params.set('paymentStatus', status);
      await api.download(`/expenses/reports/export?${params}`, 'expense-reimbursements.csv');
      toast.success('Reimbursement statement downloaded.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Expenses</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Reimbursements</h1>
          <p className="mt-1 text-[13px] text-slate-500">Track manual payments against approved claims. No payment gateway is connected.</p>
        </div>
        <Button variant="secondary" icon={Download} onClick={exportCsv}>Download statement</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Awaiting reimbursement" value={pending.length} sub="Approved, unpaid claims" icon={Clock3} tone="amber" />
        <StatCard label="Outstanding amount" value={expenseMoney(totals.pendingAmount)} sub="Still to be paid" icon={Wallet} tone="orange" />
        <StatCard label="Paid reimbursements" value={expenseMoney(totals.paidAmount)} sub="Recorded as paid" icon={Banknote} tone="emerald" />
        <StatCard label="In processing" value={expenseMoney(totals.processing)} sub="Pending / processing records" icon={RefreshCw} tone="sky" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { key: 'pending', label: 'Awaiting payment', count: pending.length },
              { key: 'history', label: 'Payment history', count: history.length },
            ]}
          />
          {tab === 'history' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input py-2 pl-10 text-[12.5px]" placeholder="Search claim or reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="input w-auto min-w-[150px] py-2 text-[12.5px]" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{REIMBURSEMENT_STATUS[s]?.label || s}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading reimbursements…" />
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <Card><NoExpenses title="Nothing awaiting reimbursement" description="Approved claims that still need a payment will appear here." /></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {pending.map((claim) => (
              <Card key={claim.id} hover className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={claim.employee_name} color={claim.avatar_color || 'indigo'} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-ink-900">{claim.employee_name}</p>
                      <p className="text-[11.5px] text-slate-400">{claim.employee_code} · {claim.department_name || 'No department'}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-emerald-600">Approved</span>
                </div>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-ink-900">{claim.title}</p>
                    <p className="text-[11px] text-slate-500">{claim.expense_code} · {claim.category_name}</p>
                    <p className="text-[10.5px] text-slate-400">Expense date {fmtDate(claim.expense_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Outstanding</p>
                    <p className="font-display text-[18px] font-bold text-ink-900">{expenseMoney(outstandingAmount(claim), claim.currency)}</p>
                    <p className="text-[10.5px] text-slate-400">of {expenseMoney(claim.approved_amount ?? claim.amount, claim.currency)}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                  <button onClick={() => setDetailId(claim.id)} className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">View claim</button>
                  <Button size="sm" variant="primary" icon={Banknote} onClick={() => setSelectedClaim(claim)}>Record payment</Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : history.length === 0 ? (
        <Card><NoExpenses title="No reimbursement records" description="Payments recorded against approved claims will appear here." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <SectionTitle title="Reimbursement history" description={`${history.length} payment record${history.length === 1 ? '' : 's'}`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-head">Claim</th>
                  <th className="table-head">Employee</th>
                  <th className="table-head">Amount</th>
                  <th className="table-head">Method</th>
                  <th className="table-head">Reference</th>
                  <th className="table-head">Payment date</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Processed by</th>
                  <th className="table-head text-right">Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-50/60">
                    <td className="table-cell">
                      <p className="font-mono text-[11.5px] font-semibold text-brand-600">{r.expense_code}</p>
                      <p className="max-w-[180px] truncate text-[11px] text-slate-400">{r.title}</p>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.employee_name} color={r.avatar_color || 'indigo'} size="xs" />
                        <div>
                          <p className="text-[12.5px] font-semibold text-ink-900">{r.employee_name}</p>
                          <p className="text-[10.5px] text-slate-400">{r.department_name || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell"><span className="font-semibold text-ink-900">{expenseMoney(r.amount, r.currency)}</span></td>
                    <td className="table-cell">{PAYMENT_METHOD_LABEL[r.payment_method] || r.payment_method}</td>
                    <td className="table-cell"><span className="font-mono text-[11px] text-slate-500">{r.transaction_reference || '—'}</span></td>
                    <td className="table-cell">{r.payment_date ? fmtDate(r.payment_date) : '—'}</td>
                    <td className="table-cell"><ReimbursementStatusBadge status={r.payment_status} /></td>
                    <td className="table-cell">{r.processed_by_name || '—'}</td>
                    <td className="table-cell">
                      <select
                        className={clsx('input w-auto min-w-[130px] py-1.5 text-[11.5px]', r.payment_status === 'paid' && 'text-emerald-600')}
                        value={r.payment_status}
                        disabled={updating === r.id || r.payment_status === 'paid'}
                        onChange={(e) => updateStatus(r, e.target.value)}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{REIMBURSEMENT_STATUS[s]?.label || s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-[11.5px] text-slate-500">
        <CheckCircle2 size={14} className="text-emerald-500" />
        Reimbursement amounts can never exceed the approved claim amount. Fully paid claims are marked reimbursed automatically.
      </div>

      <ReimbursementModal open={Boolean(selectedClaim)} claim={selectedClaim} onClose={() => setSelectedClaim(null)} onSaved={load} />

      <ExpenseDetailsModal
        open={Boolean(detailId)}
        expenseId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
        canApprove={false}
        canReimburse={false}
      />
    </div>
  );
}
