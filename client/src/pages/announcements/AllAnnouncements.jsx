import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  BellRing,
  Filter,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, LoadingBlock, Pagination, SearchInput, Select } from '../../components/ui';
import {
  AnnouncementDetailModal,
  AnnouncementFormModal,
  AnnouncementRow,
  AudienceLabel,
  CategoryPill,
  StatusPill,
  announcementWhen,
} from './announcement-ui';

const PAGE_SIZE = 15;

export default function AllAnnouncements() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '', category: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(null);

  const canManage = can('announcements.manage');
  const canDelete = user?.role === 'super_admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.status) params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      const res = await api.get(`/announcements?${params.toString()}`);
      setRows(res.data || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    api.get('/departments')
      .then((res) => { if (!cancelled) setDepartments(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const update = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clear = () => {
    setPage(1);
    setFilters({ search: '', status: '', category: '' });
  };

  const run = async (row, action) => {
    if (action === 'delete' && !window.confirm(`Delete "${row.title}" permanently? Acknowledgment records will be removed.`)) return;
    setBusy(`${row.id}:${action}`);
    try {
      if (action === 'publish') {
        const res = await api.post(`/announcements/${row.id}/publish`);
        toast.success(res.message || 'Announcement published.');
      } else if (action === 'archive') {
        const res = await api.post(`/announcements/${row.id}/archive`);
        toast.success(res.message || 'Announcement archived.');
      } else if (action === 'delete') {
        const res = await api.del(`/announcements/${row.id}`);
        toast.success(res.message || 'Announcement deleted.');
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const openEdit = (row) => {
    setSelected(null);
    setEditTarget(row);
    setFormOpen(true);
  };

  const activeFilters = useMemo(
    () => [filters.status, filters.category].filter(Boolean).length,
    [filters.status, filters.category]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Communication</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">All announcements</h1>
          <p className="mt-1 text-[13px] text-slate-500">Every published, scheduled, drafted and archived notice.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('announcements.reports') && <Button variant="secondary" onClick={() => navigate('/announcements/reports')}>Reports</Button>}
          {canManage && <Button variant="primary" icon={Plus} onClick={() => { setEditTarget(null); setFormOpen(true); }}>New announcement</Button>}
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={filters.search}
            onChange={(v) => update('search', v)}
            placeholder="Search announcements."
            className="min-w-[220px] flex-1"
          />
          <Select value={filters.status} onChange={(e) => update('status', e.target.value)} className="w-auto min-w-[150px]">
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
          <Button variant={showFilters ? 'soft' : 'secondary'} icon={Filter} onClick={() => setShowFilters((v) => !v)}>
            Filters {activeFilters ? `(${activeFilters})` : ''}
          </Button>
          {(filters.search || activeFilters) && <Button variant="ghost" icon={X} onClick={clear}>Clear</Button>}
        </div>
        {showFilters && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
            <Select label="Category" value={filters.category} onChange={(e) => update('category', e.target.value)}>
              <option value="">All categories</option>
              <option value="general">General</option>
              <option value="hr">HR</option>
              <option value="holiday">Holiday</option>
              <option value="policy">Policy</option>
              <option value="important">Important Notice</option>
            </Select>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <p className="text-[12.5px] font-semibold text-ink-900">{pagination.total || 0} announcement{pagination.total === 1 ? '' : 's'}</p>
          <p className="text-[11px] text-slate-400">Page {pagination.page} of {pagination.pages}</p>
        </div>

        {loading ? (
          <LoadingBlock label="Loading announcements…" className="py-16" />
        ) : rows.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[10.5px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-semibold">Announcement</th>
                    <th className="px-3 py-3 font-semibold">Category</th>
                    <th className="px-3 py-3 font-semibold">Audience</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">When</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="text-[12.5px] transition hover:bg-slate-50/70">
                      <td className="max-w-[320px] px-5 py-3">
                        <button onClick={() => setSelected(row.id)} className="block max-w-full truncate text-left font-semibold text-ink-900 hover:text-brand-600">{row.title}</button>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {Number(row.requires_acknowledgment) ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600"><BellRing size={10} /> Acknowledgment required</span>
                          ) : null}
                          {Number(row.requires_acknowledgment) && row.status === 'published' ? (
                            <span className="text-[10px] text-slate-400">{row.acknowledged_count || 0} / {row.target_count || 0} acknowledged</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3"><CategoryPill category={row.category} label={row.category_label} /></td>
                      <td className="px-3 py-3"><AudienceLabel announcement={row} /></td>
                      <td className="px-3 py-3"><StatusPill status={row.status} label={row.status_label} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-500">{announcementWhen(row)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && row.status !== 'archived' && (
                            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(row)} aria-label="Edit">Edit</Button>
                          )}
                          {canManage && ['draft', 'scheduled'].includes(row.status) && (
                            <Button size="sm" variant="ghost" icon={Send} loading={busy === `${row.id}:publish`} onClick={() => run(row, 'publish')}>Publish</Button>
                          )}
                          {canManage && row.status !== 'archived' && (
                            <Button size="sm" variant="ghost" icon={Archive} loading={busy === `${row.id}:archive`} onClick={() => run(row, 'archive')}>Archive</Button>
                          )}
                          {canDelete && (
                            <Button size="sm" variant="ghost" icon={Trash2} loading={busy === `${row.id}:delete`} onClick={() => run(row, 'delete')} aria-label="Delete" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {rows.map((row) => (
                <div key={row.id} className="px-4 py-3">
                  <AnnouncementRow row={row} onOpen={(r) => setSelected(r.id)} />
                  {canManage && (
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      {row.status !== 'archived' && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openEdit(row)}>Edit</Button>}
                      {['draft', 'scheduled'].includes(row.status) && <Button size="sm" variant="secondary" icon={Send} onClick={() => run(row, 'publish')}>Publish</Button>}
                      {row.status !== 'archived' && <Button size="sm" variant="secondary" icon={Archive} onClick={() => run(row, 'archive')}>Archive</Button>}
                      {canDelete && <Button size="sm" variant="danger" icon={Trash2} onClick={() => run(row, 'delete')}>Delete</Button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={Megaphone}
            title="No announcements match these filters"
            description="Try a different search or clear the filters."
            action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}
            className="py-16"
          />
        )}

        {pagination.pages > 1 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </Card>

      <AnnouncementFormModal
        open={formOpen}
        announcement={editTarget}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        onSaved={load}
        departments={Array.isArray(departments) ? departments : []}
      />
      <AnnouncementDetailModal
        open={Boolean(selected)}
        id={selected}
        onClose={() => setSelected(null)}
        onChanged={load}
        onEdit={openEdit}
      />
    </div>
  );
}
