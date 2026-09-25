import { useEffect, useState } from 'react'

// VITE_* variables are baked into the JS bundle at build time.
// They are PUBLIC — never put secrets here.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export default function App() {
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/hello`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setMessage(data.message))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 520, margin: '80px auto', textAlign: 'center' }}>
      <h1>Hello World</h1>

      <p style={{ color: '#555', fontSize: '0.9rem' }}>
        API URL test: <code>{API_BASE}</code>
      </p>

      {loading && <p style={{ color: '#888' }}>Loading…</p>}
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {message && <p style={{ fontSize: '1.2rem' }}>{message}</p>}

      {/* ⚠️  VITE_* variables are compiled into the public JS bundle.
           Never put API secrets, tokens, or passwords in VITE_* vars. */}
    </div>
  )
}
