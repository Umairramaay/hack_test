import { ShieldCheck } from 'lucide-react'
import InsuranceAnalyzer from './InsuranceAnalyzer'

export default function App() {
  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <div style={styles.brand}>
          <div style={styles.logo}><ShieldCheck size={18} strokeWidth={1.5} /></div>
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
  brand: { display: 'flex', alignItems: 'center', gap: 8 },
  logo: {
    width: 32, height: 32, borderRadius: 8, color: '#fff', background: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  brandName: { fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' },
  main: { maxWidth: 960, margin: '0 auto', paddingTop: 48 },
}
