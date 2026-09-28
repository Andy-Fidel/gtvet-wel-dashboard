import { API_BASE } from '@/config'

const RETRY_DELAYS_MS = [250, 650]
const TRANSIENT_STATUSES = new Set([502, 503, 504])

let csrfRequestInFlight: Promise<string> | null = null

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export const getCsrfTokenFromCookie = () => {
  if (typeof document === 'undefined') return null
  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('gtvets_csrf='))
  if (!cookie) return null
  return decodeURIComponent(cookie.slice('gtvets_csrf='.length))
}

const responseMessage = async (response: Response) => {
  const payload = await response.json().catch(() => ({})) as { message?: unknown }
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim()
  if (response.status === 429) return 'Too many authentication attempts. Please wait and try again.'
  if (response.status === 503) return 'The service is unavailable. Check your connection and try again.'
  if (response.status === 502 || response.status === 504) return 'The security service is temporarily unavailable. Please try again.'
  return `Unable to initialize security token (HTTP ${response.status}).`
}

const recordFailure = (error: unknown, status?: number) => {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'warn',
    event: 'csrf_initialization_failed',
    status: status || null,
    online: typeof navigator === 'undefined' ? null : navigator.onLine,
    message: error instanceof Error ? error.message : String(error),
  }))
}

const requestCsrfToken = async () => {
  let finalError: Error = new Error('Unable to connect to the server. Check your connection and try again.')
  let finalStatus: number | undefined

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}/auth/csrf`, {
        credentials: 'include',
        cache: 'no-store',
      })

      if (response.ok) {
        const payload = await response.json().catch(() => ({})) as { csrfToken?: unknown }
        const token = typeof payload.csrfToken === 'string' ? payload.csrfToken : getCsrfTokenFromCookie()
        if (token) return token
        finalError = new Error('The server did not provide a security token. Please try again.')
        break
      }

      finalStatus = response.status
      finalError = new Error(await responseMessage(response))
      if (!TRANSIENT_STATUSES.has(response.status) || attempt === RETRY_DELAYS_MS.length) break
    } catch {
      finalError = new Error(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'You are offline. Reconnect and try again.'
          : 'Unable to connect to the server. Check your connection and try again.'
      )
      if (attempt === RETRY_DELAYS_MS.length) break
    }

    await sleep(RETRY_DELAYS_MS[attempt])
  }

  recordFailure(finalError, finalStatus)
  throw finalError
}

export const ensureCsrfToken = async (forceRefresh = false) => {
  const existingToken = getCsrfTokenFromCookie()
  if (existingToken && !forceRefresh) return existingToken
  if (csrfRequestInFlight) return csrfRequestInFlight

  const request = requestCsrfToken()
  csrfRequestInFlight = request
  try {
    return await request
  } finally {
    if (csrfRequestInFlight === request) csrfRequestInFlight = null
  }
}
