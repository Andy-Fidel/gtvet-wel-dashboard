import { useSyncExternalStore } from 'react'
import { latestRelease } from '@/lib/releaseNotes'

const eventName = 'gtvets-release-read'
const memory = new Map<string, string>()
const storageKey = (userId: string) => `gtvets-release-read:v1:${userId}`

function subscribe(listener: () => void) {
  const changed = (event: StorageEvent) => {
    if (event.key) memory.delete(event.key)
    else memory.clear()
    listener()
  }
  window.addEventListener(eventName, listener)
  window.addEventListener('storage', changed)
  return () => {
    window.removeEventListener(eventName, listener)
    window.removeEventListener('storage', changed)
  }
}

function read(userId?: string) {
  if (!userId) return ''
  const key = storageKey(userId)
  if (memory.has(key)) return memory.get(key) || ''
  try { return localStorage.getItem(key) || '' }
  catch { return '' }
}

export function useReleaseNotes(userId?: string, readOnly = false) {
  const seen = useSyncExternalStore(subscribe, () => read(userId), () => '')
  const markRead = () => {
    if (!userId || readOnly || seen === latestRelease.id) return
    const key = storageKey(userId)
    memory.set(key, latestRelease.id)
    try { localStorage.setItem(key, latestRelease.id) } catch { /* Dismiss for this session when storage is unavailable. */ }
    window.dispatchEvent(new Event(eventName))
  }
  return { hasUnread: Boolean(userId) && seen !== latestRelease.id, markRead }
}
