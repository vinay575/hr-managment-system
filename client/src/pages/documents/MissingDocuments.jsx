import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, FileWarning, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Avatar, Button, Card, EmptyState, LoadingBlock, Pagination, SearchInput, Select } from '../../components/ui';
import { DocumentDetailModal, StatusPill } from './document-ui';

const PAGE_SIZE = 15;

export default function MissingDocuments() {
  const toast = useToast();
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [summary, setSummary] = useState(null);
  const [counts, setCounts] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [reminding, setReminding] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (categoryId) params.set('categoryId', categoryId);
      if (onlyMissing) params.set('onlyMissing', '1');
      const res = await api.get(`/documents/missing?${params.toString()}`);
      setRows(res.data || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
      setSummary(res.summary || null);
      setCounts(res.counts || {});
      setCategories(res.categories || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, categoryId, onlyMissing, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, status, categoryId, onlyMissing]);

  const remind = async (row) => {
    const key = `${row.employee_id}:${row.category_id}`;
    setReminding(key);
    try {
      const res = await api.post('/documents/missing/remind', { employeeId: row.employee_id, categoryId: row.category_id });
      toast.success(res.message || 'Reminder sent.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReminding('');
    }
  };

  const outstanding = useMemo(
    () => rows.filter((r) => r.status === 'missing' || r.status === 'rejected').length,
    [rows]
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Missing documents</h1>
        <p className="mt-1 text-[13px] text-slate-500">Required categories that are missing, pending or rejected. Onboarding uploads count automatically.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Required categories</p>
          <p className="mt-1 text-[22px] font-extrabold text-ink-900">{summary?.requiredCategories ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Complete employee files</p>
          <p className="mt-1 text-[22px] font-extrabold text-emerald-600">{summary?.completeEmployees ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Files needing action</p>
          <p className="mt-1 text-[22px] font-extrabold text-amber-600">{summary?.incompleteEmployees ?? 0}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee or category…" className="min-w-[220px] flex-1" />
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} wrapperClass="w-auto min-w-[170px]">
            <option value="">All required categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} wrapperClass="w-auto min-w-[140px]">
            <option value="">All statuses</option>
            <option value="missing">Missing</option>
            <option value="pending">Pending verification</option>
            <option value="rejected">Rejected</option>
            <option value="verified">Verified</option>
            <option value="expired">Expired</option>
          </Select>
          <button
            onClick={() => setOnlyMissing((v) => !v)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11.5px] font-semibold transition',
              onlyMissing ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
            )}
          >
            <FileWarning size={13} /> Outstanding only
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <p className="text-[12.5px] font-semibold text-ink-900">{pagination.total} requirement{pagination.total === 1 ? '' : 's'} shown</p>
          <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Missing {counts.missing || 0}</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Pending {counts.pending || 0}</span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">Rejected {counts.rejected || 0}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Verified {counts.verified || 0}</span>
          </div>
        </div>
        {loading ? (
          <LoadingBlock label="Checking employee files…" className="py-16" />
        ) : rows.length ? (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const key = `${row.employee_id}:${row.category_id}`;
              const actionable = row.status === 'missing' || row.status === 'rejected';
              return (
                <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/70">
                  <Avatar name={row.employee_name} color={row.avatar_color || 'indigo'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink-900">{row.employee_name}</p>
                    <p className="truncate text-[11px] text-slate-500">{row.employee_code} · {row.department_name || 'Unassigned'} · {row.category_name}</p>
                  </div>
                  <StatusPill status={row.status} />
                  <div className="hidden text-right sm:block">
                    <p className="text-[10.5px] text-slate-400">{row.last_reminder ? `Reminded ${fmtDate(row.last_reminder)}` : 'No reminder sent'}</p>
                    {row.document_uid && <p className="text-[10px] text-slate-400">On file · {row.source}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    {row.document_uid && <Button size="sm" variant="ghost" onClick={() => setSelected(row.document_uid)}>Open</Button>}
                    {actionable && can('documents.manage') && (
                      <Button size="sm" variant="secondary" icon={BellRing} loading={reminding === key} onClick={() => remind(row)}>
                        Remind
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={onlyMissing ? CheckCircle2 : ShieldAlert}
            title={onlyMissing ? 'Every required document is in place' : 'No missing document records'}
            description={onlyMissing ? 'All active employees have verified required documents.' : 'Adjust the filters to review the complete requirement matrix.'}
            className="py-16"
          />
        )}
        {pagination.pages > 1 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </Card>

      <p className="text-[11px] text-slate-400">{outstanding} outstanding requirement{outstanding === 1 ? '' : 's'} on this page. Reminders are deduplicated per employee, category and day.</p>

      <DocumentDetailModal open={Boolean(selected)} uid={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
