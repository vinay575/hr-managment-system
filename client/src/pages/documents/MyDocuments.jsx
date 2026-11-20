import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, ShieldAlert, UploadCloud } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Button, Card, EmptyState, LoadingBlock, SearchInput, SectionTitle, Select, Progress, StatCard } from '../../components/ui';
import { DocumentDetailModal, DocumentRow, StatusPill, UploadDocumentModal } from './document-ui';

export default function MyDocuments() {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [required, setRequired] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!user?.employeeId) return setLoading(false);
    setLoading(true);
    try {
      const [docs, catRes] = await Promise.all([
        api.get('/documents/my?limit=100'),
        api.get('/documents/categories').catch(() => ({ data: [] })),
      ]);
      setRows(docs.data || []);
      setCategories(catRes.data || []);
      const sum = await api.get(`/documents/employee/${user.employeeId}/summary`);
      setSummary(sum.summary);
      setRequired(sum.required || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast, user?.employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((doc) => {
      if (status && doc.status !== status) return false;
      if (!q) return true;
      return `${doc.name} ${doc.category_name}`.toLowerCase().includes(q);
    });
  }, [rows, search, status]);

  const requiredDone = required.filter((r) => r.status === 'verified').length;
  const requiredTotal = required.length;
  const completion = requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 100;

  if (!user?.employeeId) {
    return <EmptyState icon={ShieldAlert} title="No employee record linked" description="Your account is not linked to an employee profile. Contact HR to link your record before uploading documents." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">My documents</h1>
          <p className="mt-1 text-[13px] text-slate-500">Your personal document file. Only you and authorised HR can access these files.</p>
        </div>
        <Button variant="primary" icon={UploadCloud} onClick={() => setUploadOpen(true)}>Upload document</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Documents" value={summary?.total ?? rows.length} icon={FileText} tone="indigo" loading={loading} />
        <StatCard label="Verified" value={summary?.verified ?? 0} icon={CheckCircle2} tone="emerald" loading={loading} />
        <StatCard label="Pending" value={summary?.pending ?? 0} icon={ShieldAlert} tone="amber" loading={loading} />
        <StatCard label="Missing required" value={summary?.missing ?? 0} icon={ShieldAlert} tone="rose" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle title="My files" description="Onboarding, employment and exit documents in one place" />
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Search…" className="w-40" />
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto py-1.5 text-[12px]" aria-label="Filter by status">
                  <option value="">All statuses</option>
                  <option value="verified">Verified</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {loading ? (
                <LoadingBlock label="Loading your documents…" className="py-12" />
              ) : filtered.length ? (
                filtered.map((doc) => <DocumentRow key={doc.uid} doc={doc} showEmployee={false} onOpen={(d) => setSelected(d.uid)} />)
              ) : (
                <EmptyState
                  icon={FileText}
                  title={rows.length ? 'No documents match your search' : 'No documents yet'}
                  description={rows.length ? 'Try a different search term or status.' : 'Upload your first document to start your personal file.'}
                  action={<Button variant="primary" icon={UploadCloud} onClick={() => setUploadOpen(true)}>Upload document</Button>}
                />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle title="Required documents" description="Set by HR for every employee" />
            <div className="mt-4 flex items-center justify-between text-[11.5px]">
              <span className="text-slate-500">{requiredDone} of {requiredTotal} verified</span>
              <span className="font-bold text-ink-900">{completion}%</span>
            </div>
            <Progress value={completion} tone={completion === 100 ? 'emerald' : 'indigo'} className="mt-2" />
            <div className="mt-4 space-y-2">
              {required.length ? (
                required.map((row) => {
                  const done = row.status === 'verified';
                  return (
                    <div key={`${row.category_id}`} className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {done ? <CheckCircle2 size={13} /> : <FileText size={12} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] font-semibold text-ink-800">{row.category_name}</p>
                        {!done && row.source && <p className="text-[10px] text-slate-400">Submitted · {row.status}</p>}
                      </div>
                      {!done && row.status !== 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => setUploadOpen(true)}>Upload</Button>
                      )}
                      {row.status === 'expired' && <StatusPill status="expired" />}
                    </div>
                  );
                })
              ) : (
                <p className="text-[11.5px] text-slate-400">No required document categories configured.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-[12px] font-bold text-ink-900">Status guide</p>
            <ul className="mt-3 space-y-2 text-[11px] text-slate-500">
              <li className="flex gap-2"><StatusPill status="pending" /> <span>HR is reviewing your file. You will be notified when it changes.</span></li>
              <li className="flex gap-2"><StatusPill status="verified" /> <span>Checked and accepted by HR.</span></li>
              <li className="flex gap-2"><StatusPill status="rejected" /> <span>Needs correction. Read the reason, then replace the file.</span></li>
              <li className="flex gap-2"><StatusPill status="expired" /> <span>Expired files should be replaced with a current copy.</span></li>
            </ul>
            {summary?.complete && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">Your required document file is complete.</p>}
            {required.length > 0 && !summary?.complete && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">Some required documents are still outstanding. Upload them to complete your file.</p>
            )}
          </Card>
        </div>
      </div>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSaved={load}
        categories={categories}
        fixedEmployeeId={user.employeeId}
      />
      <DocumentDetailModal open={Boolean(selected)} uid={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
