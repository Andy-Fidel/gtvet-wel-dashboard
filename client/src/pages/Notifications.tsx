import { useEffect, useState } from 'react';
import { useNotifications, type NotificationStatus, type NotificationType, type NotificationView } from '@/hooks/useNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/toast';
import { format } from 'date-fns';
import { Bell, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const categories: Array<{ value: NotificationType | 'all'; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'system', label: 'System' },
  { value: 'placement', label: 'Placements' },
  { value: 'visit', label: 'Monitoring visits' },
  { value: 'assessment', label: 'Assessments' },
  { value: 'report', label: 'Reports' },
  { value: 'partner', label: 'Partners' },
  { value: 'support', label: 'Support' },
];

const preferenceLabels = [
  ['inApp', 'In-app inbox'], ['whatsApp', 'WhatsApp'],
  ['systemUpdates', 'System'], ['placementUpdates', 'Placements'],
  ['visitUpdates', 'Monitoring visits'], ['assessmentUpdates', 'Assessments'],
  ['reportReminders', 'Reports'], ['partnerUpdates', 'Partners'], ['supportUpdates', 'Support'],
] as const;
type PreferenceKey = typeof preferenceLabels[number][0];
type Preferences = Record<PreferenceKey, boolean>;

function NotificationPreferences() {
  const { authFetch } = useAuth();
  const push = usePushNotifications();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void authFetch('/api/settings/notifications').then(async (response) => {
      if (!response.ok) throw new Error('Could not load preferences');
      const data = await response.json();
      if (active) setPreferences(data);
    }).catch(() => { if (active) toast.error('Could not load notification preferences'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authFetch]);

  const save = async () => {
    if (!preferences) return;
    setSaving(true);
    try {
      const response = await authFetch('/api/settings/notifications', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error();
      setPreferences(await response.json());
      toast.success('Notification preferences saved');
    } catch { toast.error('Could not save notification preferences'); }
    finally { setSaving(false); }
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (push.subscribed) await push.disable(); else await push.enable();
      toast.success(push.subscribed ? 'Push disabled on this device' : 'Push enabled on this device');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update push notifications'); }
    finally { setPushBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4" aria-label="Notification preferences">
      <h2 className="font-bold text-gray-900">Notification preferences</h2>
      {loading ? <p className="text-sm text-gray-500">Loading preferences…</p> : preferences ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preferenceLabels.map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 text-sm text-gray-700">
                <input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences((current) => current ? { ...current, [key]: event.target.checked } : current)} className="h-4 w-4 accent-blue-600" />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">WhatsApp requires an account phone number and a configured provider. Push is enabled separately for each browser.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</Button>
            {push.supported && push.configured ? <Button variant="outline" onClick={() => void togglePush()} disabled={pushBusy}>{push.subscribed ? 'Disable push on this device' : 'Enable push on this device'}</Button> : null}
          </div>
        </>
      ) : <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>}
    </section>
  );
}

export default function Notifications() {
  const [view, setView] = useState<NotificationView>('active');
  const [status, setStatus] = useState<NotificationStatus>('all');
  const [type, setType] = useState<NotificationType | 'all'>('all');
  const [showPreferences, setShowPreferences] = useState(false);
  const { notifications, markAsRead, markAsUnread, dismiss, restore, markAllAsRead, unreadCount, isLoading, isError, retry, isUpdating, hasMore, loadingMore, loadMoreError, loadMore } = useNotifications({ view, status, type });
  const navigate = useNavigate();

  const open = async (notification: typeof notifications[number]) => {
    if (!notification.read && view === 'active') await markAsRead(notification._id).catch(() => undefined);
    if (notification.link?.startsWith('/') && !notification.link.startsWith('//')) navigate(notification.link);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Notifications</h1>
          <p className="text-gray-500 font-medium mt-1">Updates on your workflows and account</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreferences((value) => !value)} aria-expanded={showPreferences}><Settings2 className="mr-2 h-4 w-4" /> Preferences</Button>
          {unreadCount > 0 && <Button onClick={() => void markAllAsRead()} disabled={isUpdating}>Mark all as read</Button>}
        </div>
      </div>

      {showPreferences && <NotificationPreferences />}

      <div className="flex flex-wrap gap-2" aria-label="Notification filters">
        <select aria-label="Inbox view" value={view} onChange={(event) => setView(event.target.value as NotificationView)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="active">Inbox</option><option value="dismissed">Dismissed</option>
        </select>
        <select aria-label="Read status" value={status} onChange={(event) => setStatus(event.target.value as NotificationStatus)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="all">All statuses</option><option value="unread">Unread</option><option value="read">Read</option>
        </select>
        <select aria-label="Category" value={type} onChange={(event) => setType(event.target.value as NotificationType | 'all')} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-[2rem] p-4 md:p-8 shadow-xl border border-gray-100 flex flex-col gap-3">
        {isError ? <div role="alert" className="text-rose-700">Notifications could not be loaded. <Button variant="outline" size="sm" onClick={() => void retry()}>Retry</Button></div>
          : isLoading ? <p className="text-gray-500">Loading notifications…</p>
          : notifications.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center gap-3 text-gray-500"><Bell className="h-10 w-10" /><p>No notifications match these filters.</p></div>
          ) : notifications.map((notification) => (
            <article key={notification._id} className={`rounded-2xl border p-4 ${notification.read ? 'border-gray-100' : 'border-amber-200 bg-amber-50/40'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-gray-900">{notification.title}</h2><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">{notification.type}</span>{!notification.read && <span className="sr-only">Unread</span>}</div>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{notification.message}</p>
                  <p className="mt-2 text-xs text-gray-500">{format(new Date(notification.createdAt), 'PP p')}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {notification.link?.startsWith('/') && !notification.link.startsWith('//') && <Button variant="ghost" size="sm" onClick={() => void open(notification)}>Open</Button>}
                  {view === 'active' && <Button variant="ghost" size="sm" disabled={isUpdating} onClick={() => void (notification.read ? markAsUnread(notification._id) : markAsRead(notification._id))}>{notification.read ? 'Mark unread' : 'Mark read'}</Button>}
                  <Button variant="ghost" size="sm" disabled={isUpdating} onClick={() => void (view === 'active' ? dismiss(notification._id) : restore(notification._id))}>{view === 'active' ? 'Dismiss' : 'Restore'}</Button>
                </div>
              </div>
            </article>
          ))}
        {hasMore && !isError && <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Load older notifications'}</Button>}
        {loadMoreError && <p role="alert" className="text-sm text-rose-700">Could not load older notifications. Please try again.</p>}
      </div>
    </div>
  );
}
