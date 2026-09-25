import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Fallback coordinates (Lisbon, Portugal)
const FALLBACK_LAT = 38.7169
const FALLBACK_LNG = -9.1399

// Maps health_items item_id → service_type for the "Find a place" button
export const ITEM_SERVICE_TYPE = {
  // Blood / lab tests
  lipid_panel:                 'blood_test',
  total_cholesterol_only:      'blood_test',
  blood_sugar:                 'blood_test',
  full_blood_count:            'blood_test',
  urine_test:                  'blood_test',
  kidney_liver_panel:          'blood_test',
  vitamin_b12_folate:          'blood_test',
  colorectal_screening:        'blood_test',
  psa_test:                    'blood_test',
  cervical_screening:          'blood_test',
  cervical_screening_high_risk:'blood_test',
  cervical_cytology:           'blood_test',

  // Diagnostic imaging
  breast_screening:            'diagnostic_imaging',
  breast_ultrasound:           'diagnostic_imaging',
  bone_density:                'diagnostic_imaging',

  // Dental
  dental_check:                'dental',

  // Vision
  eye_exam:                    'vision',

  // Vaccinations
  td_booster:                  'vaccination',
  hpv_vaccine:                 'vaccination',
  tdpa_vaccine:                'vaccination',
  flu_vaccine:                 'vaccination',
  pneumococcal_vaccine:        'vaccination',
  shingles_vaccine:            'vaccination',

  // GP / general
  clinical_eval_consult:       'general_practice',
  results_consult:             'general_practice',

  // Specialist
  gyn_consult:                 'specialist',
  urology_consult:             'specialist',
  skin_check:                  'specialist',
}

// Prevent Leaflet default-icon resolution error (safe to call multiple times)
delete L.Icon.Default.prototype._getIconUrl

function _makeProviderIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
    <path fill="#059669" stroke="white" stroke-width="1.5" d="M13 0C5.82 0 0 5.82 0 13c0 8.667 13 25 13 25S26 21.667 26 13C26 5.82 20.18 0 13 0z"/>
    <circle cx="13" cy="13" r="6.5" fill="white" opacity="0.9"/>
    <text x="13" y="17" text-anchor="middle" font-size="11" font-weight="bold" fill="#059669">+</text>
  </svg>`
  return L.divIcon({ html: svg, iconSize: [26, 38], iconAnchor: [13, 38], popupAnchor: [0, -40], className: '' })
}

function _makeUserIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="32" viewBox="0 0 22 32">
    <path fill="#4f46e5" stroke="white" stroke-width="1.5" d="M11 0C4.925 0 0 4.925 0 11c0 7.333 11 21 11 21S22 18.333 22 11C22 4.925 17.075 0 11 0z"/>
    <circle cx="11" cy="11" r="4.5" fill="white"/>
    <circle cx="11" cy="11" r="2.5" fill="#4f46e5"/>
  </svg>`
  return L.divIcon({ html: svg, iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -34], className: '' })
}

// ─── Map ────────────────────────────────────────────────────────────────────

function ProviderMap({ userLoc, providers }) {
  const divRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!divRef.current) return
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

    const map = L.map(divRef.current).setView([userLoc.lat, userLoc.lng], 14)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    L.marker([userLoc.lat, userLoc.lng], { icon: _makeUserIcon() })
      .bindPopup('<strong>Your location</strong>')
      .addTo(map)

    const valid = providers.filter(p => p.latitude && p.longitude)
    valid.forEach(p => {
      L.marker([p.latitude, p.longitude], { icon: _makeProviderIcon() })
        .bindPopup(
          `<div style="font-size:13px;line-height:1.5;max-width:200px">` +
          `<strong>${p.name}</strong>` +
          `<div style="color:#059669;font-size:12px">${p.type}</div>` +
          (p.address ? `<div style="color:#777;font-size:12px;margin-top:2px">${p.address}</div>` : '') +
          (p.distance_km != null ? `<div style="color:#059669;font-size:12px;margin-top:2px">${p.distance_km} km away</div>` : '') +
          `</div>`,
          { maxWidth: 240 }
        )
        .addTo(map)
    })

    if (valid.length > 0) {
      map.fitBounds(
        L.latLngBounds([[userLoc.lat, userLoc.lng], ...valid.map(p => [p.latitude, p.longitude])]),
        { padding: [40, 40] }
      )
    }

    mapRef.current = map
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [userLoc, providers])

  return <div ref={divRef} style={{ height: 260, borderRadius: 8, marginBottom: 12, position: 'relative', zIndex: 0 }} />
}

// ─── Provider card ───────────────────────────────────────────────────────────

