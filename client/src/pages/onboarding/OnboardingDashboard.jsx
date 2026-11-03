import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck,
  FileText,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, fmtDate } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, LoadingBlock, SectionTitle, Select } from '../../components/ui';

const STATUS_TONES = {
  pending: 'amber',
  in_progress: 'sky',
  submitted: 'indigo',
  under_review: 'violet',
  completed: 'emerald',
  rejected: 'rose',
};

export default function OnboardingDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, can } = useAuth();
  const isEmployee = user?.role === 'employee';
  const manage = can('onboarding.manage');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ metrics: {}, recent: [] });
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      if (!isEmployee) {
        const dash = await api.get('/onboarding/dashboard');
        setData(dash);
      }
      const rec = await api.get('/onboarding/records');
      setRecords(rec.records || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = records.filter((r) => {
    const matchSearch =
      !search ||
      (r.candidate_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.designation || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) return <LoadingBlock label="Loading onboarding information…" />;

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
            {isEmployee ? 'My Onboarding Workspace' : 'Employee Onboarding'}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {isEmployee
              ? 'Complete your profile, upload required credentials, and monitor your verification status.'
              : 'Streamlined candidate-to-employee onboarding, compliance checklists, and verified documents.'}
          </p>
        </div>
        {manage && (
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" icon={FileText} onClick={() => navigate('/onboarding/templates')}>
              Manage Templates
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => navigate('/recruitment/offers')}>
              Onboard Candidate
            </Button>
          </div>
        )}
      </div>

      {/* Overview Metric Cards (HR / Super Admin / CEO) */}
      {!isEmployee && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <Users size={22} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-slate-500">Total In Onboarding</p>
              <p className="font-display text-2xl font-bold text-ink-900">{data.metrics?.total || 0}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              <Clock size={22} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-slate-500">Pending & In-Progress</p>
              <p className="font-display text-2xl font-bold text-ink-900">
                {(data.metrics?.pending || 0) + (data.metrics?.inProgress || 0)}
              </p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
              <FileCheck size={22} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-slate-500">Under Review / Verification</p>
              <p className="font-display text-2xl font-bold text-ink-900">
                {(data.metrics?.submitted || 0) + (data.metrics?.underReview || 0)}
              </p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-slate-500">Fully Completed</p>
              <p className="font-display text-2xl font-bold text-ink-900">{data.metrics?.completed || 0}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Records Table Card */}
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            title={isEmployee ? 'My Onboarding Status' : 'Onboarding Pipeline'}
            description={
              isEmployee
                ? 'Click on your onboarding record to review tasks and upload verification proofs.'
                : 'Manage candidates and new team members completing setup.'
            }
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-56">
              <Input
                placeholder="Search candidates/role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={Search}
              />
            </div>
            <div className="w-40">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under Review</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No onboarding records found"
            description={
              isEmployee
                ? 'You do not have an active onboarding process assigned at this time.'
                : 'Initiate onboarding directly from accepted candidate offers.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Member / Candidate</th>
                  <th className="px-5 py-3">Designation & Department</th>
                  <th className="px-5 py-3">Joining Date</th>
                  <th className="px-5 py-3">Template</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const displayName = r.candidate_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'New Hire';
                  const displayEmail = r.candidate_email || r.employee_email;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/onboarding/records/${r.id}`)}
                      className="cursor-pointer hover:bg-slate-50/60 transition"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-ink-900">{displayName}</div>
                        <div className="text-[11.5px] text-slate-400">{displayEmail}</div>
                        {r.employee_code && (
                          <span className="inline-block mt-0.5 text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                            {r.employee_code}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800">{r.designation}</div>
                        <div className="text-[11.5px] text-slate-400">{r.department_name || 'General Operations'}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{fmtDate(r.joining_date)}</td>
                      <td className="px-5 py-3.5 text-slate-600">{r.template_name || 'Standard Full-Time'}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone={STATUS_TONES[r.status] || 'slate'}>
                          {(r.status || 'pending').replace('_', ' ').toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={ChevronRight}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/onboarding/records/${r.id}`);
                          }}
                        >
                          View Checklist
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
