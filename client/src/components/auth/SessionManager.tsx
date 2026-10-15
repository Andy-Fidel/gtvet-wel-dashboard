import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, LockKeyhole, Timer } from 'lucide-react';
import { API_BASE } from '@/config';
import { ensureCsrfToken } from '@/lib/csrf';

export const SESSION_TIMING_KEY = 'gtvets-session-deadlines';
export interface SessionTiming {
  id: string;
  userId: string;
  expiresAt: number;
  idleExpiresAt: number;
  serverNow: number;
  warningMs: number;
  clockOffset?: number;
}

interface Props {
  user: { _id: string; email: string; inspection?: unknown; session?: SessionTiming };
  locked: boolean;
  onLock: () => void;
  onResume: (password: string, mfaCode?: string) => Promise<{ mfaRequired?: boolean }>;
  onLogout: () => Promise<void>;
}

const buttonClass = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFB800] px-5 py-3 font-bold text-slate-900 hover:bg-[#FFD700] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50';
const inputClass = 'mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500';
const validTiming = (value: SessionTiming | null | undefined, userId: string): value is SessionTiming => Boolean(
  value && value.userId === userId && typeof value.id === 'string'
  && Number.isFinite(value.expiresAt) && Number.isFinite(value.idleExpiresAt) && Number.isFinite(value.serverNow),
);

export function SessionManager({ user, locked, onLock, onResume, onLogout }: Props) {
  const [timing, setTiming] = useState<SessionTiming | null>(null);
  const requestGeneration = useRef(0);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [dismissedAbsoluteDeadline, setDismissedAbsoluteDeadline] = useState<number | null>(null);
  const generation = user.session?.id;

  const acceptTiming = useCallback((value: SessionTiming, fromStorage = false) => {
    if (!validTiming(value, user._id)) return;
    const next = { ...value, clockOffset: fromStorage ? value.clockOffset || 0 : value.serverNow - Date.now() };
    setTiming(next);
    if (!fromStorage) {
      try { localStorage.setItem(SESSION_TIMING_KEY, JSON.stringify(next)); } catch { /* Server enforcement does not rely on local storage. */ }
    }
  }, [user._id]);

  const refresh = useCallback(async (activity = false) => {
    const version = requestGeneration.current;
    try {
      const csrfToken = activity ? await ensureCsrfToken() : null;
      const response = await fetch(`${API_BASE}/auth/session${activity ? '/activity' : ''}`, {
        method: activity ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000),
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      });
      if (version !== requestGeneration.current) return false;
      if (response.status === 401) { onLock(); return false; }
      if (!response.ok) throw new Error('Unable to confirm your session. Check your connection and try again.');
      const payload = await response.json();
      if (version !== requestGeneration.current) return false;
      acceptTiming(payload);
      return true;
    } catch (cause) {
      if (activity) throw cause;
      // A network failure never grants more time; the last server deadlines still apply.
      return false;
    }
  }, [acceptTiming, onLock]);

  useEffect(() => {
    if (user.session && navigator.onLine) acceptTiming(user.session);
    else {
      try {
        const stored = JSON.parse(localStorage.getItem(SESSION_TIMING_KEY) || 'null');
        if (validTiming(stored, user._id)) acceptTiming(stored, true);
        else if (user.session) acceptTiming(user.session, true);
      } catch { /* Ignore invalid local data. */ }
    }
    void refresh();
    const poll = window.setInterval(() => { if (!locked) void refresh(); }, 60000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const visible = () => {
      if (document.visibilityState === 'visible') { setNow(Date.now()); if (!locked) void refresh(); }
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== SESSION_TIMING_KEY || !event.newValue) return;
      try {
        const stored = JSON.parse(event.newValue);
        if (validTiming(stored, user._id)) acceptTiming(stored, true);
      } catch { /* Ignore invalid local data. */ }
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('storage', storage);
    return () => {
      requestGeneration.current += 1;
      clearInterval(poll); clearInterval(clock);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('storage', storage);
    };
    // Session ID changes after reauthentication; unrelated user hydration must not reset deadlines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, user._id, locked, acceptTiming, refresh]);

  const remaining = timing ? Math.min(timing.expiresAt, timing.idleExpiresAt) - now - (timing.clockOffset || 0) : Infinity;
  const absoluteWarning = Boolean(timing && timing.expiresAt <= timing.idleExpiresAt);
  const warning = !locked && remaining > 0 && remaining <= (timing?.warningMs || 120000)
    && !(absoluteWarning && dismissedAbsoluteDeadline === timing?.expiresAt);
  const secondsRemaining = Math.ceil(Math.max(0, remaining) / 1000);

  useEffect(() => { if (remaining <= 0 && !locked) onLock(); }, [remaining, locked, onLock]);

  useEffect(() => {
    if (locked || warning || user.inspection) return;
    let lastInteraction = 0;
    let inFlight = false;
    let lastSent = Date.now();
    const send = async () => {
      if (!lastInteraction || Date.now() - lastInteraction > 60000 || inFlight || document.visibilityState !== 'visible') return;
      lastInteraction = 0; inFlight = true; lastSent = Date.now();
      try { await refresh(true); } catch { /* Keep the existing deadline on failure. */ }
      finally { inFlight = false; }
    };
    const activity = (event: Event) => {
      if (!event.isTrusted) return;
      lastInteraction = Date.now();
      if (Date.now() - lastSent >= 60000) void send();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach(name => window.addEventListener(name, activity, { passive: true }));
    const interval = window.setInterval(() => { if (Date.now() - lastSent >= 60000) void send(); }, 15000);
    return () => { clearInterval(interval); events.forEach(name => window.removeEventListener(name, activity)); };
  }, [locked, warning, user.inspection, refresh]);

  const continueSession = async () => {
    setBusy(true); setError('');
    try { await refresh(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to extend your session.'); }
    finally { setBusy(false); }
  };

  const resume = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await onResume(password, needsMfa ? mfaCode.trim() : undefined);
      if (result.mfaRequired) { setNeedsMfa(true); return; }
      setPassword(''); setMfaCode(''); setNeedsMfa(false);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true); setError('');
    try { await onLogout(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign out.'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog.Root open={locked || warning}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-[300] ${locked ? 'bg-slate-950' : 'bg-slate-950/70 backdrop-blur-sm'}`} />
        <Dialog.Content
          onEscapeKeyDown={event => event.preventDefault()}
          onPointerDownOutside={event => event.preventDefault()}
          onInteractOutside={event => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[301] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            {locked ? <LockKeyhole aria-hidden="true" /> : <Timer aria-hidden="true" />}
          </div>
          <Dialog.Title className="text-2xl font-black text-slate-900">{locked ? 'Sign in to continue' : 'Your session is ending'}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-slate-600">
            {user.inspection ? 'This read-only inspection is ending. Return to your Super Admin account to continue.'
              : locked ? 'Your session is locked. Sign in with the same account to return to your open work. Keep this tab open to retain unsaved entries.'
              : absoluteWarning ? 'You are reaching the 8-hour session limit. Save your work before signing in again.'
              : 'You have been inactive. Stay signed in to continue working, or your session will lock.'}
          </Dialog.Description>
          {!locked && <p role="timer" aria-label="Time until session locks" className="mt-4 font-bold tabular-nums text-slate-800">{Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')} remaining</p>}
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {locked && !user.inspection ? (
            <form onSubmit={resume} className="mt-6 space-y-4" aria-busy={busy}>
              <p className="break-words text-sm font-medium text-slate-700">{user.email}</p>
              <label className="block text-sm font-medium text-slate-700" htmlFor="resume-password">Password
                <input id="resume-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} className={inputClass} />
              </label>
              {needsMfa && <label className="block text-sm font-medium text-slate-700" htmlFor="resume-mfa">Authenticator or recovery code
                <input id="resume-mfa" autoComplete="one-time-code" required maxLength={64} value={mfaCode} onChange={event => setMfaCode(event.target.value)} disabled={busy} className={inputClass} />
              </label>}
              <button type="submit" disabled={busy} className={buttonClass}>{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Sign in and resume</button>
            </form>
          ) : !locked && !absoluteWarning && !user.inspection ? (
            <button type="button" onClick={() => void continueSession()} disabled={busy} className={`${buttonClass} mt-6`}>{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Stay signed in</button>
          ) : !locked ? <div className="mt-6 space-y-2">
            <button type="button" onClick={() => setDismissedAbsoluteDeadline(timing?.expiresAt || null)} className={buttonClass}>Return to work</button>
            <button type="button" onClick={onLock} className="min-h-11 w-full rounded-xl text-sm font-bold text-slate-700 focus-visible:ring-2 focus-visible:ring-amber-500">Sign in again</button>
          </div> : null}
          <button type="button" onClick={() => void signOut()} disabled={busy} className="mt-4 min-h-11 w-full rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">{user.inspection ? 'Return to Super Admin' : 'Sign out'}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
