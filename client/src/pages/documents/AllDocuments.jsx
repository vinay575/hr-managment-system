import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, Search, UploadCloud, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Button, Card, SearchInput, Select, EmployeePicker } from '../../components/ui';
import { DocumentDetailModal, EmployeeDocumentsModal, EmployeeFileGrid, UploadDocumentModal } from './document-ui';

export default function AllDocuments() {
  const toast = useToast();
  const { can, user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [directory, setDirectory] = useState({ data: [], totalEmployees: 0, totalDocuments: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: '', categoryId: '', employeeId: '', expiryStatus: '', source: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEmployee, setUploadEmployee] = useState(null);
  const [employeeFile, setEmployeeFile] = useState(null);
  const [selected, setSelected] = useState(null);
  const [docRefresh, setDocRefresh] = useState(0);

  const canManage = can('documents.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: 'all' });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const res = await api.get(`/documents/directory?${params.toString()}`);
      setDirectory(res || { data: [], totalEmployees: 0, totalDocuments: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/documents/categories').then((res) => setCategories(res.data || [])).catch(() => {});
    if (canManage) {
      api.get('/employees/options?includeInactive=1').then((res) => setEmployees(res.data || [])).catch(() => {});
    }
  }, [canManage]);

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  const update = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clear = () => setFilters({ search: '', status: '', categoryId: '', employeeId: '', expiryStatus: '', source: '' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">All documents</h1>
          <p className="mt-1 text-[13px] text-slate-500">Choose an employee to open their complete document file, including onboarding records and generated exit letters.</p>
        </div>
        {(canManage || user?.employeeId) && (
          <Button
            variant="primary"
            icon={UploadCloud}
            onClick={() => {
              setUploadEmployee(null);
              setUploadOpen(true);
            }}
          >
            Upload document
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={filters.search} onChange={(v) => update('search', v)} placeholder="Search employee, department or document…" className="min-w-[240px] flex-1" />
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
              <EmployeePicker
                label="Employee"
                value={filters.employeeId}
                onChange={(value) => update('employeeId', value)}
                employees={employees}
                clearable
                placeholder="All employees"
              />
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

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[17px] font-bold tracking-tight text-ink-900">Employee files</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {directory.totalEmployees || 0} employee{directory.totalEmployees === 1 ? '' : 's'} · {directory.totalDocuments || 0} matching document{directory.totalDocuments === 1 ? '' : 's'}
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Search size={12} /> Open an employee to see only their documents</p>
        </div>
        <EmployeeFileGrid
          employees={directory.data || []}
          onSelect={setEmployeeFile}
          countNoun="file"
          loading={loading}
          loadingLabel="Loading employee files…"
          emptyTitle={activeFilterCount ? 'No employees match these filters' : 'No documents yet'}
          emptyDescription={activeFilterCount ? 'Try a different search or clear the filters.' : 'Upload the first employee document to begin the central history.'}
          emptyAction={activeFilterCount ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : null}
        />
      </Card>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setUploadEmployee(null);
        }}
        onSaved={load}
        categories={categories}
        employees={employees}
        fixedEmployeeId={uploadEmployee || (canManage ? null : user?.employeeId || null)}
      />
      <EmployeeDocumentsModal
        open={Boolean(employeeFile)}
        employee={employeeFile}
        refreshKey={docRefresh}
        onClose={() => setEmployeeFile(null)}
        onOpenDocument={(uid) => setSelected(uid)}
        onUpload={(emp) => {
          setUploadEmployee(emp?.employee_id || null);
          setEmployeeFile(null);
          setUploadOpen(true);
        }}
      />
      <DocumentDetailModal
        open={Boolean(selected)}
        uid={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setDocRefresh((value) => value + 1);
          load();
        }}
      />
    </div>
  );
}
