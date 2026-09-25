import { useRef, useState } from 'react'
import ProviderSearch from './ProviderSearch'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const ANALYSIS_STEPS = [
  'Reading your policy',
  'Extracting coverage',
  'Verifying quotes',
  'Building your plan',
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

// ─── Shared helpers ──────────────────────────────────────────────────────────

const SERVICE_LABELS = {
  gp_consult: 'GP Consultation', specialist_consult: 'Specialist Consultation',
  urgent_care: 'Urgent Care', online_consult: 'Online Consultation',
  home_visit: 'Home Visit', psychology: 'Psychology', psychiatry: 'Psychiatry',
  blood_tests: 'Blood Tests', ultrasound: 'Ultrasound', xray: 'X-Ray',
  ct_scan: 'CT Scan', mri: 'MRI', pathology: 'Pathology', other_exams: 'Other Exams',
  physio: 'Physiotherapy', speech_therapy: 'Speech Therapy', alt_therapies: 'Alt. Therapies',
  checkup: 'Annual Check-up', dental_checkup: 'Dental Check-up',
  dental_treatment: 'Dental Treatment', glasses: 'Glasses/Optical',
  hospital_stay: 'Hospital Stay', day_surgery: 'Day Surgery', childbirth: 'Childbirth',
  psych_hospital: 'Psychiatric Hospital', ambulance: 'Ambulance',
  medication: 'Medication', care_abroad: 'Care Abroad', sns_fees: 'SNS Fees',
}

function networkText(n) {
  if (!n) return '—'
  const t = n.type
  if (t === 'free') return 'Free'
  if (t === 'fixed_copay') return `€${n.amount_eur} copay`
  if (t === 'percent_copay') return `${n.pct}%${n.min_eur ? ` (min €${n.min_eur})` : ''}`
  if (t === 'network_discount') return 'Network price'
  if (t === 'not_covered') return 'Not covered'
  if (t === 'not_stated') return 'Not stated'
  return n.type || '—'
}

// ─── Extraction details ───────────────────────────────────────────────────────

function ExtractionDetails({ coverage }) {
  const [open, setOpen] = useState(false)
  if (!coverage) return null
  const poolMap = Object.fromEntries((coverage.limit_pools || []).map(p => [p.id, `€${p.amount_eur}/yr`]))
  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={s.detailBtn}>
        {open ? '▲' : '▼'} Extraction details — what was read from your PDF
      </button>
      {open && (
        <div style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem' }}>
            <strong>{coverage.insurer || 'Unknown insurer'}</strong>
            {coverage.product_as_written && (
              <span style={{ color: '#6b7280', marginLeft: 8 }}>· {coverage.product_as_written}</span>
            )}
            {coverage.limit_pools?.length > 0 && (
              <span style={{ marginLeft: 12, fontSize: '0.78rem', color: '#6b7280' }}>
                Annual limits: {coverage.limit_pools.map(p => `${p.id}: €${p.amount_eur}`).join(' · ')}
              </span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Service', 'In-network', 'Out-of-network', 'Annual limit', 'Waiting', 'Source'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(coverage.rows || []).map((row, i) => (
                  <tr key={i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{SERVICE_LABELS[row.service_id] || row.service_id}</td>
                    <td style={s.td}>{networkText(row.network)}</td>
                    <td style={s.td}>{networkText(row.out_of_network)}</td>
                    <td style={s.td}>{row.limit_pool ? (poolMap[row.limit_pool] || row.limit_pool) : '—'}</td>
                    <td style={s.td}>{row.waiting_days ? `${row.waiting_days}d` : '—'}</td>
                    <td style={s.td}>
                      {row.page && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>p.{row.page}</span>}
                      {row.quote && <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic' }}>"{row.quote}"</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Plan computation details ─────────────────────────────────────────────────

function PlanComputationDetails({ checkup_plan }) {
  const [open, setOpen] = useState(false)
  if (!checkup_plan) return null
  const { recommended = [], included_in_insurance = [], fallback_message, product_used, product_inferred } = checkup_plan
  const checkupTableFound = included_in_insurance.length > 0 || recommended.some(r => r.best_option?.source === 'insurance_checkup')
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(o => !o)} style={s.detailBtn}>
        {open ? '▲' : '▼'} How this plan was computed
      </button>
      {open && (
        <div style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: '0.85rem', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {product_used && <span><strong>Product:</strong> {product_used}{product_inferred ? ' (inferred)' : ''}</span>}
            <span><strong>Check-up table:</strong> {checkupTableFound ? '✓ Found' : '✗ Not found — using policy prices'}</span>
            <span><strong>Fallback:</strong> {fallback_message ? 'Yes' : 'No'}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Test', 'Strength', 'Source', 'Cost logic', 'Status'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recommended.map((item, i) => {
                  const bo = item.best_option || {}
                  const sourceLabel = { insurance_checkup: 'Annual check-up', sns: 'SNS (free)', insurance_policy: 'Policy coverage' }[bo.source] || bo.source
                  return (
                    <tr key={i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                      <td style={{ ...s.td, fontWeight: 500 }}>{item.label}</td>
                      <td style={s.td}>{item.strength}</td>
                      <td style={s.td}>{sourceLabel}</td>
                      <td style={s.td}>{bo.cost_text || (bo.cost_eur != null ? `€${bo.cost_eur}` : 'Free')}</td>
                      <td style={s.td}>{item.status}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Checkup plan components ─────────────────────────────────────────────────

function CheckupItemCard({ item }) {
  const [open, setOpen] = useState(false)
  const bo = item.best_option || {}

  const strengthColor = { official: 'green', guideline: 'blue', general: 'gray' }[item.strength] || 'gray'
  const isFree = bo.source === 'insurance_checkup' || bo.source === 'sns'
  const costText = isFree ? 'Free' : (bo.cost_text || (bo.cost_eur != null ? `€${bo.cost_eur}` : '—'))

  const hasEvidence = bo.source === 'insurance_policy' && !!bo.evidence?.length
  const canShowSource = hasEvidence || bo.source === 'insurance_checkup'

  const warn = !item.rec_verified ||
    (bo.source === 'insurance_policy' && (!hasEvidence || bo.evidence.some(e => !e.verified)))

  return (
    <div style={s.infoCard}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1a1a2e', flex: 1, minWidth: 0 }}>
          {warn ? '⚠️ ' : ''}{item.label}
        </span>
        {item.strength && <Badge color={strengthColor}>{item.strength}</Badge>}
        {item.status && item.status !== 'eligible now' && item.status !== 'note' && (
          <Badge color="yellow">{item.status}</Badge>
        )}
        {item.status === 'note' && <Badge color="gray">with another test</Badge>}
      </div>

      {item.screens_for && (
        <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 3 }}>
          Screens for: {item.screens_for}
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: isFree ? '#166534' : '#1a1a2e' }}>
          {costText}
        </span>
        {bo.label && (
          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{bo.label}</span>
        )}
        {item.next_due && (
          <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>· {item.next_due}</span>
        )}
      </div>

      {canShowSource && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', fontSize: '0.78rem', padding: '4px 0 0', display: 'block' }}
        >
          {open ? '▲ Hide source' : '▼ See source'}
        </button>
      )}

      {open && (
        <div style={{ marginTop: 6, background: '#f8fafc', borderRadius: 6, padding: '8px 12px', fontSize: '0.8rem', border: '1px solid #e5e7eb' }}>
          {bo.source === 'insurance_checkup' && (
            <span style={{ color: '#374151' }}>{bo.label}</span>
          )}
          {bo.source === 'insurance_policy' && (
            bo.breakdown?.length > 0 ? (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Cost breakdown:</div>
                {bo.breakdown.map((b, i) => (
                  <div key={i} style={{ marginBottom: i < bo.breakdown.length - 1 ? 8 : 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{SERVICE_LABELS[b.service_id] || b.service_id}</span>
                      <span style={{ color: '#4f46e5', fontWeight: 600 }}>{b.cost_text}</span>
                    </div>
                    {b.evidence && (
                      <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: 2 }}>
                        {b.evidence.page != null && <span>p.{b.evidence.page}: </span>}
                        {b.evidence.quote && <em>"{b.evidence.quote}"</em>}
                        {!b.evidence.verified && <span style={{ color: '#b45309' }}> ⚠️ not found</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              bo.evidence?.map((ev, i) => (
                <div key={i} style={{ marginTop: i > 0 ? 6 : 0, color: '#374151' }}>
                  {ev.page != null && <span style={{ color: '#9ca3af', marginRight: 4 }}>p.{ev.page}:</span>}
                  <em>"{ev.quote}"</em>
                  {!ev.verified && <span style={{ color: '#b45309', marginLeft: 8 }}>⚠️ not found in document</span>}
                </div>
              ))
            )
          )}
        </div>
      )}

      <ProviderSearch itemId={item.item_id} label={item.label} />
    </div>
  )
}

function CheckupSection({ title, items, defaultCollapsed = false }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  if (!items?.length) return null
  return (
    <div style={{ marginTop: 20 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', borderBottom: '2px solid #e5e7eb', paddingBottom: 8, marginBottom: open ? 10 : 0 }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1a1a2e', flex: 1 }}>
          {title} <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 400 }}>({items.length})</span>
        </h3>
        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => <CheckupItemCard key={item.item_id || i} item={item} />)}
        </div>
      )}
    </div>
  )
}

function CheckupPlan({ checkup_plan, verification_summary, used_demo }) {
  if (!checkup_plan) return null

  const { recommended = [], included_in_insurance = [], coming_up = [],
    fallback_message, product_used, product_inferred } = checkup_plan

  if (!recommended.length && !included_in_insurance.length && !coming_up.length && !fallback_message) return null

  const official  = recommended.filter(r => r.strength === 'official')
  const guideline = recommended.filter(r => r.strength === 'guideline')
  const general   = recommended.filter(r => r.strength !== 'official' && r.strength !== 'guideline')

  const includedAsCards = included_in_insurance.map(it => ({
    ...it,
    strength: 'general',
    rec_verified: true,
    status: 'eligible now',
    best_option: { source: 'insurance_checkup', cost_eur: 0, label: 'Part of your annual check-up benefit' },
  }))

  return (
    <div style={{ marginTop: 32, borderTop: '2px solid #e5e7eb', paddingTop: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700, color: '#1a1a2e' }}>
        Preventive Health Plan
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {used_demo && (
          <div style={s.noticeBox}>
            ℹ️ Coverage data from demo policy — document extraction failed. Costs shown may not match your policy.
          </div>
        )}
        {product_inferred && product_used && (
          <div style={s.noticeBox}>
            Looks like <strong>{product_used}</strong>, correct? If your product differs, check-up contents may vary.
          </div>
        )}
        {fallback_message && (
          <div style={{ ...s.noticeBox, borderColor: '#fcd34d', background: '#fffbeb', color: '#92400e' }}>
            {fallback_message}
          </div>
        )}
        {verification_summary && (
          <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>🔍 Quote check: {verification_summary}</div>
        )}
      </div>

      <PlanComputationDetails checkup_plan={checkup_plan} />

      <CheckupSection title="Official Recommendations" items={official} />
      <CheckupSection title="Guideline Recommendations" items={guideline} />
      <CheckupSection title="General Recommendations" items={general} />
      <CheckupSection title="Included in your insurance check-up" items={includedAsCards} defaultCollapsed />

      {!!coming_up.length && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 700, color: '#1a1a2e', borderBottom: '2px solid #e5e7eb', paddingBottom: 8 }}>
            Coming up
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {coming_up.map((item, i) => (
              <div key={item.item_id || i} style={{ ...s.infoCard, opacity: 0.82 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1a1a2e' }}>{item.label}</span>
                  {item.strength && <Badge color={{ official: 'green', guideline: 'blue', general: 'gray' }[item.strength] || 'gray'}>{item.strength}</Badge>}
                  {item.age_min && <Badge color="gray">from age {item.age_min}</Badge>}
                </div>
                {item.screens_for && (
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 3 }}>Screens for: {item.screens_for}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    const { record, coverage, checkup_plan, verification_summary, used_demo } = result
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={reset} style={s.ghostBtn}>Analyze Another</button>
        </div>
        <div style={s.uploadedBy}>
          Analyzed for <strong>{record.name}</strong> · Age {record.age} ·{' '}
          {record.gender.charAt(0).toUpperCase() + record.gender.slice(1)}
        </div>
        <ExtractionDetails coverage={coverage} />
        {!checkup_plan && (
          <div style={{ ...s.successBox, marginTop: 16 }}>
            {record.filename.toLowerCase().endsWith('.pdf')
              ? 'Could not build a plan from this document.'
              : 'Preventive health plan is only available for PDF files.'}
          </div>
        )}
        <CheckupPlan
          checkup_plan={checkup_plan}
          verification_summary={verification_summary}
          used_demo={used_demo}
        />
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
  detailBtn: {
    background: 'none',
    border: '1px solid #dde2e8',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '0.82rem',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  noticeBox: {
    padding: '10px 14px',
    background: '#eff6ff',
    color: '#1e40af',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
}
