import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  BellRing,
  CheckCheck,
  Clock3,
  Megaphone,
  Paperclip,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Button, Card, EmptyState, LoadingBlock, Progress, SearchInput, Tabs } from '../../components/ui';
import {
  AnnouncementDetailModal,
  CategoryPill,
  fmtDateTime,
} from './announcement-ui';

export default function MyAnnouncements() {
  const toast = useToast();
  const [data, setData] = useState({ data: [], unread: 0, pendingAcknowledgment: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/announcements/my');
      setData({ data: res.data || [], unread: res.unread || 0, pendingAcknowledgment: res.pendingAcknowledgment || 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id) => {
    try {
      await api.post(`/announcements/my/${id}/read`);
      setData((current) => ({
        ...current,
        unread: Math.max(0, Number(current.unread || 0) - 1),
        data: current.data.map((row) => (Number(row.id) === Number(id) ? { ...row, read_at: row.read_at || new Date().toISOString() } : row)),
      }));
    } catch {
      /* A failed read receipt must never block reading the announcement. */
    }
  }, []);

  const openRow = (row) => {
    setSelected(row.id);
    if (!row.read_at) markRead(row.id);
  };

  const acknowledge = async (row) => {
    setBusy(row.id);
    try {
      const res = await api.post(`/announcements/my/${row.id}/acknowledge`);
      toast.success(res.message || 'Announcement acknowledged.');
      if (!row.read_at) await markRead(row.id);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => {
    let list = data.data || [];
    if (tab === 'unread') list = list.filter((row) => !row.read_at);
    if (tab === 'ack') list = list.filter((row) => Number(row.requires_acknowledgment) && !row.acknowledged_at);
    if (tab === 'acknowledged') list = list.filter((row) => row.acknowledged_at);
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((row) => `${row.title} ${row.content} ${row.category_label || ''}`.toLowerCase().includes(term));
    }
    return list;
  }, [data.data, tab, search]);

  const published = data.data?.length || 0;
  const acknowledged = (data.data || []).filter((row) => row.acknowledged_at).length;
  const requiresAck = (data.data || []).filter((row) => Number(row.requires_acknowledgment)).length;
  const pendingAck = Number(data.pendingAcknowledgment || 0);
  const pendingShare = requiresAck ? Math.round((pendingAck / requiresAck) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Communication</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">My announcements</h1>
        <p className="mt-1 text-[13px] text-slate-500">Notices addressed to you, with read state and acknowledgment tracking.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Megaphone size={18} /></span>
          <div><p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Announcements</p><p className="text-[20px] font-extrabold text-ink-900">{published}</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><BellRing size={18} /></span>
          <div><p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Unread</p><p className="text-[20px] font-extrabold text-ink-900">{data.unread || 0}</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><Clock3 size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Pending acknowledgment</p>
            <div className="flex items-baseline gap-2">
              <p className="text-[20px] font-extrabold text-ink-900">{pendingAck}</p>
              <p className="text-[10px] text-slate-400">{acknowledged} of {requiresAck} acknowledged</p>
            </div>
            <Progress value={pendingShare} tone="amber" className="mt-1" height="h-1" />
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            items={[
              { key: 'all', label: 'All', count: published },
              { key: 'unread', label: 'Unread', count: data.unread || 0 },
              { key: 'ack', label: 'Needs acknowledgment', count: data.pendingAcknowledgment || 0 },
              { key: 'acknowledged', label: 'Acknowledged' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div className="ml-auto w-full min-w-[200px] sm:w-auto">
            <SearchInput value={search} onChange={setSearch} placeholder="Search my announcements." />
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading your announcements…" className="py-16" />
      ) : rows.length ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className={clsx('p-4 transition sm:p-5', !row.read_at && 'border-brand-200 bg-brand-50/20')}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => openRow(row)} className="text-left text-[14px] font-bold text-ink-900 hover:text-brand-600">{row.title}</button>
                    <CategoryPill category={row.category} label={row.category_label} />
                    {!row.read_at && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">New</span>}
                    {Number(row.requires_acknowledgment) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><BellRing size={10} /> Acknowledgment required</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Published {fmtDateTime(row.published_at || row.publish_at || row.created_at)}
                    {row.audience_label ? ` · ${row.audience_label}` : ''}
                  </p>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-600">{row.content}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {row.has_attachment && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Paperclip size={12} /> {row.attachment_name}</span>
                    )}
                    {row.acknowledged_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                        <CheckCheck size={11} /> Acknowledged {fmtDate(row.acknowledged_at)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openRow(row)}>Read</Button>
                  {Number(row.requires_acknowledgment) && !row.acknowledged_at && (
                    <Button size="sm" variant="primary" icon={CheckCheck} loading={busy === row.id} onClick={() => acknowledge(row)}>Acknowledge</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Megaphone}
          title={tab === 'unread' ? 'You are all caught up' : tab === 'ack' ? 'No acknowledgments pending' : 'No announcements yet'}
          description={tab === 'all' ? 'Announcements targeted to you will appear here.' : 'Try another tab or clear the search.'}
          className="py-16"
        />
      )}

      <AnnouncementDetailModal
        open={Boolean(selected)}
        id={selected}
        onClose={() => setSelected(null)}
        onChanged={load}
        onAcknowledge={load}
      />
    </div>
  );
}
