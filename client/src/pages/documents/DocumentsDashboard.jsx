import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  FolderPlus,
  ShieldCheck,
  UploadCloud,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Avatar, Button, Card, EmptyState, LoadingBlock, Progress, SearchInput, SectionTitle, StatCard } from '../../components/ui';
import { DocumentDetailModal, EmployeeDocumentsModal, EmployeeFileGrid, UploadDocumentModal } from './document-ui';

const COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#6366f1'];
const RING = ['#6366f1', '#8b5cf6'];

export default function DocumentsDashboard() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEmployee, setUploadEmployee] = useState(null);
  const [employeeFile, setEmployeeFile] = useState(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const canManage = can('documents.manage');
  const canVerify = can('documents.verify');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, cats, emps] = await Promise.all([
        api.get('/documents/dashboard'),
        api.get('/documents/categories').catch(() => ({ data: [] })),
        canManage ? api.get('/employees').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setData(res);
      setCategories(cats.data || []);
      setEmployees(emps.data || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast, canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const pieData = useMemo(
    () => (data?.verificationSummary || []).filter((s) => s.count > 0).map((s) => ({ name: s.label, value: s.count })),
    [data]
  );
  const completion = useMemo(() => {
    const total = Number(summary.employeesComplete || 0) + Number(summary.employeesIncomplete || 0);
    return total ? Math.round((Number(summary.employeesComplete || 0) / total) * 100) : 0;
  }, [summary]);
  const employeeFiles = useMemo(() => data?.employeeFiles || [], [data]);
  const visibleEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employeeFiles;
    return employeeFiles.filter((row) =>
      `${row.employee_name} ${row.employee_code} ${row.department_name || ''}`.toLowerCase().includes(q)
    );
  }, [employeeFiles, employeeSearch]);
  const attentionEmployees = useMemo(
    () => employeeFiles
      .filter((emp) => emp.pending > 0 || emp.rejected > 0)
      .sort((a, b) => (b.pending + b.rejected) - (a.pending + a.rejected))
      .slice(0, 5),
    [employeeFiles]
  );
  const expiryEmployees = useMemo(
    () => employeeFiles
      .filter((emp) => emp.expiring > 0 || emp.expired > 0)
      .sort((a, b) => (b.expired + b.expiring) - (a.expired + a.expiring))
      .slice(0, 5),
    [employeeFiles]
  );

  if (loading && !data) return <LoadingBlock label="Loading document overview…" />;
  if (!data) return <EmptyState icon={FileText} title="Document overview unavailable" description="Please refresh the page or try again shortly." />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Employee document management</h1>
          <p className="mt-1 text-[13px] text-slate-500">One central, secure document history across onboarding, employment and offboarding.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && <Button variant="secondary" icon={FolderPlus} onClick={() => navigate('/documents/categories')}>Categories</Button>}
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
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total documents" value={summary.total ?? 0} icon={FileText} tone="indigo" loading={loading} />
        <StatCard label="Verified" value={summary.verified ?? 0} icon={CheckCircle2} tone="emerald" loading={loading} />
        <StatCard label="Pending" value={summary.pending ?? 0} icon={Clock3} tone="amber" loading={loading} />
        <StatCard label="Rejected" value={summary.rejected ?? 0} icon={XCircle} tone="rose" loading={loading} />
        <StatCard label="Expiring soon" value={summary.expiringSoon ?? 0} icon={AlertTriangle} tone="orange" loading={loading} />
        <StatCard label="Missing required" value={summary.missing ?? 0} icon={ShieldCheck} tone="slate" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle
            title="Expiry overview"
            description={`Documents approaching expiry within the ${summary.warningDays || 30}-day warning period`}
            action={<Link to="/documents/expiring" className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">View all</Link>}
          />
          <div className="mt-4 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.expiryOverview?.buckets || []} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="count" name="Documents" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={46} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Verification status" description="Across all visible documents" />
          {pieData.length ? (
            <>
              <div className="mx-auto mt-2 h-[160px] w-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={2}>
                      {pieData.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {data.verificationSummary?.map((s, i) => (
                  <div key={s.key} className="flex items-center justify-between text-[11.5px]">
                    <span className="flex items-center gap-2 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{s.label}</span>
                    <span className="font-semibold text-ink-800">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid place-items-center py-14 text-center text-[12px] text-slate-400">No documents yet.</div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle title="Employee file completeness" description="Required categories verified" />
          <div className="mt-5 flex items-center gap-4">
            <div className="relative grid h-20 w-20 place-items-center">
              <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eef2f7" strokeWidth="3.5" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none" stroke="url(#docGrad)" strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={`${(completion / 100) * 97.4} 97.4`}
                />
                <defs>
                  <linearGradient id="docGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={RING[0]} /><stop offset="100%" stopColor={RING[1]} />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute text-[16px] font-extrabold text-ink-900">{completion}%</span>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between text-[11.5px]"><span className="text-slate-500">Complete</span><span className="font-semibold text-emerald-600">{summary.employeesComplete ?? 0}</span></div>
              <div className="flex items-center justify-between text-[11.5px]"><span className="text-slate-500">Incomplete</span><span className="font-semibold text-amber-600">{summary.employeesIncomplete ?? 0}</span></div>
              <Progress value={completion} tone="indigo" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/documents/missing" className="btn-secondary px-3 py-2 text-[12px]">Missing documents</Link>
            {can('documents.reports') && <Link to="/documents/reports" className="btn-secondary px-3 py-2 text-[12px]">Reports</Link>}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Needs attention"
            description="Employees with pending or rejected files"
            action={canVerify ? <Link to="/documents/pending-verification" className="text-[11.5px] font-semibold text-brand-600">Queue</Link> : null}
          />
          <div className="mt-3 space-y-2">
            {attentionEmployees.map((emp) => (
              <button key={emp.employee_id} onClick={() => setEmployeeFile(emp)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                <Avatar name={emp.employee_name} color={emp.avatar_color || 'indigo'} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-ink-800">{emp.employee_name}</span>
                  <span className="block truncate text-[10.5px] text-slate-400">
                    {emp.pending > 0 ? `${emp.pending} pending` : ''}{emp.pending > 0 && emp.rejected > 0 ? ' · ' : ''}{emp.rejected > 0 ? `${emp.rejected} rejected` : ''}
                  </span>
                </span>
                <ArrowRight size={13} className="text-slate-300" />
              </button>
            ))}
            {!attentionEmployees.length && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-[11.5px] text-emerald-700">
                <CheckCircle2 size={14} /> No documents need verification right now.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Expiring & expired" description="Employees needing renewals" action={<Link to="/documents/expiring" className="text-[11.5px] font-semibold text-brand-600">View</Link>} />
          <div className="mt-3 space-y-2">
            {expiryEmployees.map((emp) => (
              <button key={emp.employee_id} onClick={() => setEmployeeFile(emp)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                <span className={clsx('grid h-7 w-7 place-items-center rounded-lg', emp.expired > 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600')}>
                  <AlertTriangle size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-ink-800">{emp.employee_name}</span>
                  <span className="block truncate text-[10.5px] text-slate-400">
                    {emp.expired > 0 ? `${emp.expired} expired` : ''}{emp.expired > 0 && emp.expiring > 0 ? ' · ' : ''}{emp.expiring > 0 ? `${emp.expiring} expiring` : ''}
                  </span>
                </span>
              </button>
            ))}
            {!expiryEmployees.length && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-[11.5px] text-emerald-700">
                <CheckCircle2 size={14} /> No documents expiring soon.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Employee files"
          description="Select an employee to view only the documents they have submitted."
          action={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <SearchInput
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search employees…"
                className="w-full sm:w-[240px]"
              />
              <Link to="/documents/all" className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">All documents</Link>
            </div>
          }
        />
        <EmployeeFileGrid
          employees={visibleEmployees}
          onSelect={setEmployeeFile}
          countNoun="file"
          loading={loading}
          emptyIcon={Users}
          emptyTitle={employeeSearch ? 'No employees match this search' : 'No employees yet'}
          emptyDescription={
            employeeSearch
              ? 'Try a different name, employee ID or department.'
              : 'Add employees to begin collecting and reviewing document files.'
          }
          emptyAction={employeeSearch ? <Button variant="secondary" onClick={() => setEmployeeSearch('')}>Clear search</Button> : null}
          className="mt-4"
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
        onClose={() => setEmployeeFile(null)}
        onOpenDocument={(uid) => setSelected(uid)}
        onUpload={(emp) => {
          setUploadEmployee(emp?.employee_id || null);
          setEmployeeFile(null);
          setUploadOpen(true);
        }}
      />
      <DocumentDetailModal open={Boolean(selected)} uid={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
