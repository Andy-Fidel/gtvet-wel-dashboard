import { useNotifications } from '@/hooks/useNotifications';
import { format } from 'date-fns';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function Notifications() {
  const { notifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">System Notifications</h1>
            <p className="text-gray-500 font-medium mt-1">Stay updated on workflow approvals and system events</p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={() => markAllAsRead()} className="rounded-xl shadow-md font-bold">Mark all as read</Button>
        )}
      </div>

      <div className="bg-white rounded-[2rem] p-6 md:p-10 shadow-xl border border-gray-100 flex flex-col gap-4">
        {notifications.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
                <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                    <Bell className="h-10 w-10" />
                </div>
                <p className="text-gray-400 font-bold text-lg">You don't have any notifications yet</p>
            </div>
        ) : (
            notifications.map(notification => (
                <div 
                    key={notification._id} 
                    className={`flex items-start gap-4 p-5 rounded-2xl cursor-pointer transition-colors border ${notification.read ? 'border-gray-100 bg-white hover:bg-gray-50' : 'border-[#FFB800]/30 bg-amber-50/30 hover:bg-amber-50'}`}
                    onClick={async () => {
                        if (!notification.read) await markAsRead(notification._id);
                        if (notification.link) navigate(notification.link);
                    }}
                >
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                           <h3 className={`font-black ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>{notification.title}</h3>
                           <span className="text-xs text-gray-400 font-bold">{format(new Date(notification.createdAt), 'PP p')}</span>
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed">{notification.message}</p>
                    </div>
                </div>
            ))
        )}
      </div>
    </div>
  );
}
