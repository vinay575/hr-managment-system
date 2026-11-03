import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout, { Logo } from './components/Layout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employees = lazy(() => import('./pages/Employees'));
const Departments = lazy(() => import('./pages/Departments'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Leaves = lazy(() => import('./pages/Leaves'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Reports = lazy(() => import('./pages/Reports'));
const AccessControl = lazy(() => import('./pages/AccessControl'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Settings = lazy(() => import('./pages/Settings'));
const RecruitmentDashboard = lazy(() => import('./pages/recruitment/RecruitmentDashboard'));
const RecruitmentJobs = lazy(() => import('./pages/recruitment/RecruitmentJobs'));
const RecruitmentJobDetail = lazy(() => import('./pages/recruitment/RecruitmentJobDetail'));
const RecruitmentCandidates = lazy(() => import('./pages/recruitment/RecruitmentCandidates'));
const RecruitmentCandidateDetail = lazy(() => import('./pages/recruitment/RecruitmentCandidateDetail'));
const RecruitmentPipeline = lazy(() => import('./pages/recruitment/RecruitmentPipeline'));
const RecruitmentInterviews = lazy(() => import('./pages/recruitment/RecruitmentInterviews'));
const RecruitmentOffers = lazy(() => import('./pages/recruitment/RecruitmentOffers'));
const RecruitmentOfferDetail = lazy(() => import('./pages/recruitment/RecruitmentOfferDetail'));
const RecruitmentReports = lazy(() => import('./pages/recruitment/RecruitmentReports'));
const OnboardingDashboard = lazy(() => import('./pages/onboarding/OnboardingDashboard'));
const OnboardingDetail = lazy(() => import('./pages/onboarding/OnboardingDetail'));
const OnboardingTemplates = lazy(() => import('./pages/onboarding/OnboardingTemplates'));
const Resignations = lazy(() => import('./pages/offboarding/Resignations'));
const NoticePeriods = lazy(() => import('./pages/offboarding/NoticePeriods'));
const ExitDocuments = lazy(() => import('./pages/offboarding/ExitDocuments'));
const CandidatePortal = lazy(() => import('./pages/portal/CandidatePortal'));
const ExpenseDashboard = lazy(() => import('./pages/expenses/ExpenseDashboard'));
const MyExpenses = lazy(() => import('./pages/expenses/MyExpenses'));
const ExpenseClaims = lazy(() => import('./pages/expenses/ExpenseClaims'));
const ExpenseApprovals = lazy(() => import('./pages/expenses/ExpenseApprovals'));
const Reimbursements = lazy(() => import('./pages/expenses/Reimbursements'));
const ExpenseCategories = lazy(() => import('./pages/expenses/ExpenseCategories'));
const ExpenseReports = lazy(() => import('./pages/expenses/ExpenseReports'));
const ExpenseSettings = lazy(() => import('./pages/expenses/ExpenseSettings'));
const PerformanceDashboard = lazy(() => import('./pages/performance/PerformanceDashboard'));
const Goals = lazy(() => import('./pages/performance/Goals'));
const GoalProgress = lazy(() => import('./pages/performance/GoalProgress'));
const ReviewCycles = lazy(() => import('./pages/performance/ReviewCycles'));
const ReviewHistory = lazy(() => import('./pages/performance/ReviewHistory'));
const PerformanceReports = lazy(() => import('./pages/performance/PerformanceReports'));
const Notifications = lazy(() => import('./pages/Notifications'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);
  return null;
}

function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink-900">
      <Logo />
      <div className="flex items-center gap-2 text-[12px] text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-brand-400" />
        Preparing your workspace…
      </div>
    </div>
  );
}

function Protected({ permission, children }) {
  const { user, booting, can } = useAuth();
  if (booting) return <BootScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  return children || <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ScrollToTop />
          <Suspense fallback={<BootScreen />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/portal/candidate" element={<CandidatePortal />} />
              <Route element={<Protected />}>
                <Route element={<Layout />}>
                <Route index element={<Protected permission="dashboard.view"><Dashboard /></Protected>} />
                <Route path="attendance" element={<Protected permission={['attendance.view_all', 'attendance.self']}><Attendance /></Protected>} />
                <Route path="leaves" element={<Protected permission={['leaves.view_all', 'leaves.self']}><Leaves /></Protected>} />
                <Route path="payroll" element={<Protected permission={['payroll.view_all', 'payroll.self']}><Payroll /></Protected>} />
                <Route path="employees" element={<Protected permission="employees.view"><Employees /></Protected>} />
                <Route path="departments" element={<Protected permission="departments.view"><Departments /></Protected>} />
                <Route path="reports" element={<Protected permission="reports.view"><Reports /></Protected>} />
                <Route path="access" element={<Protected permission="roles.manage"><AccessControl /></Protected>} />
                <Route path="audit" element={<Protected permission="audit.view"><AuditLog /></Protected>} />
                <Route path="settings" element={<Protected permission="settings.self"><Settings /></Protected>} />
                <Route path="notifications" element={<Protected permission="dashboard.view"><Notifications /></Protected>} />

                <Route path="recruitment" element={<Protected permission="recruitment.view"><RecruitmentDashboard /></Protected>} />
                <Route path="recruitment/jobs" element={<Protected permission="recruitment.jobs.view"><RecruitmentJobs /></Protected>} />
                <Route path="recruitment/jobs/:id" element={<Protected permission="recruitment.jobs.view"><RecruitmentJobDetail /></Protected>} />
                <Route path="recruitment/candidates" element={<Protected permission="recruitment.candidates.view"><RecruitmentCandidates /></Protected>} />
                <Route path="recruitment/candidates/:id" element={<Protected permission="recruitment.candidates.view"><RecruitmentCandidateDetail /></Protected>} />
                <Route path="recruitment/pipeline" element={<Protected permission="recruitment.candidates.view"><RecruitmentPipeline /></Protected>} />
                <Route path="recruitment/applications" element={<Protected permission="recruitment.candidates.view"><RecruitmentPipeline /></Protected>} />
                <Route path="recruitment/interviews" element={<Protected permission="recruitment.interviews.view"><RecruitmentInterviews /></Protected>} />
                <Route path="recruitment/offers" element={<Protected permission="recruitment.offers.view"><RecruitmentOffers /></Protected>} />
                <Route path="recruitment/offers/:id" element={<Protected permission="recruitment.offers.view"><RecruitmentOfferDetail /></Protected>} />
                <Route path="recruitment/reports" element={<Protected permission="recruitment.reports.view"><RecruitmentReports /></Protected>} />

                {/* Phase 3: Onboarding Routes */}
                <Route path="onboarding" element={<Protected permission={['onboarding.view', 'onboarding.manage', 'onboarding.self']}><OnboardingDashboard /></Protected>} />
                <Route path="onboarding/records/:id" element={<Protected permission={['onboarding.view', 'onboarding.manage', 'onboarding.self']}><OnboardingDetail /></Protected>} />
                <Route path="onboarding/templates" element={<Protected permission="onboarding.manage"><OnboardingTemplates /></Protected>} />

                {/* Phase 3: Offboarding Routes */}
                <Route path="offboarding/resignations" element={<Protected permission={['offboarding.view', 'offboarding.manage', 'offboarding.self']}><Resignations /></Protected>} />
                <Route path="offboarding/notice-periods" element={<Protected permission={['offboarding.view', 'offboarding.manage', 'offboarding.self']}><NoticePeriods /></Protected>} />
                <Route path="offboarding/exit-documents" element={<Protected permission={['offboarding.view', 'offboarding.manage', 'offboarding.self']}><ExitDocuments /></Protected>} />

                {/* Phase 4: Expense Management */}
                <Route path="expenses" element={<Protected permission={['expenses.dashboard', 'expenses.self']}><ExpenseDashboard /></Protected>} />
                <Route path="expenses/my" element={<Protected permission="expenses.self"><MyExpenses /></Protected>} />
                <Route path="expenses/claims" element={<Protected permission="expenses.view_all"><ExpenseClaims /></Protected>} />
                <Route path="expenses/approvals" element={<Protected permission="expenses.approve"><ExpenseApprovals /></Protected>} />
                <Route path="expenses/reimbursements" element={<Protected permission="expenses.reimburse"><Reimbursements /></Protected>} />
                <Route path="expenses/categories" element={<Protected permission="expenses.categories.manage"><ExpenseCategories /></Protected>} />
                <Route path="expenses/reports" element={<Protected permission="expenses.reports"><ExpenseReports /></Protected>} />
                <Route path="expenses/settings" element={<Protected permission="expenses.settings"><ExpenseSettings /></Protected>} />

                {/* Phase 5: Performance Management */}
                <Route path="performance" element={<Protected permission={['performance.dashboard', 'performance.goals.self']}><PerformanceDashboard /></Protected>} />
                <Route path="performance/goals" element={<Protected permission={['performance.goals.view', 'performance.goals.manage', 'performance.goals.self']}><Goals /></Protected>} />
                <Route path="performance/progress" element={<Protected permission={['performance.goals.self', 'performance.goals.view', 'performance.goals.manage']}><GoalProgress /></Protected>} />
                <Route path="performance/review-cycles" element={<Protected permission={['performance.reviews.view', 'performance.reviews.manage']}><ReviewCycles /></Protected>} />
                <Route path="performance/review-history" element={<Protected permission={['performance.reviews.view', 'performance.reviews.manage']}><ReviewHistory /></Protected>} />
                <Route path="performance/reports" element={<Protected permission="performance.reports"><PerformanceReports /></Protected>} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
