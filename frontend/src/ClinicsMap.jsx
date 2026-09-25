import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const TYPE_COLORS = {
  hospital: '#dc2626',
  clinic: '#2563eb',
  dental_clinic: '#7c3aed',
  physiotherapy_clinic: '#059669',
  dialysis_center: '#d97706',
  diagnostic_center: '#0891b2',
  medical_center: '#4338ca',
}

function makeClinicIcon(type) {
  const color = TYPE_COLORS[type] || '#6b7280'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
    <path fill="${color}" stroke="white" stroke-width="1.5" d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26S28 23.333 28 14C28 6.268 21.732 0 14 0z"/>
    <circle cx="14" cy="14" r="7" fill="white" opacity="0.9"/>
    <text x="14" y="18" text-anchor="middle" font-size="11" font-weight="bold" fill="${color}">+</text>
  </svg>`
  return L.divIcon({ html: svg, iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -42], className: '' })
}

function makeUserIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
    <path fill="#4f46e5" stroke="white" stroke-width="1.5" d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26S28 23.333 28 14C28 6.268 21.732 0 14 0z"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
    <circle cx="14" cy="14" r="3" fill="#4f46e5"/>
  </svg>`
  return L.divIcon({ html: svg, iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -42], className: '' })
}

function buildPopupHtml(clinic) {
  const color = TYPE_COLORS[clinic.type] || '#555'
  const typeLabel = clinic.type.replace(/_/g, ' ')
  const specialties = clinic.specialties.map(s => s.replace(/_/g, ' ')).join(', ')
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
  const hours = days
    .map(d => clinic.opening_hours[d] ? `${d.slice(0,3)}: ${clinic.opening_hours[d]}` : null)
    .filter(Boolean).join('<br/>')
  return `
    <div style="font-size:13px;line-height:1.5;max-width:260px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${color};margin-bottom:2px">${typeLabel}</div>
      <strong style="font-size:14px">${clinic.name}</strong>
      <div style="color:#555;margin:4px 0">${clinic.address}</div>
      <div style="font-style:italic;color:#374151;margin-bottom:4px;text-transform:capitalize">${specialties}</div>
      <div style="font-size:11px;color:#6b7280">${hours}</div>
    </div>`
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const FALLBACK_COORDS = [38.731829, -9.149501]

export default function ClinicsMap() {
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const [clinics, setClinics] = useState([])
  const [locationStatus, setLocationStatus] = useState('detecting')
  const [error, setError] = useState(null)

  // Fetch clinics
  useEffect(() => {
    fetch(`${API_BASE}/clinics`)
      .then(r => r.json())
      .then(data => setClinics(data.providers || []))
      .catch(() => setError('Failed to load clinics'))
  }, [])

  // Init map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    mapRef.current = L.map(mapDivRef.current).setView(FALLBACK_COORDS, 14)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(mapRef.current)
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Add clinic markers when clinics load
  useEffect(() => {
    const map = mapRef.current
    if (!map || clinics.length === 0) return
    clinics.forEach(clinic => {
      L.marker([clinic.coordinates.lat, clinic.coordinates.lng], { icon: makeClinicIcon(clinic.type) })
        .bindPopup(buildPopupHtml(clinic), { maxWidth: 280 })
        .addTo(map)
    })
  }, [clinics])

  // Geolocation: try real coords, fall back to hardcoded
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function useCoords(lat, lng, status) {
      map.setView([lat, lng], 14)
      L.marker([lat, lng], { icon: makeUserIcon() })
        .bindPopup(status === 'found' ? '<strong>Your Location</strong>' : '<strong>Default Location</strong>')
        .addTo(map)
      setLocationStatus(status)
    }

    if (!navigator.geolocation) {
      useCoords(...FALLBACK_COORDS, 'fallback')
      return
    }

    navigator.geolocation.getCurrentPosition(
      pos => useCoords(pos.coords.latitude, pos.coords.longitude, 'found'),
      () => useCoords(...FALLBACK_COORDS, 'fallback'),
      { timeout: 6000, maximumAge: 60000, enableHighAccuracy: false }
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef.current])

  if (error) return <div style={styles.errorBox}>{error}</div>

  return (
    <div style={styles.wrapper}>
      <div style={styles.legend}>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <span key={type} style={styles.legendItem}>
            <span style={{ ...styles.dot, background: color }} />
            {type.replace(/_/g, ' ')}
          </span>
        ))}
        <span style={styles.legendItem}>
          <span style={{ ...styles.dot, background: '#4f46e5' }} />
          {locationStatus === 'found' ? 'your location' : 'default location'}
        </span>
        {locationStatus === 'fallback' && (
          <span style={styles.locationNote}>GPS unavailable — using default location</span>
        )}
      </div>
      <div ref={mapDivRef} style={styles.map} />
    </div>
  )
}

const styles = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 12 },
  map: { height: 500, width: '100%', borderRadius: 10 },
  errorBox: {
    padding: '12px 16px', background: '#fef2f2', color: '#991b1b',
    borderRadius: 8, border: '1px solid #fecaca',
  },
  legend: { display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: '0.78rem', color: '#555' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, textTransform: 'capitalize' },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  locationNote: { color: '#888', fontStyle: 'italic' },
}
