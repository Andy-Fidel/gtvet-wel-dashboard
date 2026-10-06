/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_CONTEXT_KEY, endInspection, INSPECTION_KEY } from '@/lib/inspection';
import { ensureCsrfToken } from '@/lib/csrf';
import { supportsOfflineAction, offlineLock } from '@/lib/offlinePolicy';
import { getOfflineConflictBridge, clearOfflineConflictBridge } from '@/lib/offlineConflictBridge';

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'SuperAdmin' | 'HQManager' | 'HQStaff' | 'RegionalAdmin' | 'Admin' | 'Manager' | 'Staff' | 'IndustryPartner' | 'Guardian';
  status: string;
  institution: string;
  phone?: string;
  passwordChangeRequired?: boolean;
  inspection?: { readOnly: true; actorName: string; expiresAt: string };
  region?: string;
  hqScopeType?: 'National' | 'Region' | 'Institution';
  profilePicture?: string;
  partnerId?: {
    _id: string;
    name: string;
  };
  partnerPortalRole?: 'Coordinator' | 'Supervisor';
  linkedLearners?: Array<{
    _id: string;
    name: string;
    trackingId?: string;
  }>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  passwordChangeRequired: boolean;
  offlineQueueCount: number;
  isSyncingOfflineQueue: boolean;
  offlineQueue: Array<{
    id: string;
    url: string;
    method: string;
    queuedAt: string;
    body: string;
    syncStatus: 'pending' | 'failed' | 'needs-review';
    lastAttemptAt?: string | null;
    lastError?: string | null;
    attemptCount?: number;
    conflictDetails?: {
      reason: string;
      entityType: string;
      serverUpdatedAt?: string | null;
      clientUpdatedAt?: string | null;
      changedFields?: Array<{
        field: string;
        serverValue: unknown;
        clientValue: unknown;
      }>;
    } | null;
  }>;
  offlineSyncHistory: Array<{
    id: string;
    url: string;
    method: string;
    queuedAt: string;
    status: 'synced' | 'failed' | 'needs-review';
    syncedAt?: string | null;
    lastError?: string | null;
  }>;
  login: (email: string, password: string, mfaCode?: string) => Promise<{
    passwordChangeRequired: boolean;
    mfaRequired?: boolean;
  }>;
  logout: () => Promise<void>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  changePassword: (newPassword: string) => Promise<void>;
  syncOfflineQueue: () => Promise<void>;
  removeOfflineQueueItem: (id: string) => void;
  clearOfflineQueue: () => void;
}

import { API_BASE } from '@/config';

type AuthContextGlobal = typeof globalThis & {
  __gtvetsAuthContext__?: ReturnType<typeof createContext<AuthContextType | null>>;
  __gtvetsAuthContextValue__?: AuthContextType | null;
};

const authContextGlobal = globalThis as AuthContextGlobal;
const AuthContext = authContextGlobal.__gtvetsAuthContext__ || createContext<AuthContextType | null>(null);
authContextGlobal.__gtvetsAuthContext__ = AuthContext;

type OfflineMutation = {
  id: string;
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  queuedAt: string;
  syncStatus?: 'pending' | 'failed' | 'needs-review';
  lastAttemptAt?: string | null;
  lastError?: string | null;
  attemptCount?: number;
  conflictDetails?: {
    reason: string;
    entityType: string;
    serverUpdatedAt?: string | null;
    clientUpdatedAt?: string | null;
    changedFields?: Array<{
      field: string;
      serverValue: unknown;
      clientValue: unknown;
    }>;
  } | null;
};

const LEGACY_OFFLINE_QUEUE_KEY = 'gtvets-offline-mutation-queue';
const LEGACY_OFFLINE_SYNC_HISTORY_KEY = 'gtvets-offline-sync-history';
const OFFLINE_STORAGE_SCOPE_KEY = 'gtvets-offline-storage-scope';

const buildOfflineQueueKey = (scope: string) => `${LEGACY_OFFLINE_QUEUE_KEY}:${scope}`;
const buildOfflineSyncHistoryKey = (scope: string) => `${LEGACY_OFFLINE_SYNC_HISTORY_KEY}:${scope}`;

const getActiveOfflineScope = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(OFFLINE_STORAGE_SCOPE_KEY);
};

