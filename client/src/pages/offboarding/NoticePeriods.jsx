import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, Hourglass } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Badge, Button, Card, EmptyState, LoadingBlock, SectionTitle } from '../../components/ui';

export default function NoticePeriods() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [noticePeriods, setNoticePeriods] = useState([]);

  const load = () => {
    setLoading(true);
    api
      .get('/offboarding/notice-periods')
      .then((res) => setNoticePeriods(res.noticePeriods || []))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingBlock label="Loading notice period timelines…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/offboarding/resignations')} className="!p-2.5" />
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">Notice Period Management</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Live tracking of serving employees, remaining tenure, and verified handover dates.
            </p>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <SectionTitle
            title="Active Notice Periods"
            description="Dynamically calculated remaining days according to company notice policies."
          />
        </div>

        {noticePeriods.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No active notice periods"
            description="There are currently no team members serving a notice period."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Submission Date</th>
                  <th className="px-5 py-3">Notice Duration</th>
                  <th className="px-5 py-3">Expected Last Day</th>
                  <th className="px-5 py-3">Approved Last Day</th>
                  <th className="px-5 py-3">Days Remaining</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {noticePeriods.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-ink-900">{n.first_name} {n.last_name}</div>
                      <div className="text-[11px] text-slate-400">{n.employee_code} · {n.designation}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{fmtDate(n.submission_date)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{n.notice_duration_days} Days</td>
                    <td className="px-5 py-3.5 text-slate-600">{fmtDate(n.expected_lwd)}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {n.approved_lwd ? (
                        <span className="font-semibold text-emerald-600">{fmtDate(n.approved_lwd)}</span>
                      ) : (
                        <span className="text-slate-400">Under Review</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-[12px]">
                        <Hourglass size={13} /> {n.remaining_days} days left
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={n.status === 'serving' ? 'amber' : 'emerald'}>
                        {n.status.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
