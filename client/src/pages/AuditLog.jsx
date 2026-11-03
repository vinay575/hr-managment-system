import { useCallback, useEffect, useState } from 'react';
import { ScrollText, ShieldCheck } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api, fmtDate } from '../lib/api';
import {
  Badge,
  Card,
  EmptyState,
  LoadingBlock,
  Pagination,
  SearchInput,
  SectionTitle,
} from '../components/ui';

const ACTION_TONE = (action = '') => {
  if (action.includes('delete') || action.includes('rejected') || action.includes('deactivate')) return 'rose';
  if (action.includes('create') || action.includes('approved') || action.includes('activate')) return 'emerald';
  if (action.includes('role') || action.includes('permission')) return 'violet';
  if (action.includes('password')) return 'amber';
  return 'sky';
};

const detailText = (details) => {
  if (!details) return '—';
  if (typeof details === 'string') return details;
  const entries = Object.entries(details).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!entries.length) return '—';
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join(' · ');
};

export default function AuditLog() {
  const toast = useToast();
  const [data, setData] = useState({ data: [], total: 0, page: 1, limit: 20, actions: [] });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 20 });
      if (action) params.set('action', action);
      if (role) params.set('role', role);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/audit?${params}`);
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, action, role, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const rows = data.data || [];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">System</p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Audit log</h1>
        <p className="mt-1 text-[13px] text-slate-500">Every sensitive administrative action, captured for accountability.</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search actor, action, entity or details…" className="flex-1" />
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="input w-auto min-w-[180px] py-2.5 text-[13px]">
            <option value="">All actions</option>
            {(data.actions || []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="input w-auto min-w-[150px] py-2.5 text-[13px]">
            <option value="">All roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="ceo">CEO</option>
            <option value="administration">Administration</option>
            <option value="hr">HR</option>
            <option value="employee">Employee</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <SectionTitle title="Administrative activity" description={`${data.total || 0} recorded action${data.total === 1 ? '' : 's'}`} />
          <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-violet-600">
            <ShieldCheck size={12} /> Immutable trail
          </span>
        </div>

        {loading ? (
          <LoadingBlock label="Loading audit log…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No activity recorded" description="Sensitive administrative actions will appear here as they happen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-y border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-head">When</th>
                  <th className="table-head">Actor</th>
                  <th className="table-head">Action</th>
                  <th className="table-head">Entity</th>
                  <th className="table-head">Details</th>
                  <th className="table-head">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50/60">
                    <td className="table-cell whitespace-nowrap text-[12px] text-slate-500">
                      {fmtDate(row.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="table-cell">
                      <p className="text-[12.5px] font-semibold text-ink-900">{row.actor_name || 'System'}</p>
                      <p className="text-[10.5px] text-slate-400">{row.actor_role_label || '—'}</p>
                    </td>
                    <td className="table-cell">
                      <Badge tone={ACTION_TONE(row.action)} dot={false}>{row.action}</Badge>
                    </td>
                    <td className="table-cell text-[12px] text-slate-600">
                      {row.entity ? `${row.entity}${row.entity_id ? ` #${row.entity_id}` : ''}` : '—'}
                    </td>
                    <td className="table-cell max-w-[320px]">
                      <p className="truncate text-[11.5px] text-slate-500" title={detailText(row.details)}>{detailText(row.details)}</p>
                    </td>
                    <td className="table-cell whitespace-nowrap text-[11px] text-slate-400">{row.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.total > data.limit && (
        <Pagination page={data.page} pages={Math.ceil(data.total / data.limit)} total={data.total} limit={data.limit} onChange={setPage} />
      )}
    </div>
  );
}
