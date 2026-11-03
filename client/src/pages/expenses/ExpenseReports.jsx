import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Download, FileText, Filter, Users, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, monthShort } from '../../lib/api';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Progress,
  SectionTitle,
  StatCard,
} from '../../components/ui';
import { EXPENSE_STATUS, expenseMoney } from './expense-ui';

const RANGES = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3 months' },
  { key: 'this_year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

export default function ExpenseReports() {
  const toast = useToast();
  const { can, user } = useAuth();
  const [filters, setFilters] = useState({ range: 'this_year', from: '', to: '', employeeId: '', departmentId: '', categoryId: '', status: '' });
  const [summary, setSummary] = useState(null);
  const [byCategory, setByCategory] = useState([]);
  const [byDepartment, setByDepartment] = useState([]);
  const [byEmployee, setByEmployee] = useState([]);
  const [reimbursements, setReimbursements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) p.set(key, value);
    });
    if (filters.range !== 'custom') {
      p.delete('from');
      p.delete('to');
    }
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, c, d, e, r] = await Promise.all([
        api.get(`/expenses/reports/summary?${params}`),
        api.get(`/expenses/reports/by-category?${params}`),
        api.get(`/expenses/reports/by-department?${params}`),
        api.get(`/expenses/reports/by-employee?${params}`),
        api.get(`/expenses/reports/reimbursements?${params}`),
      ]);
      setSummary(s);
      setByCategory(c.data || []);
      setByDepartment(d.data || []);
      setByEmployee(e.data || []);
      setReimbursements(r.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [params, toast]);

  useEffect(() => {
    if (filters.range === 'custom' && !filters.from && !filters.to) return;
    load();
  }, [load, filters.range, filters.from, filters.to]);

  useEffect(() => {
    api.get('/expenses/categories').then((res) => setCategories(res.data || [])).catch(() => {});
    if (can('departments.view')) api.get('/departments').then((res) => setDepartments(res.data || [])).catch(() => {});
    if (can('employees.view')) api.get('/employees/options').then((res) => setEmployees(res.data || [])).catch(() => {});
  }, [can]);

  const update = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const monthly = (summary?.monthly || []).map((m) => ({ ...m, label: monthShort(m.month), amount: Number(m.amount) }));
  const s = summary?.summary || {};
  const maxCategory = Math.max(1, ...byCategory.map((c) => Number(c.amount)));
  const maxDepartment = Math.max(1, ...byDepartment.map((d) => Number(d.amount)));
  const totalReimbursed = reimbursements.filter((r) => r.payment_status === 'paid').reduce((sum, r) => sum + Number(r.amount), 0);
  const pendingReimbursed = reimbursements.filter((r) => ['pending', 'processing', 'partially_paid'].includes(r.payment_status)).reduce((sum, r) => sum + Number(r.amount), 0);

  const exportCsv = async (type = 'claims') => {
    try {
      const p = new URLSearchParams({ type });
      Object.entries(filters).forEach(([key, value]) => {
        if (value && key !== 'range' && (filters.range === 'custom' || !['from', 'to'].includes(key))) p.set(key, value);
      });
      if (filters.range && filters.range !== 'custom' && filters.range !== 'all') p.set('range', filters.range);
      await api.download(`/expenses/reports/export?${p}`, `aurora-expense-${type}.csv`);
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const downloadStatement = async (employeeId) => {
    setDownloading(true);
    try {
      const p = new URLSearchParams();
      if (employeeId) p.set('employeeId', employeeId);
      if (filters.range) p.set('range', filters.range);
      if (filters.from) p.set('from', filters.from);
      if (filters.to) p.set('to', filters.to);
      await api.download(`/expenses/reports/statement?${p}`, 'expense-statement.pdf');
      toast.success('Expense statement downloaded.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Expenses</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Expense reports</h1>
          <p className="mt-1 text-[13px] text-slate-500">Spending by month, team, category and employee — generated from live records.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" icon={FileText} loading={downloading} onClick={() => downloadStatement(user?.employeeId)}>My statement (PDF)</Button>
          <Button variant="primary" icon={Download} onClick={() => exportCsv('claims')}>Export claims</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => update('range', r.key)}
              className={clsx('rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition', filters.range === r.key ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-ink-800')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6">
          {filters.range === 'custom' && (
            <>
              <input type="date" className="input py-2 text-[12.5px]" value={filters.from} onChange={(e) => update('from', e.target.value)} title="From" />
              <input type="date" className="input py-2 text-[12.5px]" value={filters.to} onChange={(e) => update('to', e.target.value)} title="To" />
            </>
          )}
          {employees.length > 0 && (
            <select className="input py-2 text-[12.5px]" value={filters.employeeId} onChange={(e) => update('employeeId', e.target.value)}>
              <option value="">All employees</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
            </select>
          )}
          {departments.length > 0 && (
            <select className="input py-2 text-[12.5px]" value={filters.departmentId} onChange={(e) => update('departmentId', e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <select className="input py-2 text-[12.5px]" value={filters.categoryId} onChange={(e) => update('categoryId', e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input py-2 text-[12.5px]" value={filters.status} onChange={(e) => update('status', e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(EXPENSE_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={Filter} onClick={load}>Refresh</Button>
            <Button variant="ghost" size="sm" icon={BarChart3} onClick={() => exportCsv('reimbursements')}>Reimbursements</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard label="Total claimed" value={expenseMoney(s.totalAmount)} sub={`${s.totalClaims || 0} claims`} icon={Wallet} tone="indigo" loading={loading} />
        <StatCard label="Approved" value={expenseMoney(s.approvedAmount)} sub={`${s.approvedCount || 0} claims`} icon={BarChart3} tone="emerald" loading={loading} />
        <StatCard label="Pending" value={s.pendingCount || 0} sub="Awaiting approval" icon={Filter} tone="amber" loading={loading} />
        <StatCard label="Reimbursed" value={expenseMoney(totalReimbursed || s.reimbursedAmount)} sub="Paid records" icon={Users} tone="teal" loading={loading} />
        <StatCard label="Reimbursement pending" value={expenseMoney(pendingReimbursed || s.pendingReimbursementAmount)} sub="Outstanding payments" icon={Wallet} tone="orange" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Total expenses by month" description="Claimed amount" />
          <div className="mt-4 h-[260px]">
            {loading ? (
              <div className="skeleton h-full w-full" />
            ) : monthly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip formatter={(value) => expenseMoney(value)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="amount" name="Amount" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={BarChart3} title="No data for this period" description="Adjust the filters to see monthly spend." className="py-8" />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Reimbursement status" description="Payment records" />
          <div className="mt-4 space-y-3">
            {reimbursements.length ? reimbursements.map((r) => (
              <div key={r.payment_status}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium capitalize text-ink-700">{String(r.payment_status).replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-slate-500">{expenseMoney(r.amount)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Progress value={(Number(r.amount) / Math.max(1, ...reimbursements.map((x) => Number(x.amount)))) * 100} tone={r.payment_status === 'paid' ? 'emerald' : r.payment_status === 'failed' ? 'rose' : 'amber'} className="flex-1" />
                  <span className="text-[10.5px] text-slate-400">{r.count}</span>
                </div>
              </div>
            )) : <p className="py-8 text-center text-[12px] text-slate-400">No reimbursement records.</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Expenses by category" description="Where money is spent" />
          <div className="mt-4 space-y-3.5">
            {byCategory.length ? byCategory.map((c) => (
              <div key={c.id}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-ink-700">{c.name}</span>
                  <span className="font-semibold text-slate-500">{expenseMoney(c.amount)} <span className="font-normal text-slate-400">· {c.count}</span></span>
                </div>
                <Progress value={(Number(c.amount) / maxCategory) * 100} tone="violet" className="mt-1.5" />
              </div>
            )) : <p className="py-8 text-center text-[12px] text-slate-400">No category data.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Expenses by department" description="Spend by team" />
          <div className="mt-4 space-y-3.5">
            {byDepartment.length ? byDepartment.map((d) => (
              <div key={d.name}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-ink-700">{d.name}</span>
                  <span className="font-semibold text-slate-500">{expenseMoney(d.amount)} <span className="font-normal text-slate-400">· {d.count}</span></span>
                </div>
                <Progress value={(Number(d.amount) / maxDepartment) * 100} tone="sky" className="mt-1.5" />
              </div>
            )) : <p className="py-8 text-center text-[12px] text-slate-400">No department data.</p>}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <SectionTitle title="Expenses by employee" description="Approved, rejected and reimbursed totals" />
          <span className="text-[11px] text-slate-400">Download a PDF statement per employee</span>
        </div>
        {loading ? (
          <LoadingBlock label="Loading employee report…" />
        ) : byEmployee.length === 0 ? (
          <EmptyState icon={Users} title="No employee spend" description="No claims match the selected filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-head">Employee</th>
                  <th className="table-head">Department</th>
                  <th className="table-head">Claims</th>
                  <th className="table-head">Claimed</th>
                  <th className="table-head">Approved</th>
                  <th className="table-head">Rejected</th>
                  <th className="table-head">Reimbursed</th>
                  <th className="table-head text-right">Statement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byEmployee.map((emp) => (
                  <tr key={emp.id} className="transition hover:bg-slate-50/60">
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp.name} color={emp.avatar_color || 'indigo'} size="xs" />
                        <div>
                          <p className="text-[12.5px] font-semibold text-ink-900">{emp.name}</p>
                          <p className="text-[10.5px] text-slate-400">{emp.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">{emp.department_name || '—'}</td>
                    <td className="table-cell">{emp.count}</td>
                    <td className="table-cell font-semibold text-ink-900">{expenseMoney(emp.amount)}</td>
                    <td className="table-cell text-emerald-600">{expenseMoney(emp.approved_amount)}</td>
                    <td className="table-cell text-rose-500">{emp.rejected_count}</td>
                    <td className="table-cell text-slate-600">{expenseMoney(emp.reimbursed_amount)}</td>
                    <td className="table-cell text-right">
                      <button className="icon-btn h-8 w-8" title="Download statement" onClick={() => downloadStatement(emp.id)}>
                        <Download size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
