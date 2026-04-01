import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

export interface Notification {
  _id: string;
  recipient: string;
  sender?: {
    _id: string;
    name: string;
    role: string;
    profilePicture?: string;
  };
  type: 'system' | 'placement' | 'visit' | 'assessment' | 'report' | 'partner';
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

export function useNotifications() {
  const { authFetch, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await authFetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json() as Promise<Notification[]>;
    },
    enabled: isAuthenticated,
    refetchInterval: 30000, // Poll every 30 seconds
    refetchOnWindowFocus: true,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to mark notification as read');
      return res.json();
    },
    onMutate: async (id) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const previousNotifications = queryClient.getQueryData<Notification[]>(['notifications']);
      
      if (previousNotifications) {
        queryClient.setQueryData<Notification[]>(
          ['notifications'],
          previousNotifications.map((n) => (n._id === id ? { ...n, read: true } : n))
        );
      }
      return { previousNotifications };
    },
    onError: (_error, _id, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(['notifications'], context.previousNotifications);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/notifications/read-all', { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to mark all as read');
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const previousNotifications = queryClient.getQueryData<Notification[]>(['notifications']);
      
      if (previousNotifications) {
        queryClient.setQueryData<Notification[]>(
          ['notifications'],
          previousNotifications.map((n) => ({ ...n, read: true }))
        );
      }
      return { previousNotifications };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(['notifications'], context.previousNotifications);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = query.data?.filter((n) => !n.read).length || 0;

  return {
    notifications: query.data || [],
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
  };
}
