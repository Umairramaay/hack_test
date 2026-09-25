import { useRef, useState } from 'react'
import {
  CalendarPlus, Check, ChevronDown, ChevronUp, CircleAlert, CircleCheck, CircleHelp, CircleX,
  Clock, FileText, Info, LoaderCircle, RefreshCw, Sparkles, Upload,
} from 'lucide-react'
import ProviderSearch from './ProviderSearch'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const ANALYSIS_STEPS = [
  'Reading your policy',
  'Extracting coverage',
  'Verifying quotes',
  'Building your plan',
]

const ICON = { size: 16, strokeWidth: 1.5 }

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

function Tag({ children, icon: Icon, variant }) {
  return (
    <span className={`tag${variant ? ` tag-${variant}` : ''}`}>
      {Icon && <Icon size={14} strokeWidth={1.5} />}
      {children}
    </span>
  )
}

function Notice({ children }) {
  return (
    <div style={s.notice}>
      <Info {...ICON} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  )
}

function EmptyState({ title, children }) {
  return (
    <div style={s.empty}>
      <div style={{ fontWeight: 500 }}>{title}</div>
      {children && <div className="muted" style={{ marginTop: 4, fontSize: 14 }}>{children}</div>}
    </div>
  )
}

function WaitingCell({ days, startDate }) {
  const w = waitingStatus(days, startDate)
  if (w.kind === 'none') return <Tag icon={Check} variant="green">No wait</Tag>
  if (w.kind === 'unknown') return <Tag icon={Clock} variant="amber">{w.days}-day wait</Tag>
  if (w.kind === 'active') {
    return (
      <div>
        <Tag icon={Check} variant="green">Covered now</Tag>
        <div style={s.cellSub}>Wait ended {formatDate(w.eligible)}</div>
      </div>
    )
  }
  return (
    <div>
      <Tag icon={Clock} variant="amber"><span className="num">{w.left}</span> days left</Tag>
      <div style={s.cellSub}>Covered from {formatDate(w.eligible)}</div>
    </div>
  )
}

const COVERAGE_TAG = { free: 'green', not_covered: 'red' }

function CoverageValue({ n }) {
  const variant = COVERAGE_TAG[n?.type]
  return variant ? <Tag variant={variant}>{networkText(n)}</Tag> : networkText(n)
}

// ─── Coverage (what was read from the PDF) ───────────────────────────────────

