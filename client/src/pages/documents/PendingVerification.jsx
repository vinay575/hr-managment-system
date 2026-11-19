import { useCallback, useEffect, useState } from 'react';
import { Clock3, ShieldCheck } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Card, LoadingBlock, SearchInput, Select } from '../../components/ui';
import { DocumentDetailModal, EmployeeDocumentsModal, EmployeeFileGrid } from './document-ui';

export default function PendingVerification() {
  const toast = useToast();
  const [directory, setDirectory] = useState({ data: [], totalEmployees: 0, totalDocuments: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [employeeFile, setEmployeeFile] = useState(null);
  const [selected, setSelected] = useState(null);
  const [docRefresh, setDocRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'pending' });
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      const res = await api.get(`/documents/directory?${params.toString()}`);
      setDirectory(res || { data: [], totalEmployees: 0, totalDocuments: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, categoryId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/documents/categories').then((res) => setCategories(res.data || [])).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Pending verification</h1>
        <p className="mt-1 text-[13px] text-slate-500">Choose an employee to review their pending files, verify valid documents, or reject with a clear reason.</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, department or document…" className="min-w-[220px] flex-1" />
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} wrapperClass="w-auto min-w-[180px]">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[11.5px] font-semibold text-amber-700">
            <Clock3 size={13} /> {directory.totalDocuments || 0} waiting · {directory.totalEmployees || 0} employee{directory.totalEmployees === 1 ? '' : 's'}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[17px] font-bold tracking-tight text-ink-900">Employee files</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {directory.totalEmployees || 0} employee{directory.totalEmployees === 1 ? '' : 's'} · {directory.totalDocuments || 0} pending file{directory.totalDocuments === 1 ? '' : 's'}
            </p>
          </div>
          <p className="text-[11px] text-slate-400">Open an employee to review only their files</p>
        </div>
        {loading ? (
          <LoadingBlock label="Loading verification queue…" className="py-20" />
        ) : (
          <EmployeeFileGrid
            employees={directory.data || []}
            onSelect={setEmployeeFile}
            countNoun="pending file"
            loading={false}
            emptyIcon={ShieldCheck}
            emptyTitle="Verification queue is clear"
            emptyDescription="No documents are waiting for review. New uploads will appear here automatically."
          />
        )}
      </Card>

      <EmployeeDocumentsModal
        open={Boolean(employeeFile)}
        employee={employeeFile}
        refreshKey={docRefresh}
        onClose={() => setEmployeeFile(null)}
        onOpenDocument={(uid) => setSelected(uid)}
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
