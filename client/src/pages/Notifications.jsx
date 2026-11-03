import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Briefcase, CalendarDays, CheckCheck, Clock3, Receipt, Target, UserPlus, Wallet } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api, fmtDate } from '../lib/api';
import { Button, Card, EmptyState, LoadingBlock, SectionTitle } from '../components/ui';

const icons = {
  leave: CalendarDays,
  payroll: Wallet,
  success: UserPlus,
  recruitment: Briefcase,
  interview: Clock3,
  offer: Briefcase,
  expense: Receipt,
  performance: Target,
  info: Bell,
};

const tones = {
  leave: 'bg-amber-50 text-amber-600',
  payroll: 'bg-brand-50 text-brand-600',
  success: 'bg-emerald-50 text-emerald-600',
  recruitment: 'bg-violet-50 text-violet-600',
  interview: 'bg-sky-50 text-sky-600',
  offer: 'bg-orange-50 text-orange-600',
  expense: 'bg-violet-50 text-violet-600',
  performance: 'bg-teal-50 text-teal-600',
  info: 'bg-slate-100 text-slate-500',
};

function safePath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : null;
}

export default function Notifications() {
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get(`/notifications?filter=${filter}&limit=100`);
      setItems(result.items || []);
      setUnreadCount(Number(result.unreadCount) || 0);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (item) => {
    try {
      await api.patch(`/notifications/${item.id}/read`);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
      setUnreadCount((count) => Math.max(0, count - (item.readAt ? 0 : 1)));
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      setUnreadCount(0);
      toast.success('All notifications marked as read.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const openItem = async (item) => {
    if (!item.readAt && !(await markRead(item))) return;
    const path = safePath(item.to);
    if (path) navigate(path);
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Notifications"
        description={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
        action={unreadCount > 0 ? <Button variant="secondary" size="sm" icon={CheckCheck} onClick={markAllRead}>Mark all as read</Button> : null}
      />

      <div className="flex gap-2" role="tablist" aria-label="Notification filter">
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={filter === option.key}
            onClick={() => setFilter(option.key)}
            className={`rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${filter === option.key ? 'bg-ink-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingBlock label="Loading notifications…" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title={filter === 'unread' ? 'No unread notifications' : 'You’re all caught up'}
            description={filter === 'unread' ? 'New updates will appear here.' : 'There are no notifications to show right now.'}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = icons[item.type] || Bell;
            return (
              <Card key={item.id} className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
                <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[item.type] || tones.info}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => openItem(item)} className="text-left">
                    <p className={`text-[13px] text-ink-900 ${item.readAt ? 'font-medium' : 'font-bold'}`}>{item.title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{item.body}</p>
                  </button>
                  <p className="mt-2 text-[10.5px] text-slate-400">{fmtDate(item.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                {!item.readAt && (
                  <button
                    type="button"
                    onClick={() => markRead(item)}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                  >
                    Mark read
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
