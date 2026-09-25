import { useEffect, useState } from 'react'
import ClinicsMap from './ClinicsMap'
import InsuranceAnalyzer from './InsuranceAnalyzer'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const GENDER_LABELS = { male: 'Male', female: 'Female', other: 'Other' }

function formatDate(iso) {
  return new Date(iso).toLocaleString()
}

export default function App() {
  const [records, setRecords] = useState([])

  async function loadRecords() {
    try {
      const res = await fetch(`${API_BASE}/records`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRecords(await res.json())
    } catch {
      // silently skip if backend unreachable on initial load
    }
  }

  useEffect(() => { loadRecords() }, [])

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Understand Your Insurance</h1>
        <p style={styles.subtitle}>AI-powered health insurance document analyzer</p>
      </header>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Analyze Insurance Document</h2>
        <InsuranceAnalyzer onUploadSuccess={loadRecords} />
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
                  {['#', 'Name', 'Gender', 'Age', 'File', 'Path', 'Uploaded At'].map(h => (
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
                    <td style={{ ...styles.td, ...styles.mono }}>{r.filename}</td>
                    <td style={{ ...styles.td, ...styles.mono }}>{r.filepath}</td>
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
    maxWidth: 960,
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
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' },
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
  mono: { fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
