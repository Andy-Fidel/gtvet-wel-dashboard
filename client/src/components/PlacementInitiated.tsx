const timestamp = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
})

export function PlacementInitiated({ createdAt, notInitiated = false, hideLabel = false }: { createdAt?: string | null; notInitiated?: boolean; hideLabel?: boolean }) {
  const date = createdAt ? new Date(createdAt) : null
  const valid = date && Number.isFinite(date.getTime())
  return <dl className="min-w-0 text-sm">
    <dt className={hideLabel ? "sr-only" : "text-xs font-semibold text-slate-500"}>Placement initiated</dt>
    <dd className="mt-1 break-words font-semibold text-slate-900">
      {notInitiated ? 'Not initiated' : valid ? <time dateTime={date.toISOString()}>{timestamp.format(date)} UTC</time> : 'Not recorded'}
    </dd>
  </dl>
}
