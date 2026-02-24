import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import LearnerRegister from '@/pages/LearnerRegister';
import Placements from '@/pages/Placements';
import MonitoringVisits from '@/pages/MonitoringVisits';
import MonthlyReports from '@/pages/MonthlyReports';
import Users from '@/pages/Users';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import SuperAdminDashboard from '@/pages/SuperAdminDashboard';
import CalendarView from './pages/CalendarView';
import CompetencyAssessments from '@/pages/CompetencyAssessments';
import LearnerProfile from '@/pages/LearnerProfile';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="learners" element={<LearnerRegister />} />
            <Route path="learners/:id" element={<LearnerProfile />} />
            <Route path="placements" element={<Placements />} />
            <Route path="monitoring-visits" element={<MonitoringVisits />} />
            <Route path="monthly-reports" element={<MonthlyReports />} />
            <Route path="assessments" element={<CompetencyAssessments />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="users" element={
              <ProtectedRoute requiredRoles={['Admin', 'SuperAdmin']}>
                <Users />
              </ProtectedRoute>
            } />
            <Route path="system-overview" element={
              <ProtectedRoute requiredRoles={['SuperAdmin']}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
