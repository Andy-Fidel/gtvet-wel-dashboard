export const supportsOfflineAction = (url: string, method: string) => (
  (method === 'POST' && /^\/api\/(monitoring-visits|attendance-logs|support-tickets)$/.test(url))
  || (method === 'PUT' && /^\/api\/(monitoring-visits|attendance-logs)\/[a-f\d]{24}$/i.test(url))
  || (method === 'POST' && /^\/api\/support-tickets\/[a-f\d]{24}\/replies$/i.test(url))
)

export const ownsOfflineDraft = (key: string, userId?: string) => Boolean(userId && (
  key.startsWith(`draft:monitoring-visit:${userId}:`)
  || key.startsWith(`draft:${userId}:attendance-log:`)
  || key.startsWith(`draft:support:${userId}:`)
))

export const offlineLock = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
  if (navigator.locks) return navigator.locks.request(`gtvets:${name}`, work)
  return work()
}
