import { Outlet, NavLink } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { LayoutDashboard, Users, Briefcase, Menu, X, Shield, ClipboardList, FileText, Calendar as CalendarIcon, GraduationCap, Building2, Bell, Activity, Clock3, LifeBuoy, Settings2, WifiOff, HeartHandshake, Archive } from 'lucide-react';
import type { FocusEvent, MouseEvent } from 'react';
import { useState } from 'react';
import gtvetsLogo from '@/assets/gtvets_logo.png';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { Badge } from '@/components/ui/badge';

import { Toaster } from 'sonner';
import { PlacementProgressWidget } from './PlacementProgressWidget';
import { usePushNotificationEvents } from '@/hooks/usePushNotifications';

export default function Layout() {
  usePushNotificationEvents();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarTooltip, setSidebarTooltip] = useState<{ label: string; top: number } | null>(null);
  const { user, offlineQueueCount } = useAuth();
  const { unreadCount } = useNotifications();

  const isAdminOrSuper = user?.role === 'Admin' || user?.role === 'SuperAdmin' || user?.role === 'RegionalAdmin';
  const isSuperAdmin = user?.role === 'SuperAdmin';
  const isRegionalAdmin = user?.role === 'RegionalAdmin';
  const isIndustryPartner = user?.role === 'IndustryPartner';
  const isGuardian = user?.role === 'Guardian';
  const showSidebarTooltip = (label: string, element: HTMLElement) => {
    if (!isSidebarCollapsed) return;

    const rect = element.getBoundingClientRect();
    setSidebarTooltip({ label, top: rect.top + rect.height / 2 });
  };
  const hideSidebarTooltip = () => setSidebarTooltip(null);
  const collapsedNavTooltip = (label: string) => ({
    'aria-label': isSidebarCollapsed ? label : undefined,
    onMouseEnter: (event: MouseEvent<HTMLElement>) => showSidebarTooltip(label, event.currentTarget),
    onMouseLeave: hideSidebarTooltip,
    onFocus: (event: FocusEvent<HTMLElement>) => showSidebarTooltip(label, event.currentTarget),
    onBlur: hideSidebarTooltip,
  });

  return (
    <>
      <div className="mesh-bg">
        <div className="mesh-blob bg-indigo-500/20 w-96 h-96 top-0 left-0" />
        <div className="mesh-blob bg-purple-500/20 w-96 h-96 top-1/4 right-0 animation-delay-2000" />
        <div className="mesh-blob bg-emerald-500/20 w-96 h-96 bottom-0 left-1/4 animation-delay-4000" />
        <div className="mesh-blob bg-amber-500/20 w-96 h-96 bottom-1/4 right-1/4 animation-delay-6000" />
      </div>
      
      <div className="min-h-screen flex p-0 sm:p-4 gap-0 sm:gap-4 relative z-10">
      {/* Mobile Menu Button */}
      <button 
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-white rounded-lg shadow-sm border border-gray-200"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMobileMenuOpen}
      >
        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/60 z-30 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-4 left-4 z-40 glass-panel rounded-[2rem] flex flex-col transition-[width,transform] duration-200 ease-in-out shadow-xl will-change-[width,transform]
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-[120%] md:translate-x-0'}
        ${isSidebarCollapsed ? 'w-24' : 'w-72'}
      `}>
        {/* Desktop Collapse Toggle */}
        <button 
          onClick={() => {
            hideSidebarTooltip();
            setIsSidebarCollapsed(!isSidebarCollapsed);
          }}
          className="hidden md:flex absolute -right-3 top-8 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center hover:bg-gray-50 shadow-sm z-50 transition-transform"
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? <Menu size={14} className="text-gray-500" /> : <X size={14} className="text-gray-500" />}
        </button>

        <div className={`p-6 md:p-8 flex flex-col gap-4 ${isSidebarCollapsed ? 'items-center' : ''}`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
             <img src={gtvetsLogo} alt="GTVETS Logo" className="w-10 h-10 md:w-12 md:h-12 object-contain" />
             {!isSidebarCollapsed && (
               <div className="flex flex-col">
                 <h1 className="text-xl font-black tracking-tighter text-gray-900 uppercase leading-none">GTVETS</h1>
                 <span className="text-[10px] font-bold text-[#FFB800] tracking-[0.2em] uppercase">WEL Tracker</span>
               </div>
             )}
          </div>
          {user && !isSidebarCollapsed && (
            <div className="bg-gray-50/50 rounded-2xl px-4 py-3 mt-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                {user.role === 'RegionalAdmin' ? 'Region' : (user.role === 'SuperAdmin' ? 'HQ' : (isIndustryPartner ? 'Company' : isGuardian ? 'Portal' : user.institution === 'N/A' ? 'Company' : 'Institution'))}
              </p>
              <p className="text-sm font-black text-gray-700 truncate">
                {user.role === 'RegionalAdmin'
                  ? (user.region || 'Regional Office')
                  : isIndustryPartner || user.institution === 'N/A'
                    ? (user.partnerId && typeof user.partnerId === 'object' ? user.partnerId.name : 'Partner Portal')
                    : isGuardian
                      ? 'Parent / Guardian Access'
                    : (user.institution || user.region || 'Institution Portal')}
              </p>
            </div>
          )}
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto overflow-x-hidden pb-4">
          {!isIndustryPartner && !isGuardian && (
              <NavLink 
                to="/" 
                className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/10 text-[#FFB800] font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Dashboard')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <LayoutDashboard size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Dashboard</span>}
                  </>
                )}
              </NavLink>
          )}

          {isIndustryPartner && (
              <>
              <NavLink
                to="/partner-dashboard"
                className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/10 text-[#FFB800] font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Partner Portal')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Building2 size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Partner Portal</span>}
                  </>
                )}
              </NavLink>
              <NavLink
                to="/notifications"
                className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/10 text-[#FFB800] font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Notifications')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <div className={`relative ${isSidebarCollapsed ? 'mx-auto' : ''}`}>
                      <Bell size={22} className={`group-hover:scale-110 transition-transform`} />
                      {!isSidebarCollapsed && unreadCount > 0 && (
                        <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center p-0">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="flex items-center gap-2">
                        <span className="text-base">Notifications</span>
                        {unreadCount > 0 && (
                          <Badge className="bg-red-500 text-white hover:bg-red-600 border-0 text-[10px] h-5 w-5 rounded-full p-0 flex items-center justify-center">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </Badge>
                        )}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
              <NavLink
                to="/attendance-logs"
                className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/10 text-[#FFB800] font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Attendance Logs')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Clock3 size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Attendance Logs</span>}
                  </>
                )}
              </NavLink>
              <NavLink
                to="/partner-history"
                className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/10 text-[#FFB800] font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Partner History')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Archive size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Partner History</span>}
                  </>
                )}
              </NavLink>
              </>
          )}

          {isGuardian && (
              <>
              <NavLink
                to="/guardian-dashboard"
                className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/10 text-[#FFB800] font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Guardian Portal')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <HeartHandshake size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Guardian Portal</span>}
                  </>
                )}
              </NavLink>
              <NavLink
                to="/notifications"
                className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/10 text-[#FFB800] font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/50'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Notifications')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Bell size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Notifications</span>}
                  </>
                )}
              </NavLink>
              </>
          )}

          {!isSuperAdmin && !isRegionalAdmin && !isIndustryPartner && !isGuardian && (
            <>
              <NavLink
                to="/learners"
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Learner Register')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Users size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Learner Register</span>}
                  </>
                )}
              </NavLink>
              <NavLink
                to="/graduated-learners"
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Graduated Learners')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <GraduationCap size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Graduated Learners</span>}
                  </>
                )}
              </NavLink>
              <NavLink
                to="/learner-progress"
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Progress Tracker')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Activity size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Progress Tracker</span>}
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/placements" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Placements')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Briefcase size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Placements</span>}
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/attendance-logs" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Attendance Logs')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Clock3 size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Attendance Logs</span>}
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/monitoring-visits" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Monitoring Visits')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <ClipboardList size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Monitoring Visits</span>}
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/semester-reports" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Term Closure')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <FileText size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Term Closure</span>}
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/assessments" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Assessments')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <GraduationCap size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Assessments</span>}
                  </>
                )}
              </NavLink>

              {/* Industry Portal Links for Institution Admins */}
              <div className="pt-4 pb-2">
                <p className={`px-6 text-xs font-black text-gray-400 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center' : ''}`}>
                  {isSidebarCollapsed ? '...' : 'Industry Portal'}
                </p>
              </div>
              <NavLink 
                to="/industry-partners" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Industry Partners')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Building2 size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Industry Partners</span>}
                  </>
                )}
              </NavLink>

              <NavLink 
                to="/calendar" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Calendar')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <CalendarIcon size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Calendar</span>}
                  </>
                )}
              </NavLink>
            </>
          )}

          {/* RegionalAdmin-specific links */}
          {isRegionalAdmin && (
            <NavLink 
              to="/semester-reports" 
              className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={() => setIsMobileMenuOpen(false)}
              {...collapsedNavTooltip('Term Closure')}
            >
              {({ isActive }) => (
                <>
                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  <FileText size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                  {!isSidebarCollapsed && <span className="text-base">Term Closure</span>}
                </>
              )}
            </NavLink>
          )}

          {isRegionalAdmin && (
            <>
              <div className="pt-4 pb-2">
                <p className={`px-6 text-xs font-black text-gray-400 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center' : ''}`}>
                  {isSidebarCollapsed ? '...' : 'Industry Portal'}
                </p>
              </div>
              <NavLink 
                to="/industry-partners" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Industry Partners')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Building2 size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Industry Partners</span>}
                  </>
                )}
              </NavLink>

            </>
          )}

          {isSuperAdmin && (
            <NavLink 
              to="/hq-industry-partners" 
              className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={() => setIsMobileMenuOpen(false)}
              {...collapsedNavTooltip('HQ Partner Registry')}
            >
              {({ isActive }) => (
                <>
                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  <HeartHandshake size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                  {!isSidebarCollapsed && <span className="text-base">HQ Partner Registry</span>}
                </>
              )}
            </NavLink>
          )}

          {/* Admin-only links */}
          {isAdminOrSuper && (
            <NavLink 
              to="/users" 
              className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={() => setIsMobileMenuOpen(false)}
              {...collapsedNavTooltip('User Management')}
            >
              {({ isActive }) => (
                <>
                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  <Users size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                  {!isSidebarCollapsed && <span className="text-base">User Management</span>}
                </>
              )}
            </NavLink>
          )}

          {isAdminOrSuper && (
            <NavLink 
              to="/activity-log" 
              className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={() => setIsMobileMenuOpen(false)}
              {...collapsedNavTooltip('Activity Log')}
            >
              {({ isActive }) => (
                <>
                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  <Shield size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                  {!isSidebarCollapsed && <span className="text-base">Activity Log</span>}
                </>
              )}
            </NavLink>
          )}

          <NavLink 
            to="/support-center" 
            className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => setIsMobileMenuOpen(false)}
            {...collapsedNavTooltip('Help & Support')}
          >
            {({ isActive }) => (
              <>
                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                <LifeBuoy size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                {!isSidebarCollapsed && <span className="text-base">Help & Support</span>}
              </>
            )}
          </NavLink>

          <NavLink 
            to="/settings" 
            className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => setIsMobileMenuOpen(false)}
            {...collapsedNavTooltip('Settings')}
          >
            {({ isActive }) => (
              <>
                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                <Settings2 size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                {!isSidebarCollapsed && <span className="text-base">Settings</span>}
              </>
            )}
          </NavLink>

          <NavLink 
            to="/offline-sync" 
            className={({ isActive }) => `relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-6'} py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => setIsMobileMenuOpen(false)}
            {...collapsedNavTooltip('Offline Sync')}
          >
            {({ isActive }) => (
              <>
                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                <div className={`relative ${isSidebarCollapsed ? 'mx-auto' : ''}`}>
                  <WifiOff size={22} className="group-hover:scale-110 transition-transform" />
                  {!isSidebarCollapsed && offlineQueueCount > 0 ? (
                    <Badge className="absolute -top-2 -right-2 h-5 min-w-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center p-0">
                      {offlineQueueCount > 9 ? '9+' : offlineQueueCount}
                    </Badge>
                  ) : null}
                </div>
                {!isSidebarCollapsed && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">Offline Sync</span>
                    {offlineQueueCount > 0 ? (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-600 border-0 text-[10px] h-5 min-w-5 rounded-full p-0 flex items-center justify-center">
                        {offlineQueueCount > 9 ? '9+' : offlineQueueCount}
                      </Badge>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </NavLink>

          {/* SuperAdmin-only links */}
          {isSuperAdmin && (
            <>
              <NavLink 
                to="/academic-calendar" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('Academic Calendar')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <CalendarIcon size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">Academic Calendar</span>}
                  </>
                )}
              </NavLink>
              <NavLink 
                to="/system-overview" 
                className={({ isActive }) => `relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-colors duration-150 group ${isActive ? 'bg-[#FFB800]/5 text-gray-900 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                onClick={() => setIsMobileMenuOpen(false)}
                {...collapsedNavTooltip('System Overview')}
              >
                {({ isActive }) => (
                  <>
                    <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-[#FFB800] rounded-l-full transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    <Shield size={22} className={`group-hover:scale-110 transition-transform ${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                    {!isSidebarCollapsed && <span className="text-base">System Overview</span>}
                  </>
                )}
              </NavLink>
            </>
          )}
        </nav>
        {!isSidebarCollapsed && !isIndustryPartner && !isGuardian && (
          <div className="mt-auto p-8">
             <PlacementProgressWidget />
          </div>
        )}
      </aside>
      {isSidebarCollapsed && sidebarTooltip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed left-[7.5rem] z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-950 px-3 py-2 text-sm font-bold text-white shadow-xl md:block"
          style={{ top: sidebarTooltip.top }}
        >
          {sidebarTooltip.label}
        </div>
      ) : null}

      {/* Main Content */}
      <main className={`flex-1 flex flex-col min-w-0 min-h-screen md:min-h-0 relative z-20 transition-[margin] duration-200 ease-in-out ml-0 ${isSidebarCollapsed ? 'md:ml-32' : 'md:ml-80'}`}>
        <Navbar />
        <div className="flex-1 overflow-auto glass-panel rounded-[1.5rem] md:rounded-[2.5rem] mt-4 p-2 sm:p-4 md:p-8 w-full">
          <Outlet />
        </div>
      </main>
      <Toaster
        position="top-center"
        offset="42vh"
        richColors
        toastOptions={{
          className: "min-w-[340px] rounded-2xl px-6 py-5 text-base font-bold shadow-2xl",
        }}
      />
    </div>
    </>
  );
}
