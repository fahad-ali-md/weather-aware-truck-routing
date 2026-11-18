import { useEffect, useRef, useState } from 'react'
import { TripForm } from './features/trip-planner/TripForm'
import { CheckpointTable, RouteResults } from './features/route-results/RouteResults'
import { ForecastSlider, WeatherMap } from './features/weather-map/WeatherMap'
import { analyze, api, colors, levels } from './lib/api'
import type { Plan, TripInput } from './lib/api'
import './App.css'

function App() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [selected, setSelected] = useState(0)
  const [editingTrip, setEditingTrip] = useState(true)
  const [submittedTrip, setSubmittedTrip] = useState<TripInput | null>(null)
  const [hour, setHour] = useState(0)
  const [heatmap, setHeatmap] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const rulesDialog = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!showRules) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    rulesDialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowRules(false)
      if (event.key !== 'Tab') return
      const items = rulesDialog.current?.querySelectorAll<HTMLElement>('button, a[href], input, summary, [tabindex="0"]')
      if (!items?.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [showRules])
  const active = useRef<AbortController | null>(null)
  useEffect(() => {
    api<{ routing_configured: boolean }>('status').then(value => setConfigured(value.routing_configured)).catch(() => setConfigured(false))
    return () => active.current?.abort()
  }, [])

  async function submit(input: TripInput) {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setSubmittedTrip(input); setEditingTrip(false)
    setBusy(true); setError(''); setPlan(null); setSelected(0); setHour(0); setFocusId(null)
    setProgress('Finding truck routes…')
    try {
      const result = await analyze(input, controller.signal, (next, message) => { setPlan(next); setProgress(message) })
      if (controller.signal.aborted) return
      setPlan(result)
      setSelected(result.recommended_index ?? 0)
      setConfigured(true)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Unable to analyze the trip. Please retry.')
        setEditingTrip(true)
      }
    } finally {
      if (active.current === controller) { setBusy(false); setProgress('') }
    }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#route-map">Skip to route map</a>
    <header className="app-header">
      <a className="brand" href="/" aria-label="Wayfinder home">
        <svg className="brand-mark" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor" /><path d="M9 23l6-14h8l-6 14H9Z" stroke="white" strokeWidth="1.7" /><path d="m14 19 3-6" stroke="white" strokeWidth="1.7" strokeLinecap="round" /></svg>
        <span>wayfinder<span className="brand-period">.</span></span>
        <span className="brand-tagline">Weather-aware truck routing</span>
      </a>
      <div className="header-right"><span className={`connection ${configured ? 'connected' : ''}`}><i />{configured === null ? 'Connecting' : configured ? 'Forecasts connected' : 'API key needed'}</span><button className="header-help" onClick={() => setShowRules(true)}>Risk guide <span aria-hidden="true">?</span></button></div>
    </header>
    <nav className="mobile-nav" aria-label="Workspace sections"><a href="#trip-planner">{editingTrip ? 'Plan trip' : 'Route options'}</a><a href="#route-map">Route map</a>{plan && <a href="#checkpoints">Checkpoints</a>}</nav>
    <div className="main-layout">
      <aside className="sidebar" id="trip-planner" aria-label="Trip planner and route comparison">
        {!editingTrip && submittedTrip && <div className="directions-summary">
          <div className="directions-summary-top"><button className="directions-back" aria-label="Edit trip details" onClick={() => setEditingTrip(true)} disabled={busy}>←</button><h1>Your truck routes</h1><span className="directions-mode" title="Truck routing"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h11v11H3V6Zm11 4h4l3 4v3h-7v-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="7" cy="18" r="2" fill="white" stroke="currentColor" strokeWidth="1.7" /><circle cx="18" cy="18" r="2" fill="white" stroke="currentColor" strokeWidth="1.7" /></svg></span></div>
          <div className="directions-stops"><div><i className="stop-origin" /><span>{submittedTrip.origin}</span></div><div><i className="stop-destination" /><span>{submittedTrip.destination}</span></div></div>
          <div className="directions-settings"><span>{new Date(submittedTrip.departure).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span>{submittedTrip.load_lb.toLocaleString()} lb</span><button disabled={busy} onClick={() => setEditingTrip(true)}>Edit trip</button></div>
        </div>}
        <div hidden={!editingTrip}>
          {plan && <button className="back-to-routes" onClick={() => setEditingTrip(false)}>← Back to route options</button>}
          <TripForm busy={busy} onSubmit={submit} onCancel={() => { active.current?.abort(); setPlan(null); setBusy(false); setProgress(''); setEditingTrip(true) }} />
        </div>
        {error && <div className="sidebar-message notice danger" role="alert">{error}</div>}
        {busy && <div className="directions-progress" role="status"><span className="spinner" /><div><strong>Checking your route options</strong><p>{progress}</p></div><button onClick={() => { active.current?.abort(); setPlan(null); setBusy(false); setProgress(''); setEditingTrip(true) }}>Cancel</button></div>}
        {plan && !editingTrip && <RouteResults plan={plan} selected={selected} onSelect={setSelected} busy={busy} />}
      </aside>
      <main className="workspace">
        <section className="map-section" id="route-map" aria-labelledby="map-title">
          <div className="map-heading"><div><span className="eyebrow">Route overview</span><h2 id="map-title">{plan ? `${plan.origin.label.split(',')[0]} → ${plan.destination.label.split(',')[0]}` : 'See the road ahead.'}</h2><p>{plan ? `${plan.routes.length} truck routes · Checkpoints every ${plan.spacing} miles · ${plan.load_lb.toLocaleString()} lb cargo` : 'Compare truck routes with weather matched to your arrival.'}</p></div>{plan && <span className="map-selection">Viewing route {String.fromCharCode(65 + selected)}</span>}</div>
          <div className="map-stage"><WeatherMap plan={plan} selected={selected} onSelect={setSelected} focusId={focusId} hour={hour} heatmap={heatmap} /></div>
          <div className="map-key"><span className="map-key-title">{heatmap && plan ? `Forecast risk · +${hour}h` : 'Arrival-time risk'}</span><div className="map-legend" aria-label="Weather risk legend">{levels.map(level => <span key={level}><i style={{ background: colors[level] }} />{level}</span>)}</div></div>
          <ForecastSlider key={`${plan?.departure}:${plan?.routes[selected]?.id}`} departure={plan?.departure} route={plan?.routes[selected]} hour={hour} setHour={setHour} heatmap={heatmap} setHeatmap={setHeatmap} />
        </section>
        {plan?.warnings.map(warning => <div className="workspace-notice notice" key={warning}>{warning}</div>)}
        {plan && <CheckpointTable route={plan.routes[selected]} onFocus={id => { setFocusId(null); requestAnimationFrame(() => setFocusId(id)); document.querySelector('.map-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />}
        {!plan && <section className="explanation-strip" aria-label="How to plan a trip"><div><span className="explanation-number">1</span><span><strong>Enter your trip</strong><small>Add stops, departure, and cargo.</small></span></div><div><span className="explanation-number">2</span><span><strong>Compare the routes</strong><small>See weather risk at arrival.</small></span></div><div><span className="explanation-number">3</span><span><strong>Explore the forecast</strong><small>Play through the next 48 hours.</small></span></div></section>}
        <footer className="workspace-footer"><span>Routing © TomTom · Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></span><span>Forecasts support planning; conditions can change.</span></footer>
      </main>
    </div>
    {showRules && <div className="modal-backdrop" onClick={() => setShowRules(false)}><section ref={rulesDialog} className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={() => setShowRules(false)} aria-label="Close risk rules">×</button><span className="eyebrow">THE LOGIC BEHIND THE ROUTE</span><h2 id="rules-title">Weather first. Time second.</h2><p>Each checkpoint takes the highest risk from wind, rain, snow, and cargo load.</p><div className="table-scroll"><table><thead><tr><th>Risk</th><th>Wind · mph</th><th>Rain · in/hr</th><th>Snow · in/hr</th></tr></thead><tbody><tr><td>Low</td><td>&lt;25</td><td>&lt;0.10</td><td>&lt;0.5</td></tr><tr><td>Moderate</td><td>25–&lt;35</td><td>0.10–&lt;0.25</td><td>0.5–&lt;1</td></tr><tr><td>High</td><td>35–&lt;45</td><td>0.25–&lt;0.50</td><td>1–&lt;2</td></tr><tr><td>Severe</td><td>45–&lt;55</td><td>0.50–1</td><td>2–3</td></tr><tr><td>No Travel</td><td>≥55</td><td>&gt;1</td><td>&gt;3</td></tr></tbody></table></div><p>At 45–&lt;55 mph, cargo over 30,000 lb means No Travel. At 35–&lt;45 mph, cargo over 40,000 lb means Severe. Wind ≥55 mph means No Travel for every load.</p><p>Routes with any No Travel or unknown checkpoint are excluded. Remaining routes are ranked by Severe miles, High miles, distance-weighted average risk (0–4), then duration. Every road mile is counted once.</p><p className="muted">At overlapping rain and snow boundaries, the higher category applies. The slider inspects weather along sampled routes at departure +0–48h; changing departure requires a new analysis.</p></section></div>}
  </div>
}
export default App
