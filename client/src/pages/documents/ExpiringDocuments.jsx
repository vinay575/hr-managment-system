import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, FileText } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Avatar, Button, Card, EmptyState, LoadingBlock, Pagination, SearchInput } from '../../components/ui';
import { DocumentDetailModal, StatusPill, formatBytes } from './document-ui';

const PAGE_SIZE = 12;
const TABS = [
  { key: 'expiring', label: 'Expiring soon', icon: CalendarClock, tone: 'amber' },
  { key: 'expired', label: 'Expired', icon: AlertTriangle, tone: 'rose' },
];

export default function ExpiringDocuments() {
  const toast = useToast();
  const { can } = useAuth();
  const [tab, setTab] = useState('expiring');
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (search) params.set('search', search);
      const res = await api.get(`/documents/${tab}?${params.toString()}`);
      setRows(res.data || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, page, search, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

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
          <p className="mt-1 text-[13px] text-slate-500">Track renewals before compliance gaps appear. Reminders are deduplicated per document and interval.</p>
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
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee or document…" />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <p className="text-[12.5px] font-semibold text-ink-900">{pagination.total} document{pagination.total === 1 ? '' : 's'}</p>
          <p className="text-[11px] text-slate-400">Page {pagination.page} of {pagination.pages}</p>
        </div>
        {loading ? (
          <LoadingBlock label="Loading expiry list…" className="py-16" />
        ) : rows.length ? (
          <div className="divide-y divide-slate-100">
            {rows.map((doc) => (
              <div key={doc.uid} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/70">
                <Avatar name={doc.employee_name} color={doc.avatar_color || 'indigo'} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setSelected(doc.uid)} className="truncate text-[12.5px] font-semibold text-ink-900 hover:text-brand-600">{doc.name}</button>
                    <StatusPill status={tab === 'expired' ? 'expired' : 'expiring'} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">{doc.employee_name} · {doc.category_name} · {formatBytes(doc.file_size)}</p>
                </div>
                <div className="text-right">
                  <p className={clsx('text-[11.5px] font-semibold', tab === 'expired' ? 'text-rose-600' : 'text-amber-600')}>
                    {doc.days_remaining < 0
                      ? `${Math.abs(doc.days_remaining)} days overdue`
                      : doc.days_remaining === 0
                        ? 'Expires today'
                        : `${doc.days_remaining} days left`}
                  </p>
                  <p className="text-[10.5px] text-slate-400">{fmtDate(doc.expiry_date)}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelected(doc.uid)}>Open</Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={tab === 'expired' ? AlertTriangle : CalendarClock}
            title={tab === 'expired' ? 'No expired documents' : 'Nothing expiring soon'}
            description={tab === 'expired' ? 'All tracked documents are within their validity period.' : 'Documents will appear here as they approach their expiry date.'}
            className="py-16"
          />
        )}
        {pagination.pages > 1 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11.5px] leading-relaxed text-slate-500">
        <FileText size={15} className="mt-0.5 shrink-0 text-brand-500" />
        Expiry reminders respect the configured warning period and interval list. Employees receive one notification per document per interval, and HR verifiers are notified separately.
      </div>

      <DocumentDetailModal open={Boolean(selected)} uid={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
