import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

export interface Notification {
  _id: string;
  recipient: string;
  sender?: { _id: string; name: string; role: string; profilePicture?: string };
  type: 'system' | 'placement' | 'visit' | 'assessment' | 'report' | 'partner' | 'support';
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

type NotificationPage = { items: Notification[]; unreadCount: number; nextCursor: string | null };

export function useNotifications() {
  const { authFetch, isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [olderPages, setOlderPages] = useState<NotificationPage[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  useEffect(() => { setOlderPages([]); setLoadMoreError(false); }, [user?._id]);

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await authFetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json() as Promise<NotificationPage>;
    },
    enabled: isAuthenticated,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to mark notification as read');
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const previous = queryClient.getQueryData<NotificationPage>(['notifications']);
      if (previous) {
        const item = [...previous.items, ...olderPages.flatMap((page) => page.items)].find((notification) => notification._id === id);
        queryClient.setQueryData<NotificationPage>(['notifications'], {
          ...previous,
          unreadCount: Math.max(0, previous.unreadCount - (item && !item.read ? 1 : 0)),
          items: previous.items.map((notification) => notification._id === id ? { ...notification, read: true } : notification),
        });
        setOlderPages((pages) => pages.map((page) => ({ ...page, items: page.items.map((notification) => notification._id === id ? { ...notification, read: true } : notification) })));
      }
      return { previous, previousOlderPages: olderPages };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['notifications'], context.previous);
      if (context?.previousOlderPages) setOlderPages(context.previousOlderPages);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/notifications/read-all', { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to mark all as read');
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const previous = queryClient.getQueryData<NotificationPage>(['notifications']);
      if (previous) queryClient.setQueryData<NotificationPage>(['notifications'], { ...previous, unreadCount: 0, items: previous.items.map((notification) => ({ ...notification, read: true })) });
      setOlderPages((pages) => pages.map((page) => ({ ...page, items: page.items.map((notification) => ({ ...notification, read: true })) })));
      return { previous, previousOlderPages: olderPages };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['notifications'], context.previous);
      if (context?.previousOlderPages) setOlderPages(context.previousOlderPages);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const cursor = olderPages.at(-1)?.nextCursor ?? query.data?.nextCursor;
  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const res = await authFetch(`/api/notifications?before=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error('Failed to load older notifications');
      const page = await res.json() as NotificationPage;
      setOlderPages((pages) => [...pages, page]);
    } catch {
      setLoadMoreError(true);
    } finally { setLoadingMore(false); }
  };

  const seen = new Set<string>();
  const notifications = [...(query.data?.items || []), ...olderPages.flatMap((page) => page.items)]
    .filter((notification) => {
      if (seen.has(notification._id)) return false;
      seen.add(notification._id);
      return true;
    });

  return {
    notifications,
    unreadCount: query.data?.unreadCount || 0,
    hasMore: Boolean(cursor),
    loadingMore,
    loadMoreError,
    loadMore,
    isLoading: query.isLoading,
    isError: query.isError,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
  };
}
