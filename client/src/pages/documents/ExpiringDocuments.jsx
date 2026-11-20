import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, FileText } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Button, Card, LoadingBlock, SearchInput } from '../../components/ui';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { DocumentDetailModal, EmployeeDocumentsModal, EmployeeFileGrid } from './document-ui';

const TABS = [
  { key: 'expiring', label: 'Expiring soon', icon: CalendarClock, tone: 'amber' },
  { key: 'expired', label: 'Expired', icon: AlertTriangle, tone: 'rose' },
];

export default function ExpiringDocuments() {
  const toast = useToast();
  const { can } = useAuth();
  const [tab, setTab] = useState('expiring');
  const [directory, setDirectory] = useState({ data: [], totalEmployees: 0, totalDocuments: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [employeeFile, setEmployeeFile] = useState(null);
  const [selected, setSelected] = useState(null);
  const [docRefresh, setDocRefresh] = useState(0);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ expiryStatus: tab === 'expiring' ? 'expiring_soon' : 'expired' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await api.get(`/documents/directory?${params.toString()}`);
      setDirectory(res || { data: [], totalEmployees: 0, totalDocuments: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const runReminders = async () => {
    setRunning(true);
    try {
      const res = await api.post('/documents/reminders/run');
      toast.success(`Reminders processed · ${res.result?.expiry || 0} expiry, ${res.result?.missing || 0} missing.`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Expiring documents</h1>
          <p className="mt-1 text-[13px] text-slate-500">Choose an employee to review only their renewals. Reminders are deduplicated per document and interval.</p>
        </div>
        {can('documents.manage') && (
          <Button variant="secondary" icon={BellRing} loading={running} onClick={runReminders}>Run reminders</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(({ key, label, icon: Icon, tone }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition',
              tab === key
                ? tone === 'rose'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-ink-800'
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
        <div className="ml-auto w-full sm:w-64">
          <SearchInput value={search} onChange={setSearch} placeholder="Search employee, department or document…" />
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[17px] font-bold tracking-tight text-ink-900">Employee files</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {directory.totalEmployees || 0} employee{directory.totalEmployees === 1 ? '' : 's'} · {directory.totalDocuments || 0} {tab === 'expired' ? 'expired' : 'expiring'} document{directory.totalDocuments === 1 ? '' : 's'}
            </p>
          </div>
          <p className="text-[11px] text-slate-400">Open an employee to see only their documents</p>
        </div>
        {loading ? (
          <LoadingBlock label="Loading expiry list…" className="py-16" />
        ) : (
          <EmployeeFileGrid
            employees={directory.data || []}
            onSelect={setEmployeeFile}
            countNoun="document"
            loading={false}
            emptyIcon={tab === 'expired' ? AlertTriangle : CalendarClock}
            emptyTitle={tab === 'expired' ? 'No expired documents' : 'Nothing expiring soon'}
            emptyDescription={tab === 'expired' ? 'All tracked documents are within their validity period.' : 'Documents will appear here as they approach their expiry date.'}
          />
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11.5px] leading-relaxed text-slate-500">
        <FileText size={15} className="mt-0.5 shrink-0 text-brand-500" />
        Expiry reminders respect the configured warning period and interval list. Employees receive one notification per document per interval, and HR verifiers are notified separately.
      </div>

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
