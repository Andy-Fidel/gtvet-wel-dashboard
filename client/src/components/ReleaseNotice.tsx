import { Link, useLocation } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useReleaseNotes } from '@/hooks/useReleaseNotes'
import { latestRelease } from '@/lib/releaseNotes'
import { Button } from '@/components/ui/button'

export function ReleaseNotice() {
  const { user } = useAuth()
  const { hasUnread, markRead } = useReleaseNotes(user?._id, Boolean(user?.inspection))
  const { pathname } = useLocation()
  if (!hasUnread || user?.inspection || pathname === '/whats-new') return null
  return <aside aria-label="New portal updates" className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
    <Sparkles aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-blue-700" />
    <div className="min-w-0 flex-1">
      <p className="font-bold">There’s something new in your portal</p>
      <p className="mt-1 text-sm">{latestRelease.title}</p>
      <Link to="/whats-new" className="mt-2 inline-flex min-h-10 items-center font-semibold text-blue-800 underline underline-offset-4">Read what’s new</Link>
    </div>
    <Button variant="ghost" size="icon" onClick={markRead} aria-label="Dismiss release announcement" className="shrink-0"><X className="h-4 w-4" /></Button>
  </aside>
}
