import { Bell, LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { Badge } from "@/components/ui/badge"
import { Search } from "./Search"
import { useNotifications } from "@/hooks/useNotifications"
import { formatDistanceToNow } from "date-fns"

export function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  
  const getPageTitle = (pathname: string) => {
    switch(pathname) {
      case '/': return 'Dashboard';
      case '/learners': return 'Learner Register';
      case '/placements': return 'Workplace Placements';
      case '/attendance-logs': return 'Attendance & Hours';
      case '/support-center': return 'Help & Support';
      case '/activity-log': return 'Activity & Audit Log';
      case '/monitoring-visits': return 'Monitoring Visits';
      case '/semester-reports': return 'Semester Reports';
      case '/users': return 'User Management';
      case '/system-overview': return 'System Overview';
      case '/academic-calendar': return 'Academic Calendar';
      default: return 'Dashboard';
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  }

  const getRoleBadgeColor = (role: string) => {
    switch(role) {
      case 'SuperAdmin': return 'bg-purple-500';
      case 'Admin': return 'bg-blue-500';
      case 'Manager': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  }

  return (
    <div className="flex items-center justify-between pl-4 pr-16 md:px-8 py-4 glass-panel rounded-[2rem] sticky top-0 z-30">
      <div className="flex items-center gap-2 md:gap-6">
        <div className="hidden sm:flex items-center gap-2 bg-[#4ADE80] px-3 py-2 rounded-xl text-white text-[10px] md:text-xs font-black uppercase tracking-wider shadow-sm animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full" />
          <span className="hidden md:inline">Live</span>
        </div>
        <h2 className="text-lg md:text-xl font-black text-gray-900 tracking-tight truncate max-w-[150px] md:max-w-none">
          {getPageTitle(location.pathname)}
        </h2>
      </div>

      <div className="hidden lg:block flex-1 max-w-md mx-8">
        <Search />
      </div>

      <div className="flex items-center gap-2 md:gap-8">
        <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-1 justify-end">
          <div className="lg:hidden w-[150px] sm:w-auto">
            <Search />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all cursor-pointer">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 md:top-3 md:right-3 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white shadow-sm ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 md:w-96 rounded-3xl mt-2 p-0 bg-white border-gray-100 shadow-2xl" align="end" forceMount>
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="font-black text-gray-900">Notifications</span>
                  {unreadCount > 0 && (
                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0">{unreadCount} new</Badge>
                  )}
                </div>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => markAllAsRead()} className="text-xs text-blue-600 font-bold hover:text-blue-700 hover:bg-blue-50 h-auto py-1">
                    Mark all read
                  </Button>
                )}
              </div>
              <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="h-12 w-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400">
                      <Bell className="h-5 w-5" />
                    </div>
                    <p className="text-gray-500 font-medium text-sm">You have no notifications yet.</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {notifications.map(notification => (
                      <DropdownMenuItem 
                        key={notification._id}
                        className={`cursor-pointer rounded-2xl p-3 flex gap-3 transition-colors ${notification.read ? 'hover:bg-gray-50' : 'bg-blue-50/50 hover:bg-blue-50'}`}
                        onClick={async () => {
                          if (!notification.read) {
                            await markAsRead(notification._id);
                          }
                          if (notification.link) navigate(notification.link);
                        }}
                      >
                        <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${notification.read ? 'bg-transparent' : 'bg-blue-500'}`} />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className={`text-sm tracking-tight truncate ${notification.read ? 'font-semibold text-gray-700' : 'font-black text-gray-900'}`}>{notification.title}</p>
                          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{notification.message}</p>
                          <p className="text-[10px] text-gray-400 font-medium">{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</p>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-2 border-t border-gray-100">
                <Button variant="ghost" className="w-full text-xs font-bold text-gray-600 hover:text-gray-900 rounded-xl" onClick={() => navigate('/notifications')}>
                  View all notifications
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-12 w-12 rounded-2xl p-0 hover:ring-2 hover:ring-[#FFB800] transition-all overflow-hidden bg-gray-100">
                {user?.profilePicture ? (
                  <img src={user.profilePicture} alt={user.name} className="h-12 w-12 object-cover" />
                ) : (
                  <Avatar className="h-12 w-12 rounded-none">
                    <AvatarFallback className="rounded-none bg-[#FFB800]/10 text-[#FFB800] font-black">
                      {user ? getInitials(user.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 rounded-3xl mt-2 p-2 bg-[#1E1E1E]/95 backdrop-blur-xl border-white/10 text-white shadow-2xl" align="end" forceMount>
              <DropdownMenuLabel className="font-normal p-4">
                <div className="flex flex-col space-y-1">
                  <p className="text-base font-black leading-none text-white">{user?.name}</p>
                  <p className="text-sm leading-none text-white/60 mt-1">
                    {user?.email}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`${getRoleBadgeColor(user?.role || '')} text-white border-0 text-[10px]`}>
                      {user?.role}
                    </Badge>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                className="rounded-2xl p-3 focus:bg-white/10 focus:text-white cursor-pointer transition-colors"
                onClick={() => navigate('/profile')}
              >
                <User className="mr-3 h-5 w-5" />
                <span className="font-bold">Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="text-red-400 rounded-2xl p-3 focus:bg-red-500/10 focus:text-red-400 cursor-pointer transition-colors" onClick={handleLogout}>
                <LogOut className="mr-3 h-5 w-5" />
                <span className="font-bold">Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
