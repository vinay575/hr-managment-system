import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BarChart3, CheckCircle2, Download, FileText, ShieldAlert } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Button, Card, EmptyState, LoadingBlock, Progress, SectionTitle, StatCard } from '../../components/ui';
import { StatusPill } from './document-ui';

const COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#6366f1', '#0ea5e9'];

export default function DocumentReports() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get('/documents/reports'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async (type) => {
    setExporting(type);
    try {
      await api.download(`/documents/reports/export?type=${type}`, `kodewar-documents-${type}.csv`);
      toast.success('Report exported.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting('');
    }
  };

  const statusData = useMemo(
    () => (data?.byStatus || []).map((s) => ({ name: s.status, value: s.count })),
    [data]
  );

  if (loading && !data) return <LoadingBlock label="Building document report…" />;
  if (!data) return <EmptyState icon={BarChart3} title="Report unavailable" description="Please refresh and try again." />;

  const s = data.summary || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Document reports</h1>
          <p className="mt-1 text-[13px] text-slate-500">Verification progress, completeness, expiry exposure and department coverage.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Download} loading={exporting === 'documents'} onClick={() => exportCsv('documents')}>Export all</Button>
          <Button variant="secondary" icon={Download} loading={exporting === 'missing'} onClick={() => exportCsv('missing')}>Missing</Button>
          <Button variant="secondary" icon={Download} loading={exporting === 'expiring'} onClick={() => exportCsv('expiring')}>Expiry</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Documents" value={s.total || 0} icon={FileText} tone="indigo" />
        <StatCard label="Verified" value={s.verified || 0} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Pending" value={s.pending || 0} icon={ShieldAlert} tone="amber" />
        <StatCard label="Rejected" value={s.rejected || 0} icon={AlertTriangle} tone="rose" />
        <StatCard label="Expiring" value={s.expiring || 0} icon={AlertTriangle} tone="orange" />
        <StatCard label="Missing" value={s.missing || 0} icon={ShieldAlert} tone="slate" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Documents by category" description="Across the full central document history" />
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byCategory?.slice(0, 10) || []} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="category" width={150} tick={{ fontSize: 10.5, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="count" name="Documents" fill="#8b5cf6" radius={[0, 6, 6, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Verification split" description="All visible documents" />
          <div className="mx-auto mt-3 h-[190px] w-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {statusData.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {statusData.map((entry, i) => (
              <div key={entry.name} className="flex items-center justify-between text-[11.5px]">
                <span className="flex items-center gap-2 capitalize text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{entry.name}</span>
                <span className="font-semibold text-ink-800">{entry.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Employee file completeness" description="Required categories verified" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-600">Complete</p>
              <p className="mt-0.5 text-[22px] font-extrabold text-emerald-700">{s.completeEmployees || 0}</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-amber-600">Needs action</p>
              <p className="mt-0.5 text-[22px] font-extrabold text-amber-700">{s.incompleteEmployees || 0}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {(data.byDepartment || []).slice(0, 6).map((d) => {
              const max = Math.max(...(data.byDepartment || []).map((x) => x.count), 1);
              return (
                <div key={d.department}>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="truncate text-slate-500">{d.department}</span>
                    <span className="font-semibold text-ink-800">{d.count}</span>
                  </div>
                  <Progress value={(d.count / max) * 100} tone="indigo" className="mt-1" />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Expiry exposure" description="Next documents needing renewal" action={<Button size="sm" variant="ghost" icon={Download} onClick={() => exportCsv('expiring')}>CSV</Button>} />
          <div className="mt-3 space-y-2">
            {[...(data.expiring || []), ...(data.expired || [])].slice(0, 8).map((doc) => (
              <div key={doc.uid} className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-ink-800">{doc.name}</p>
                  <p className="truncate text-[10.5px] text-slate-400">{doc.employee_name} · {doc.category_name}</p>
                </div>
                <span className={clsx('text-[10.5px] font-semibold', doc.expiry_status === 'expired' ? 'text-rose-600' : 'text-amber-600')}>
                  {doc.expiry_status === 'expired' ? 'Expired' : `${doc.days_remaining}d`}
                </span>
              </div>
            ))}
            {!data.expiring?.length && !data.expired?.length && <p className="py-8 text-center text-[12px] text-slate-400">No expiry exposure.</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Rejected documents" description="Awaiting replacement or correction" action={<Button size="sm" variant="ghost" icon={Download} onClick={() => exportCsv('documents')}>CSV</Button>} />
          <div className="mt-3 space-y-2">
            {(data.rejected || []).slice(0, 8).map((doc) => (
              <div key={doc.uid} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12px] font-semibold text-ink-800">{doc.name}</p>
                  <StatusPill status="rejected" />
                </div>
                <p className="truncate text-[10.5px] text-slate-400">{doc.employee_name} · {doc.rejection_reason || 'No reason recorded'}</p>
              </div>
            ))}
            {!data.rejected?.length && <p className="py-8 text-center text-[12px] text-slate-400">No rejected documents.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Missing required documents" description="Outstanding employee requirements" action={<Button size="sm" variant="ghost" icon={Download} onClick={() => exportCsv('missing')}>CSV</Button>} />
          <div className="mt-3 space-y-2">
            {(data.missing || []).slice(0, 8).map((row) => (
              <div key={`${row.employee_id}:${row.category_id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-ink-800">{row.employee_name}</p>
                  <p className="truncate text-[10.5px] text-slate-400">{row.category_name} · {row.department_name || 'Unassigned'}</p>
                </div>
                <div className="text-right">
                  <StatusPill status={row.status} />
                  <p className="mt-1 text-[10px] text-slate-400">{row.last_reminder ? fmtDate(row.last_reminder) : 'No reminder'}</p>
                </div>
              </div>
            ))}
            {!data.missing?.length && <p className="py-8 text-center text-[12px] text-slate-400">No missing requirements.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
