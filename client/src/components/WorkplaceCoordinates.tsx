import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function readCoordinates(lat: string, lng: string, required = false) {
  if (!lat.trim() && !lng.trim()) {
    if (required) throw new Error('Workplace latitude and longitude are required before activation.')
    return undefined
  }
  const coordinates = { lat: Number(lat), lng: Number(lng) }
  if (!lat.trim() || !lng.trim() || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)
      || Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lng) > 180) {
    throw new Error('Enter both coordinates: latitude -90 to 90 and longitude -180 to 180.')
  }
  return coordinates
}

export function WorkplaceCoordinates({ lat, lng, onChange, disabled = false }: {
  lat: string; lng: string; onChange: (lat: string, lng: string) => void; disabled?: boolean
}) {
  const [error, setError] = useState('')
  const [capturing, setCapturing] = useState(false)
  const capture = () => {
    if (!navigator.geolocation) { setError('Location is unavailable. Enter workplace coordinates manually.'); return }
    setCapturing(true); setError('')
    navigator.geolocation.getCurrentPosition(position => {
      onChange(String(position.coords.latitude), String(position.coords.longitude)); setCapturing(false)
    }, () => { setError('Could not capture location. Allow location access or enter coordinates manually.'); setCapturing(false) },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border p-4">
    <legend className="px-1 text-sm font-semibold">Workplace GPS coordinates</legend>
    <p className="text-sm text-gray-600">Use the actual workplace or branch location. Use my location only while physically at that site.</p>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm">Latitude<Input type="number" step="any" min={-90} max={90} value={lat} onChange={event => onChange(event.target.value, lng)} /></label>
      <label className="text-sm">Longitude<Input type="number" step="any" min={-180} max={180} value={lng} onChange={event => onChange(lat, event.target.value)} /></label>
    </div>
    <Button type="button" variant="outline" disabled={capturing || disabled} onClick={capture}>{capturing ? 'Capturing…' : 'Use my location'}</Button>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </fieldset>
}
