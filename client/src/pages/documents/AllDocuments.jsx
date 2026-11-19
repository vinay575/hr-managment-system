import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, FileText, Search, UploadCloud, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Avatar, Button, Card, EmptyState, Input, LoadingBlock, Pagination, SearchInput, Select } from '../../components/ui';
import { DocumentDetailModal, StatusPill, UploadDocumentModal, formatBytes, expiryText } from './document-ui';

const PAGE_SIZE = 15;

export default function AllDocuments() {
  const toast = useToast();
  const { can, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '', categoryId: '', employeeId: '', expiryStatus: '', source: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const canManage = can('documents.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const res = await api.get(`/documents?${params.toString()}`);
      setRows(res.data || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/documents/categories').then((res) => setCategories(res.data || [])).catch(() => {});
    if (canManage) {
      api.get('/employees').then((res) => setEmployees(res.data || [])).catch(() => {});
    }
  }, [canManage]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  const update = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clear = () => setFilters({ search: '', status: '', categoryId: '', employeeId: '', expiryStatus: '', source: '' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">All documents</h1>
          <p className="mt-1 text-[13px] text-slate-500">Every employee document, including onboarding records and generated exit letters.</p>
        </div>
        {(canManage || user?.employeeId) && <Button variant="primary" icon={UploadCloud} onClick={() => setUploadOpen(true)}>Upload document</Button>}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={filters.search} onChange={(e) => update('search', e.target.value)} placeholder="Search document, employee or number…" className="min-w-[240px] flex-1" />
          <Button
            variant={showFilters || activeFilterCount ? 'soft' : 'secondary'}
            icon={Filter}
            onClick={() => setShowFilters((v) => !v)}
            className="relative"
          >
            Filters
            {activeFilterCount > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{activeFilterCount}</span>}
          </Button>
          {activeFilterCount > 0 && <Button variant="ghost" icon={X} onClick={clear}>Clear</Button>}
        </div>

        {showFilters && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Category" value={filters.categoryId} onChange={(e) => update('categoryId', e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Verification status" value={filters.status} onChange={(e) => update('status', e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </Select>
            <Select label="Expiry" value={filters.expiryStatus} onChange={(e) => update('expiryStatus', e.target.value)}>
              <option value="">Any expiry</option>
              <option value="expiring_soon">Expiring soon</option>
              <option value="expired">Expired</option>
              <option value="valid">Valid</option>
              <option value="no_expiry">No expiry</option>
            </Select>
            {canManage ? (
              <Select label="Employee" value={filters.employeeId} onChange={(e) => update('employeeId', e.target.value)}>
                <option value="">All employees</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} · {emp.employee_code}</option>)}
              </Select>
            ) : (
              <Select label="Source" value={filters.source} onChange={(e) => update('source', e.target.value)}>
                <option value="">All sources</option>
                <option value="documents">Document Management</option>
                <option value="onboarding">Onboarding</option>
                <option value="exit">Offboarding</option>
              </Select>
            )}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <p className="text-[12.5px] font-semibold text-ink-900">{pagination.total || 0} document{pagination.total === 1 ? '' : 's'}</p>
          <p className="text-[11px] text-slate-400">Page {pagination.page} of {pagination.pages}</p>
        </div>
        {loading ? (
          <LoadingBlock label="Loading documents…" className="py-16" />
        ) : rows.length ? (
          <div className="divide-y divide-slate-100">
            {rows.map((doc) => (
              <div key={doc.uid} className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-slate-50/70">
                <Avatar name={doc.employee_name} color={doc.avatar_color || 'indigo'} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setSelected(doc.uid)} className="truncate text-left text-[12.5px] font-semibold text-ink-900 hover:text-brand-600">{doc.name}</button>
                    <StatusPill status={doc.status} />
                    {doc.expiry_status === 'expired' && <StatusPill status="expired" />}
                    {doc.expiry_status === 'expiring' && <StatusPill status="expiring" />}
                    {doc.source !== 'documents' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{doc.source_label}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {doc.employee_name} · {doc.employee_code} · {doc.category_name} · {formatBytes(doc.file_size)} · {fmtDate(doc.uploaded_at)}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-[10.5px] font-medium text-slate-500">{expiryText(doc)}</p>
                  <p className="text-[10px] text-slate-400">{doc.verified_by_name ? `Verified by ${doc.verified_by_name}` : 'Not verified'}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelected(doc.uid)}>Open</Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={FileText} title="No documents match these filters" description="Try a different search or clear the filters." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} className="py-16" />
        )}
        {pagination.pages > 1 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </Card>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSaved={load}
        categories={categories}
        employees={employees}
        fixedEmployeeId={canManage ? null : user?.employeeId || null}
      />
      <DocumentDetailModal open={Boolean(selected)} uid={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
