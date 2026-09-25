import { useRef, useState } from 'react'
import ProviderSearch from './ProviderSearch'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const ANALYSIS_STEPS = [
  'Reading your policy',
  'Extracting coverage',
  'Verifying quotes',
  'Building your plan',
]

const BADGE_COLORS = {
  green: { background: '#dcfce7', color: '#166534' },
  red: { background: '#fee2e2', color: '#991b1b' },
  yellow: { background: '#fef3c7', color: '#92400e' },
  gray: { background: '#f1f5f9', color: '#475569' },
  blue: { background: '#e0e7ff', color: '#3730a3' },
}

function Badge({ children, color }) {
  return (
    <span style={{ ...(BADGE_COLORS[color] || BADGE_COLORS.gray), padding: '3px 9px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
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

const STRENGTH_COLOR = { official: 'green', guideline: 'blue', general: 'gray' }

function networkText(n) {
  if (!n) return '—'
  const t = n.type
  if (t === 'free') return 'Free'
  if (t === 'fixed_copay') return `€${n.amount_eur} copay`
  if (t === 'percent_copay') return `${n.pct}% copay${n.min_eur ? ` (min €${n.min_eur})` : ''}`
  if (t === 'reimbursement') return `${n.pct}% reimbursed`
  if (t === 'network_discount') return 'Network price'
  if (t === 'not_covered') return 'Not covered'
  if (t === 'not_stated') return '—'
  return n.type || '—'
}

function isMentioned(row) {
  const silent = t => !t || t === 'not_stated'
  return !(silent(row.network?.type) && silent(row.out_of_network?.type))
}

function parseDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T00:00:00`)
  return isNaN(d) ? null : d
}

function formatDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Compares the policy start date + waiting days against today.
function waitingStatus(days, startDate) {
  if (!days) return { kind: 'none' }
  const start = parseDate(startDate)
  if (!start) return { kind: 'unknown', days }
  const eligible = new Date(start)
  eligible.setDate(eligible.getDate() + days)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (today >= eligible) return { kind: 'active', days, eligible }
  // round, not ceil: a daylight-saving change adds or removes an hour
  const left = Math.round((eligible - today) / 86400000)
  return { kind: 'waiting', days, eligible, left }
}

function WaitingCell({ days, startDate }) {
  const w = waitingStatus(days, startDate)
  if (w.kind === 'none') return <Badge color="green">No wait</Badge>
  if (w.kind === 'unknown') return <Badge color="gray">{w.days}-day wait</Badge>
  if (w.kind === 'active') {
    return (
      <div>
        <Badge color="green">✓ Covered now</Badge>
        <div style={s.cellSub}>{w.days}-day wait ended {formatDate(w.eligible)}</div>
      </div>
    )
  }
  return (
    <div>
      <Badge color="yellow">{w.left} days left</Badge>
      <div style={s.cellSub}>Covered from {formatDate(w.eligible)}</div>
    </div>
  )
}

// ─── Coverage (what was read from the PDF) ───────────────────────────────────

function CoverageSection({ coverage }) {
  const [showAll, setShowAll] = useState(false)
  if (!coverage) return null

  const startDate = coverage.policy_start_date
  const hasStart = !!parseDate(startDate)
  const poolMap = Object.fromEntries((coverage.limit_pools || []).map(p => [p.id, `€${p.amount_eur.toLocaleString('en')}/yr`]))
  const rows = coverage.rows || []
  const mentioned = rows.filter(isMentioned)
  const visible = showAll ? rows : mentioned
  const hidden = rows.length - mentioned.length

  const statuses = mentioned.map(r => waitingStatus(r.waiting_days, startDate).kind)
  const inWaiting = statuses.filter(k => k === 'waiting').length
  const activeNow = statuses.filter(k => k === 'active' || k === 'none').length

  return (
    <section style={s.section}>
      <h2 style={s.h2}>Your coverage</h2>
      <p style={s.muted}>Read directly from your policy document</p>

      <div style={s.statGrid}>
        <Stat label="Insurer" value={coverage.insurer || 'Unknown'} sub={coverage.product_as_written} />
        <Stat label="Services covered" value={mentioned.length} sub={`of ${rows.length} checked`} />
        {hasStart && <Stat label="Usable today" value={activeNow} sub={`as of ${formatDate(new Date())}`} />}
        {hasStart && <Stat label="Still in waiting period" value={inWaiting} accent={inWaiting > 0 ? '#b45309' : undefined} />}
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {['Service', 'In-network', 'Out-of-network', 'Annual limit', 'Waiting period'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={row.service_id || i}>
                <td style={{ ...s.td, fontWeight: 600, color: '#0f172a' }}>{SERVICE_LABELS[row.service_id] || row.service_id}</td>
                <td style={s.td}>{networkText(row.network)}</td>
                <td style={s.td}>{networkText(row.out_of_network)}</td>
                <td style={s.td}>{row.limit_pool ? (poolMap[row.limit_pool] || row.limit_pool) : '—'}</td>
                <td style={s.td}><WaitingCell days={row.waiting_days} startDate={startDate} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <button onClick={() => setShowAll(v => !v)} style={s.linkBtn}>
          {showAll ? 'Hide services not in your policy' : `Show ${hidden} services not mentioned in your policy`}
        </button>
      )}
    </section>
  )
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color: accent || '#0f172a' }}>{value}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  )
}

// ─── Checkup plan ────────────────────────────────────────────────────────────

function CheckupItemCard({ item }) {
  const [open, setOpen] = useState(false)
  const bo = item.best_option || {}

  const isFree = bo.source === 'insurance_checkup' || bo.source === 'sns'
  const costText = isFree ? 'Free' : (bo.cost_text || (bo.cost_eur != null ? `€${bo.cost_eur}` : '—'))
  const hasEvidence = bo.source === 'insurance_policy' && (!!bo.evidence?.length || !!bo.breakdown?.length)

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={s.cardTitle}>{item.label}</span>
            {item.status && item.status !== 'eligible now' && item.status !== 'note' && (
              <Badge color="yellow">{item.status}</Badge>
            )}
          </div>
          {item.screens_for && <div style={s.cardSub}>Screens for {item.screens_for}</div>}
          <div style={{ ...s.cardSub, marginTop: 6 }}>
            {bo.label}
            {item.next_due && <span> · {item.next_due}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...s.price, color: isFree ? '#15803d' : '#0f172a' }}>{costText}</div>
          {hasEvidence && (
            <button onClick={() => setOpen(o => !o)} style={{ ...s.linkBtn, marginTop: 2, padding: 0 }}>
              {open ? 'Hide source' : 'Why this price?'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div style={s.evidence}>
          {bo.breakdown?.length > 0 ? bo.breakdown.map((b, i) => (
            <div key={i} style={{ marginTop: i ? 8 : 0 }}>
              <strong>{SERVICE_LABELS[b.service_id] || b.service_id}</strong>
              <span style={{ color: '#4f46e5', fontWeight: 600, marginLeft: 8 }}>{b.cost_text}</span>
              {b.evidence?.quote && (
                <div style={s.quote}>
                  {b.evidence.page != null && `Page ${b.evidence.page}: `}“{b.evidence.quote}”
                </div>
              )}
            </div>
          )) : bo.evidence?.map((ev, i) => (
            <div key={i} style={{ ...s.quote, marginTop: i ? 6 : 0 }}>
              {ev.page != null && `Page ${ev.page}: `}“{ev.quote}”
            </div>
          ))}
        </div>
      )}

      <div style={s.actions}>
        <CalendarButton item={item} costText={costText} />
        {!isFree && <PriceEstimate label={item.label} services={(bo.breakdown || []).map(b => b.service_id)} />}
      </div>

      <ProviderSearch itemId={item.item_id} label={item.label} />
    </div>
  )
}

function ymd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

// Due date if the plan gives one in the future, otherwise a reminder a week from now to book it.
// Age-based items ("due at age 50") have no real date, so they get no button.
function calendarDate(item) {
  const due = parseDate(item.next_due)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (due) return due > today ? due : today
  if (item.next_due) return null
  const inAWeek = new Date(today)
  inAWeek.setDate(inAWeek.getDate() + 7)
  return inAWeek
}

// Opens Google Calendar's "new event" screen pre-filled; the user saves it in their own account.
function CalendarButton({ item, costText }) {
  const start = calendarDate(item)
  if (!start) return null
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const details = [
    item.screens_for && `Screens for: ${item.screens_for}`,
    costText && `Cost with your policy: ${costText}`,
    item.best_option?.label,
    '',
    'Added from Insurely',
  ].filter(v => v !== undefined && v !== null && v !== false).join('\n')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Book: ${item.label}`,
    dates: `${ymd(start)}/${ymd(end)}`,
    details,
  })
  return (
    <a
      href={`https://calendar.google.com/calendar/render?${params}`}
      target="_blank"
      rel="noreferrer"
      style={s.calendarBtn}
    >
      📅 Put it on calendar
    </a>
  )
}

// Optional: asks the backend to search the web for typical private prices in Portugal.
function PriceEstimate({ label, services }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  async function fetchEstimate() {
    setState('loading')
    try {
      const res = await fetch(`${API_BASE}/api/price-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, services }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      setData(json)
      setState('done')
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }

  if (state === 'idle') {
    return (
      <button onClick={fetchEstimate} style={s.estimateBtn}>
        ✨ Get price estimate
      </button>
    )
  }
  if (state === 'loading') {
    return (
      <div style={{ ...s.estimateBox, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={s.miniSpinner} />
        <span style={{ color: '#475569' }}>Searching prices across Portuguese clinics…</span>
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div style={{ ...s.estimateBox, background: '#fef2f2', color: '#991b1b' }}>
        {error} <button onClick={fetchEstimate} style={{ ...s.linkBtn, padding: 0, marginLeft: 6 }}>Retry</button>
      </div>
    )
  }
  return (
    <div style={s.estimateBox}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={s.estimateLabel}>Estimated private price</span>
        <span style={s.estimateRange}>€{data.min_eur} – €{data.max_eur}</span>
        {data.typical_eur != null && <span style={{ color: '#64748b' }}>typically ~€{data.typical_eur}</span>}
      </div>
      {data.summary && <div style={{ color: '#475569', marginTop: 4 }}>{data.summary}</div>}
      {data.sources?.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data.sources.map(src => (
            <a key={src.url} href={src.url} target="_blank" rel="noreferrer" style={s.sourceChip}>
              {src.title.length > 40 ? `${src.title.slice(0, 40)}…` : src.title}
            </a>
          ))}
        </div>
      )}
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 6 }}>AI estimate from web search, may vary by clinic. Your network discount may lower this.</div>
    </div>
  )
}

function CheckupGroup({ title, hint, items, color, defaultCollapsed = false }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  if (!items?.length) return null
  return (
    <div style={{ marginTop: 24 }}>
      <button onClick={() => setOpen(o => !o)} style={s.groupHead}>
        <span style={{ ...s.dot, background: color }} />
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{title}</span>
        <span style={s.count}>{items.length}</span>
        {hint && <span style={{ ...s.muted, marginLeft: 4 }}>{hint}</span>}
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.8rem' }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {items.map((item, i) => <CheckupItemCard key={item.item_id || i} item={item} />)}
        </div>
      )}
    </div>
  )
}

function CheckupPlan({ checkup_plan, used_demo }) {
  if (!checkup_plan) return null
  const { recommended = [], included_in_insurance = [], coming_up = [],
    fallback_message, product_used, product_inferred } = checkup_plan

  if (!recommended.length && !included_in_insurance.length && !coming_up.length && !fallback_message) return null

  const official = recommended.filter(r => r.strength === 'official')
  const guideline = recommended.filter(r => r.strength === 'guideline')
  const general = recommended.filter(r => r.strength !== 'official' && r.strength !== 'guideline')

  const includedAsCards = included_in_insurance.map(it => ({
    ...it,
    status: 'eligible now',
    best_option: { source: 'insurance_checkup', cost_eur: 0, label: 'Part of your annual check-up benefit' },
  }))

  return (
    <section style={s.section}>
      <h2 style={s.h2}>Your preventive health plan</h2>
      <p style={s.muted}>Screenings recommended for you, and what each one costs with your policy</p>

      {(used_demo || (product_inferred && product_used) || fallback_message) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {used_demo && <div style={s.notice}>Showing a sample policy — we couldn't read this document, so prices may not match yours.</div>}
          {product_inferred && product_used && (
            <div style={s.notice}>Looks like <strong>{product_used}</strong>. If your product differs, check-up contents may vary.</div>
          )}
          {fallback_message && <div style={{ ...s.notice, ...s.noticeWarn }}>{fallback_message}</div>}
        </div>
      )}

      <CheckupGroup title="Official recommendations" hint="National screening programme" items={official} color="#16a34a" />
      <CheckupGroup title="Guideline recommendations" hint="Clinical guidelines" items={guideline} color="#4f46e5" />
      <CheckupGroup title="General recommendations" items={general} color="#94a3b8" />
      <CheckupGroup title="Included in your check-up" items={includedAsCards} color="#0ea5e9" defaultCollapsed />

      {!!coming_up.length && (
        <div style={{ marginTop: 24 }}>
          <div style={{ ...s.groupHead, cursor: 'default' }}>
            <span style={{ ...s.dot, background: '#cbd5e1' }} />
            <span style={{ fontWeight: 700, color: '#0f172a' }}>Coming up</span>
            <span style={s.count}>{coming_up.length}</span>
          </div>
          <div style={s.chips}>
            {coming_up.map((item, i) => (
              <div key={item.item_id || i} style={s.chip}>
                <span style={{ fontWeight: 600, color: '#334155' }}>{item.label}</span>
                {item.age_min && <span style={{ color: '#94a3b8' }}> · from age {item.age_min}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InsuranceAnalyzer({ onUploadSuccess }) {
  const [phase, setPhase] = useState('idle')   // idle | analyzing | result | error
  const [stepIdx, setStepIdx] = useState(0)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [form, setForm] = useState({ name: '', age: '', gender: '' })
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [tab, setTab] = useState('coverage')
  const fileRef = useRef()
  const stepTimer = useRef(null)

  function handleField(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function startStepCycle() {
    let idx = 0
    setStepIdx(0)
    stepTimer.current = setInterval(() => {
      idx = Math.min(idx + 1, ANALYSIS_STEPS.length - 1)
      setStepIdx(idx)
    }, 4000)
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
    setTab('coverage')
    if (fileRef.current) fileRef.current.value = ''
  }

  if (phase === 'analyzing') {
    return (
      <div style={{ ...s.panel, textAlign: 'center', padding: '48px 24px' }}>
        <div style={s.spinner} />
        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a', marginBottom: 24 }}>
          Analyzing your policy…
        </div>
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
          {ANALYSIS_STEPS.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700,
                background: i <= stepIdx ? '#4f46e5' : '#e2e8f0',
                color: i <= stepIdx ? '#fff' : '#94a3b8',
                transition: 'background 0.4s',
              }}>
                {i < stepIdx ? '✓' : i + 1}
              </span>
              <span style={{
                fontSize: '0.92rem',
                color: i === stepIdx ? '#0f172a' : i < stepIdx ? '#64748b' : '#94a3b8',
                fontWeight: i === stepIdx ? 600 : 400,
              }}>
                {step}
              </span>
            </div>
          ))}
        </div>
        <p style={{ ...s.muted, marginTop: 28 }}>Usually takes 20–60 seconds.</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={s.panel}>
        <div style={s.errorBox}>{errorMsg}</div>
        <button onClick={reset} style={s.btn}>Try again</button>
      </div>
    )
  }

  if (phase === 'result' && result) {
    const { record, coverage, checkup_plan, used_demo } = result
    const initials = record.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    const coveredCount = (coverage?.rows || []).filter(isMentioned).length
    const planCount = checkup_plan
      ? (checkup_plan.recommended?.length || 0) + (checkup_plan.included_in_insurance?.length || 0)
      : null
    const tabs = [
      { id: 'coverage', label: 'Coverage', count: coverage ? coveredCount : null },
      { id: 'plan', label: 'Preventive health plan', count: planCount },
    ]
    return (
      <div>
        <div style={s.profile}>
          <div style={s.avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>{record.name}</div>
            <div style={s.muted}>
              {record.age} years · {record.gender.charAt(0).toUpperCase() + record.gender.slice(1)} · {record.filename}
            </div>
          </div>
          <button onClick={reset} style={s.ghostBtn}>New analysis</button>
        </div>

        <div style={s.tabs} role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}
            >
              {t.label}
              {t.count != null && <span style={{ ...s.tabCount, ...(tab === t.id ? s.tabCountActive : {}) }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Both tabs stay mounted so fetched price estimates survive switching. */}
        <div style={{ display: tab === 'coverage' ? 'block' : 'none' }}>
          <CoverageSection coverage={coverage} />
        </div>
        <div style={{ display: tab === 'plan' ? 'block' : 'none' }}>
          {!checkup_plan && (
            <div style={{ ...s.notice, marginTop: 20 }}>
              {record.filename.toLowerCase().endsWith('.pdf')
                ? 'We could not build a plan from this document.'
                : 'The preventive health plan is only available for PDF files.'}
            </div>
          )}
          <CheckupPlan checkup_plan={checkup_plan} used_demo={used_demo} />
        </div>
      </div>
    )
  }

  // idle — show the form
  return (
    <form onSubmit={handleSubmit} style={{ ...s.panel, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={s.field}>
        <label style={s.label}>Full name</label>
        <input name="name" value={form.name} onChange={handleField} placeholder="Maria Silva" style={s.input} />
      </div>

      <div style={s.row2}>
        <div style={s.field}>
          <label style={s.label}>Age</label>
          <input name="age" type="number" value={form.age} onChange={handleField} placeholder="35" min={1} max={120} style={s.input} />
        </div>
        <div style={s.field}>
          <label style={s.label}>Gender</label>
          <select name="gender" value={form.gender} onChange={handleField} style={s.input}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div style={s.field}>
        <label style={s.label}>Insurance policy</label>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); setFile(e.dataTransfer.files?.[0] || null) }}
          style={{ ...s.drop, ...(dragOver || file ? s.dropActive : {}) }}
        >
          <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{file ? '📄' : '⬆️'}</div>
          {file ? (
            <>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{file.name}</div>
              <div style={s.muted}>{(file.size / 1024).toFixed(0)} KB · click to change</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>Drop your policy PDF here</div>
              <div style={s.muted}>or click to browse · up to 15 MB</div>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ display: 'none' }}
        />
      </div>

      <button type="submit" style={s.btn}>Analyze my policy</button>
    </form>
  )
}

const s = {
  panel: { background: '#fff', borderRadius: 16, padding: '28px 28px', boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06)' },
  section: { background: '#fff', borderRadius: 16, padding: '24px 24px', marginTop: 20, boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06)' },
  h2: { margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' },
  muted: { margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#334155' },
  input: {
    padding: '11px 14px', fontSize: '0.95rem', border: '1.5px solid #e2e8f0', borderRadius: 10,
    outline: 'none', background: '#f8fafc', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  drop: {
    border: '2px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center',
    cursor: 'pointer', background: '#f8fafc', transition: 'all 0.15s',
  },
  dropActive: { borderColor: '#4f46e5', background: '#eef2ff' },
  btn: {
    padding: '14px 0', fontSize: '1rem', fontWeight: 600, background: '#4f46e5', color: '#fff',
    border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
  },
  ghostBtn: {
    padding: '8px 16px', fontSize: '0.85rem', background: '#fff', border: '1.5px solid #e2e8f0',
    borderRadius: 999, cursor: 'pointer', color: '#4f46e5', fontWeight: 600, fontFamily: 'inherit',
  },
  linkBtn: {
    background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', fontSize: '0.82rem',
    fontWeight: 600, padding: '12px 0 0', fontFamily: 'inherit',
  },

  profile: {
    display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 16, padding: '16px 20px',
    boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06)', flexWrap: 'wrap',
  },
  avatar: {
    width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#0ea5e9)',
    color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },


  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '20px 0' },
  stat: { background: '#f8fafc', borderRadius: 12, padding: '14px 16px', border: '1px solid #f1f5f9' },
  statLabel: { fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' },
  statValue: { fontSize: '1.35rem', fontWeight: 700, marginTop: 4, overflowWrap: 'anywhere' },
  statSub: { fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 },

  tableWrap: { overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' },
  th: {
    padding: '11px 14px', background: '#f8fafc', textAlign: 'left', fontWeight: 600, color: '#64748b',
    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  td: { padding: '11px 14px', borderBottom: '1px solid #f1f5f9', color: '#334155', verticalAlign: 'top' },
  cellSub: { fontSize: '0.74rem', color: '#94a3b8', marginTop: 4, whiteSpace: 'nowrap' },

  groupHead: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none',
    borderBottom: '1px solid #e2e8f0', padding: '0 0 10px', cursor: 'pointer', fontSize: '0.98rem',
    fontFamily: 'inherit', textAlign: 'left', flexWrap: 'wrap',
  },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  count: { background: '#f1f5f9', color: '#475569', borderRadius: 999, padding: '1px 8px', fontSize: '0.75rem', fontWeight: 600 },

  card: { padding: '16px 18px', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' },
  cardTitle: { fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' },
  cardSub: { fontSize: '0.82rem', color: '#64748b', marginTop: 3 },
  price: { fontWeight: 700, fontSize: '1.05rem' },
  evidence: { marginTop: 12, background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: '#334155' },
  quote: { color: '#64748b', fontStyle: 'italic', marginTop: 2 },

  tabs: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 20, padding: 6,
    background: '#e2e8f0', borderRadius: 16, width: '100%',
  },
  tab: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px 12px',
    border: 'none', borderRadius: 12, background: 'transparent', color: '#475569', fontWeight: 700,
    fontSize: '1.05rem', fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s', minWidth: 0,
    textAlign: 'center',
  },
  tabActive: { background: '#fff', color: '#0f172a', boxShadow: '0 1px 3px rgba(15,23,42,0.12)' },
  tabCount: { background: '#cbd5e1', color: '#475569', borderRadius: 999, padding: '1px 8px', fontSize: '0.74rem' },
  tabCountActive: { background: '#e0e7ff', color: '#4338ca' },

  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', marginTop: 12 },
  calendarBtn: {
    padding: '7px 14px', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
    background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 999,
    cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
  },
  estimateBtn: {
    padding: '7px 14px', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
    background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: 999, cursor: 'pointer',
  },
  estimateBox: {
    width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: '0.84rem',
    background: 'linear-gradient(135deg,#eef2ff,#f0f9ff)', border: '1px solid #e0e7ff',
  },
  estimateLabel: { fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' },
  estimateRange: { fontSize: '1.15rem', fontWeight: 800, color: '#312e81' },
  sourceChip: {
    fontSize: '0.72rem', color: '#4338ca', background: '#fff', border: '1px solid #e0e7ff',
    borderRadius: 999, padding: '2px 8px', textDecoration: 'none',
  },
  miniSpinner: {
    width: 14, height: 14, borderRadius: '50%', border: '2px solid #c7d2fe', borderTopColor: '#4f46e5',
    animation: 'spin 0.8s linear infinite', display: 'inline-block', flexShrink: 0,
  },

  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 12px', fontSize: '0.82rem' },

  notice: { padding: '10px 14px', background: '#eef2ff', color: '#3730a3', borderRadius: 10, fontSize: '0.86rem', lineHeight: 1.5 },
  noticeWarn: { background: '#fffbeb', color: '#92400e' },
  errorBox: { padding: '12px 16px', background: '#fef2f2', color: '#991b1b', borderRadius: 10, fontSize: '0.9rem', marginBottom: 14 },
  spinner: {
    width: 40, height: 40, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#4f46e5',
    animation: 'spin 0.8s linear infinite', margin: '0 auto 20px',
  },
}
