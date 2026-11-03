import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, FolderPlus, Pencil, Plus, Receipt, Search, ShieldCheck, Tag } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  SearchInput,
  SectionTitle,
  StatCard,
  Textarea,
} from '../../components/ui';
import { expenseMoney } from './expense-ui';

const EMPTY = { name: '', description: '', receiptRequired: true, requiresApproval: true, maxClaimAmount: '' };

export default function ExpenseCategories() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/expenses/categories?all=1');
      setRows(res.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter((c) => {
        if (!showInactive && !Number(c.is_active)) return false;
        if (search && !`${c.name} ${c.description || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [rows, showInactive, search]
  );

  const activeCount = rows.filter((c) => Number(c.is_active)).length;
  const receiptCount = rows.filter((c) => Number(c.receipt_required)).length;
  const limitedCount = rows.filter((c) => c.max_claim_amount != null).length;

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (category) => {
    setEditing(category);
    setForm({
      name: category.name || '',
      description: category.description || '',
      receiptRequired: Boolean(Number(category.receipt_required)),
      requiresApproval: Boolean(Number(category.requires_approval)),
      maxClaimAmount: category.max_claim_amount != null ? String(category.max_claim_amount) : '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Category name is required.');
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description,
        receiptRequired: form.receiptRequired,
        requiresApproval: form.requiresApproval,
        maxClaimAmount: form.maxClaimAmount === '' ? null : Number(form.maxClaimAmount),
      };
      const res = editing
        ? await api.put(`/expenses/categories/${editing.id}`, body)
        : await api.post('/expenses/categories', body);
      toast.success(res.message);
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (category) => {
    setToggling(category.id);
    try {
      const res = await api.patch(`/expenses/categories/${category.id}/status`, { isActive: !Number(category.is_active) });
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Expenses</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Expense categories</h1>
          <p className="mt-1 text-[13px] text-slate-500">Configure receipt rules, claim limits and approval requirements. Categories are never deleted.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openNew}>Add category</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total categories" value={rows.length} sub="Configured policies" icon={Tag} tone="indigo" />
        <StatCard label="Active" value={activeCount} sub="Available to employees" icon={CheckCircle2} tone="emerald" />
        <StatCard label="Receipt required" value={receiptCount} sub="Proof mandatory" icon={Receipt} tone="amber" />
        <StatCard label="Claim limits" value={limitedCount} sub="Categories with a cap" icon={ShieldCheck} tone="violet" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search categories…" className="w-full sm:w-72" />
          <label className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive categories
          </label>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading categories…" />
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Tag} title="No categories found" description="Add an expense category to start accepting claims." action={<Button variant="primary" icon={FolderPlus} onClick={openNew}>Add category</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <SectionTitle title="Category policies" description={`${filtered.length} categor${filtered.length === 1 ? 'y' : 'ies'} in this view`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-head">Category</th>
                  <th className="table-head">Description</th>
                  <th className="table-head">Receipt</th>
                  <th className="table-head">Approval</th>
                  <th className="table-head">Max claim</th>
                  <th className="table-head">Claims</th>
                  <th className="table-head">Status</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((category) => (
                  <tr key={category.id} className={clsx('transition hover:bg-slate-50/60', !Number(category.is_active) && 'opacity-60')}>
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><Tag size={16} /></div>
                        <span className="font-semibold text-ink-900">{category.name}</span>
                      </div>
                    </td>
                    <td className="table-cell"><span className="block max-w-[280px] truncate text-[12.5px] text-slate-500">{category.description || '—'}</span></td>
                    <td className="table-cell">{Number(category.receipt_required) ? <Badge tone="amber">Required</Badge> : <span className="text-slate-400">Optional</span>}</td>
                    <td className="table-cell">{Number(category.requires_approval) ? <Badge tone="sky">Approval</Badge> : <span className="text-slate-400">Auto</span>}</td>
                    <td className="table-cell">{category.max_claim_amount != null ? expenseMoney(category.max_claim_amount) : <span className="text-slate-400">No limit</span>}</td>
                    <td className="table-cell">{category.claim_count || 0}</td>
                    <td className="table-cell"><Badge status={Number(category.is_active) ? 'active' : 'inactive'}>{Number(category.is_active) ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="icon-btn h-8 w-8" title="Edit category" onClick={() => openEdit(category)}><Pencil size={14} /></button>
                        <button
                          className={clsx('rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition', Number(category.is_active) ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50')}
                          disabled={toggling === category.id}
                          onClick={() => toggle(category)}
                        >
                          {Number(category.is_active) ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={saving ? undefined : () => setOpen(false)}
        title={editing ? 'Edit expense category' : 'Add expense category'}
        subtitle="Employees will see active categories in the expense form."
        icon={Tag}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" icon={editing ? Pencil : Plus} loading={saving} onClick={save}>{editing ? 'Save changes' : 'Create category'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Category name" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Client entertainment" />
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="What belongs in this category?" />
          <Input
            label="Maximum claim amount"
            type="number"
            min="0"
            step="0.01"
            value={form.maxClaimAmount}
            onChange={(e) => setForm((p) => ({ ...p, maxClaimAmount: e.target.value }))}
            hint="Leave blank for no limit. Amounts are in the claim currency."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20" checked={form.receiptRequired} onChange={(e) => setForm((p) => ({ ...p, receiptRequired: e.target.checked }))} />
              <span>
                <span className="block text-[12.5px] font-semibold text-ink-800">Receipt required</span>
                <span className="block text-[11px] text-slate-400">Employees must attach proof before submission.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20" checked={form.requiresApproval} onChange={(e) => setForm((p) => ({ ...p, requiresApproval: e.target.checked }))} />
              <span>
                <span className="block text-[12.5px] font-semibold text-ink-800">Requires approval</span>
                <span className="block text-[11px] text-slate-400">Route claims through the approval workflow.</span>
              </span>
            </label>
          </div>
          {editing && Number(editing.claim_count) > 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-700">
              This category is used by {editing.claim_count} claim(s), so it cannot be deleted. Deactivate it instead to hide it from new claims.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
