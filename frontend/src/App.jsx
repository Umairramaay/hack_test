import InsuranceAnalyzer from './InsuranceAnalyzer'

export default function App() {
  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <div style={styles.brand}>
          <div style={styles.logo}>✚</div>
          <span style={styles.brandName}>Insurely</span>
        </div>
      </nav>

      <header style={styles.header}>
        <h1 style={styles.title}>Understand your health insurance</h1>
        <p style={styles.subtitle}>
          Upload your policy and Insurely shows what's covered, what you can use today, and which check-ups you can get for free.
        </p>
      </header>

      <main style={styles.main}>
        <InsuranceAnalyzer />
      </main>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', padding: '20px 16px 80px' },
  nav: { maxWidth: 920, margin: '0 auto 40px', display: 'flex', alignItems: 'center' },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandName: { fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' },
  header: { textAlign: 'center', maxWidth: 620, margin: '0 auto 32px' },
  logo: {
    width: 36, height: 36, borderRadius: 10, color: '#fff', fontSize: '1.05rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#4f46e5,#0ea5e9)', boxShadow: '0 6px 16px rgba(79,70,229,0.3)',
  },
  title: { margin: 0, fontSize: 'clamp(1.7rem, 4vw, 2.3rem)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' },
  subtitle: { margin: '10px 0 0', color: '#64748b', fontSize: '1rem', lineHeight: 1.55 },
  main: { maxWidth: 920, margin: '0 auto' },
}
