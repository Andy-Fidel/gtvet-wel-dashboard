import notes from '@/data/releases.json'

export interface ReleaseChange {
  kind: string
  title: string
  body: string
  audience: string
  roles?: string[]
  action?: { label: string; path: string }
}
export interface Release {
  id: string
  date: string
  title: string
  summary: string
  changes: ReleaseChange[]
}

export const releases: Release[] = notes
export const latestRelease = releases[0]
export const relevantChange = (change: ReleaseChange, role?: string) => !change.roles || change.roles.includes(role || '')
export const formatReleaseDate = (date: string) => new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'long', timeZone: 'Africa/Accra',
}).format(new Date(`${date}T12:00:00Z`))
