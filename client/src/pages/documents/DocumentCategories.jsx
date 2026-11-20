import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, FileText, FolderPlus, Pencil, Search, Tag, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, Input, LoadingBlock, Modal, SearchInput, SectionTitle, Select, Textarea } from '../../components/ui';

const EMPTY = {
  name: '',
  slug: '',
  group_name: 'Other Documents',
  description: '',
  is_required: false,
  requires_expiry: false,
  employee_uploads: true,
  requires_verification: true,
  is_active: true,
  sort_order: 0,
};

const GROUPS = ['Identity Documents', 'Employment Documents', 'Education Documents', 'Address Documents', 'Financial Documents', 'Other Documents'];

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
      <span className={clsx('mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition', checked ? 'bg-brand-600' : 'bg-slate-200')}>
        <span className={clsx('h-4 w-4 rounded-full bg-white shadow transition', checked && 'translate-x-4')} />
      </span>
      <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-[12px] font-semibold text-ink-800">{label}</span>
        <span className="block text-[10.5px] text-slate-400">{description}</span>
      </span>
    </label>
  );
}

export default function DocumentCategories() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/documents/categories?all=1');
      setRows(res.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => !q || `${r.name} ${r.group_name} ${r.slug}`.toLowerCase().includes(q));
    const map = new Map();
    for (const row of filtered) {
      const key = row.group_name || 'Other Documents';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()];
  }, [rows, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, sort_order: rows.length });
    setError('');
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name,
      slug: row.slug,
      group_name: row.group_name || 'Other Documents',
      description: row.description || '',
      is_required: Boolean(Number(row.is_required)),
      requires_expiry: Boolean(Number(row.requires_expiry)),
      employee_uploads: Boolean(Number(row.employee_uploads)),
      requires_verification: Boolean(Number(row.requires_verification)),
      is_active: Boolean(Number(row.is_active)),
      sort_order: Number(row.sort_order) || 0,
    });
    setError('');
    setOpen(true);
  };

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('Category name is required.');
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        slug: form.slug.trim() || form.name.trim(),
        group: form.group_name,
        description: form.description,
        isRequired: form.is_required,
        requiresExpiry: form.requires_expiry,
        employeeUploads: form.employee_uploads,
        requiresVerification: form.requires_verification,
        isActive: form.is_active,
        sortOrder: Number(form.sort_order) || 0,
      };
      const res = editing ? await api.put(`/documents/categories/${editing.id}`, body) : await api.post('/documents/categories', body);
      toast.success(res.message || 'Category saved.');
      setOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      await api.put(`/documents/categories/${row.id}`, { ...row, isActive: !Number(row.is_active) });
      toast.success(Number(row.is_active) ? 'Category deactivated.' : 'Category activated.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"? Categories already used by documents cannot be deleted.`)) return;
    try {
      const res = await api.del(`/documents/categories/${row.id}`);
      toast.success(res.message || 'Category deleted.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Document categories</h1>
          <p className="mt-1 text-[13px] text-slate-500">Configure required types, expiry rules, employee uploads and verification behaviour.</p>
        </div>
        <Button variant="primary" icon={FolderPlus} onClick={openCreate}>New category</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search categories…" className="min-w-[220px] flex-1" />
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600">{rows.length} categories</span>
          <span className="rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700">{rows.filter((r) => Number(r.is_required)).length} required</span>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading document categories…" className="py-20" />
      ) : grouped.length ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {grouped.map(([group, items]) => (
            <Card key={group} className="p-5">
              <SectionTitle title={group} description={`${items.length} categor${items.length === 1 ? 'y' : 'ies'}`} />
              <div className="mt-3 space-y-2">
                {items.map((row) => (
                  <div key={row.id} className={clsx('rounded-xl border px-3.5 py-3', Number(row.is_active) ? 'border-slate-100 bg-white' : 'border-slate-100 bg-slate-50/70 opacity-70')}>
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Tag size={14} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[12.5px] font-semibold text-ink-900">{row.name}</p>
                          {Number(row.is_required) > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-brand-700">Required</span>}
                          {Number(row.requires_expiry) > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700">Expiry</span>}
                          {!Number(row.is_active) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-semibold text-slate-500">Inactive</span>}
                        </div>
                        <p className="mt-0.5 text-[10.5px] text-slate-400">
                          {Number(row.employee_uploads) ? 'Employee upload allowed' : 'HR upload only'}
                          {' · '}{Number(row.requires_verification) ? 'Verification required' : 'No verification'}
                          {' · '}{Number(row.document_count) > 0
                            ? `${Number(row.document_count)} file${Number(row.document_count) === 1 ? '' : 's'}`
                            : 'No files yet'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(row)} aria-label="Edit category" />
                        <Button size="sm" variant="ghost" icon={Number(row.is_active) ? Check : FileText} onClick={() => toggleActive(row)} aria-label="Toggle category" />
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(row)} aria-label="Delete category" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Tag} title="No categories found" description="Create document categories to define what employees must submit." action={<Button variant="primary" icon={FolderPlus} onClick={openCreate}>New category</Button>} />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit category' : 'New category'}
        subtitle="Rules apply to new uploads; existing documents are not altered."
        icon={Tag}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Check} loading={saving} onClick={save}>Save category</Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <div className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-700">{error}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Category name" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <Input label="Slug" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} hint="Leave blank to derive from the name." />
            <Select label="Group" value={form.group_name} onChange={(e) => setForm((p) => ({ ...p, group_name: e.target.value }))}>
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
            <Input label="Sort order" type="number" value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))} />
          </div>
          <Textarea label="Description (optional)" rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle checked={form.is_required} onChange={(v) => setForm((p) => ({ ...p, is_required: v }))} label="Required document" description="Included in employee completeness tracking." />
            <Toggle checked={form.requires_expiry} onChange={(v) => setForm((p) => ({ ...p, requires_expiry: v }))} label="Requires expiry date" description="Track renewal and send expiry reminders." />
            <Toggle checked={form.employee_uploads} onChange={(v) => setForm((p) => ({ ...p, employee_uploads: v }))} label="Employee uploads" description="Employees may upload this type themselves." />
            <Toggle checked={form.requires_verification} onChange={(v) => setForm((p) => ({ ...p, requires_verification: v }))} label="Requires verification" description="New files enter the HR verification queue." />
            <Toggle checked={form.is_active} onChange={(v) => setForm((p) => ({ ...p, is_active: v }))} label="Active" description="Inactive categories are hidden from upload forms." />
          </div>
        </div>
      </Modal>
    </div>
  );
}
