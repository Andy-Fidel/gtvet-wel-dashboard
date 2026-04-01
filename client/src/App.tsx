import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageSkeleton } from '@/components/PageSkeleton';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';

// Lazy-loaded page components (code-split by route)
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const LearnerRegister = lazy(() => import('@/pages/LearnerRegister'));
const LearnerProfile = lazy(() => import('@/pages/LearnerProfile'));
const LearnerProgressDashboard = lazy(() => import('@/pages/LearnerProgressDashboard'));
const AttendanceLogs = lazy(() => import('@/pages/AttendanceLogs'));
const Placements = lazy(() => import('@/pages/Placements'));
const MonitoringVisits = lazy(() => import('@/pages/MonitoringVisits'));
const SemesterReports = lazy(() => import('@/pages/SemesterReports'));
const SemesterReportDetail = lazy(() => import('@/pages/SemesterReportDetail'));
const CompetencyAssessments = lazy(() => import('@/pages/CompetencyAssessments'));
const IndustryPartners = lazy(() => import('@/pages/IndustryPartners'));
const CalendarView = lazy(() => import('@/pages/CalendarView'));
const AcademicCalendarPage = lazy(() => import('@/pages/AcademicCalendar'));
const Users = lazy(() => import('@/pages/Users'));
const SuperAdminDashboard = lazy(() => import('@/pages/SuperAdminDashboard'));
const PartnerDashboard = lazy(() => import('@/pages/PartnerDashboard'));
const UserProfile = lazy(() => import('@/pages/UserProfile'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const SupportCenter = lazy(() => import('@/pages/SupportCenter'));
const ActivityLog = lazy(() => import('@/pages/ActivityLog'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* Protected routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <Dashboard />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="learners" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <LearnerRegister />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="learners/:id" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <LearnerProfile />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="learner-progress" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <LearnerProgressDashboard />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="attendance-logs" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <AttendanceLogs />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="placements" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <Placements />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="monitoring-visits" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <MonitoringVisits />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="semester-reports" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <SemesterReports />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="semester-reports/:id" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <SemesterReportDetail />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="assessments" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <CompetencyAssessments />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="industry-partners" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <IndustryPartners />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="calendar" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <CalendarView />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="academic-calendar" element={
                <ProtectedRoute requiredRoles={['SuperAdmin']}>
                  <ErrorBoundary>
                    <Suspense fallback={<PageSkeleton />}>
                      <AcademicCalendarPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              } />
              <Route path="users" element={
                <ProtectedRoute requiredRoles={['Admin', 'SuperAdmin', 'RegionalAdmin']}>
                  <ErrorBoundary>
                    <Suspense fallback={<PageSkeleton />}>
                      <Users />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              } />
              <Route path="system-overview" element={
                <ProtectedRoute requiredRoles={['SuperAdmin']}>
                  <ErrorBoundary>
                    <Suspense fallback={<PageSkeleton />}>
                      <SuperAdminDashboard />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              } />
              <Route path="partner-dashboard" element={
                <ProtectedRoute requiredRoles={['IndustryPartner']}>
                  <ErrorBoundary>
                    <Suspense fallback={<PageSkeleton />}>
                      <PartnerDashboard />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              } />
              <Route path="profile" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <UserProfile />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="notifications" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <Notifications />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="support-center" element={
                <ErrorBoundary>
                  <Suspense fallback={<PageSkeleton />}>
                    <SupportCenter />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="activity-log" element={
                <ProtectedRoute requiredRoles={['Admin', 'SuperAdmin', 'RegionalAdmin']}>
                  <ErrorBoundary>
                    <Suspense fallback={<PageSkeleton />}>
                      <ActivityLog />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
