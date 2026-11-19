import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, FileText, Filter, ShieldCheck } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Avatar, Button, Card, EmptyState, LoadingBlock, Pagination, SearchInput, Select } from '../../components/ui';
import { DocumentDetailModal, StatusPill, formatBytes } from './document-ui';

const PAGE_SIZE = 12;

export default function PendingVerification() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      const res = await api.get(`/documents/pending-verification?${params.toString()}`);
      setRows(res.data || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/documents/categories').then((res) => setCategories(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, categoryId]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Pending verification</h1>
        <p className="mt-1 text-[13px] text-slate-500">Review uploaded documents, verify valid files, or reject with a clear reason.</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee or document…" className="min-w-[220px] flex-1" />
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} wrapperClass="w-auto min-w-[180px]">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[11.5px] font-semibold text-amber-700">
            <Clock3 size={13} /> {pagination.total} waiting
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading verification queue…" className="py-20" />
      ) : rows.length ? (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((doc) => (
              <Card key={doc.uid} className="card-hover p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={doc.employee_name} color={doc.avatar_color || 'indigo'} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setSelected(doc.uid)} className="truncate text-[13px] font-semibold text-ink-900 hover:text-brand-600">{doc.name}</button>
                      <StatusPill status={doc.status} />
                      {doc.source !== 'documents' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{doc.source_label}</span>}
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{doc.employee_name} · {doc.employee_code}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{doc.category_name} · {formatBytes(doc.file_size)} · {fmtDate(doc.uploaded_at)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <p className="truncate text-[10.5px] text-slate-400">{doc.department_name || 'Unassigned'}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" icon={FileText} onClick={() => setSelected(doc.uid)}>Review</Button>
                    <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => setSelected(doc.uid)}>Verify</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {pagination.pages > 1 && (
            <Card className="px-4 py-3">
              <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={PAGE_SIZE} onChange={setPage} />
            </Card>
          )}
        </>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="Verification queue is clear"
          description="No documents are waiting for review. New uploads will appear here automatically."
          className="py-20"
        />
      )}

      <DocumentDetailModal open={Boolean(selected)} uid={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