const setActiveOfflineScope = (scope: string | null) => {
  if (typeof window === 'undefined') return;
  if (scope) {
    window.localStorage.setItem(OFFLINE_STORAGE_SCOPE_KEY, scope);
    return;
  }

  window.localStorage.removeItem(OFFLINE_STORAGE_SCOPE_KEY);
};

const clearLegacyOfflineStorage = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LEGACY_OFFLINE_QUEUE_KEY);
  window.localStorage.removeItem(LEGACY_OFFLINE_SYNC_HISTORY_KEY);
};

const readOfflineQueue = (scope = getActiveOfflineScope()): OfflineMutation[] => {
  if (typeof window === 'undefined') return [];
  if (!scope) return [];
  try {
    const raw = window.localStorage.getItem(buildOfflineQueueKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeOfflineQueue = (queue: OfflineMutation[], scope = getActiveOfflineScope()) => {
  if (typeof window === 'undefined') return;
  if (!scope) return;
  window.localStorage.setItem(buildOfflineQueueKey(scope), JSON.stringify(queue));
};

const readOfflineSyncHistory = (scope = getActiveOfflineScope()) => {
  if (typeof window === 'undefined') return [];
  if (!scope) return [];
  try {
    const raw = window.localStorage.getItem(buildOfflineSyncHistoryKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeOfflineSyncHistory = (history: Array<{
  id: string;
  url: string;
  method: string;
  queuedAt: string;
  status: 'synced' | 'failed' | 'needs-review';
  syncedAt?: string | null;
  lastError?: string | null;
}>, scope = getActiveOfflineScope()) => {
  if (typeof window === 'undefined') return;
  if (!scope) return;
  window.localStorage.setItem(buildOfflineSyncHistoryKey(scope), JSON.stringify(history.slice(0, 25)));
};

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
};

const isQueueableMutation = (url: string, options: RequestInit = {}) => (
  supportsOfflineAction(url, (options.method || 'GET').toUpperCase())
  && typeof options.body === 'string'
);
const SESSION_SNAPSHOT_KEY = 'gtvets-offline-session';
const saveOfflineSession = (sessionUser: User) => {
  try {
    if (!sessionUser.inspection && !sessionUser.passwordChangeRequired) {
      localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify({ user: sessionUser, savedAt: Date.now() }));
    } else localStorage.removeItem(SESSION_SNAPSHOT_KEY);
  } catch { /* Offline snapshots are optional; online sign-in must still work. */ }
};
const cachedOfflineUser = (): User | null => {
  try {
    const snapshot = JSON.parse(localStorage.getItem(SESSION_SNAPSHOT_KEY) || 'null');
    if (snapshot && Date.now() - snapshot.savedAt < 24 * 60 * 60 * 1000 && !snapshot.user.inspection && !snapshot.user.passwordChangeRequired
      && ['Admin', 'Manager', 'Staff', 'IndustryPartner'].includes(snapshot.user.role)
      && getActiveOfflineScope() === `user:${snapshot.user._id}`) return snapshot.user;
  } catch { /* Invalid local data is not a session. */ }
  return null;
};

const getOfflineScopeForUser = (sessionUser?: Pick<User, '_id' | 'inspection'> | null) => (
  sessionUser?._id && !sessionUser.inspection ? `user:${sessionUser._id}` : null
);

const mapOfflineQueueState = (queue: OfflineMutation[]) => (
  queue.map(({ id, url, method, queuedAt, body, syncStatus, lastAttemptAt, lastError, attemptCount, conflictDetails }) => ({
    id,
    url,
    method,
    queuedAt,
    body,
    syncStatus: syncStatus || 'pending',
    lastAttemptAt,
    lastError,
    attemptCount,
    conflictDetails: conflictDetails || null,
  }))
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const token: string | null = null;
  const [isLoading, setIsLoading] = useState(true);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState<boolean>(
    localStorage.getItem('passwordChangeRequired') === 'true'
  );
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(readOfflineQueue().length);
  const [offlineQueue, setOfflineQueue] = useState<Array<{
    id: string;
    url: string;
    method: string;
    queuedAt: string;
    body: string;
    syncStatus: 'pending' | 'failed' | 'needs-review';
    lastAttemptAt?: string | null;
    lastError?: string | null;
    attemptCount?: number;
    conflictDetails?: {
      reason: string;
      entityType: string;
      serverUpdatedAt?: string | null;
      clientUpdatedAt?: string | null;
      changedFields?: Array<{
        field: string;
        serverValue: unknown;
        clientValue: unknown;
      }>;
    } | null;
  }>>(
    readOfflineQueue().map(({ id, url, method, queuedAt, body, syncStatus, lastAttemptAt, lastError, attemptCount, conflictDetails }) => ({
      id,
      url,
      method,
      queuedAt,
      body,
      syncStatus: syncStatus || 'pending',
      lastAttemptAt,
      lastError,
      attemptCount,
      conflictDetails: conflictDetails || null,
    }))
  );
  const [offlineSyncHistory, setOfflineSyncHistory] = useState(readOfflineSyncHistory());
  const [isSyncingOfflineQueue, setIsSyncingOfflineQueue] = useState(false);
  const syncInFlightRef = useRef(false);
  const isLoggingInRef = useRef(false);
  const offlineScopeRef = useRef<string | null>(null);

  const loadOfflineState = useCallback((scope = offlineScopeRef.current) => {
    const queue = readOfflineQueue(scope);
    const history = readOfflineSyncHistory(scope);
    setOfflineQueueCount(queue.length);
    setOfflineQueue(mapOfflineQueueState(queue));
    setOfflineSyncHistory(history);
  }, []);

  const activateOfflineScope = useCallback((scope: string | null) => {
    offlineScopeRef.current = scope;
    setActiveOfflineScope(scope);
    loadOfflineState(scope);
  }, [loadOfflineState]);

  const hydrateSessionUser = useCallback(async (fallbackUser?: User | null) => {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Invalid session');
    }

    const hydratedUser = await response.json();
    const requiresPasswordChange = Boolean(hydratedUser?.passwordChangeRequired);
    setPasswordChangeRequired(requiresPasswordChange);
    if (requiresPasswordChange) localStorage.setItem('passwordChangeRequired', 'true');
    else localStorage.removeItem('passwordChangeRequired');
    setUser(hydratedUser || fallbackUser || null);
    if (hydratedUser) saveOfflineSession(hydratedUser);
    activateOfflineScope(getOfflineScopeForUser(hydratedUser || fallbackUser || null));
    return hydratedUser as User;
  }, [activateOfflineScope]);

  useEffect(() => {
    clearLegacyOfflineStorage();
  }, []);

  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === AUTH_CONTEXT_KEY) window.location.reload(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  // Load user from session cookie on mount (skipped during login to avoid race conditions)
  useEffect(() => {
    if (isLoggingInRef.current) return;

    let isMounted = true;
    fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) {
          localStorage.removeItem(SESSION_SNAPSHOT_KEY);
          throw new Error('Invalid session');
        }
        return res.json();
      })
      .then(userData => {
        if (isMounted) {
            setUser(userData);
            saveOfflineSession(userData);
            const requiresPasswordChange = Boolean(userData.passwordChangeRequired);
            setPasswordChangeRequired(requiresPasswordChange);
            if (requiresPasswordChange) localStorage.setItem('passwordChangeRequired', 'true');
            else localStorage.removeItem('passwordChangeRequired');
            activateOfflineScope(getOfflineScopeForUser(userData));
            setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
            const cachedUser = !navigator.onLine ? cachedOfflineUser() : null;
            if (cachedUser) {
              setUser(cachedUser);
              activateOfflineScope(getOfflineScopeForUser(cachedUser));
              setIsLoading(false);
              return;
            }
            localStorage.removeItem(SESSION_SNAPSHOT_KEY);
            setActiveOfflineScope(null);
            setUser(null);
            clearOfflineConflictBridge();
            loadOfflineState(null);
            setIsLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [activateOfflineScope, loadOfflineState]);

  const login = useCallback(async (email: string, password: string, mfaCode?: string) => {
    // Always rotate the CSRF token before login. This prevents a token left by
    // a previous browser session from being reused after logout.
    const csrfToken = await ensureCsrfToken(true);
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ email, password, mfaCode }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Login failed');
    if (data.mfaRequired) return { passwordChangeRequired: false, mfaRequired: true };
    if (!data.user) throw new Error('Login failed');

    // Prevent the token useEffect from racing with login hydration
    isLoggingInRef.current = true;

    // Clear previous session's cached queries before setting new user
    queryClient.clear();

    // Set user immediately from login response so the correct dashboard
    // renders on navigation — avoids showing the previous user's stale data
    setUser(data.user);
    activateOfflineScope(getOfflineScopeForUser(data.user));
    setIsLoading(true);

    // Handle password change requirement
    if (data.passwordChangeRequired) {
      localStorage.setItem('passwordChangeRequired', 'true');
      setPasswordChangeRequired(true);
    } else {
      localStorage.removeItem('passwordChangeRequired');
      setPasswordChangeRequired(false);
    }

    try {
      // Hydrate with full server data (populated fields like partnerId)
      await hydrateSessionUser(data.user);
    } finally {
      setIsLoading(false);
      isLoggingInRef.current = false;
    }

    return { passwordChangeRequired: data.passwordChangeRequired || false, mfaRequired: false };
  }, [activateOfflineScope, hydrateSessionUser, queryClient]);

  const logout = useCallback(async () => {
    if (user?.inspection || localStorage.getItem(INSPECTION_KEY) === 'true') {
      await endInspection();
      return;
    }
    const csrfToken = await ensureCsrfToken();

    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.getRegistration('/').catch(() => undefined);
      const subscription = await registration?.pushManager.getSubscription().catch(() => null);
      if (subscription) {
        await fetch(`${API_BASE}/push/subscribe`, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined);
        await subscription.unsubscribe().catch(() => false);
      }
    }

    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    }).catch(() => undefined);

    localStorage.removeItem('passwordChangeRequired');
    clearLegacyOfflineStorage();
    queryClient.clear();
    setUser(null);
    localStorage.removeItem(SESSION_SNAPSHOT_KEY);
    clearOfflineConflictBridge();
    setActiveOfflineScope(null);
    setOfflineQueue([]);
    setOfflineQueueCount(0);
    setOfflineSyncHistory([]);
    setPasswordChangeRequired(false);
    setIsLoading(false);
  }, [queryClient, user?.inspection]);

  const syncOfflineQueue = useCallback(async () => {
    if (!user || user.inspection || localStorage.getItem(INSPECTION_KEY) === 'true' || typeof window === 'undefined' || !window.navigator.onLine || syncInFlightRef.current) {
      return;
    }

    const activeScope = getActiveOfflineScope();
    if (activeScope !== getOfflineScopeForUser(user)) return;
    const queuedRequests = readOfflineQueue(activeScope);
    if (!queuedRequests.length) {
      setOfflineQueueCount(0);
      setOfflineQueue([]);
      return;
    }

    syncInFlightRef.current = true;
    setIsSyncingOfflineQueue(true);

    let syncedCount = 0;
    try {
      await offlineLock(`sync:${activeScope}`, async () => {
        const csrfToken = await ensureCsrfToken();
        for (const request of readOfflineQueue(activeScope)) {
          if (getActiveOfflineScope() !== activeScope) break;
          if (request.syncStatus === 'needs-review') continue;
          if (!readOfflineQueue(activeScope).some(item => item.id === request.id)) continue;
          let updatedRequest: OfflineMutation | null = null;
          let stop = false;
          try {
            if (!supportsOfflineAction(request.url, request.method) || !request.headers['X-Offline-Action']) {
              updatedRequest = { ...request, syncStatus: 'needs-review', lastError: 'This older action cannot be retried safely. Check the server record before submitting again.' };
            } else {
              const response = await fetch(request.url, {
                method: request.method,
                headers: { ...request.headers, 'X-Session-User': user._id, 'X-CSRF-Token': csrfToken },
                credentials: 'include', body: request.body, signal: AbortSignal.timeout(30000),
              });
              if (response.ok) {
                syncedCount += 1;
              } else {
                const payload = await response.json().catch(() => ({}));
                stop = response.status === 401 || payload.code === 'SESSION_CONTEXT_CHANGED' || payload.code === 'PASSWORD_CHANGE_REQUIRED';
                updatedRequest = {
                  ...request,
                  syncStatus: response.status >= 400 && response.status < 500 && !stop && response.status !== 429 ? 'needs-review' : 'failed',
                  lastError: payload.message || `Sync failed (HTTP ${response.status})`, conflictDetails: payload.conflict || null,
                };
              }
            }
          } catch {
            updatedRequest = { ...request, syncStatus: 'failed', lastError: 'Connection interrupted. Your action remains saved for retry.' };
            stop = true;
          }
          const attemptedAt = new Date().toISOString();
          if (updatedRequest) updatedRequest = { ...updatedRequest, lastAttemptAt: attemptedAt, attemptCount: (request.attemptCount || 0) + 1 };
          await offlineLock(`storage:${activeScope}`, async () => {
            const latest = readOfflineQueue(activeScope);
            writeOfflineQueue(latest.flatMap(item => item.id !== request.id ? [item] : updatedRequest ? [updatedRequest] : []), activeScope);
            const history = readOfflineSyncHistory(activeScope);
            history.unshift({ id: request.id, url: request.url, method: request.method, queuedAt: request.queuedAt,
              status: updatedRequest?.syncStatus || 'synced', syncedAt: attemptedAt, lastError: updatedRequest?.lastError || null });
            writeOfflineSyncHistory(history, activeScope);
          });
          if (getActiveOfflineScope() === activeScope) loadOfflineState(activeScope);
          if (stop) break;
        }
      });
      if (syncedCount > 0) {
        void queryClient.invalidateQueries();
        toast.success(`${syncedCount} offline action${syncedCount === 1 ? '' : 's'} synced successfully.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sync. Your queued actions are still saved.');
    } finally {
      syncInFlightRef.current = false;
      setIsSyncingOfflineQueue(false);
    }

  }, [user, loadOfflineState, queryClient]);

  const removeOfflineQueueItem = useCallback((id: string) => {
    const scope = getActiveOfflineScope();
    if (!scope || scope !== offlineScopeRef.current) return;
    void offlineLock(`storage:${scope}`, async () => {
      writeOfflineQueue(readOfflineQueue(scope).filter(item => item.id !== id), scope);
      if (getActiveOfflineScope() === scope) loadOfflineState(scope);
    });
  }, [loadOfflineState]);

  const clearOfflineQueue = useCallback(() => {
    const scope = getActiveOfflineScope();
    if (!scope || scope !== offlineScopeRef.current) return;
    void offlineLock(`storage:${scope}`, async () => {
      writeOfflineQueue([], scope);
      if (getActiveOfflineScope() === scope) loadOfflineState(scope);
    });
  }, [loadOfflineState]);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if ((user?.inspection || localStorage.getItem(INSPECTION_KEY) === 'true') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return new Response(JSON.stringify({ message: 'Inspection mode is read-only. Return to Super Admin to make changes.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    const isFormData = options.body instanceof FormData;
    const queueable = isQueueableMutation(url, options);
    const actionId = queueable ? crypto.randomUUID() : null;
    const capturedScope = getOfflineScopeForUser(user);
    const cacheable = method === 'GET' && Boolean(capturedScope) && (
      /^\/api\/learners\/options(?:\?|$)/.test(url)
      || url === '/api/attendance-logs/learner-options'
      || url === '/api/partner-portal/placements?status=Active'
    );
    const optionScope = JSON.stringify([user?.role, user?.institution, user?.region, user?.partnerId?._id]);
    const cacheKey = `gtvets-offline-options:${capturedScope}:${optionScope}:${url}`;
    const cachedResponse = () => {
      if (!cacheable || navigator.onLine || getActiveOfflineScope() !== capturedScope) return null;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000) {
          return new Response(cached.body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': 'true' } });
        }
      } catch { /* Missing or invalid offline data needs an online refresh. */ }
      return null;
    };
    let csrfToken: string | null = null;
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...normalizeHeaders(options.headers),
      ...(actionId ? { 'X-Offline-Action': actionId } : {}),
      ...(user?._id ? { 'X-Session-User': user._id } : {}),
    };

    try {
      const cached = cachedResponse();
      if (cached) return cached;
      if (queueable && !navigator.onLine) throw new Error('Offline');
      csrfToken = !['GET', 'HEAD', 'OPTIONS'].includes(method) ? await ensureCsrfToken() : null;
      if (csrfToken) Object.assign(headers, { 'X-CSRF-Token': csrfToken });
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
        ...(queueable && !options.signal ? { signal: AbortSignal.timeout(30000) } : {}),
      });
      if (cacheable && response.ok && getActiveOfflineScope() === capturedScope) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ body: await response.clone().text(), savedAt: Date.now() }));
        } catch { /* Storage exhaustion must not prevent online work. */ }
      }

      if (response.status === 401) {
        localStorage.removeItem('passwordChangeRequired');
        queryClient.clear();
        setUser(null);
        localStorage.removeItem(SESSION_SNAPSHOT_KEY);
        clearOfflineConflictBridge();
        setPasswordChangeRequired(false);
        setActiveOfflineScope(null);
        setOfflineQueue([]);
        setOfflineQueueCount(0);
        setOfflineSyncHistory([]);
      }
      if (response.status === 403) {
        const payload = await response.clone().json().catch(() => ({}));
        if (payload.code === 'PASSWORD_CHANGE_REQUIRED') {
          localStorage.setItem('passwordChangeRequired', 'true');
          setPasswordChangeRequired(true);
        }
      }
      if (response.status === 409) {
        const payload = await response.clone().json().catch(() => ({}));
        if (payload.code === 'SESSION_CONTEXT_CHANGED') window.location.reload();
      }

      if (response.ok && queueable) {
        const bridge = getOfflineConflictBridge();
        if (bridge?.queueId && bridge.userId === user?._id && bridge.requestUrl === url && bridge.requestMethod === method) {
          await offlineLock(`storage:${capturedScope}`, async () => {
            writeOfflineQueue(readOfflineQueue(capturedScope).filter(item => item.id !== bridge.queueId), capturedScope);
          });
          if (getActiveOfflineScope() === capturedScope) loadOfflineState(capturedScope);
        }
      }
      return response;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (!user?.inspection && localStorage.getItem(INSPECTION_KEY) !== 'true' && isQueueableMutation(url, options)) {
        const activeScope = getActiveOfflineScope();
        if (!activeScope || activeScope !== capturedScope) {
          throw error;
        }

        const queuedRequest: OfflineMutation = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          url,
          method,
          body: options.body as string,
          headers: { 'Content-Type': 'application/json', 'X-Offline-Action': actionId! },
          queuedAt: new Date().toISOString(),
          syncStatus: 'pending',
          lastAttemptAt: null,
          lastError: null,
          attemptCount: 0,
          conflictDetails: null,
        };
        await offlineLock(`storage:${activeScope}`, async () => {
          const queue = readOfflineQueue(activeScope);
          const bridge = getOfflineConflictBridge();
          const retained = bridge?.queueId && bridge.userId === user?._id && bridge.requestUrl === url && bridge.requestMethod === method ? queue.filter(item => item.id !== bridge.queueId) : queue;
          retained.push(queuedRequest);
          writeOfflineQueue(retained, activeScope);
        });
        if (getActiveOfflineScope() === activeScope) loadOfflineState(activeScope);

        return new Response(
          JSON.stringify({
            offlineQueued: true,
            queuedAt: queuedRequest.queuedAt,
            message: 'Saved offline. It will sync automatically when connectivity returns.',
          }),
          {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw error;
    }
  }, [queryClient, user, loadOfflineState]);

  const changePassword = useCallback(async (newPassword: string, currentPassword?: string) => {
    const res = await authFetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword, ...(currentPassword ? { currentPassword } : {}) }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to change password');
    }

    localStorage.removeItem('passwordChangeRequired');
    setPasswordChangeRequired(false);
    queryClient.clear();
    await hydrateSessionUser(user);
  }, [authFetch, hydrateSessionUser, queryClient, user]);

  useEffect(() => {
    if (!user) return;
    syncOfflineQueue();
  }, [user, syncOfflineQueue]);

  useEffect(() => {
    const handleOnline = () => {
      void hydrateSessionUser().then(() => syncOfflineQueue()).catch(() => undefined);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncOfflineQueue, hydrateSessionUser]);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === OFFLINE_STORAGE_SCOPE_KEY && event.newValue !== offlineScopeRef.current) {
        window.location.reload();
        return;
      }
      if (event.key?.startsWith(LEGACY_OFFLINE_QUEUE_KEY) || event.key?.startsWith(LEGACY_OFFLINE_SYNC_HISTORY_KEY)) loadOfflineState();
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [loadOfflineState]);

  const contextValue: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !passwordChangeRequired,
    isLoading,
    passwordChangeRequired,
    offlineQueueCount,
    offlineQueue,
    offlineSyncHistory,
    isSyncingOfflineQueue,
    login,
    logout,
    authFetch,
    changePassword,
    syncOfflineQueue,
    removeOfflineQueueItem,
    clearOfflineQueue,
  };
  authContextGlobal.__gtvetsAuthContextValue__ = contextValue;

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context) {
    return context;
  }

  const fallbackContext = authContextGlobal.__gtvetsAuthContextValue__;
  if (fallbackContext) {
    return fallbackContext;
  }

  throw new Error('useAuth must be used within an AuthProvider');
}
