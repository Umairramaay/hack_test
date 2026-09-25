import InsuranceAnalyzer from './InsuranceAnalyzer'

export default function App() {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Understand Your Insurance</h1>
        <p style={styles.subtitle}>AI-powered health insurance document analyzer</p>
      </header>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Analyze Insurance Document</h2>
        <InsuranceAnalyzer />
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
}
