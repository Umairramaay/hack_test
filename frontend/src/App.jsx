import InsuranceAnalyzer from './InsuranceAnalyzer'

export default function App() {
  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <div style={styles.brand}>
          <div style={styles.logo}>
            <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M13 8h6v5h5v6h-5v5h-6v-5H8v-6h5z" fill="#fff" />
            </svg>
          </div>
          <span style={styles.brandName}>Insurely</span>
        </div>
      </nav>

      <main style={styles.main}>
        <InsuranceAnalyzer />
      </main>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', padding: '0 16px 80px' },
  nav: {
    maxWidth: 960, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center',
    borderBottom: '1px solid var(--border)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: {
    width: 36, height: 36, borderRadius: 10, color: '#fff', fontSize: '1.05rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#4f46e5,#0ea5e9)', boxShadow: '0 6px 16px rgba(79,70,229,0.3)',
  },
  brandName: { fontFamily: "'Inter', system-ui, sans-serif", fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' },
  main: { maxWidth: 960, margin: '0 auto', paddingTop: 48 },
}