function ProviderCard({ provider }) {
  const osmUrl = provider.latitude && provider.longitude
    ? `https://www.openstreetmap.org/?mlat=${provider.latitude}&mlon=${provider.longitude}&zoom=17`
    : null

  return (
    <div style={ps.provCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1a1a2e' }}>{provider.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 500, marginTop: 1 }}>{provider.type}</div>
        </div>
        {provider.distance_km != null && (
          <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {provider.distance_km} km away
          </span>
        )}
      </div>

      {provider.opening_hours && provider.opening_hours.length > 0 && (
        <div style={{ marginTop: 5, fontSize: '0.75rem', color: '#374151', lineHeight: 1.4 }}>
          {provider.opening_hours.map((h, i) => <div key={i}>{h}</div>)}
        </div>
      )}

      {provider.address && (
        <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#6b7280' }}>{provider.address}</div>
      )}

      {provider.phone && (
        <div style={{ marginTop: 3, fontSize: '0.75rem' }}>
          <a href={`tel:${provider.phone}`} style={{ color: '#4f46e5', textDecoration: 'none' }}>
            {provider.phone}
          </a>
        </div>
      )}

      {(osmUrl || provider.website) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {osmUrl && (
            <a href={osmUrl} target="_blank" rel="noopener noreferrer" style={ps.cardLink}>
              View on map
            </a>
          )}
          {provider.website && (
            <a href={provider.website} target="_blank" rel="noopener noreferrer" style={ps.cardLink}>
              Website
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main exported component ─────────────────────────────────────────────────

export default function ProviderSearch({ itemId, label }) {
  const serviceType = ITEM_SERVICE_TYPE[itemId]
  const [state, setState]       = useState('idle')   // idle | locating | loading | done | error
  const [providers, setProviders] = useState([])
  const [userLoc, setUserLoc]   = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  if (!serviceType) return null

  async function fetchProviders(lat, lng) {
    setState('loading')
    try {
      const res = await fetch(
        `${API_BASE}/api/providers?service_type=${encodeURIComponent(serviceType)}&lat=${lat}&lng=${lng}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setUserLoc({ lat, lng })
      setProviders(data.providers || [])
      setState('done')
    } catch (err) {
      setErrorMsg(err.message)
      setState('error')
    }
  }

  function handleFind() {
    setState('locating')
    if (!navigator.geolocation) {
      fetchProviders(FALLBACK_LAT, FALLBACK_LNG)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => fetchProviders(pos.coords.latitude, pos.coords.longitude),
      ()  => fetchProviders(FALLBACK_LAT, FALLBACK_LNG),
      { timeout: 6000, maximumAge: 60000, enableHighAccuracy: false }
    )
  }

  if (state === 'idle') {
    return (
      <button onClick={handleFind} style={ps.findBtn}>
        📍 Find a place
      </button>
    )
  }

  if (state === 'locating' || state === 'loading') {
    return (
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={ps.miniSpinner} />
        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
          {state === 'locating' ? 'Getting your location…' : 'Searching nearby providers…'}
        </span>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={ps.errorBox}>{errorMsg}</div>
        <button onClick={handleFind} style={{ ...ps.findBtn, marginTop: 6 }}>Retry</button>
      </div>
    )
  }

  // done
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
          Nearby places — {label}
        </span>
        <button onClick={() => setState('idle')} style={ps.closeBtn}>✕ Close</button>
      </div>

      {providers.length === 0 ? (
        <div style={ps.noResults}>
          No matching providers found within 5 km. You may need to search manually.
        </div>
      ) : (
        <>
          {userLoc && <ProviderMap userLoc={userLoc} providers={providers} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {providers.map((p, i) => <ProviderCard key={i} provider={p} />)}
          </div>
        </>
      )}
    </div>
  )
}

const ps = {
  findBtn: {
    marginTop: 8,
    padding: '4px 11px',
    fontSize: '0.76rem',
    fontWeight: 600,
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    borderRadius: 6,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  miniSpinner: {
    width: 13,
    height: 13,
    borderRadius: '50%',
    border: '2px solid #e5e7eb',
    borderTopColor: '#4f46e5',
    animation: 'spin 0.7s linear infinite',
    flexShrink: 0,
  },
  errorBox: {
    padding: '8px 12px',
    background: '#fef2f2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: '0.78rem',
    border: '1px solid #fecaca',
  },
  noResults: {
    padding: '10px 14px',
    background: '#f8fafc',
    color: '#6b7280',
    borderRadius: 6,
    fontSize: '0.8rem',
    border: '1px solid #e5e7eb',
    fontStyle: 'italic',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9ca3af',
    fontSize: '0.75rem',
    padding: '2px 6px',
    lineHeight: 1,
  },
  provCard: {
    padding: '9px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 7,
    background: '#fff',
  },
  cardLink: {
    padding: '3px 9px',
    fontSize: '0.73rem',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #dde2e8',
    borderRadius: 4,
    textDecoration: 'none',
    fontWeight: 500,
  },
}
