import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileWarning, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Card, LoadingBlock, SearchInput, Select } from '../../components/ui';
import { DocumentDetailModal, EmployeeDocumentsModal, EmployeeFileGrid } from './document-ui';

export default function MissingDocuments() {
  const toast = useToast();
  const { can } = useAuth();
  const [directory, setDirectory] = useState({ data: [], totalEmployees: 0, totalRequirements: 0, counts: {}, summary: null });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [reminding, setReminding] = useState(false);
  const [employeeFile, setEmployeeFile] = useState(null);
  const [selected, setSelected] = useState(null);
  const [docRefresh, setDocRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: 'missing' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (categoryId) params.set('categoryId', categoryId);
      if (onlyMissing) params.set('onlyMissing', '1');
      const res = await api.get(`/documents/directory?${params.toString()}`);
      setDirectory(res || { data: [], totalEmployees: 0, totalRequirements: 0, counts: {}, summary: null });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, categoryId, onlyMissing, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/documents/categories').then((res) => setCategories(res.data || [])).catch(() => {});
  }, []);

  const remind = async (employee) => {
    setReminding(true);
    try {
      const res = await api.post('/documents/missing/remind', { employeeId: employee.employee_id });
      toast.success(res.message || 'Reminder sent.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReminding(false);
    }
  };

  const summary = directory.summary;
  const counts = directory.counts || {};

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Missing documents</h1>
        <p className="mt-1 text-[13px] text-slate-500">Choose an employee to see their outstanding required documents. Onboarding uploads count automatically.</p>
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
          <SearchInput value={search} onChange={setSearch} placeholder="Search employee, department or category…" className="min-w-[220px] flex-1" />
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

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[17px] font-bold tracking-tight text-ink-900">Employee files</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {directory.totalEmployees || 0} employee{directory.totalEmployees === 1 ? '' : 's'} · {directory.totalRequirements || 0} requirement{directory.totalRequirements === 1 ? '' : 's'} shown
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Missing {counts.missing || 0}</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Pending {counts.pending || 0}</span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">Rejected {counts.rejected || 0}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Verified {counts.verified || 0}</span>
          </div>
        </div>
        <div className="mt-4">
          {loading ? (
            <LoadingBlock label="Checking employee files…" className="py-16" />
          ) : (
            <EmployeeFileGrid
              employees={directory.data || []}
              onSelect={setEmployeeFile}
              countNoun="requirement"
              loading={false}
              emptyIcon={onlyMissing ? CheckCircle2 : ShieldAlert}
              emptyTitle={onlyMissing ? 'Every required document is in place' : 'No missing document records'}
              emptyDescription={onlyMissing ? 'All active employees have verified required documents.' : 'Adjust the filters to review the complete requirement matrix.'}
            />
          )}
        </div>
      </Card>

      <p className="text-[11px] text-slate-400">Reminders are deduplicated per employee, category and day.</p>

      <EmployeeDocumentsModal
        open={Boolean(employeeFile)}
        employee={employeeFile}
        refreshKey={docRefresh}
        onClose={() => setEmployeeFile(null)}
        onOpenDocument={(uid) => setSelected(uid)}
        onRemind={can('documents.manage') ? remind : null}
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
