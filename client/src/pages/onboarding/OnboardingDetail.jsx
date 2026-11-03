import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, LoadingBlock, Modal, SectionTitle, Select } from '../../components/ui';

const CATEGORIES = ['PERSONAL INFORMATION', 'DOCUMENT VERIFICATION', 'EMPLOYMENT FORMALITIES'];

export default function OnboardingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, can } = useAuth();
  const isEmployee = user?.role === 'employee';
  const manage = can('onboarding.manage');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('checklist'); // checklist | personal_info | documents | bank
  const [uploadModal, setUploadModal] = useState({ open: false, taskId: null, docType: 'identity_proof', title: '' });
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submittingInfo, setSubmittingInfo] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    date_of_birth: '',
    gender: 'male',
    current_address: '',
    highest_qualification: '',
    institution: '',
    course_specialization: '',
    graduation_year: 2024,
    score_percentage_cgpa: '85%',
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    branch_name: '',
  });

  const load = () => {
    setLoading(true);
    api
      .get(`/onboarding/records/${id}`)
      .then((res) => {
        setData(res);
        const r = res.record;
        const b = res.bank || {};
        const edu = res.education?.[0] || {};
        setFormData({
          first_name: r.first_name || (r.candidate_name ? r.candidate_name.split(' ')[0] : ''),
          last_name: r.last_name || (r.candidate_name ? r.candidate_name.split(' ').slice(1).join(' ') : ''),
          phone: r.phone || r.candidate_phone || '',
          date_of_birth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : '',
          gender: r.gender || 'male',
          current_address: r.address || r.candidate_location || '',
          highest_qualification: edu.highest_qualification || r.highest_qualification || 'Bachelor of Science',
          institution: edu.institution || '',
          course_specialization: edu.course_specialization || 'Computer Science',
          graduation_year: edu.graduation_year || 2024,
          score_percentage_cgpa: edu.score_percentage_cgpa || '8.5 CGPA',
          account_holder_name: b.account_holder_name || r.candidate_name || '',
          bank_name: b.bank_name || '',
          account_number: b.account_number || '',
          ifsc_code: b.ifsc_code || '',
          branch_name: b.branch_name || '',
        });
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const record = data?.record;
  const tasks = data?.tasks || [];
  const documents = data?.documents || [];

  const handleSaveInfo = async (e) => {
    e.preventDefault();
    setSubmittingInfo(true);
    try {
      await api.post(`/onboarding/records/${id}/submit-info`, {
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
      });
      toast.success('Onboarding information saved and submitted.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmittingInfo(false);
    }
  };

  const handleUploadDoc = async () => {
    if (!fileToUpload) return toast.error('Please choose a file to upload.');
    setUploading(true);
    const form = new FormData();
    form.append('file', fileToUpload);
    form.append('doc_type', uploadModal.docType);
    form.append('title', uploadModal.title || fileToUpload.name);
    if (uploadModal.taskId) form.append('task_id', uploadModal.taskId);

    try {
      const res = await fetch(`/api/onboarding/records/${id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('aurora_token')}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Upload failed');
      toast.success('Document uploaded successfully.');
      setUploadModal({ open: false, taskId: null, docType: 'identity_proof', title: '' });
      setFileToUpload(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const verifyDoc = async (docId, status, rejection_reason = '') => {
    try {
      await api.patch(`/onboarding/documents/${docId}/verify`, { status, rejection_reason });
      toast.success(`Document ${status}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!window.confirm('Mark this employee onboarding as fully completed and activate profile?')) return;
    try {
      const res = await api.post(`/onboarding/records/${id}/complete`, {});
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <LoadingBlock label="Loading onboarding details…" />;
  if (!record) return <EmptyState title="Record not found" action={<Button onClick={() => navigate('/onboarding')}>Back</Button>} />;

  const displayName = record.candidate_name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'New Hire';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/onboarding')} className="!p-2.5" />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">{displayName}</h1>
              {record.employee_code && (
                <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                  {record.employee_code}
                </span>
              )}
            </div>
            <p className="mt-1 text-[13px] text-slate-500">
              {record.designation} · {record.department_name || 'General Operations'} · Joining: {fmtDate(record.joining_date)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {manage && record.status !== 'completed' && (
            <Button
              variant="primary"
              icon={CheckCircle2}
              onClick={handleCompleteOnboarding}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Finalize & Complete Onboarding
            </Button>
          )}
          <Badge tone={record.status === 'completed' ? 'emerald' : 'sky'}>
            {record.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-[13px] font-medium text-slate-500 gap-6">
        <button
          onClick={() => setActiveTab('checklist')}
          className={`pb-3 font-semibold transition ${
            activeTab === 'checklist' ? 'border-b-2 border-brand-500 text-brand-600' : 'hover:text-slate-800'
          }`}
        >
          Compliance Checklist
        </button>
        <button
          onClick={() => setActiveTab('personal_info')}
          className={`pb-3 font-semibold transition ${
            activeTab === 'personal_info' ? 'border-b-2 border-brand-500 text-brand-600' : 'hover:text-slate-800'
          }`}
        >
          Personal & Educational Info
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 font-semibold transition ${
            activeTab === 'documents' ? 'border-b-2 border-brand-500 text-brand-600' : 'hover:text-slate-800'
          }`}
        >
          Document Vault ({documents.length})
        </button>
        {manage && (
          <button
            onClick={() => setActiveTab('bank')}
            className={`pb-3 font-semibold transition ${
              activeTab === 'bank' ? 'border-b-2 border-brand-500 text-brand-600' : 'hover:text-slate-800'
            }`}
          >
            Bank & Compensation
          </button>
        )}
      </div>

      {/* Tab 1: Checklist */}
      {activeTab === 'checklist' && (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const catTasks = tasks.filter((t) => t.category === cat);
            if (!catTasks.length) return null;
            return (
              <Card key={cat} className="p-5">
                <SectionTitle title={cat} description="Review each verification checkpoint." />
                <div className="mt-4 divide-y divide-slate-100">
                  {catTasks.map((t) => (
                    <div key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
                              t.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {t.status === 'completed' ? '✓' : '•'}
                          </span>
                          <span className="font-semibold text-ink-900 text-[13px]">{t.title}</span>
                          {t.is_mandatory && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded font-bold">
                              Mandatory
                            </span>
                          )}
                        </div>
                        {t.description && <p className="text-[12px] text-slate-400 ml-7">{t.description}</p>}
                        {t.rejection_reason && (
                          <p className="text-[11px] text-rose-500 ml-7 mt-0.5">Rejected: {t.rejection_reason}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            t.status === 'completed'
                              ? 'emerald'
                              : t.status === 'submitted'
                              ? 'indigo'
                              : t.status === 'rejected'
                              ? 'rose'
                              : 'slate'
                          }
                        >
                          {t.status.toUpperCase()}
                        </Badge>
                        {t.category === 'DOCUMENT VERIFICATION' && t.status !== 'completed' && (
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
                            Upload Proof
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tab 2: Personal & Educational Form */}
      {activeTab === 'personal_info' && (
        <Card className="p-6">
          <form onSubmit={handleSaveInfo} className="space-y-6">
            <div>
              <SectionTitle title="Personal Details" description="Verified employee identity and contact records." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  label="Phone Number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
                <Input
                  label="Date of Birth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />
                <Select
                  label="Gender"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </Select>
                <Input
                  label="Residential Address"
                  value={formData.current_address}
                  onChange={(e) => setFormData({ ...formData, current_address: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <SectionTitle title="Educational Background" description="Degrees and academic qualifications." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Highest Qualification"
                  required
                  value={formData.highest_qualification}
                  onChange={(e) => setFormData({ ...formData, highest_qualification: e.target.value })}
                />
                <Input
                  label="University / College"
                  required
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                />
                <Input
                  label="Specialization / Branch"
                  value={formData.course_specialization}
                  onChange={(e) => setFormData({ ...formData, course_specialization: e.target.value })}
                />
                <Input
                  label="Graduation Year"
                  type="number"
                  value={formData.graduation_year}
                  onChange={(e) => setFormData({ ...formData, graduation_year: e.target.value })}
                />
                <Input
                  label="Grade / CGPA / %"
                  value={formData.score_percentage_cgpa}
                  onChange={(e) => setFormData({ ...formData, score_percentage_cgpa: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button variant="primary" type="submit" loading={submittingInfo} icon={CheckCircle2}>
                Save & Submit Information
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab 3: Documents Vault */}
      {activeTab === 'documents' && (
        <Card className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <SectionTitle title="Uploaded Documents" description="Secure storage with authenticated access." />
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
              Upload New Document
            </Button>
          </div>

          {documents.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-[13px]">
              No documents uploaded yet. Click Upload New Document above.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {documents.map((doc) => (
                <div key={doc.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-ink-900 text-[13px]">{doc.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {doc.original_filename} · {doc.doc_type.replace('_', ' ')} · Uploaded {fmtDate(doc.uploaded_at)}
                    </p>
                    {doc.rejection_reason && (
                      <p className="text-[11px] text-rose-500 mt-0.5">Rejection reason: {doc.rejection_reason}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone={doc.status === 'verified' ? 'emerald' : doc.status === 'rejected' ? 'rose' : 'sky'}>
                      {doc.status.toUpperCase()}
                    </Badge>
                    <a
                      href={`/api/onboarding/documents/${doc.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                    >
                      <Download size={14} /> Download
                    </a>
                    {manage && doc.status !== 'verified' && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={CheckCircle2}
                          onClick={() => verifyDoc(doc.id, 'verified')}
                          className="text-emerald-600 hover:bg-emerald-50"
                        >
                          Verify
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={XCircle}
                          onClick={() => {
                            const reason = window.prompt('Enter rejection reason:');
                            if (reason) verifyDoc(doc.id, 'rejected', reason);
                          }}
                          className="text-rose-600 hover:bg-rose-50"
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Tab 4: Bank Details (Protected) */}
      {activeTab === 'bank' && manage && (
        <Card className="p-6">
          <SectionTitle title="Bank Account & Payroll Credentials" description="Encrypted and restricted access." />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 max-w-2xl">
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
              label="IFSC Code / Branch Code"
              value={formData.ifsc_code}
              onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value })}
            />
            <Input
              label="Branch Name"
              value={formData.branch_name}
              onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
            />
          </div>
          <div className="mt-6 flex">
            <Button variant="primary" icon={CheckCircle2} onClick={handleSaveInfo} loading={submittingInfo}>
              Save Bank Details
            </Button>
          </div>
        </Card>
      )}

      {/* Upload Modal */}
      <Modal
        open={uploadModal.open}
        onClose={() => setUploadModal({ ...uploadModal, open: false })}
        title="Upload Verification Document"
        subtitle="Accepted formats: PDF, JPG, PNG, DOC, DOCX up to 10MB."
        icon={Upload}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadModal({ ...uploadModal, open: false })}>
              Cancel
            </Button>
            <Button variant="primary" loading={uploading} icon={CheckCircle2} onClick={handleUploadDoc}>
              Upload Document
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Document Category"
            value={uploadModal.docType}
            onChange={(e) => setUploadModal({ ...uploadModal, docType: e.target.value })}
          >
            <option value="identity_proof">Identity Proof (Aadhaar / Passport / SSN)</option>
            <option value="pan_card">PAN Card / Tax ID</option>
            <option value="address_proof">Address Proof (Utility Bill / Lease)</option>
            <option value="educational_certificate">Educational Certificate</option>
            <option value="previous_employment">Previous Employment Relieving / Payslips</option>
            <option value="bank_proof">Bank Proof (Cancelled Cheque / Statement)</option>
            <option value="signed_offer_letter">Signed Offer Letter</option>
            <option value="employment_agreement">Employment Agreement</option>
            <option value="photograph">Photograph</option>
            <option value="other">Other Official Document</option>
          </Select>
          <Input
            label="Document Title"
            value={uploadModal.title}
            onChange={(e) => setUploadModal({ ...uploadModal, title: e.target.value })}
            placeholder="e.g. Passport Copy"
          />
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">Select File</label>
            <input
              type="file"
              onChange={(e) => setFileToUpload(e.target.files[0])}
              className="w-full text-[13px] text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[12px] file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

