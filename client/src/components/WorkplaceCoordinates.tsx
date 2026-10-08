import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'

import { type TownLocation } from '@/lib/workplaceCoordinates'

type LocationResult = TownLocation

export function WorkplaceCoordinates({ lat, lng, onChange, disabled = false, townLocation, onTownChange }: {
  lat: string; lng: string; onChange: (lat: string, lng: string) => void; disabled?: boolean
  townLocation?: TownLocation | null; onTownChange?: (value: TownLocation | null) => void
}) {
  const [error, setError] = useState('')
  const [capturing, setCapturing] = useState(false)
  const { authFetch } = useAuth()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [results, setResults] = useState<LocationResult[] | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const search = async () => {
    const text = query.trim()
    if (text.length < 3) { setSearchError('Enter at least 3 characters.'); return }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setSearching(true); setSearchError(''); setResults(null)
    try {
      const response = await authFetch(`/api/workplace-location-search?q=${encodeURIComponent(text)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not search locations. Try again.')
      if (!controller.signal.aborted) setResults(data.results)
    } catch (failure) {
      if (!controller.signal.aborted) setSearchError(failure instanceof Error ? failure.message : 'Could not search locations. Try again.')
    } finally {
      if (!controller.signal.aborted) setSearching(false)
    }
  }
  const capture = () => {
    if (!navigator.geolocation) { setError('Location is unavailable. Enter workplace coordinates manually.'); return }
    setCapturing(true); setError('')
    navigator.geolocation.getCurrentPosition(position => {
      onChange(String(position.coords.latitude), String(position.coords.longitude)); setCapturing(false)
    }, () => { setError('Could not capture location. Allow location access or enter coordinates manually.'); setCapturing(false) },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border p-4">
    <legend className="px-1 text-sm font-semibold">Workplace location</legend>
    <p className="text-sm text-gray-600">Choose a town for a general location. Capture exact workplace GPS later for visit verification. Use my location only while physically at that site.</p>
    <div className="space-y-2">
      <label htmlFor={searchId} className="text-sm font-medium">Search an area or town in Ghana</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={searchId} value={query} maxLength={160} placeholder="e.g. Adenta, Accra or Kumasi, Ashanti" aria-describedby={`${searchId}-hint`} onChange={event => {
          request.current?.abort(); setSearching(false); setResults(null); setSearchError(''); setQuery(event.target.value)
        }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!disabled && !searching) void search() } }} />
        <Button type="button" variant="outline" disabled={disabled || searching || query.trim().length < 3} onClick={() => void search()}>{searching ? 'Searching…' : 'Search Ghana'}</Button>
      </div>
      <p id={`${searchId}-hint`} className="text-xs text-gray-600">Town locations are approximate. Search only public town or area names; do not enter personal details or private addresses. Searches use OpenStreetMap.</p>
      {searchError && <p role="alert" className="text-sm text-red-600">{searchError}</p>}
      {results !== null && <div className="space-y-2 rounded-lg border bg-gray-50 p-3" aria-live="polite">
        <a className="text-xs text-gray-600 underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
        {results.length === 0 ? <p className="text-sm">No matching locations in Ghana. Try adding the region or district.</p> : <ul className="space-y-3">{results.map(result => <li key={`${result.osmType}-${result.osmId}`}>
          <p className="text-sm font-medium">{result.name}</p>
          <p className="text-xs text-gray-600">Approximate town location: {result.lat}, {result.lng}</p>
          <a className="text-sm font-medium text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${result.lat}&mlon=${result.lng}#map=13/${result.lat}/${result.lng}`}>View town on map</a>
        {onTownChange && <Button type="button" variant="outline" className="ml-2" onClick={() => onTownChange(result)}>Use this town</Button>}
        </li>)}</ul>}
      </div>}
    </div>
    {townLocation && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
      <strong>Approximate town location</strong><p>{townLocation.name}</p>
      <p className="text-xs">{townLocation.lat}, {townLocation.lng} · Used for general location only; not for visit verification.</p>
      <a className="text-xs underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
      {onTownChange && <Button type="button" variant="ghost" onClick={() => onTownChange(null)}>Remove town location</Button>}
    </div>}
    <p className="text-sm font-medium">Exact workplace GPS (optional at registration)</p>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm">Latitude<Input type="number" step="any" min={-90} max={90} value={lat} onChange={event => onChange(event.target.value, lng)} /></label>
      <label className="text-sm">Longitude<Input type="number" step="any" min={-180} max={180} value={lng} onChange={event => onChange(lat, event.target.value)} /></label>
    </div>
    <Button type="button" variant="outline" disabled={capturing || disabled} onClick={capture}>{capturing ? 'Capturing…' : 'Use my location'}</Button>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </fieldset>
}
