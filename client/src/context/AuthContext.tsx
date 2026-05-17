/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'SuperAdmin' | 'RegionalAdmin' | 'Admin' | 'Manager' | 'Staff' | 'IndustryPartner' | 'Guardian';
  status: string;
  institution: string;
  phone?: string;
  region?: string;
  profilePicture?: string;
  partnerId?: {
    _id: string;
    name: string;
  };
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
  login: (email: string, password: string) => Promise<{ passwordChangeRequired: boolean }>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  changePassword: (newPassword: string) => Promise<void>;
  syncOfflineQueue: () => Promise<void>;
  removeOfflineQueueItem: (id: string) => void;
  clearOfflineQueue: () => void;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  institution: string;
  role?: string;
  phone?: string;
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

const isQueueableMutation = (url: string, options: RequestInit = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
  if (!url.startsWith('/api/')) return false;
  if (url.startsWith('/api/auth/')) return false;
  if (options.body instanceof FormData) return false;
  return typeof options.body === 'string';
};

const getOfflineScopeForUser = (sessionUser?: Pick<User, '_id'> | null) => (
  sessionUser?._id ? `user:${sessionUser._id}` : null
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

  const getCsrfTokenFromCookie = useCallback(() => {
    if (typeof document === 'undefined') return null;
    const cookie = document.cookie
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('gtvets_csrf='));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice('gtvets_csrf='.length));
  }, []);

  const ensureCsrfToken = useCallback(async () => {
    const existingToken = getCsrfTokenFromCookie();
    if (existingToken) return existingToken;

    const response = await fetch(`${API_BASE}/auth/csrf`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to initialize security token');
    }
    const payload = await response.json().catch(() => ({}));
    return payload.csrfToken || getCsrfTokenFromCookie() || null;
  }, [getCsrfTokenFromCookie]);

  const loadOfflineState = useCallback((scope = getActiveOfflineScope()) => {
    const queue = readOfflineQueue(scope);
    const history = readOfflineSyncHistory(scope);
    setOfflineQueueCount(queue.length);
    setOfflineQueue(mapOfflineQueueState(queue));
    setOfflineSyncHistory(history);
  }, []);

  const activateOfflineScope = useCallback((scope: string | null) => {
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
    setUser(hydratedUser || fallbackUser || null);
    activateOfflineScope(getOfflineScopeForUser(hydratedUser || fallbackUser || null));
    return hydratedUser as User;
  }, [activateOfflineScope]);

  useEffect(() => {
    clearLegacyOfflineStorage();
  }, []);

  // Load user from session cookie on mount (skipped during login to avoid race conditions)
  useEffect(() => {
    if (isLoggingInRef.current) return;

    let isMounted = true;
    fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error('Invalid session');
        return res.json();
      })
      .then(userData => {
        if (isMounted) {
            setUser(userData);
            activateOfflineScope(getOfflineScopeForUser(userData));
            setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
            setActiveOfflineScope(null);
            setUser(null);
            loadOfflineState(null);
            setIsLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [activateOfflineScope, loadOfflineState]);

  const login = useCallback(async (email: string, password: string) => {
    const csrfToken = await ensureCsrfToken();
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Login failed');
    }

    const data = await res.json();

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

    return { passwordChangeRequired: data.passwordChangeRequired || false };
  }, [activateOfflineScope, ensureCsrfToken, hydrateSessionUser, queryClient]);

  const register = useCallback(async (registerData: RegisterData) => {
    const csrfToken = await ensureCsrfToken();
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(registerData),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Registration failed');
    }

    const data = await res.json();
    setUser(data.user);
    activateOfflineScope(getOfflineScopeForUser(data.user));
  }, [activateOfflineScope, ensureCsrfToken]);

  const logout = useCallback(async () => {
    const csrfToken = await ensureCsrfToken();
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    }).catch(() => undefined);

    localStorage.removeItem('passwordChangeRequired');
    clearLegacyOfflineStorage();
    queryClient.clear();
    setUser(null);
    setActiveOfflineScope(null);
    setOfflineQueue([]);
    setOfflineQueueCount(0);
    setOfflineSyncHistory([]);
    setPasswordChangeRequired(false);
    setIsLoading(false);
  }, [ensureCsrfToken, queryClient]);

  const syncOfflineQueue = useCallback(async () => {
    if (!user || typeof window === 'undefined' || !window.navigator.onLine || syncInFlightRef.current) {
      return;
    }

    const activeScope = getActiveOfflineScope();
    const queuedRequests = readOfflineQueue(activeScope);
    if (!queuedRequests.length) {
      setOfflineQueueCount(0);
      setOfflineQueue([]);
      return;
    }

    syncInFlightRef.current = true;
    setIsSyncingOfflineQueue(true);

    const remaining: OfflineMutation[] = [];
    const history = readOfflineSyncHistory(activeScope);
    let syncedCount = 0;
    const csrfToken = await ensureCsrfToken();

    for (const request of queuedRequests) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: {
            ...request.headers,
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          credentials: 'include',
          body: request.body,
        });

        if (response.ok) {
          syncedCount += 1;
          history.unshift({
            id: request.id,
            url: request.url,
            method: request.method,
            queuedAt: request.queuedAt,
            status: 'synced',
            syncedAt: new Date().toISOString(),
            lastError: null,
          });
        } else {
          const errorPayload = await response.json().catch(() => ({}));
          const permanentFailure = response.status >= 400 && response.status < 500;
          const updatedRequest: OfflineMutation = {
            ...request,
            syncStatus: permanentFailure ? 'needs-review' : 'failed',
            lastAttemptAt: new Date().toISOString(),
            lastError: errorPayload.message || `Sync failed with status ${response.status}`,
            attemptCount: (request.attemptCount || 0) + 1,
            conflictDetails: errorPayload.conflict || null,
          };
          remaining.push(updatedRequest);
          history.unshift({
            id: request.id,
            url: request.url,
            method: request.method,
            queuedAt: request.queuedAt,
            status: permanentFailure ? 'needs-review' : 'failed',
            syncedAt: updatedRequest.lastAttemptAt,
            lastError: updatedRequest.lastError,
          });
        }
      } catch {
        const updatedRequest: OfflineMutation = {
          ...request,
          syncStatus: 'failed',
          lastAttemptAt: new Date().toISOString(),
          lastError: 'Connection interrupted during sync',
          attemptCount: (request.attemptCount || 0) + 1,
          conflictDetails: null,
        };
        remaining.push(updatedRequest);
        history.unshift({
          id: request.id,
          url: request.url,
          method: request.method,
          queuedAt: request.queuedAt,
          status: 'failed',
          syncedAt: updatedRequest.lastAttemptAt,
          lastError: updatedRequest.lastError,
        });
      }
    }

    writeOfflineQueue(remaining, activeScope);
    writeOfflineSyncHistory(history, activeScope);
    setOfflineQueueCount(remaining.length);
    setOfflineQueue(mapOfflineQueueState(remaining));
    setOfflineSyncHistory(history.slice(0, 25));
    syncInFlightRef.current = false;
    setIsSyncingOfflineQueue(false);

    if (syncedCount > 0) {
      toast.success(`${syncedCount} offline action${syncedCount === 1 ? '' : 's'} synced successfully.`);
    }
  }, [ensureCsrfToken, user]);

  const removeOfflineQueueItem = useCallback((id: string) => {
    const nextQueue = readOfflineQueue().filter((item) => item.id !== id);
    writeOfflineQueue(nextQueue);
    setOfflineQueueCount(nextQueue.length);
    setOfflineQueue(mapOfflineQueueState(nextQueue));
  }, []);

  const clearOfflineQueue = useCallback(() => {
    writeOfflineQueue([]);
    setOfflineQueue([]);
    setOfflineQueueCount(0);
  }, []);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const isFormData = options.body instanceof FormData;
    const csrfToken = !['GET', 'HEAD', 'OPTIONS'].includes(method) ? await ensureCsrfToken() : null;
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (response.status === 401) {
        localStorage.removeItem('passwordChangeRequired');
        queryClient.clear();
        setUser(null);
        setPasswordChangeRequired(false);
        setActiveOfflineScope(null);
        setOfflineQueue([]);
        setOfflineQueueCount(0);
        setOfflineSyncHistory([]);
      }

      return response;
    } catch (error) {
      if (isQueueableMutation(url, options)) {
        const activeScope = getActiveOfflineScope();
        if (!activeScope) {
          throw error;
        }

        const queue = readOfflineQueue();
        const queuedRequest: OfflineMutation = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          url,
          method,
          body: options.body as string,
          headers: normalizeHeaders(options.headers),
          queuedAt: new Date().toISOString(),
          syncStatus: 'pending',
          lastAttemptAt: null,
          lastError: null,
          attemptCount: 0,
          conflictDetails: null,
        };
        queue.push(queuedRequest);
        writeOfflineQueue(queue, activeScope);
        setOfflineQueueCount(queue.length);
        setOfflineQueue(mapOfflineQueueState(queue));

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
  }, [ensureCsrfToken, queryClient]);

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
      syncOfflineQueue();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncOfflineQueue]);

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
    register,
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
    authContextGlobal.__gtvetsAuthContextValue__ = context;
    return context;
  }

  const fallbackContext = authContextGlobal.__gtvetsAuthContextValue__;
  if (fallbackContext) {
    return fallbackContext;
  }

  throw new Error('useAuth must be used within an AuthProvider');
}
