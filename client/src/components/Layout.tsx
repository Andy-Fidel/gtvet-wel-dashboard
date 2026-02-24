
import { Outlet, NavLink } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { LayoutDashboard, Users, Briefcase, Menu, X, Shield, ClipboardList, FileText, Calendar as CalendarIcon, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import gtvetsLogo from '@/assets/gtvets_logo.png';
import { useAuth } from '@/context/AuthContext';

import { Toaster } from 'sonner';
import { PlacementProgressWidget } from './PlacementProgressWidget';

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();

  const isAdminOrSuper = user?.role === 'Admin' || user?.role === 'SuperAdmin';
  const isSuperAdmin = user?.role === 'SuperAdmin';

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-900 flex p-4 gap-4">
      {/* Mobile Menu Button */}
      <button 
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-white rounded-lg shadow-sm border border-gray-200"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40 w-72 bg-white rounded-[2rem] border border-gray-100 flex flex-col transition-transform duration-300 ease-in-out shadow-sm
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-8 flex flex-col gap-4">
          <div className="flex items-center gap-3">
             <img src={gtvetsLogo} alt="GTVETS Logo" className="w-12 h-12 object-contain" />
             <div className="flex flex-col">
               <h1 className="text-xl font-black tracking-tighter text-gray-900 uppercase leading-none">GTVETS</h1>
               <span className="text-[10px] font-bold text-[#FFB800] tracking-[0.2em] uppercase">WEL Tracker</span>
             </div>
          </div>
          {user && (
            <div className="bg-gray-50 rounded-2xl px-4 py-3 mt-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Institution</p>
              <p className="text-sm font-black text-gray-700 truncate">{user.institution}</p>
            </div>
          )}
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <NavLink 
            to="/" 
            className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            {({ isActive }) => (
              <>
                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                <LayoutDashboard size={22} className="group-hover:scale-110 transition-transform" />
                <span className="text-base">Dashboard</span>
              </>
            )}
          </NavLink>
          {!isSuperAdmin && (
            <>
              <NavLink 
                to="/learners" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Users size={22} className="group-hover:scale-110 transition-transform" />
                    <span className="text-base">Learner Register</span>
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/placements" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Briefcase size={22} className="group-hover:scale-110 transition-transform" />
                    <span className="text-base">Placements</span>
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/monitoring-visits" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <ClipboardList size={22} className="group-hover:scale-110 transition-transform" />
                    <span className="text-base">Monitoring Visits</span>
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/monthly-reports" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <FileText size={22} className="group-hover:scale-110 transition-transform" />
                    <span className="text-base">Monthly Reports</span>
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/assessments" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <GraduationCap size={22} className="group-hover:scale-110 transition-transform" />
                    <span className="text-base">Assessments</span>
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/calendar" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <CalendarIcon size={22} className="group-hover:scale-110 transition-transform" />
                    <span className="text-base">Calendar</span>
                  </>
                )}
              </NavLink>
            </>
          )}

          {/* Admin-only links */}
          {isAdminOrSuper && (
            <NavLink 
              to="/users" 
              className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {({ isActive }) => (
                <>
                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  <Users size={22} className="group-hover:scale-110 transition-transform" />
                  <span className="text-base">User Management</span>
                </>
              )}
            </NavLink>
          )}

          {/* SuperAdmin-only link */}
          {isSuperAdmin && (
            <NavLink 
              to="/system-overview" 
              className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {({ isActive }) => (
                <>
                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  <Shield size={22} className="group-hover:scale-110 transition-transform" />
                  <span className="text-base">System Overview</span>
                </>
              )}
            </NavLink>
          )}
        </nav>
        <div className="mt-auto p-8">
           <PlacementProgressWidget />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen md:min-h-0">
        <Navbar />
        <div className="flex-1 overflow-auto bg-white rounded-[1.5rem] md:rounded-[2.5rem] mt-4 border border-gray-100 p-4 md:p-8 shadow-sm">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  );
}
