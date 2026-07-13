import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

type PushState = {
  supported: boolean;
  configured: boolean;
  subscribed: boolean;
  permission: NotificationPermission | 'unsupported';
  subscriptionCount: number;
  loading: boolean;
};

const browserSupportsPush = () => (
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
);

const urlBase64ToUint8Array = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
};

const getRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing || navigator.serviceWorker.register('/sw.js');
};

const openNotificationUrl = (value: string) => {
  const target = new URL(value, window.location.origin);
  window.location.assign(target.origin === window.location.origin ? target.href : '/notifications');
};

export function usePushNotifications() {
  const { authFetch, isAuthenticated } = useAuth();
  const [state, setState] = useState<PushState>({
    supported: browserSupportsPush(),
    configured: false,
    subscribed: false,
    permission: browserSupportsPush() ? Notification.permission : 'unsupported',
    subscriptionCount: 0,
    loading: true,
  });

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !browserSupportsPush()) {
      setState((current) => ({ ...current, loading: false }));
      return;
    }

    try {
      const [response, registration] = await Promise.all([
        authFetch('/api/push/status'),
        navigator.serviceWorker.getRegistration('/'),
      ]);
      if (!response.ok) throw new Error('Could not load push status');
      const serverStatus = await response.json();
      const subscription = await registration?.pushManager.getSubscription();
      setState({
        supported: true,
        configured: Boolean(serverStatus.supported),
        subscribed: Boolean(subscription),
        permission: Notification.permission,
        subscriptionCount: Number(serverStatus.subscriptionCount || 0),
        loading: false,
      });
    } catch {
      setState((current) => ({ ...current, loading: false }));
    }
  }, [authFetch, isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!browserSupportsPush()) throw new Error('Push notifications are not supported by this browser');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState((current) => ({ ...current, permission }));
      throw new Error(permission === 'denied'
        ? 'Notifications are blocked in your browser settings'
        : 'Notification permission was not granted');
    }

    const keyResponse = await authFetch('/api/push/vapid-public-key');
    const keyPayload = await keyResponse.json().catch(() => ({}));
    if (!keyResponse.ok || !keyPayload.publicKey) {
      throw new Error(keyPayload.message || 'Push notifications are not configured');
    }

    const registration = await getRegistration();
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey),
    });

    const response = await authFetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (!existing) await subscription.unsubscribe().catch(() => false);
      throw new Error(payload.message || 'Could not enable push notifications');
    }
    await refresh();
  }, [authFetch, refresh]);

  const disable = useCallback(async () => {
    if (!browserSupportsPush()) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      const response = await authFetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Could not disable push notifications');
      }
      await subscription.unsubscribe();
    }
    await refresh();
  }, [authFetch, refresh]);

  const sendTest = useCallback(async () => {
    const response = await authFetch('/api/push/test', { method: 'POST' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Could not send a test notification');
  }, [authFetch]);

  return { ...state, enable, disable, sendTest, refresh };
}

export function usePushNotificationEvents() {
  const { authFetch, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || !browserSupportsPush()) return;

    const currentUrl = new URL(window.location.href);
    const openedNotificationId = currentUrl.searchParams.get('pushNotification');
    if (openedNotificationId) {
      currentUrl.searchParams.delete('pushNotification');
      window.history.replaceState(window.history.state, '', currentUrl);
      void authFetch(`/api/notifications/${openedNotificationId}/read`, { method: 'PUT' })
        .finally(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }));
    }

    const onMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (payload?.type === 'PUSH_NOTIFICATION_RECEIVED') {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        toast(payload.notification?.title || 'New notification', {
          description: payload.notification?.body,
          action: payload.notification?.url ? {
            label: 'Open',
            onClick: () => openNotificationUrl(payload.notification.url),
          } : undefined,
        });
      }

      if (payload?.type === 'PUSH_NOTIFICATION_CLICKED' && payload.notification?.id) {
        void authFetch(`/api/notifications/${payload.notification.id}/read`, { method: 'PUT' })
          .finally(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }));
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [authFetch, isAuthenticated, queryClient]);
}