function CoverageSection({ coverage }) {
  const [showAll, setShowAll] = useState(false)
  if (!coverage) {
    return <EmptyState title="No coverage found">We couldn't read coverage details from this document.</EmptyState>
  }

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
      <div style={s.statGrid}>
        <Stat label="Insurer" value={coverage.insurer || 'Unknown'} sub={coverage.product_as_written} />
        <Stat label="Services covered" value={mentioned.length} sub={`of ${rows.length} checked`} />
        {hasStart && <Stat label="Usable today" value={activeNow} color="#15803d" sub={`as of ${formatDate(new Date())}`} />}
        {hasStart && <Stat label="In waiting period" value={inWaiting} color={inWaiting > 0 ? '#c2410c' : undefined} sub={`policy started ${formatDate(parseDate(startDate))}`} />}
      </div>

      {mentioned.length === 0 && !showAll ? (
        <EmptyState title="No covered services found">
          The document didn't list any services we recognise.
        </EmptyState>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {['Service', 'In-network', 'Out-of-network', 'Annual limit', 'Waiting period'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr key={row.service_id || i}>
                  <td style={{ fontWeight: 500 }}>{SERVICE_LABELS[row.service_id] || row.service_id}</td>
                  <td className="num"><CoverageValue n={row.network} /></td>
                  <td className="num"><CoverageValue n={row.out_of_network} /></td>
                  <td className="num">{row.limit_pool ? (poolMap[row.limit_pool] || row.limit_pool) : '—'}</td>
                  <td><WaitingCell days={row.waiting_days} startDate={startDate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hidden > 0 && (
        <button onClick={() => setShowAll(v => !v)} className="btn btn-text" style={{ marginTop: 16 }}>
          {showAll ? 'Hide services not in your policy' : `Show ${hidden} services not mentioned in your policy`}
        </button>
      )}
    </section>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="card" style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div className="num" style={{ ...s.statValue, ...(color ? { color } : {}) }}>{value}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  )
}

// ─── Checkup plan ────────────────────────────────────────────────────────────

function CheckupItemCard({ item, insurer }) {
  const [open, setOpen] = useState(false)
  const bo = item.best_option || {}

  const isFree = bo.source === 'insurance_checkup' || bo.source === 'sns'
  const costText = isFree ? 'Free' : (bo.cost_text || (bo.cost_eur != null ? `€${bo.cost_eur}` : '—'))
  const hasEvidence = bo.source === 'insurance_policy' && (!!bo.evidence?.length || !!bo.breakdown?.length)
  const showStatus = item.status && item.status !== 'eligible now' && item.status !== 'note'

  return (
    <div className="plan-row">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={s.rowTitle}>{item.label}</span>
            {showStatus && <Tag variant={item.status === 'due now' ? 'amber' : undefined}>{item.status}</Tag>}
            {item.strength && item.strength !== 'general' && (
              <Tag variant={item.strength === 'official' ? 'green' : 'blue'}>{item.strength}</Tag>
            )}
          </div>
          {item.screens_for && <div style={s.rowSub}>Screens for {item.screens_for}</div>}
          {bo.label && <div style={s.rowSub}>{bo.label}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: '45%' }}>
          <div className="num" style={{ ...s.price, color: isFree ? 'var(--free)' : 'var(--text)' }}>{costText}</div>
          {hasEvidence && (
            <button onClick={() => setOpen(o => !o)} className="btn btn-text" style={{ marginTop: 4 }}>
              {open ? 'Hide source' : 'Why this price?'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div style={s.evidence}>
          {bo.breakdown?.length > 0 ? bo.breakdown.map((b, i) => (
            <div key={i} style={{ marginTop: i ? 8 : 0 }}>
              <span style={{ fontWeight: 500 }}>{SERVICE_LABELS[b.service_id] || b.service_id}</span>
              <span className="num" style={{ marginLeft: 8 }}>{b.cost_text}</span>
              {b.evidence?.quote && (
                <div style={s.quote}>
                  {b.evidence.page != null && `Page ${b.evidence.page}: `}“{b.evidence.quote}”
                </div>
              )}
            </div>
          )) : bo.evidence?.map((ev, i) => (
            <div key={i} style={{ ...s.quote, marginTop: i ? 8 : 0 }}>
              {ev.page != null && `Page ${ev.page}: `}“{ev.quote}”
            </div>
          ))}
        </div>
      )}

      <div style={s.actions}>
        <ProviderSearch itemId={item.item_id} label={item.label} />
        <CalendarButton item={item} costText={costText} />
        {!isFree && <PriceEstimate insurer={insurer} label={item.label} services={(bo.breakdown || []).map(b => b.service_id)} />}
      </div>
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
    <a href={`https://calendar.google.com/calendar/render?${params}`} target="_blank" rel="noreferrer" className="btn btn-outline">
      <CalendarPlus {...ICON} /> Add to calendar
    </a>
  )
}

const NETWORK_TAG = {
  yes: { icon: CircleCheck, text: 'Likely in network', variant: 'green' },
  no: { icon: CircleX, text: 'Not in network', variant: 'red' },
  unknown: { icon: CircleHelp, text: 'Network unknown' },
}

// Optional: asks the backend to search the web for typical private prices in Portugal.
function PriceEstimate({ label, services, insurer }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  async function fetchEstimate() {
    setState('loading')
    try {
      const res = await fetch(`${API_BASE}/api/price-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, services, insurer }),
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
      <button onClick={fetchEstimate} className="btn btn-outline">
        <Sparkles {...ICON} /> Get price estimate
      </button>
    )
  }
  if (state === 'loading') {
    return (
      <div style={s.panel}>
        <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <LoaderCircle {...ICON} className="spinner" /> Searching prices{insurer ? ` and ${insurer} network` : ''}…
        </div>
        <div className="skeleton" style={{ height: 20, width: 160, marginTop: 16 }} />
        <div className="skeleton" style={{ height: 12, width: '80%', marginTop: 8 }} />
        {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 40, marginTop: 8 }} />)}
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div style={{ ...s.panel, ...s.errorInline }}>
        <CircleAlert {...ICON} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Couldn't get an estimate. {error}</span>
        <button onClick={fetchEstimate} className="btn btn-outline"><RefreshCw {...ICON} /> Retry</button>
      </div>
    )
  }
  return (
    <div style={s.panel}>
      <div style={s.statLabel}>Estimated private price</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <span className="num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>€{data.min_eur} – €{data.max_eur}</span>
        {data.typical_eur != null && <span className="muted num" style={{ fontSize: 14 }}>typically €{data.typical_eur}</span>}
      </div>
      {data.summary && <div className="muted" style={{ marginTop: 4, fontSize: 14 }}>{data.summary}</div>}

      {data.clinics?.length > 0 && (
        <>
          <div style={{ ...s.statLabel, marginTop: 16 }}>
            Clinics{insurer ? ` · checked against ${insurer} network` : ''}
          </div>
          <div style={s.clinicList}>
            {data.clinics.map(c => {
              const net = NETWORK_TAG[c.in_network] || NETWORK_TAG.unknown
              const tag = <Tag icon={net.icon} variant={net.variant}>{net.text}</Tag>
              return (
                <div key={c.name} style={s.clinicRow}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{c.name}</span>
                  {c.network_source_url
                    ? <a href={c.network_source_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{tag}</a>
                    : tag}
                  <span className="num" style={{ width: 48, textAlign: 'right', fontWeight: 500 }}>
                    {c.price_eur != null ? `€${c.price_eur}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {data.sources?.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
          <span className="muted">Sources:</span>
          {data.sources.map(src => (
            <a key={src.url} href={src.url} target="_blank" rel="noreferrer">
              {src.title.length > 40 ? `${src.title.slice(0, 40)}…` : src.title}
            </a>
          ))}
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        AI estimate from web search. Prices vary by clinic; your network discount may lower them.
      </div>
    </div>
  )
}

function CheckupGroup({ title, hint, items, insurer, defaultCollapsed = false }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  if (!items?.length) return null
  const Chevron = open ? ChevronUp : ChevronDown
  return (
    <div style={{ marginTop: 32 }}>
      <button onClick={() => setOpen(o => !o)} style={s.groupHead}>
        <h3 style={{ fontSize: 16 }}>{title}</h3>
        <span className="tab-count">{items.length}</span>
        {hint && <span className="muted" style={{ fontSize: 14 }}>· {hint}</span>}
        <Chevron {...ICON} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
      </button>
      {open && (
        <div className="card" style={{ marginTop: 8 }}>
          {items.map((item, i) => <CheckupItemCard key={item.item_id || i} item={item} insurer={insurer} />)}
        </div>
      )}
    </div>
  )
}

function CheckupPlan({ checkup_plan, used_demo, insurer }) {
  if (!checkup_plan) return null
  const { recommended = [], included_in_insurance = [], coming_up = [],
    fallback_message, product_used, product_inferred } = checkup_plan

  if (!recommended.length && !included_in_insurance.length && !coming_up.length && !fallback_message) {
    return <EmptyState title="No screenings to recommend right now">Nothing in the screening guidelines matches your age and sex yet.</EmptyState>
  }

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
      <p className="muted" style={{ margin: 0 }}>Screenings recommended for you, and what each one costs with your policy.</p>

      {(used_demo || (product_inferred && product_used) || fallback_message) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {used_demo && <Notice>Showing a sample policy. We couldn't read this document, so prices may not match yours.</Notice>}
          {product_inferred && product_used && (
            <Notice>Looks like <strong style={{ fontWeight: 500 }}>{product_used}</strong>. If your product differs, check-up contents may vary.</Notice>
          )}
          {fallback_message && <Notice>{fallback_message}</Notice>}
        </div>
      )}

      <CheckupGroup insurer={insurer} title="Official recommendations" hint="National screening programme" items={official} />
      <CheckupGroup insurer={insurer} title="Guideline recommendations" hint="Clinical guidelines" items={guideline} />
      <CheckupGroup insurer={insurer} title="General recommendations" items={general} />
      <CheckupGroup insurer={insurer} title="Included in your check-up" items={includedAsCards} defaultCollapsed />

      {!!coming_up.length && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 16 }}>Coming up</h3>
            <span className="tab-count">{coming_up.length}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {coming_up.map((item, i) => (
              <Tag key={item.item_id || i}>
                <span style={{ color: 'var(--text)' }}>{item.label}</span>
                {item.age_min && <span> · from age {item.age_min}</span>}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Loading / error screens ─────────────────────────────────────────────────

function AnalyzingScreen({ stepIdx, fileName }) {
  return (
    <div>
      <div className="card" style={{ ...s.profile, gap: 16 }}>
        <div style={s.fileIcon}><FileText size={20} strokeWidth={1.5} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>Analyzing {fileName || 'your policy'}</div>
          <div className="muted" style={{ fontSize: 14 }}>Usually takes 20–60 seconds</div>
        </div>
        <LoaderCircle size={20} strokeWidth={1.5} className="spinner" style={{ color: 'var(--accent)' }} />
      </div>

      <ol style={s.steps}>
        {ANALYSIS_STEPS.map((step, i) => {
          const done = i < stepIdx
          const current = i === stepIdx
          return (
            <li key={step} style={{ ...s.step, color: done || current ? 'var(--text)' : 'var(--muted)', fontWeight: current ? 500 : 400 }}>
              <span style={{ ...s.stepDot, ...(done ? s.stepDone : current ? s.stepCurrent : {}) }}>
                {done ? <Check size={12} strokeWidth={2} /> : current ? <LoaderCircle size={12} strokeWidth={2} className="spinner" /> : null}
              </span>
              {step}
            </li>
          )
        })}
      </ol>

      {/* Skeleton of the results page */}
      <div className="tabs" style={{ pointerEvents: 'none' }}>
        <div className="tab" aria-selected="true">Coverage</div>
        <div className="tab">Preventive health plan</div>
      </div>
      <div style={{ ...s.statGrid, marginTop: 24 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card" style={s.stat}>
            <div className="skeleton" style={{ height: 12, width: '50%' }} />
            <div className="skeleton" style={{ height: 24, width: '40%', marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '8px 0' }}>
            <div className="skeleton" style={{ height: 16, flex: 2 }} />
            <div className="skeleton" style={{ height: 16, flex: 1 }} />
            <div className="skeleton" style={{ height: 16, flex: 1 }} />
            <div className="skeleton" style={{ height: 16, flex: 1 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InsuranceAnalyzer({ onUploadSuccess }) {
  const [phase, setPhase] = useState('idle')   // idle | analyzing | result | error
  const [stepIdx, setStepIdx] = useState(0)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [form, setForm] = useState({ name: '', age: '', gender: '' })
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [tab, setTab] = useState('coverage')
  const fileRef = useRef()
  const stepTimer = useRef(null)

  function handleField(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setFieldError('')
  }

  function pickFile(f) {
    setFile(f || null)
    setFieldError('')
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

  async function submit() {
    const age = parseInt(form.age, 10)
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
      setTab('coverage')
      setPhase('result')
      onUploadSuccess?.()
    } catch (err) {
      stopStepCycle()
      setErrorMsg(err.message === 'Failed to fetch' ? "We couldn't reach the server. Check your connection and try again." : err.message)
      setPhase('error')
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const age = parseInt(form.age, 10)
    if (!form.name.trim()) return setFieldError('Enter your full name.')
    if (!age || age < 1 || age > 120) return setFieldError('Enter a valid age (1–120).')
    if (!form.gender) return setFieldError('Select a gender.')
    if (!file) return setFieldError('Add your policy PDF.')
    submit()
  }

  function reset() {
    setPhase('idle')
    setResult(null)
    setErrorMsg('')
    setFieldError('')
    setForm({ name: '', age: '', gender: '' })
    setFile(null)
    setTab('coverage')
    if (fileRef.current) fileRef.current.value = ''
  }

  if (phase === 'analyzing') {
    return <div style={s.resultsWrap}><AnalyzingScreen stepIdx={stepIdx} fileName={file?.name} /></div>
  }

  if (phase === 'error') {
    return (
      <div style={s.formWrap}>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={s.errorIcon}><CircleAlert size={20} strokeWidth={1.5} /></div>
          <h2 style={{ fontSize: 20, marginTop: 16 }}>We couldn't analyze this policy</h2>
          <p className="muted" style={{ margin: '8px auto 0', maxWidth: 440 }}>{errorMsg}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button onClick={submit} className="btn btn-primary"><RefreshCw {...ICON} /> Try again</button>
            <button onClick={() => setPhase('idle')} className="btn btn-outline btn-lg" style={{ height: 48 }}>Edit details</button>
          </div>
        </div>
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
      <div style={s.resultsWrap}>
        <div className="card" style={s.profile}>
          <div style={s.avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>{record.name}</div>
            <div className="muted" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {record.age} years · {record.gender.charAt(0).toUpperCase() + record.gender.slice(1)} · {record.filename}
            </div>
          </div>
          <button onClick={reset} className="btn btn-outline btn-lg">New analysis</button>
        </div>

        <div className="tabs" role="tablist">
          {tabs.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="tab">
              {t.label}
              {t.count != null && <span className="tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Both tabs stay mounted so fetched price estimates survive switching. */}
        <div style={{ display: tab === 'coverage' ? 'block' : 'none' }}>
          <CoverageSection coverage={coverage} />
        </div>
        <div style={{ display: tab === 'plan' ? 'block' : 'none' }}>
          {!checkup_plan ? (
            <EmptyState title="No health plan for this document">
              {record.filename.toLowerCase().endsWith('.pdf')
                ? 'We could not build a plan from this document.'
                : 'The preventive health plan is only available for PDF files.'}
            </EmptyState>
          ) : (
            <CheckupPlan checkup_plan={checkup_plan} used_demo={used_demo} insurer={used_demo ? '' : (coverage?.insurer || '')} />
          )}
        </div>
      </div>
    )
  }

  // idle — show the form
  return (
    <div style={s.formWrap}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, lineHeight: 1.2 }}>Understand your health insurance</h1>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 16 }}>
          Upload your policy to see what's covered, what you can use today, and which check-ups you can get for free.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={s.fieldWrap}>
          <label htmlFor="name" style={s.label}>Full name</label>
          <input id="name" name="name" value={form.name} onChange={handleField} placeholder="Maria Silva" className="field" autoComplete="name" />
        </div>

        <div style={s.row2}>
          <div style={s.fieldWrap}>
            <label htmlFor="age" style={s.label}>Age</label>
            <input id="age" name="age" type="number" inputMode="numeric" value={form.age} onChange={handleField} placeholder="35" min={1} max={120} className="field" />
          </div>
          <div style={s.fieldWrap}>
            <label htmlFor="gender" style={s.label}>Gender</label>
            <select id="gender" name="gender" value={form.gender} onChange={handleField} className="field" style={{ color: form.gender ? 'var(--text)' : '#a0a0aa' }}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div style={s.fieldWrap}>
          <span style={s.label}>Insurance policy</span>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]) }}
            className={`dropzone${dragOver ? ' is-active' : ''}`}
          >
            <div className="dropzone-icon">
              {file ? <FileText size={20} strokeWidth={1.5} /> : <Upload size={20} strokeWidth={1.5} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {file ? (
                <>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                  <div className="muted num" style={{ fontSize: 14 }}>{(file.size / 1024).toFixed(0)} KB</div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 500 }}>Upload your policy PDF</div>
                  <div className="muted" style={{ fontSize: 14 }}>Drag and drop, or click to browse · up to 15 MB</div>
                </>
              )}
            </div>
            {file && <span className="btn-text btn">Change</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={e => pickFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </div>

        {fieldError && (
          <div role="alert" style={s.errorInline}>
            <CircleAlert {...ICON} style={{ flexShrink: 0 }} /> {fieldError}
          </div>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Analyze my policy</button>
      </form>
    </div>
  )
}

const s = {
  formWrap: { maxWidth: 720, margin: '0 auto' },
  resultsWrap: { maxWidth: 960, margin: '0 auto' },
  section: { paddingTop: 24 },

  fieldWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 },
  label: { fontSize: 14, fontWeight: 500 },

  profile: { display: 'flex', alignItems: 'center', gap: 16, padding: 16, flexWrap: 'wrap' },
  avatar: {
    width: 40, height: 40, borderRadius: '50%', background: 'var(--subtle)', color: 'var(--text)',
    fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  fileIcon: {
    width: 40, height: 40, borderRadius: 10, background: 'var(--subtle)', color: 'var(--muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(176px, 1fr))', gap: 16, marginBottom: 16 },
  stat: { padding: 16 },
  statLabel: { fontSize: 13, color: 'var(--muted)' },
  statValue: { fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 4, overflowWrap: 'anywhere' },
  statSub: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  cellSub: { fontSize: 12, color: 'var(--muted)', marginTop: 4, whiteSpace: 'nowrap' },

  groupHead: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none',
    padding: '8px 0', cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--text)', flexWrap: 'wrap',
  },
  rowTitle: { fontWeight: 500, fontSize: 15 },
  rowSub: { fontSize: 14, color: 'var(--muted)', marginTop: 4 },
  price: { fontWeight: 600, fontSize: 15 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', marginTop: 16 },
  evidence: { marginTop: 16, background: 'var(--subtle)', borderRadius: 8, padding: '8px 16px', fontSize: 14 },
  quote: { color: 'var(--muted)', fontStyle: 'italic', marginTop: 4 },

  panel: { width: '100%', padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: '#fbfbfc', fontSize: 14 },
  clinicList: { marginTop: 8, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' },
  clinicRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', marginTop: -1 },

  notice: {
    display: 'flex', gap: 8, padding: '12px 16px', background: 'var(--subtle)', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 10, fontSize: 14,
  },
  empty: {
    marginTop: 24, padding: '40px 24px', textAlign: 'center', border: '1px dashed var(--border-strong)',
    borderRadius: 'var(--radius)', background: 'var(--surface)',
  },
  errorInline: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, fontSize: 14,
    color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid #fecdca',
  },
  errorIcon: {
    width: 40, height: 40, margin: '0 auto', borderRadius: '50%', background: 'var(--danger-bg)', color: 'var(--danger)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  steps: { listStyle: 'none', padding: 0, margin: '24px 0 0', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14 },
  step: { display: 'flex', alignItems: 'center', gap: 8 },
  stepDot: {
    width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--border-strong)', background: 'var(--surface)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepDone: { background: 'var(--text)', borderColor: 'var(--text)', color: '#fff' },
  stepCurrent: { borderColor: 'var(--accent)', color: 'var(--accent)' },
}
