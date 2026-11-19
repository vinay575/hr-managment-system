import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Megaphone,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, LoadingBlock, Progress, SectionTitle, StatCard } from '../../components/ui';
import {
  AnnouncementDetailModal,
  AnnouncementFormModal,
  AnnouncementRow,
  CategoryPill,
  StatusPill,
  fmtDateTime,
} from './announcement-ui';

export default function AnnouncementDashboard() {
  const toast = useToast();
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, deps] = await Promise.all([
        api.get('/announcements/dashboard'),
        api.get('/departments').catch(() => ({ data: [] })),
      ]);
      setData(res);
      setDepartments(deps.data || deps.departments || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const departmentList = useMemo(() => {
    const rows = Array.isArray(departments) ? departments : departments?.data || [];
    return rows;
  }, [departments]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <LoadingBlock label="Loading announcement overview…" />;
  if (!data) return <EmptyState icon={Megaphone} title="Announcement overview unavailable" description="Please refresh the page or try again shortly." />;

  const summary = data.summary || {};
  const ack = data.acknowledgmentSummary || {};
  const canManage = can('announcements.manage');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Communication</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Announcements</h1>
          <p className="mt-1 text-[13px] text-slate-500">Company updates, scheduled notices and acknowledgment tracking in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('announcements.reports') && <Link to="/announcements/reports" className="btn-secondary px-3.5 py-2 text-[12.5px]">Acknowledgment report</Link>}
          {canManage && <Button variant="primary" icon={Plus} onClick={() => { setEditTarget(null); setFormOpen(true); }}>New announcement</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total announcements" value={summary.total ?? 0} icon={Megaphone} tone="indigo" loading={loading} />
        <StatCard label="Published" value={summary.published ?? 0} icon={CheckCircle2} tone="emerald" loading={loading} />
        <StatCard label="Scheduled" value={summary.scheduled ?? 0} icon={CalendarClock} tone="amber" loading={loading} />
        <StatCard label="Acknowledgment required" value={summary.requiresAcknowledgment ?? 0} icon={BellRing} tone="rose" loading={loading} />
        <StatCard label="Archived" value={summary.archived ?? 0} icon={Users} tone="slate" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle title="Acknowledgment completion" description="Across published notices that require a response" />
          <div className="mt-5 flex items-center gap-4">
            <div className="relative grid h-24 w-24 place-items-center">
              <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#eef2f7" strokeWidth="3.5" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none" stroke="url(#ackGrad)" strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={`${(Number(ack.completion || 0) / 100) * 97.4} 97.4`}
                />
                <defs>
                  <linearGradient id="ackGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute text-[18px] font-extrabold text-ink-900">{ack.completion || 0}%</span>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between text-[11.5px]"><span className="text-slate-500">Acknowledged</span><span className="font-semibold text-emerald-600">{ack.acknowledged || 0}</span></div>
              <div className="flex items-center justify-between text-[11.5px]"><span className="text-slate-500">Pending</span><span className="font-semibold text-amber-600">{ack.pending || 0}</span></div>
              <div className="flex items-center justify-between text-[11.5px]"><span className="text-slate-500">Targeted employees</span><span className="font-semibold text-ink-800">{ack.targeted || 0}</span></div>
              <Progress value={Number(ack.completion || 0)} tone="indigo" />
            </div>
          </div>
          {can('announcements.reports') && (
            <Link to="/announcements/reports" className="mt-4 inline-block text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">Open acknowledgment report →</Link>
          )}
        </Card>

        <Card className="p-5 xl:col-span-2">
          <SectionTitle
            title="Upcoming & scheduled"
            description="Announcements that will publish automatically"
            action={<Link to="/announcements/all" className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">All announcements</Link>}
          />
          <div className="mt-4 space-y-2">
            {data.upcoming?.length ? data.upcoming.map((row) => (
              <button key={row.id} onClick={() => setSelected(row.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/20 sm:flex-nowrap">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><CalendarClock size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink-900">{row.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">{row.category_label} · {row.audience_label} · {fmtDateTime(row.publish_at)}</span>
                </span>
                <StatusPill status={row.status} label={row.status_label} />
              </button>
            )) : (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-4 text-[11.5px] text-slate-500">
                <CalendarClock size={14} /> No scheduled announcements.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Recent announcements"
          description="Latest published communication"
          action={<Link to="/announcements/all" className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">View all</Link>}
        />
        <div className="mt-4 space-y-2">
          {data.recent?.length ? data.recent.map((row) => (
            <AnnouncementRow key={row.id} row={row} onOpen={(r) => setSelected(r.id)} />
          )) : (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Publish the first announcement to reach your people."
              action={canManage ? <Button variant="primary" icon={Send} onClick={() => setFormOpen(true)}>New announcement</Button> : null}
            />
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-5 py-4">
        <CategoryPill category="important" />
        <p className="flex-1 text-[11.5px] text-slate-500">
          Notifications are sent automatically when an announcement is published or when a scheduled notice goes live.
        </p>
        <Link to="/announcements/my" className={clsx('text-[11.5px] font-semibold text-brand-600 hover:text-brand-700')}>My announcements →</Link>
      </div>

      <AnnouncementFormModal
        open={formOpen}
        announcement={editTarget}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        onSaved={load}
        departments={departmentList}
      />
      <AnnouncementDetailModal
        open={Boolean(selected)}
        id={selected}
        onClose={() => setSelected(null)}
        onChanged={load}
        onEdit={(row) => { setSelected(null); setEditTarget(row); setFormOpen(true); }}
      />
    </div>
  );
}
