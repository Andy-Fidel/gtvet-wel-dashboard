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

export function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  
  const getPageTitle = (pathname: string) => {
    switch(pathname) {
      case '/': return 'Dashboard';
      case '/learners': return 'Learner Register';
      case '/placements': return 'Workplace Placements';
      case '/monitoring-visits': return 'Monitoring Visits';
      case '/monthly-reports': return 'Monthly Reports';
      case '/users': return 'User Management';
      case '/system-overview': return 'System Overview';
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
    <div className="flex items-center justify-between px-4 md:px-8 py-4 bg-white rounded-[2rem] border border-gray-100 shadow-sm sticky top-0 z-30">
      <div className="flex items-center gap-3 md:gap-6">
        <div className="hidden sm:flex items-center gap-2 bg-[#4ADE80] px-4 py-2 rounded-xl text-white text-xs font-black uppercase tracking-wider shadow-sm animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full" />
          Live
        </div>
        <h2 className="text-lg md:text-xl font-black text-gray-900 tracking-tight truncate max-w-[150px] md:max-w-none">
          {getPageTitle(location.pathname)}
        </h2>
      </div>

      <div className="hidden lg:block flex-1 max-w-md mx-8">
        <Search />
      </div>

      <div className="flex items-center gap-2 md:gap-8">
        <div className="flex items-center gap-2 md:gap-4">
          <div className="lg:hidden">
            <Search />
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all">
            <Bell className="h-5 w-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-12 w-12 rounded-2xl p-0 hover:ring-2 hover:ring-[#FFB800] transition-all overflow-hidden bg-gray-100">
                <Avatar className="h-12 w-12 rounded-none">
                  <AvatarFallback className="rounded-none bg-[#FFB800]/10 text-[#FFB800] font-black">
                    {user ? getInitials(user.name) : 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 rounded-3xl mt-2 p-2" align="end" forceMount>
              <DropdownMenuLabel className="font-normal p-4">
                <div className="flex flex-col space-y-1">
                  <p className="text-base font-black leading-none">{user?.name}</p>
                  <p className="text-sm leading-none text-muted-foreground mt-1">
                    {user?.email}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`${getRoleBadgeColor(user?.role || '')} text-white border-0 text-[10px]`}>
                      {user?.role}
                    </Badge>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="rounded-2xl p-3 focus:bg-[#FFB800]/10">
                <User className="mr-3 h-5 w-5" />
                <span className="font-bold">Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 rounded-2xl p-3 focus:bg-red-50" onClick={handleLogout}>
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
