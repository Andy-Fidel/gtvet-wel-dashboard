import { useLocation } from 'react-router-dom';
import { isHQRole, canAccessHQPage } from '@/lib/rbac';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: readonly string[];
}

export default function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[#FFB800] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 font-bold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessHQPage(user?.role, location.pathname) || (requiredRoles && user && !requiredRoles.includes(user.role) && !(isHQRole(user.role) && requiredRoles.includes('SuperAdmin')))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
