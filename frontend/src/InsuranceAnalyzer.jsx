import { useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const ANALYSIS_STEPS = [
  'Reading policy',
  'Finding coverage',
  'Checking limits',
  'Finding exclusions',
  'Identifying important conditions',
]

function Badge({ children, color }) {
  const colors = {
    green: { background: '#dcfce7', color: '#166534' },
    red: { background: '#fee2e2', color: '#991b1b' },
    yellow: { background: '#fef9c3', color: '#854d0e' },
    gray: { background: '#f3f4f6', color: '#374151' },
    blue: { background: '#dbeafe', color: '#1e40af' },
  }
  const s = colors[color] || colors.gray
  return (
    <span style={{ ...s, padding: '2px 8px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600 }}>
      {children}
    </span>
  )
}

function SectionHeader({ children }) {
  return (
    <h3 style={{ margin: '28px 0 12px', fontSize: '1rem', fontWeight: 700, color: '#1a1a2e', borderBottom: '2px solid #e5e7eb', paddingBottom: 8 }}>
      {children}
    </h3>
  )
}

function SourceTag({ source }) {
  if (!source?.page && !source?.section) return null
  const parts = []
  if (source.page) parts.push(`p.${source.page}`)
  if (source.section) parts.push(source.section)
  return (
    <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 6 }}>
      [{parts.join(' · ')}]
    </span>
  )
}

function CoverageTable({ coverage }) {
  if (!coverage?.length) return <p style={s.empty}>No coverage data found.</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.table}>
        <thead>
          <tr>
            {['Benefit', 'Covered', 'Limit', 'Copayment', 'Waiting Period', 'Auth Required', 'Source'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {coverage.map((item, i) => (
            <tr key={i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
              <td style={{ ...s.td, fontWeight: 500 }}>
                {item.category}
                {item.description && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>{item.description}</div>}
              </td>
              <td style={s.td}>
                {item.covered === true ? <Badge color="green">Yes</Badge>
                  : item.covered === false ? <Badge color="red">No</Badge>
                  : <Badge color="gray">Unknown</Badge>}
              </td>
              <td style={s.td}>{item.limit ?? '—'}</td>
              <td style={s.td}>{item.copayment ?? '—'}</td>
              <td style={s.td}>{item.waiting_period ?? '—'}</td>
              <td style={s.td}>
                {item.authorization_required === true ? <Badge color="yellow">Yes</Badge>
                  : item.authorization_required === false ? <Badge color="green">No</Badge>
                  : '—'}
              </td>
              <td style={s.td}><SourceTag source={item.source} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CardList({ items, renderItem }) {
  if (!items?.length) return <p style={s.empty}>None identified.</p>
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{items.map(renderItem)}</div>
}

function AnalysisResult({ record, analysis }) {
  const { document, policy_overview: po, executive_summary,
    coverage, exclusions, waiting_periods, financial_limits,
    network_rules, preventive_care, important_conditions,
    practical_questions, unclear_or_missing_information } = analysis

  return (
    <div>
      {/* Who uploaded */}
      <div style={s.uploadedBy}>
        Analyzed for <strong>{record.name}</strong> · Age {record.age} ·{' '}
        {record.gender.charAt(0).toUpperCase() + record.gender.slice(1)} ·{' '}
        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{record.filepath}</span>
      </div>

      {/* Policy overview */}
      <div style={s.overviewGrid}>
        {[
          ['Insurer', po?.insurer],
          ['Policy', po?.policy_name],
          ['Type', po?.policy_type],
          ['Period', po?.policy_period],
          ['Region', po?.geographical_coverage],
          ['Pages', document?.page_count],
        ].map(([label, val]) => (
          <div key={label} style={s.overviewItem}>
            <div style={s.overviewLabel}>{label}</div>
            <div style={s.overviewValue}>{val ?? '—'}</div>
          </div>
        ))}
      </div>

      {executive_summary && (
        <>
          <SectionHeader>Summary</SectionHeader>
          <p style={{ lineHeight: 1.7, color: '#374151', fontSize: '0.95rem' }}>{executive_summary}</p>
        </>
      )}

      <SectionHeader>Coverage</SectionHeader>
      <CoverageTable coverage={coverage} />

      {!!important_conditions?.length && (
        <>
          <SectionHeader>Important Conditions</SectionHeader>
          <CardList items={important_conditions} renderItem={(item, i) => (
            <div key={i} style={{ ...s.alertCard, borderLeftColor: item.importance === 'high' ? '#ef4444' : '#f59e0b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <strong style={{ fontSize: '0.9rem' }}>{item.title}</strong>
                <Badge color={item.importance === 'high' ? 'red' : 'yellow'}>{item.importance}</Badge>
                <SourceTag source={item.source} />
              </div>
              <p style={{ margin: 0, color: '#374151', fontSize: '0.88rem', lineHeight: 1.6 }}>{item.description}</p>
            </div>
          )} />
        </>
      )}

      {!!waiting_periods?.length && (
        <>
          <SectionHeader>Waiting Periods</SectionHeader>
          <CardList items={waiting_periods} renderItem={(item, i) => (
            <div key={i} style={s.infoCard}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <strong style={{ fontSize: '0.9rem' }}>{item.benefit}</strong>
                <Badge color="yellow">{item.period}</Badge>
                <SourceTag source={item.source} />
              </div>
              {item.description && <p style={{ margin: '4px 0 0', color: '#374151', fontSize: '0.85rem' }}>{item.description}</p>}
            </div>
          )} />
        </>
      )}

      {!!financial_limits?.length && (
        <>
          <SectionHeader>Financial Limits</SectionHeader>
          <CardList items={financial_limits} renderItem={(item, i) => (
            <div key={i} style={s.infoCard}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <strong style={{ fontSize: '0.9rem' }}>{item.benefit}</strong>
                <Badge color="blue">{item.limit}{item.period ? ` / ${item.period}` : ''}</Badge>
                <SourceTag source={item.source} />
              </div>
              {item.conditions && <p style={{ margin: '4px 0 0', color: '#374151', fontSize: '0.85rem' }}>{item.conditions}</p>}
            </div>
          )} />
        </>
      )}

      {!!exclusions?.length && (
        <>
          <SectionHeader>Exclusions</SectionHeader>
          <CardList items={exclusions} renderItem={(item, i) => (
            <div key={i} style={{ ...s.alertCard, borderLeftColor: '#6b7280' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <strong style={{ fontSize: '0.9rem' }}>{item.title}</strong>
                <SourceTag source={item.source} />
              </div>
              <p style={{ margin: 0, color: '#374151', fontSize: '0.88rem', lineHeight: 1.6 }}>{item.description}</p>
            </div>
          )} />
        </>
      )}

      {!!preventive_care?.length && (
        <>
          <SectionHeader>Preventive Care</SectionHeader>
          <CardList items={preventive_care} renderItem={(item, i) => (
            <div key={i} style={s.infoCard}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: '0.9rem' }}>{item.benefit}</strong>
                <SourceTag source={item.source} />
              </div>
              <p style={{ margin: '4px 0 0', color: '#374151', fontSize: '0.85rem' }}>{item.description}</p>
            </div>
          )} />
        </>
      )}

      {!!network_rules?.length && (
        <>
          <SectionHeader>Network &amp; Provider Rules</SectionHeader>
          <CardList items={network_rules} renderItem={(item, i) => (
            <div key={i} style={s.infoCard}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: '0.9rem' }}>{item.rule}</strong>
                <SourceTag source={item.source} />
              </div>
              <p style={{ margin: '4px 0 0', color: '#374151', fontSize: '0.85rem' }}>{item.description}</p>
            </div>
          )} />
        </>
      )}

      {!!practical_questions?.length && (
        <>
          <SectionHeader>Questions You Can Answer</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {practical_questions.map((q, i) => (
              <div key={i} style={s.qaCard}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a2e', marginBottom: 4 }}>
                  {q.question} <SourceTag source={q.source} />
                </div>
                <div style={{ color: '#374151', fontSize: '0.88rem', lineHeight: 1.6 }}>{q.answer}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {!!unclear_or_missing_information?.length && (
        <>
          <SectionHeader>Unclear or Missing Information</SectionHeader>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#6b7280', fontSize: '0.88rem', lineHeight: 1.8 }}>
            {unclear_or_missing_information.map((text, i) => <li key={i}>{text}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}

export default function InsuranceAnalyzer({ onUploadSuccess }) {
  const [phase, setPhase] = useState('idle')   // idle | analyzing | result | error
  const [stepIdx, setStepIdx] = useState(0)
  const [result, setResult] = useState(null)   // { record, analysis }
  const [errorMsg, setErrorMsg] = useState('')
  const [form, setForm] = useState({ name: '', age: '', gender: '' })
  const [file, setFile] = useState(null)
  const fileRef = useRef()
  const stepTimer = useRef(null)

  function handleField(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function startStepCycle() {
    let idx = 0
    setStepIdx(0)
    stepTimer.current = setInterval(() => {
      idx = (idx + 1) % ANALYSIS_STEPS.length
      setStepIdx(idx)
    }, 1800)
  }

  function stopStepCycle() {
    if (stepTimer.current) clearInterval(stepTimer.current)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setErrorMsg('Name is required.'); setPhase('error'); return }
    if (!form.gender) { setErrorMsg('Gender is required.'); setPhase('error'); return }
    const age = parseInt(form.age, 10)
    if (!age || age < 1 || age > 120) { setErrorMsg('Enter a valid age (1–120).'); setPhase('error'); return }
    if (!file) { setErrorMsg('Please select a file.'); setPhase('error'); return }

    setPhase('analyzing')
    startStepCycle()

    const data = new FormData()
    data.append('name', form.name.trim())
    data.append('gender', form.gender)
    data.append('age', age)
    data.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: data })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      stopStepCycle()
      setResult(json)
      setPhase('result')
      onUploadSuccess?.()
    } catch (err) {
      stopStepCycle()
      setErrorMsg(err.message)
      setPhase('error')
    }
  }

  function reset() {
    setPhase('idle')
    setResult(null)
    setErrorMsg('')
    setForm({ name: '', age: '', gender: '' })
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (phase === 'analyzing') {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={s.spinner} />
        <div style={{ fontWeight: 600, fontSize: '1rem', color: '#1a1a2e', marginBottom: 20 }}>
          Analyzing your insurance...
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {ANALYSIS_STEPS.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700,
                background: i <= stepIdx ? '#4f46e5' : '#e5e7eb',
                color: i <= stepIdx ? '#fff' : '#9ca3af',
                transition: 'background 0.4s',
              }}>
                {i < stepIdx ? '✓' : i + 1}
              </span>
              <span style={{
                fontSize: '0.9rem',
                color: i === stepIdx ? '#1a1a2e' : i < stepIdx ? '#6b7280' : '#9ca3af',
                fontWeight: i === stepIdx ? 600 : 400,
                transition: 'color 0.4s',
              }}>
                {step}
              </span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 24 }}>
          This may take 20–60 seconds depending on document length.
        </p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div>
        <div style={s.errorBox}>{errorMsg}</div>
        <button onClick={reset} style={s.btn}>Try Again</button>
      </div>
    )
  }

  if (phase === 'result' && result) {
    const { record, analysis } = result
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={reset} style={s.ghostBtn}>Analyze Another</button>
        </div>
        {analysis && !analysis.error
          ? <AnalysisResult record={record} analysis={analysis} />
          : (
            <div style={s.successBox}>
              File saved to <code>{record.filepath}</code>.
              {analysis?.error && <span style={{ color: '#b45309', marginLeft: 8 }}>Analysis failed: {analysis.error}</span>}
              {!analysis && <span style={{ marginLeft: 8 }}>AI analysis is only available for PDF files.</span>}
            </div>
          )}
      </div>
    )
  }

  // idle — show the form
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={s.row}>
        <label style={s.label}>Full Name</label>
        <input
          name="name"
          value={form.name}
          onChange={handleField}
          placeholder="John Doe"
          style={s.input}
        />
      </div>

      <div style={s.row2}>
        <div style={s.col}>
          <label style={s.label}>Age</label>
          <input
            name="age"
            type="number"
            value={form.age}
            onChange={handleField}
            placeholder="30"
            min={1}
            max={120}
            style={s.input}
          />
        </div>
        <div style={s.col}>
          <label style={s.label}>Gender</label>
          <select name="gender" value={form.gender} onChange={handleField} style={s.input}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div style={s.row}>
        <label style={s.label}>
          Insurance Document <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400 }}>(PDF — up to 15 MB)</span>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ ...s.input, padding: '8px' }}
        />
        {file && (
          <span style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 4 }}>
            {file.name} ({(file.size / 1024).toFixed(0)} KB)
          </span>
        )}
      </div>

      <button type="submit" style={s.btn}>
        Upload &amp; Analyze
      </button>
    </form>
  )
}

const s = {
  row: { display: 'flex', flexDirection: 'column', gap: 6 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  col: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: '0.875rem', fontWeight: 500, color: '#444' },
  input: {
    padding: '10px 14px',
    fontSize: '0.95rem',
    border: '1.5px solid #dde2e8',
    borderRadius: 8,
    outline: 'none',
    background: '#fafbfc',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '12px 0',
    fontSize: '0.95rem',
    fontWeight: 600,
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  ghostBtn: {
    padding: '6px 14px',
    fontSize: '0.85rem',
    background: 'transparent',
    border: '1px solid #dde2e8',
    borderRadius: 6,
    cursor: 'pointer',
    color: '#4f46e5',
    fontWeight: 500,
  },
  errorBox: {
    padding: '12px 16px',
    background: '#fef2f2',
    color: '#991b1b',
    borderRadius: 8,
    fontSize: '0.9rem',
    border: '1px solid #fecaca',
    marginBottom: 12,
  },
  successBox: {
    padding: '12px 16px',
    background: '#ecfdf5',
    color: '#065f46',
    borderRadius: 8,
    fontSize: '0.9rem',
    border: '1px solid #a7f3d0',
  },
  spinner: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '3px solid #e5e7eb',
    borderTopColor: '#4f46e5',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 20px',
  },
  uploadedBy: {
    fontSize: '0.82rem',
    color: '#6b7280',
    background: '#f8fafc',
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 12,
    border: '1px solid #e5e7eb',
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
    background: '#f8fafc',
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 8,
  },
  overviewItem: {},
  overviewLabel: { fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 },
  overviewValue: { fontSize: '0.9rem', fontWeight: 500, color: '#1a1a2e' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { padding: '9px 12px', background: '#f8fafc', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '2px solid #eee', whiteSpace: 'nowrap' },
  td: { padding: '9px 12px', borderBottom: '1px solid #f0f0f0', color: '#374151', verticalAlign: 'top' },
  trEven: { background: '#fff' },
  trOdd: { background: '#fafbfc' },
  alertCard: { padding: '12px 16px', borderLeft: '4px solid #ef4444', background: '#fafafa', borderRadius: '0 8px 8px 0', border: '1px solid #f3f4f6' },
  infoCard: { padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' },
  qaCard: { padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' },
  empty: { color: '#9ca3af', fontSize: '0.88rem', fontStyle: 'italic', margin: '8px 0' },
}
