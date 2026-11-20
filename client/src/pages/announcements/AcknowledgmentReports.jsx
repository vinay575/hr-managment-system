import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Download,
  Megaphone,
  Users,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Avatar, Button, Card, EmptyState, LoadingBlock, Progress, SearchInput, Select, StatCard } from '../../components/ui';
import { CategoryPill, fmtDateTime } from './announcement-ui';

export default function AcknowledgmentReports() {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: '', status: '', departmentId: '' });

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await api.get('/announcements/reports');
      const rows = res.data || [];
      setAnnouncements(rows);
      setSelectedId((current) => current || (rows[0] ? String(rows[0].id) : ''));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingList(false);
    }
  }, [toast]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadReport = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.status) params.set('status', filters.status);
      if (filters.departmentId) params.set('departmentId', filters.departmentId);
      const res = await api.get(`/announcements/reports/${selectedId}?${params.toString()}`);
      setReport(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId, filters, toast]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const stats = report?.stats || { targeted: 0, acknowledged: 0, pending: 0, completion: 0 };
  const rows = report?.data || [];
  const departments = useMemo(() => {
    const map = new Map();
    for (const row of report?.data || []) {
      if (row.department_id) map.set(String(row.department_id), row.department_name || 'Department');
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [report]);

  const update = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const exportCsv = () => {
    if (!rows.length) return;
    const header = ['Employee', 'Code', 'Email', 'Department', 'Status', 'Acknowledged at'];
    const lines = rows.map((row) => [
      row.employee_name,
      row.employee_code,
      row.email,
      row.department_name || '',
      row.status,
      row.acknowledged_at || '',
    ]);
    const csv = [header, ...lines]
      .map((cells) => cells.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acknowledgments-${selectedId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  if (loadingList) return <LoadingBlock label="Loading acknowledgment reports…" />;

  if (!announcements.length) {
    return (
      <div className="space-y-5">
        <PageHeading />
        <EmptyState
          icon={BellRing}
          title="No acknowledgment reports yet"
          description="Publish an announcement that requires acknowledgment to start tracking responses."
          className="py-20"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeading />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Select label="Announcement" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {announcements.map((row) => (
              <option key={row.id} value={row.id}>{row.title}</option>
            ))}
          </Select>
          <div className="flex items-end gap-2">
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          </div>
        </div>
        {report?.announcement && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11.5px] text-slate-500">
            <CategoryPill category={report.announcement.category} label={report.announcement.category_label} />
            <span>{report.announcement.audience_label}</span>
            <span>·</span>
            <span>Published {fmtDateTime(report.announcement.published_at)}</span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Targeted employees" value={stats.targeted ?? 0} icon={Users} tone="indigo" />
        <StatCard label="Acknowledged" value={stats.acknowledged ?? 0} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Pending" value={stats.pending ?? 0} icon={Clock3} tone="amber" />
        <StatCard label="Completion" value={`${stats.completion ?? 0}%`} icon={Megaphone} tone="violet" />
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between text-[11.5px]">
          <span className="font-semibold text-slate-600">Completion</span>
          <span className="text-slate-400">{stats.acknowledged ?? 0} of {stats.targeted ?? 0} employees</span>
        </div>
        <Progress value={Number(stats.completion || 0)} tone="emerald" />
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <SearchInput value={filters.search} onChange={(v) => update('search', v)} placeholder="Search employee or code." />
          <Select value={filters.status} onChange={(e) => update('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="pending">Pending</option>
          </Select>
          <Select value={filters.departmentId} onChange={(e) => update('departmentId', e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>

        {loading ? (
          <LoadingBlock label="Loading acknowledgments…" className="py-16" />
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10.5px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Employee</th>
                  <th className="px-3 py-3 font-semibold">Department</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Acknowledged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="text-[12.5px] transition hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={row.employee_name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">{row.employee_name}</p>
                          <p className="truncate text-[10.5px] text-slate-400">{row.employee_code}{row.email ? ` · ${row.email}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{row.department_name || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={clsx(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                        row.status === 'acknowledged' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      )}>
                        {row.status === 'acknowledged' ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
                        {row.status === 'acknowledged' ? 'Acknowledged' : 'Pending'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-[11.5px] text-slate-500">
                      {row.acknowledged_at ? `${fmtDate(row.acknowledged_at)}${row.acknowledged_by_name ? ` · ${row.acknowledged_by_name}` : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No employees match these filters" description="Try a different search, status or department." className="py-16" />
        )}
      </Card>
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Communication</p>
      <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Acknowledgment reports</h1>
      <p className="mt-1 text-[13px] text-slate-500">See who has read and acknowledged important company notices.</p>
    </div>
  );
}
