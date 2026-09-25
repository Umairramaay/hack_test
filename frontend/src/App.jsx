import { useEffect, useRef, useState } from 'react'
import ClinicsMap from './ClinicsMap'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const GENDER_LABELS = { male: 'Male', female: 'Female', other: 'Other' }

function formatDate(iso) {
  return new Date(iso).toLocaleString()
}

export default function App() {
  const [records, setRecords] = useState([])
  const [form, setForm] = useState({ name: '', age: '', gender: '' })
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null) // { type: 'success'|'error', message }
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  async function loadRecords() {
    try {
      const res = await fetch(`${API_BASE}/records`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRecords(await res.json())
    } catch {
      // silently skip if backend is unreachable on initial load
    }
  }

  useEffect(() => { loadRecords() }, [])

  function handleField(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)

    if (!file) { setStatus({ type: 'error', message: 'Please select a file.' }); return }
    if (!form.name.trim()) { setStatus({ type: 'error', message: 'Name is required.' }); return }
    if (!form.gender) { setStatus({ type: 'error', message: 'Gender is required.' }); return }
    const age = parseInt(form.age, 10)
    if (!age || age < 1 || age > 120) { setStatus({ type: 'error', message: 'Enter a valid age (1–120).' }); return }

    const data = new FormData()
    data.append('name', form.name.trim())
    data.append('gender', form.gender)
    data.append('age', age)
    data.append('file', file)

    setUploading(true)
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: data })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      setStatus({ type: 'success', message: `Uploaded successfully for ${json.name}.` })
      setForm({ name: '', age: '', gender: '' })
      setFile(null)
      fileRef.current.value = ''
      loadRecords()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Insurance Document Portal</h1>
        <p style={styles.subtitle}>Upload your insurance document along with your details</p>
      </header>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Upload Document</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.row}>
            <label style={styles.label}>Full Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleField}
              placeholder="John Doe"
              style={styles.input}
            />
          </div>

          <div style={styles.row2}>
            <div style={styles.col}>
              <label style={styles.label}>Age</label>
              <input
                name="age"
                type="number"
                value={form.age}
                onChange={handleField}
                placeholder="30"
                min={1}
                max={120}
                style={styles.input}
              />
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Gender</label>
              <select name="gender" value={form.gender} onChange={handleField} style={styles.input}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Insurance Document <span style={styles.hint}>(PDF or Word)</span></label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={e => setFile(e.target.files[0] || null)}
              style={{ ...styles.input, padding: '8px' }}
            />
          </div>

          {status && (
            <div style={status.type === 'success' ? styles.success : styles.error}>
              {status.message}
            </div>
          )}

          <button type="submit" disabled={uploading} style={uploading ? styles.btnDisabled : styles.btn}>
            {uploading ? 'Uploading…' : 'Submit'}
          </button>
        </form>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Nearby Clinics &amp; Hospitals</h2>
        <ClinicsMap />
      </div>

      <div style={styles.card}>
        <div style={styles.tableHeader}>
          <h2 style={styles.cardTitle}>Submitted Records</h2>
          <button onClick={loadRecords} style={styles.refreshBtn}>Refresh</button>
        </div>
        {records.length === 0 ? (
          <p style={styles.empty}>No records yet. Upload a document above.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['#', 'Name', 'Gender', 'Age', 'File', 'Uploaded At'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={styles.td}>{r.id}</td>
                    <td style={styles.td}>{r.name}</td>
                    <td style={styles.td}>{GENDER_LABELS[r.gender] || r.gender}</td>
                    <td style={styles.td}>{r.age}</td>
                    <td style={{ ...styles.td, ...styles.filename }}>{r.filename}</td>
                    <td style={styles.td}>{formatDate(r.uploaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    maxWidth: 860,
    margin: '0 auto',
    padding: '32px 20px 60px',
    color: '#1a1a2e',
    background: '#f5f7fa',
    minHeight: '100vh',
  },
  header: { marginBottom: 32, textAlign: 'center' },
  title: { margin: 0, fontSize: '2rem', fontWeight: 700, color: '#1a1a2e' },
  subtitle: { margin: '8px 0 0', color: '#666', fontSize: '1rem' },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '28px 32px',
    marginBottom: 28,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  cardTitle: { margin: '0 0 20px', fontSize: '1.15rem', fontWeight: 600, color: '#1a1a2e' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  row: { display: 'flex', flexDirection: 'column', gap: 6 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  col: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: '0.875rem', fontWeight: 500, color: '#444' },
  hint: { fontSize: '0.75rem', fontWeight: 400, color: '#888' },
  input: {
    padding: '10px 14px',
    fontSize: '0.95rem',
    border: '1.5px solid #dde2e8',
    borderRadius: 8,
    outline: 'none',
    background: '#fafbfc',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  btn: {
    marginTop: 4,
    padding: '12px 0',
    fontSize: '0.95rem',
    fontWeight: 600,
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  btnDisabled: {
    marginTop: 4,
    padding: '12px 0',
    fontSize: '0.95rem',
    fontWeight: 600,
    background: '#a5b4fc',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'not-allowed',
  },
  success: {
    padding: '10px 14px',
    background: '#ecfdf5',
    color: '#065f46',
    borderRadius: 8,
    fontSize: '0.9rem',
    border: '1px solid #a7f3d0',
  },
  error: {
    padding: '10px 14px',
    background: '#fef2f2',
    color: '#991b1b',
    borderRadius: 8,
    fontSize: '0.9rem',
    border: '1px solid #fecaca',
  },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  refreshBtn: {
    padding: '6px 14px',
    fontSize: '0.85rem',
    background: '#f3f4f6',
    border: '1px solid #dde2e8',
    borderRadius: 6,
    cursor: 'pointer',
    color: '#444',
  },
  empty: { textAlign: 'center', color: '#999', padding: '40px 0', fontSize: '0.95rem' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: {
    padding: '10px 14px',
    background: '#f8fafc',
    textAlign: 'left',
    fontWeight: 600,
    color: '#555',
    borderBottom: '2px solid #eee',
    whiteSpace: 'nowrap',
  },
  td: { padding: '10px 14px', borderBottom: '1px solid #f0f0f0', color: '#333' },
  trEven: { background: '#fff' },
  trOdd: { background: '#fafbfc' },
  filename: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
