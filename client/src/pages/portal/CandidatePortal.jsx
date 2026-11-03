import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileSignature,
  FileText,
  Lock,
  Mail,
  ShieldAlert,
  Sparkles,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input, LoadingBlock, Modal, SectionTitle, Select } from '../../components/ui';

export default function CandidatePortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('offer'); // 'offer' | 'onboarding' | 'documents'

  const [responding, setResponding] = useState(false);
  const [declineModal, setDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Onboarding submission form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    date_of_birth: '',
    gender: 'other',
    current_address: '',
    highest_qualification: '',
    institution: '',
    course_specialization: '',
    graduation_year: 2024,
    score_percentage_cgpa: '8.5 CGPA',
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    branch_name: '',
  });

  const [submittingInfo, setSubmittingInfo] = useState(false);
  const [uploadModal, setUploadModal] = useState({ open: false, taskId: null, docType: 'identity_proof', title: '' });
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading, setUploading] = useState(false);

  const loadSession = async () => {
    if (!token) {
      setError('No candidate authorization token provided in the URL.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/portal/candidate/session?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Access denied');

      setData(json);
      const c = json.candidate;
      const o = json.offer;

      // Auto switch to onboarding tab if offer already accepted
      if (o?.status === 'accepted' && json.onboarding) {
        setActiveTab('onboarding');
      }

      setFormData((prev) => ({
        ...prev,
        first_name: c?.full_name?.split(' ')[0] || '',
        last_name: c?.full_name?.split(' ').slice(1).join(' ') || '',
        phone: c?.phone || '',
        current_address: c?.location || '',
        account_holder_name: c?.full_name || '',
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDownloadPdf = async () => {
    try {
      const res = await fetch(`/api/portal/candidate/offer/pdf?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error('Failed to download PDF.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data?.offer?.offer_number || 'Offer_Letter'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRespondOffer = async (action, notes = '') => {
    setResponding(true);
    try {
      const res = await fetch(`/api/portal/candidate/offer/respond?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, response_notes: notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Response submission failed');

      alert(json.message);
      setDeclineModal(false);
      await loadSession();
    } catch (err) {
      alert(err.message);
    } finally {
      setResponding(false);
    }
  };

  const handleSubmitOnboardingInfo = async (e) => {
    e.preventDefault();
    setSubmittingInfo(true);
    try {
      const res = await fetch(`/api/portal/candidate/onboarding/submit-info?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          date_of_birth: formData.date_of_birth,
          gender: formData.gender,
          current_address: formData.current_address,
          education: [
            {
              highest_qualification: formData.highest_qualification,
              institution: formData.institution,
              course_specialization: formData.course_specialization,
              graduation_year: formData.graduation_year,
              score_percentage_cgpa: formData.score_percentage_cgpa,
            },
          ],
          bank: {
            account_holder_name: formData.account_holder_name,
            bank_name: formData.bank_name,
            account_number: formData.account_number,
            ifsc_code: formData.ifsc_code,
            branch_name: formData.branch_name,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Submission failed');
      alert('Onboarding information saved successfully.');
      await loadSession();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingInfo(false);
    }
  };

  const handleUploadDocument = async () => {
    if (!fileToUpload) return alert('Please choose a file to upload.');
    setUploading(true);
    const form = new FormData();
    form.append('file', fileToUpload);
    form.append('doc_type', uploadModal.docType);
    form.append('title', uploadModal.title || fileToUpload.name);
    if (uploadModal.taskId) form.append('task_id', uploadModal.taskId);

    try {
      const res = await fetch(`/api/portal/candidate/onboarding/documents?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Upload failed');

      alert('Document uploaded successfully.');
      setUploadModal({ open: false, taskId: null, docType: 'identity_proof', title: '' });
      setFileToUpload(null);
      await loadSession();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <LoadingBlock label="Verifying secure candidate authorization token…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 text-rose-500 grid place-items-center mb-4">
            <Lock size={24} />
          </div>
          <h2 className="font-display text-lg font-bold text-ink-900">Access Restricted</h2>
          <p className="mt-2 text-[13px] text-slate-500">{error || 'Invalid invitation credentials.'}</p>
        </Card>
      </div>
    );
  }

  const { candidate, offer, onboarding, tasks = [], documents = [] } = data;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between">
      {/* Top Brand Bar */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-20 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-brand-500 grid place-items-center font-black text-white text-lg">A</div>
            <div>
              <p className="font-display font-bold text-[15px] leading-tight text-white">Aurora Labs</p>
              <p className="text-[11px] text-slate-400">Candidate Experience Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Signed in as <span className="font-semibold text-white">{candidate?.full_name}</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl w-full mx-auto px-4 py-8 flex-1 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex gap-4 border-b border-white/10 pb-2 text-[13px] font-semibold">
          <button
            onClick={() => setActiveTab('offer')}
            className={`pb-2 transition ${
              activeTab === 'offer' ? 'text-brand-400 border-b-2 border-brand-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Employment Offer
          </button>
          {onboarding && (
            <>
              <button
                onClick={() => setActiveTab('onboarding')}
                className={`pb-2 transition ${
                  activeTab === 'onboarding'
                    ? 'text-brand-400 border-b-2 border-brand-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Onboarding Information
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`pb-2 transition ${
                  activeTab === 'documents'
                    ? 'text-brand-400 border-b-2 border-brand-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Document Uploads ({documents.length})
              </button>
            </>
          )}
        </div>

        {/* Tab 1: Offer Review & Acceptance */}
        {activeTab === 'offer' && offer && (
          <div className="space-y-6">
            <div className="bg-slate-800/80 border border-white/10 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-400">Official Letter of Offer</span>
                <h1 className="font-display text-2xl font-extrabold text-white mt-1">{offer.job_title}</h1>
                <p className="text-[13px] text-slate-400 mt-0.5">
                  Reference: {offer.offer_number} · Joining Date: {String(offer.joining_date).slice(0, 10)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="secondary" icon={Download} onClick={handleDownloadPdf}>
                  Download Official PDF
                </Button>

                {['draft', 'sent'].includes(offer.status) && (
                  <>
                    <Button
                      variant="primary"
                      icon={CheckCircle2}
                      loading={responding}
                      onClick={() => handleRespondOffer('accept')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Accept Offer
                    </Button>
                    <Button
                      variant="secondary"
                      icon={XCircle}
                      onClick={() => setDeclineModal(true)}
                      className="text-rose-400 hover:bg-rose-500/10"
                    >
                      Decline Offer
                    </Button>
                  </>
                )}

                {offer.status === 'accepted' && (
                  <Badge tone="emerald" className="px-3 py-1 text-[13px]">
                    Offer Accepted ✓
                  </Badge>
                )}

                {offer.status === 'rejected' && (
                  <Badge tone="rose" className="px-3 py-1 text-[13px]">
                    Offer Declined
                  </Badge>
                )}
              </div>
            </div>

            {/* Offer Preview Card */}
            <Card className="overflow-hidden bg-white text-slate-800 p-8 sm:p-12">
              <div className="flex items-start justify-between border-b border-slate-200 pb-6">
                <div>
                  <p className="font-display text-2xl font-black text-slate-900 tracking-tight">Aurora Labs</p>
                  <p className="text-[12px] text-slate-500">People, beautifully managed</p>
                </div>
                <div className="text-right text-[12px] text-slate-500">
                  <p className="font-bold text-slate-900">Offer Letter</p>
                  <p>{offer.offer_number}</p>
                </div>
              </div>

              <div className="mt-6 text-[13.5px] leading-relaxed text-slate-700 space-y-3">
                <p>Dear <strong>{candidate.full_name}</strong>,</p>
                <p>
                  We are pleased to offer you the position of <strong>{offer.job_title}</strong> at Aurora Labs.
                  We were very impressed by your background, experience, and the discussions during your interview process.
                </p>
              </div>

              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10.5px] font-bold uppercase text-slate-400">Annual CTC / Salary</p>
                  <p className="font-bold text-slate-900 text-[15px] mt-0.5">${Number(offer.annual_salary).toLocaleString()}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10.5px] font-bold uppercase text-slate-400">Joining Date</p>
                  <p className="font-bold text-slate-900 text-[15px] mt-0.5">{String(offer.joining_date).slice(0, 10)}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10.5px] font-bold uppercase text-slate-400">Employment Type</p>
                  <p className="font-bold text-slate-900 text-[15px] mt-0.5">{String(offer.employment_type).toUpperCase()}</p>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10.5px] font-bold uppercase text-slate-400">Probation Period</p>
                  <p className="font-bold text-slate-900 text-[15px] mt-0.5">{offer.probation_months || 3} Months</p>
                </div>
              </div>

              {offer.terms && (
                <div className="mt-6">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Terms & Conditions</p>
                  <p className="mt-1 text-[12.5px] whitespace-pre-line text-slate-600 leading-relaxed">{offer.terms}</p>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Tab 2: Candidate Onboarding Details */}
        {activeTab === 'onboarding' && onboarding && (
          <Card className="p-6 bg-slate-800 text-white border-white/10">
            <h2 className="font-display text-lg font-bold">Candidate Onboarding Information</h2>
            <p className="text-[12px] text-slate-400 mb-6">
              Please enter your personal, educational, and bank credentials to complete your employee record.
            </p>

            <form onSubmit={handleSubmitOnboardingInfo} className="space-y-6">
              <div>
                <SectionTitle title="Personal Details" description="Used for your employee profile" />
                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <Input
                    label="First Name"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                  <Input
                    label="Last Name"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                  <Input
                    label="Phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  <Input
                    label="Date of Birth"
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                  />
                  <Input
                    label="Residential Address"
                    value={formData.current_address}
                    onChange={(e) => setFormData({ ...formData, current_address: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <SectionTitle title="Educational Qualifications" description="Degree and university information" />
                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <Input
                    label="Highest Qualification"
                    placeholder="e.g. B.Tech Computer Science"
                    value={formData.highest_qualification}
                    onChange={(e) => setFormData({ ...formData, highest_qualification: e.target.value })}
                  />
                  <Input
                    label="College / University"
                    placeholder="e.g. State University"
                    value={formData.institution}
                    onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                  />
                  <Input
                    label="Graduation Year"
                    type="number"
                    value={formData.graduation_year}
                    onChange={(e) => setFormData({ ...formData, graduation_year: e.target.value })}
                  />
                  <Input
                    label="Score / CGPA"
                    value={formData.score_percentage_cgpa}
                    onChange={(e) => setFormData({ ...formData, score_percentage_cgpa: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <SectionTitle title="Bank Account Details" description="Used exclusively for direct payroll deposits" />
                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <Input
                    label="Account Holder Name"
                    value={formData.account_holder_name}
                    onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
                  />
                  <Input
                    label="Bank Name"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  />
                  <Input
                    label="Account Number"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  />
                  <Input
                    label="IFSC / Routing Code"
                    value={formData.ifsc_code}
                    onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-white/10">
                <Button variant="primary" type="submit" loading={submittingInfo} icon={CheckCircle2}>
                  Save Onboarding Details
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Tab 3: Document Vault & Uploads */}
        {activeTab === 'documents' && onboarding && (
          <Card className="p-6 bg-slate-800 text-white border-white/10">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <h2 className="font-display text-lg font-bold">Required Documents</h2>
                <p className="text-[12px] text-slate-400">Upload identity, education, and signed documents.</p>
              </div>
              <Button
                variant="primary"
                icon={Upload}
                size="sm"
                onClick={() =>
                  setUploadModal({
                    open: true,
                    taskId: null,
                    docType: 'identity_proof',
                    title: 'New Document Upload',
                  })
                }
              >
                Upload Document
              </Button>
            </div>

            {/* Checklist Tasks */}
            <div className="mt-6 space-y-3">
              <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Assigned Tasks</p>
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-slate-900/40 text-[13px]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-5 w-5 rounded-full grid place-items-center text-[10px] ${
                        t.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {t.status === 'completed' ? '✓' : '•'}
                    </span>
                    <div>
                      <p className="font-semibold text-white">{t.title}</p>
                      <p className="text-[11px] text-slate-400">{t.category}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone={t.status === 'completed' ? 'emerald' : t.status === 'submitted' ? 'indigo' : 'slate'}>
                      {t.status.toUpperCase()}
                    </Badge>
                    {t.status !== 'completed' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Upload}
                        onClick={() =>
                          setUploadModal({
                            open: true,
                            taskId: t.id,
                            docType: 'identity_proof',
                            title: t.title,
                          })
                        }
                      >
                        Upload
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Uploaded Documents List */}
            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Your Uploaded Files</p>
              {documents.length === 0 ? (
                <p className="text-[12px] text-slate-500">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-white/5 text-[12px]"
                    >
                      <div>
                        <p className="font-semibold text-white">{d.title}</p>
                        <p className="text-slate-400 text-[11px]">{d.original_filename}</p>
                      </div>
                      <Badge tone={d.status === 'verified' ? 'emerald' : 'sky'}>{d.status.toUpperCase()}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
      </main>

      {/* Decline Offer Modal */}
      <Modal
        open={declineModal}
        onClose={() => setDeclineModal(false)}
        title="Decline Employment Offer"
        subtitle="Please let us know your reason for declining."
        icon={XCircle}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclineModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={responding}
              onClick={() => handleRespondOffer('decline', declineReason)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Confirm Decline
            </Button>
          </>
        }
      >
        <div>
          <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Reason for declining</label>
          <textarea
            rows={3}
            className="w-full rounded-xl border border-slate-200 p-3 text-[13px] text-slate-800 placeholder-slate-400"
            placeholder="e.g. Accepted another offer, relocation issues..."
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* Upload Document Modal */}
      <Modal
        open={uploadModal.open}
        onClose={() => setUploadModal({ ...uploadModal, open: false })}
        title="Upload Verification Document"
        subtitle="PDF, JPG, PNG up to 10MB."
        icon={Upload}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadModal({ ...uploadModal, open: false })}>Cancel</Button>
            <Button variant="primary" loading={uploading} icon={CheckCircle2} onClick={handleUploadDocument}>
              Upload File
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Document Title"
            value={uploadModal.title}
            onChange={(e) => setUploadModal({ ...uploadModal, title: e.target.value })}
          />
          <Select
            label="Document Category"
            value={uploadModal.docType}
            onChange={(e) => setUploadModal({ ...uploadModal, docType: e.target.value })}
          >
            <option value="identity_proof">Identity Proof (Aadhaar / Passport)</option>
            <option value="pan_card">PAN Card / Tax ID</option>
            <option value="educational_certificate">Educational Certificate</option>
            <option value="previous_employment">Relieving Letter / Payslips</option>
            <option value="bank_proof">Bank Proof</option>
            <option value="other">Other Document</option>
          </Select>
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Select File</label>
            <input
              type="file"
              onChange={(e) => setFileToUpload(e.target.files[0])}
              className="w-full text-[13px] text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[12px] file:font-semibold file:bg-brand-50 file:text-brand-700"
            />
          </div>
        </div>
      </Modal>

      <footer className="border-t border-white/10 py-6 text-center text-[12px] text-slate-500">
        Aurora Labs &copy; 2026. Secure Candidate Onboarding Gateway.
      </footer>
    </div>
  );
}

