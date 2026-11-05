export function safeActionCentreReturn(value: string | null) {
  const fallback = '/system-overview?view=operations'
  if (!value || !value.startsWith('/system-overview?')) return fallback
  const url = new URL(value, 'https://portal.invalid')
  if (url.origin !== 'https://portal.invalid' || url.pathname !== '/system-overview') return fallback
  const params = new URLSearchParams()
  for (const key of ['view', 'actionCategory', 'actionPage']) {
    const item = url.searchParams.get(key)
    if (item) params.set(key, item)
  }
  return `/system-overview?${params}`
}
export function withActionReturn(target: string, returnPath: string) {
  const url = new URL(target, 'https://portal.invalid')
  if (url.origin !== 'https://portal.invalid') throw new Error('Action target must be inside the portal')
  url.searchParams.set('from', 'hq-action-centre')
  url.searchParams.set('returnTo', safeActionCentreReturn(returnPath))
  return `${url.pathname}${url.search}`
}
