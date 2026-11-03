import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileSignature,
  Mail,
  Printer,
  RotateCcw,
  Send,
  UserCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate, fmtMoney } from '../../lib/api';
import { OFFER_STATUS_TONE, fmtDateTime, pretty } from '../../lib/recruitment';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  SectionTitle,
  Select,
} from '../../components/ui';

export default function RecruitmentOfferDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const manage = can('recruitment.offers.manage');
  const hire = can('recruitment.hire');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ name: '', email: '' });
  const [initOnboardingOpen, setInitOnboardingOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [onboardingForm, setOnboardingForm] = useState({ template_id: '', work_location: 'Headquarters' });
  const [initiating, setInitiating] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get(`/recruitment/offers/${id}`)
      .then((res) => {
        setData(res);
        if (res.offer) {
          setEmailForm({
            name: res.offer.candidate_name || '',
            email: res.offer.candidate_email || '',
          });
        }
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (can('departments.view')) {
      api.get('/departments').then((r) => setDepartments(r.departments || [])).catch(() => {});
    }
    if (can('onboarding.manage')) {
      api.get('/onboarding/templates').then((r) => setTemplates(r.templates || [])).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const offer = data?.offer;
  const application = data?.application;

  const handleDownloadPdf = async () => {
    try {
      const res = await fetch(`/api/recruitment/offers/${id}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('aurora_token')}` },
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${offer.offer_number || 'Offer_Letter'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Offer letter PDF downloaded.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSendEmail = async () => {
    if (!emailForm.email) return toast.error('Candidate email is required.');
    setSendingEmail(true);
    try {
      const res = await api.post(`/recruitment/offers/${id}/send-email`, emailForm);
      toast.success(res.message || 'Offer email dispatched successfully!');
      setEmailModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const action = async (act, label) => {
    if (act === 'reject' && !window.confirm('Mark this offer as rejected? The application will be closed.')) return;
    try {
      await api.patch(`/recruitment/offers/${id}/status`, { action: act });
      toast.success(label);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleInitiateOnboarding = async () => {
    setInitiating(true);
    try {
      const res = await api.post('/onboarding/initiate', {
        candidate_id: offer.candidate_id,
        application_id: offer.application_id,
        offer_id: offer.id,
        joining_date: offer.joining_date,
        designation: offer.job_title,
        department_id: offer.department_id,
        employment_type: offer.employment_type,
        work_location: onboardingForm.work_location || 'Headquarters',
        template_id: onboardingForm.template_id || (templates[0]?.id || null),
      });
      toast.success(res.message);
      setInitOnboardingOpen(false);
      navigate(`/onboarding/records/${res.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setInitiating(false);
    }
  };

  const timeline = useMemo(() => {
    if (!offer) return [];
    return [
      { label: 'Offer created', at: offer.created_at, done: true },
      { label: 'Offer sent', at: offer.sent_at, done: Boolean(offer.sent_at) },
      {
        label: offer.status === 'accepted' ? 'Offer accepted' : offer.status === 'rejected' ? 'Offer declined' : 'Awaiting response',
        at: offer.responded_at,
        done: ['accepted', 'rejected'].includes(offer.status),
      },
      { label: 'Employee conversion', at: application?.converted_at, done: Boolean(application?.converted_employee_id) },
    ];
  }, [offer, application]);

  if (loading) return <LoadingBlock label="Loading offer letter…" />;
  if (!offer) return <EmptyState icon={FileSignature} title="Offer not found" action={<Button onClick={() => navigate('/recruitment/offers')}>Back to offers</Button>} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/recruitment/offers')} className="!p-2.5" />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">{offer.offer_number}</h1>
              <span className="text-[12px] text-slate-400">·</span>
              <span className="text-[13px] font-semibold text-slate-700">{offer.candidate_name}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={OFFER_STATUS_TONE[offer.status]}>{pretty(offer.status)}</Badge>
              <span className="text-[12px] text-slate-500">{offer.job_title}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Download} onClick={handleDownloadPdf}>Download PDF</Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>

          {manage && (
            <Button
              variant="primary"
              icon={Mail}
              onClick={() => setEmailModalOpen(true)}
            >
              {offer.status === 'draft' ? 'Send offer email' : 'Resend offer email'}
            </Button>
          )}

          {manage && offer.status === 'sent' && (
            <>
              <Button variant="primary" icon={CheckCircle2} onClick={() => action('accept', 'Offer accepted.')}>Record acceptance</Button>
              <Button variant="secondary" icon={XCircle} onClick={() => action('reject', 'Offer rejected.')}>Record rejection</Button>
            </>
          )}

          {offer.status === 'accepted' && can('onboarding.manage') && (
            <Button
              variant="primary"
              icon={UserPlus}
              onClick={() => setInitOnboardingOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Initiate onboarding
            </Button>
          )}

          {manage && ['draft', 'sent'].includes(offer.status) && (
            <Button variant="secondary" icon={Ban} onClick={() => action('withdraw', 'Offer withdrawn.')}>Withdraw</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden">
          <div className="print-area bg-white px-8 py-8 sm:px-12 sm:py-10">
            <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
              <div>
                <p className="font-display text-2xl font-extrabold tracking-tight text-ink-900">Aurora Labs</p>
                <p className="mt-1 text-[12px] text-slate-500">People, beautifully managed</p>
              </div>
              <div className="text-right text-[12px] text-slate-500">
                <p className="font-semibold text-ink-800">Offer letter</p>
                <p>{offer.offer_number}</p>
                <p>{fmtDate(offer.created_at)}</p>
              </div>
            </div>

            <div className="mt-7 text-[13px] leading-relaxed text-slate-600">
              <p>Dear <span className="font-semibold text-ink-900">{offer.candidate_name}</span>,</p>
              <p className="mt-3">
                We are delighted to offer you the position of <span className="font-semibold text-ink-900">{offer.job_title}</span>
                {offer.department_name ? ` in the ${offer.department_name} team` : ''} at Aurora Labs. We were impressed by your experience and believe you will make a valuable contribution.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ['Annual salary', fmtMoney(offer.annual_salary)],
                ['Employment type', pretty(offer.employment_type)],
                ['Joining date', fmtDate(offer.joining_date)],
                ['Probation period', `${offer.probation_months} month${Number(offer.probation_months) === 1 ? '' : 's'}`],
                ['Offer valid until', offer.expiry_date ? fmtDate(offer.expiry_date) : 'Not specified'],
                ['Work location', offer.candidate_address || 'Headquarters / Hybrid'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 text-[13px] font-semibold text-ink-900">{value}</p>
                </div>
              ))}
            </div>

            {offer.salary_structure && (
              <div className="mt-6">
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Salary structure</p>
                <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">{offer.salary_structure}</p>
              </div>
            )}

            {offer.terms && (
              <div className="mt-6">
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Terms & conditions</p>
                <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">{offer.terms}</p>
              </div>
            )}

            <div className="mt-8 border-t border-slate-200 pt-5 text-[12.5px] leading-relaxed text-slate-600">
              <p>We look forward to welcoming you to the team.</p>
              <p className="mt-4 font-semibold text-ink-900">Aurora Labs — People Operations Team</p>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle title="Offer timeline" />
            <div className="mt-4 space-y-4">
              {timeline.map((step) => (
                <div key={step.label} className="flex items-start gap-3">
                  <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${step.done ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {step.done ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
                  </div>
                  <div>
                    <p className={`text-[12.5px] font-semibold ${step.done ? 'text-ink-800' : 'text-slate-400'}`}>{step.label}</p>
                    <p className="text-[10.5px] text-slate-400">{step.at ? fmtDateTime(step.at) : 'Pending'}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Email Delivery Status" description="Audit log of dispatched offer emails." />
            <div className="mt-3 space-y-2">
              {data?.deliveries?.length ? (
                data.deliveries.map((del) => (
                  <div key={del.id} className="rounded-xl border border-slate-100 p-3 bg-slate-50/50">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-ink-900">{del.recipient_email}</span>
                      <Badge tone={del.delivery_status === 'sent' ? 'emerald' : 'rose'}>{del.delivery_status.toUpperCase()}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{del.email_subject}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{fmtDateTime(del.sent_at)}</p>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-slate-400">No emails sent yet for this offer.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Candidate & application" />
            <div className="mt-4 space-y-3 text-[12.5px]">
              <div className="flex items-center gap-2 text-slate-600"><UserCheck size={14} className="text-slate-400" />{offer.candidate_name} ({offer.candidate_email})</div>
              <div className="flex items-center gap-2 text-slate-600"><FileSignature size={14} className="text-slate-400" />{offer.job_code} · {offer.job_title}</div>
              <div className="flex items-center gap-2 text-slate-600"><Building2 size={14} className="text-slate-400" />{offer.department_name || 'Unassigned'}</div>
              <div className="flex items-center gap-2 text-slate-600"><CalendarDays size={14} className="text-slate-400" />Application stage: {pretty(application?.stage)}</div>
            </div>
          </Card>

          {data.history?.length > 1 && (
            <Card className="p-5">
              <SectionTitle title="Offer history" description="Previous offers for this application." />
              <div className="mt-3 space-y-2">
                {data.history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => navigate(`/recruitment/offers/${h.id}`)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition hover:border-brand-200 ${h.id === offer.id ? 'border-brand-200 bg-brand-50/50' : 'border-slate-100'}`}
                  >
                    <div>
                      <p className="text-[12px] font-semibold text-ink-800">{h.offer_number}</p>
                      <p className="text-[10.5px] text-slate-400">{fmtMoney(h.annual_salary)} · {fmtDate(h.created_at)}</p>
                    </div>
                    <Badge tone={OFFER_STATUS_TONE[h.status]}>{pretty(h.status)}</Badge>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Send Email Modal */}
      <Modal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        title="Send Offer Letter by Email"
        subtitle="Generates the latest dynamic PDF and sends it directly to the candidate."
        icon={Mail}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmailModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={sendingEmail} icon={Send} onClick={handleSendEmail}>Send Offer Now</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Candidate Name"
            value={emailForm.name}
            onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
            required
          />
          <Input
            label="Recipient Email"
            type="email"
            value={emailForm.email}
            onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
            required
          />
          <div className="rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600">
            <p className="font-semibold text-ink-900">Attachment: {offer.offer_number}.pdf</p>
            <p className="mt-0.5">The PDF will be compiled fresh with the latest candidate name, position, salary, and joining date.</p>
          </div>
        </div>
      </Modal>

      {/* Initiate Onboarding Modal */}
      <Modal
        open={initOnboardingOpen}
        onClose={() => setInitOnboardingOpen(false)}
        title="Initiate Employee Onboarding"
        subtitle="Launches the onboarding workflow and prepares compliance checklist."
        icon={UserPlus}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInitOnboardingOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={initiating} icon={CheckCircle2} onClick={handleInitiateOnboarding}>Start Onboarding</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
            <p className="font-semibold text-ink-900 text-[13px]">{offer.candidate_name}</p>
            <p className="text-[12px] text-slate-500">{offer.job_title} · {offer.department_name}</p>
            <p className="text-[12px] text-slate-500">Joining Date: {fmtDate(offer.joining_date)}</p>
          </div>

          <Select
            label="Select Onboarding Template"
            value={onboardingForm.template_id}
            onChange={(e) => setOnboardingForm({ ...onboardingForm, template_id: e.target.value })}
            required
          >
            <option value="">Default (Full-Time Employee Template)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({pretty(t.type)})</option>
            ))}
          </Select>

          <Input
            label="Work Location"
            value={onboardingForm.work_location}
            onChange={(e) => setOnboardingForm({ ...onboardingForm, work_location: e.target.value })}
            required
          />
        </div>
      </Modal>
    </div>
  );
}
