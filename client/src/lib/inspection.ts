import { API_BASE } from '@/config'

export const INSPECTION_KEY = 'gtvets-inspection-active'
export const AUTH_CONTEXT_KEY = 'gtvets-auth-context-change'

export function switchInspectionContext(active: boolean, destination: string) {
  if (active) localStorage.setItem(INSPECTION_KEY, 'true')
  else localStorage.removeItem(INSPECTION_KEY)
  localStorage.removeItem('passwordChangeRequired')
  localStorage.removeItem('gtvets-offline-storage-scope')
  localStorage.setItem(AUTH_CONTEXT_KEY, `${Date.now()}-${Math.random()}`)
  window.location.assign(destination)
}

export async function endInspection() {
  const csrfResponse = await fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' })
  if (!csrfResponse.ok) throw new Error('Unable to initialize security token. Try again.')
  const { csrfToken } = await csrfResponse.json()
  const response = await fetch(`${API_BASE}/auth/inspection/stop`, {
    method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrfToken },
  })
  if (response.ok) switchInspectionContext(false, '/users')
  else if (response.status === 401) switchInspectionContext(false, '/login')
  else throw new Error('Unable to end inspection. Please try again.')
}
