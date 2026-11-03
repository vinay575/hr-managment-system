import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  LogOut,
  Plus,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, LoadingBlock, Modal, SectionTitle, Select } from '../../components/ui';

export default function Resignations() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, can } = useAuth();
  const isEmployee = user?.role === 'employee';
  const manage = can('offboarding.manage');

  const [loading, setLoading] = useState(true);
  const [resignations, setResignations] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [reviewModal, setReviewModal] = useState({ open: false, id: null, status: 'approved', lastDay: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    resignation_date: new Date().toISOString().slice(0, 10),
    proposed_last_working_day: '',
    reason: 'Career Growth & Better Opportunities',
    comments: '',
    notice_days: 30,
  });

  const load = () => {
    setLoading(true);
    api
      .get('/offboarding/resignations')
      .then((res) => setResignations(res.resignations || []))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Default proposed last day = +30 days
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setForm((prev) => ({ ...prev, proposed_last_working_day: d.toISOString().slice(0, 10) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitResignation = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/offboarding/resignations', form);
      toast.success('Resignation submitted successfully.');
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async () => {
    try {
      await api.patch(`/offboarding/resignations/${reviewModal.id}/review`, {
        status: reviewModal.status,
        approved_last_working_day: reviewModal.lastDay || undefined,
        clarification_notes: reviewModal.notes || undefined,
      });
      toast.success(`Resignation request ${reviewModal.status}.`);
      setReviewModal({ open: false, id: null, status: 'approved', lastDay: '', notes: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <LoadingBlock label="Loading resignation requests…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
            {isEmployee ? 'My Resignation & Exit' : 'Resignation Management'}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {isEmployee
              ? 'Submit resignation notices and track the review status of your proposed last working day.'
              : 'Review employee resignation submissions, configure notice periods, and confirm exit dates.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" icon={Clock} onClick={() => navigate('/offboarding/notice-periods')}>
            Notice Periods
          </Button>
          <Button variant="secondary" icon={FileText} onClick={() => navigate('/offboarding/exit-documents')}>
            Exit Documents
          </Button>
          <Button variant="primary" icon={LogOut} onClick={() => setModalOpen(true)}>
            Submit Resignation
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <SectionTitle
            title="Resignation Requests"
            description="All active and reviewed employee departure requests."
          />
        </div>

        {resignations.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No resignation records"
            description="There are currently no resignation requests on file."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Resignation Date</th>
                  <th className="px-5 py-3">Proposed Last Day</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Notice Status</th>
                  <th className="px-5 py-3">Status</th>
                  {manage && <th className="px-5 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resignations.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-ink-900">{r.first_name} {r.last_name}</div>
                      <div className="text-[11px] text-slate-400">{r.employee_code} · {r.department_name || 'Staff'}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{fmtDate(r.resignation_date)}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <div>{fmtDate(r.proposed_last_working_day)}</div>
                      {r.approved_last_working_day && (
                        <div className="text-[11px] font-semibold text-emerald-600">
                          Approved: {fmtDate(r.approved_last_working_day)}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 max-w-xs truncate">{r.reason}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone="sky">{(r.notice_status || 'serving').toUpperCase()}</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        tone={
                          r.status === 'approved'
                            ? 'emerald'
                            : r.status === 'rejected'
                            ? 'rose'
                            : 'amber'
                        }
                      >
                        {r.status.toUpperCase()}
                      </Badge>
                    </td>
                    {manage && (
                      <td className="px-5 py-3.5 text-right">
                        {r.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={CheckCircle2}
                              onClick={() =>
                                setReviewModal({
                                  open: true,
                                  id: r.id,
                                  status: 'approved',
                                  lastDay: String(r.proposed_last_working_day).slice(0, 10),
                                  notes: '',
                                })
                              }
                              className="text-emerald-600 hover:bg-emerald-50"
                            >
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={XCircle}
                              onClick={() =>
                                setReviewModal({
                                  open: true,
                                  id: r.id,
                                  status: 'rejected',
                                  lastDay: '',
                                  notes: '',
                                })
                              }
                              className="text-rose-600 hover:bg-rose-50"
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11.5px] text-slate-400">Reviewed</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Submit Resignation Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Submit Resignation Notice"
        subtitle="Specify resignation date and proposed last working day."
        icon={LogOut}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={submitting} icon={CheckCircle2} onClick={handleSubmitResignation}>
              Submit Notice
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitResignation} className="space-y-4">
          <Input
            label="Resignation Date"
            type="date"
            required
            value={form.resignation_date}
            onChange={(e) => setForm({ ...form, resignation_date: e.target.value })}
          />
          <Input
            label="Proposed Last Working Day"
            type="date"
            required
            value={form.proposed_last_working_day}
            onChange={(e) => setForm({ ...form, proposed_last_working_day: e.target.value })}
          />
          <Input
            label="Notice Period (Days)"
            type="number"
            value={form.notice_days}
            onChange={(e) => setForm({ ...form, notice_days: Number(e.target.value) })}
          />
          <Input
            label="Primary Reason"
            required
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="e.g. Higher Education, Personal Reasons, Relocation"
          />
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Comments & Handover Notes</label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-slate-200 p-3 text-[13px] text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={form.comments}
              onChange={(e) => setForm({ ...form, comments: e.target.value })}
              placeholder="Provide any additional transition context..."
            />
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      <Modal
        open={reviewModal.open}
        onClose={() => setReviewModal({ ...reviewModal, open: false })}
        title={`${reviewModal.status === 'approved' ? 'Approve' : 'Reject'} Resignation`}
        subtitle="Confirm decisions and update the notice timeline."
        icon={reviewModal.status === 'approved' ? CheckCircle2 : XCircle}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewModal({ ...reviewModal, open: false })}>Cancel</Button>
            <Button variant="primary" icon={CheckCircle2} onClick={handleReview}>Confirm Decision</Button>
          </>
        }
      >
        <div className="space-y-4">
          {reviewModal.status === 'approved' && (
            <Input
              label="Approved Last Working Day"
              type="date"
              value={reviewModal.lastDay}
              onChange={(e) => setReviewModal({ ...reviewModal, lastDay: e.target.value })}
              required
            />
          )}
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Feedback / Clarification Notes</label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-slate-200 p-3 text-[13px] text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={reviewModal.notes}
              onChange={(e) => setReviewModal({ ...reviewModal, notes: e.target.value })}
              placeholder="Optional notes for employee record..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
