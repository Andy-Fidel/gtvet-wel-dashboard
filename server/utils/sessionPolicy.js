export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
export const SESSION_WARNING_MS = 2 * 60 * 1000;
export const RECENT_AUTH_MS = 15 * 60 * 1000;

// Clamp legacy seven-day records too; deploying the policy must not grandfather them in.
export function sessionDeadlines(session) {
  const createdAt = new Date(session.createdAt).getTime();
  const activityAt = new Date(session.lastActivityAt || session.createdAt).getTime();
  return {
    expiresAt: Math.min(new Date(session.expiresAt).getTime(), createdAt + SESSION_MAX_MS),
    idleExpiresAt: activityAt + SESSION_IDLE_MS,
  };
}

export function sessionExpired(session, now = Date.now()) {
  const { expiresAt, idleExpiresAt } = sessionDeadlines(session);
  return !Number.isFinite(expiresAt) || !Number.isFinite(idleExpiresAt)
    || now >= expiresAt || now >= idleExpiresAt;
}

export function sessionMetadata(session, now = Date.now()) {
  return { id: String(session._id), userId: String(session.userId), ...sessionDeadlines(session), serverNow: now, warningMs: SESSION_WARNING_MS };
}
