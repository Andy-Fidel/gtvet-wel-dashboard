import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/toast';

export type NotificationType = 'system' | 'placement' | 'visit' | 'assessment' | 'report' | 'partner' | 'support';
export type NotificationView = 'active' | 'dismissed';
export type NotificationStatus = 'all' | 'unread' | 'read';

export interface Notification {
  _id: string;
  recipient: string;
  sender?: { _id: string; name: string; role: string; profilePicture?: string };
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

type NotificationPage = { items: Notification[]; unreadCount: number; nextCursor: string | null };
type Filters = { view?: NotificationView; status?: NotificationStatus; type?: NotificationType | 'all' };

export function useNotifications({ view = 'active', status = 'all', type = 'all' }: Filters = {}) {
  const { authFetch, isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['notifications', user?._id, view, status, type],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ view, status, type });
      if (pageParam) params.set('before', pageParam);
      const response = await authFetch(`/api/notifications?${params}`);
      if (!response.ok) throw new Error('Could not load notifications');
      return response.json() as Promise<NotificationPage>;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: isAuthenticated && Boolean(user?._id),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const update = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'read' | 'unread' | 'dismiss' | 'restore' }) => {
      const response = await authFetch(`/api/notifications/${id}/${action}`, { method: 'PUT' });
      if (!response.ok) throw new Error(`Could not ${action} notification`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?._id] }),
    onError: (error) => toast.error(error.message),
  });
  const readAll = useMutation({
    mutationFn: async () => {
      const response = await authFetch('/api/notifications/read-all', { method: 'PUT' });
      if (!response.ok) throw new Error('Could not mark notifications as read');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?._id] }),
    onError: (error) => toast.error(error.message),
  });

  return {
    notifications: query.data?.pages.flatMap((page) => page.items) || [],
    unreadCount: query.data?.pages[0]?.unreadCount || 0,
    hasMore: Boolean(query.hasNextPage),
    loadingMore: query.isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError,
    loadMore: () => query.fetchNextPage(),
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => query.refetch(),
    isUpdating: update.isPending || readAll.isPending,
    markAsRead: (id: string) => update.mutateAsync({ id, action: 'read' }),
    markAsUnread: (id: string) => update.mutateAsync({ id, action: 'unread' }),
    dismiss: (id: string) => update.mutateAsync({ id, action: 'dismiss' }),
    restore: (id: string) => update.mutateAsync({ id, action: 'restore' }),
    markAllAsRead: () => readAll.mutateAsync(),
  };
}
