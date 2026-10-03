import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useReleaseNotes } from '@/hooks/useReleaseNotes'
import { formatReleaseDate, relevantChange, releases } from '@/lib/releaseNotes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const styles: Record<string, string> = {
  New: 'bg-blue-100 text-blue-800', Improved: 'bg-amber-100 text-amber-900', Fixed: 'bg-emerald-100 text-emerald-800',
}

export default function WhatsNew() {
  const { user } = useAuth()
  const { hasUnread, markRead } = useReleaseNotes(user?._id, Boolean(user?.inspection))
  const [forMyRole, setForMyRole] = useState(true)
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const visible = releases.map(release => ({ ...release, changes: release.changes.filter(change => {
    if (forMyRole && !relevantChange(change, user?.role)) return false
    return !query || [release.title, release.summary, change.title, change.body, change.audience, change.kind].join(' ').toLocaleLowerCase().includes(query)
  }) })).filter(release => release.changes.length)

  return <div className="mx-auto w-full max-w-4xl space-y-6 pb-10">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-700"><Sparkles aria-hidden="true" className="h-5 w-5" /> Portal updates</div>
      <h1 className="text-3xl font-black tracking-tight text-slate-950">What’s new</h1>
      <p className="mt-3 max-w-2xl text-slate-600">New features, useful improvements, and fixes—explained for the people who use the WEL portal.</p>
      {!user?.inspection && <Button variant="outline" className="mt-5" disabled={!hasUnread} onClick={markRead}><Check className="h-4 w-4" />{hasUnread ? 'Mark latest update as read' : 'You’re up to date'}</Button>}
      <p className="mt-2 text-xs text-slate-500">Your reading status is saved for your account in this browser. You can return to these notes at any time.</p>
    </header>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex gap-2" role="group" aria-label="Updates audience">
        <Button variant={forMyRole ? 'default' : 'outline'} aria-pressed={forMyRole} onClick={() => setForMyRole(true)}>For my role</Button>
        <Button variant={!forMyRole ? 'default' : 'outline'} aria-pressed={!forMyRole} onClick={() => setForMyRole(false)}>All updates</Button>
      </div>
      <div className="w-full sm:max-w-xs"><label htmlFor="release-search" className="mb-1 block text-sm font-medium text-slate-700">Search updates</label><Input id="release-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try partner approvals" /></div>
    </div>
    <p role="status" className="text-sm text-slate-500">{visible.length} {visible.length === 1 ? 'release' : 'releases'} shown · Newest first</p>
    {visible.length ? visible.map(release => <article key={release.id} aria-labelledby={`release-${release.id}`} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 bg-slate-50 p-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600"><time dateTime={release.date}>{formatReleaseDate(release.date)}</time>{release.id === releases[0].id && <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-800">Latest release</span>}</div>
        <h2 id={`release-${release.id}`} className="mt-3 text-xl font-bold text-slate-950">{release.title}</h2>
        <p className="mt-2 text-slate-600">{release.summary}</p>
      </header>
      <ul className="divide-y divide-slate-100">{release.changes.map(change => <li key={change.title} className="p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-3 py-1 font-bold ${styles[change.kind]}`}>{change.kind}</span><span className="text-slate-500">For {change.audience.toLocaleLowerCase()}</span></div>
        <h3 className="mt-3 font-bold text-slate-900">{change.title}</h3>
        <p className="mt-2 leading-relaxed text-slate-600">{change.body}</p>
        {change.action && relevantChange(change, user?.role) && <Link to={change.action.path} className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold text-blue-700 underline underline-offset-4">{change.action.label}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>}
      </li>)}</ul>
    </article>) : <div className="rounded-2xl border border-dashed bg-white p-8 text-center"><h2 className="font-bold">No matching updates</h2><p className="mt-2 text-sm text-slate-600">Try another search or choose All updates.</p><Button variant="outline" className="mt-4" onClick={() => { setSearch(''); setForMyRole(false) }}>Show all updates</Button></div>}
  </div>
}
