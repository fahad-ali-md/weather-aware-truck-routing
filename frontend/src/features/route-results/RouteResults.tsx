import { colors, duration, time, unknownRisk } from '../../lib/api'
import type { Plan, Route } from '../../lib/api'

export function RouteResults({ plan, selected, onSelect, busy }: { plan: Plan; selected: number; onSelect: (index: number) => void; busy: boolean }) {
  return <section className="route-results" aria-labelledby="route-options-title">
    <div className="route-list-heading"><h2 id="route-options-title">{plan.routes.length} route options</h2><span>Weather-aware</span></div>
    <p className="ranking-note">Lowest weather exposure first</p>
    {!busy && plan.recommended_index === null && <p className="notice danger">No route can be recommended. All routes have No Travel conditions or incomplete forecasts.</p>}
    <div className="route-card-list" role="group" aria-label="Route options">
      {plan.routes.map((route, index) => {
        const summary = route.summary
        const recommended = plan.recommended_index === index
        const blocked = summary && !summary.eligible
        const noTravel = route.checkpoints.some(point => point.risk?.level === 'No Travel')
        return <button key={route.id} type="button" className={`route-card ${selected === index ? 'selected' : ''}`} onClick={() => onSelect(index)} aria-pressed={selected === index}>
          <div className="route-option-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 19V8a4 4 0 0 1 8 0v8a4 4 0 0 0 8 0V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="4" cy="20" r="2" fill="currentColor" /><circle cx="20" cy="4" r="2" fill="currentColor" /></svg></div>
          <div className="route-option-content">
            <div className="route-option-heading"><strong>{route.name}</strong><b className="route-option-duration">{duration(route.duration_seconds)}</b></div>
            <div className="route-option-meta"><span>{Math.round(route.miles).toLocaleString()} miles</span><span>Arrive {time(route.arrival)}</span></div>
            <div className="route-option-status">{recommended ? <span className="badge recommended">✓ Recommended</span> : blocked ? <span className="badge blocked">{noTravel ? 'No Travel' : 'Forecast incomplete'}</span> : <span className="route-alternative">Alternative route</span>}{selected === index && <span className="route-selected-label">Selected</span>}</div>
            <div className="route-risk-line"><span>Severe <b>{summary ? summary.risk_miles.Severe.toFixed(1) : '—'} mi</b></span><span>High <b>{summary ? summary.risk_miles.High.toFixed(1) : '—'} mi</b></span><span>Avg <b>{summary?.average_risk?.toFixed(2) ?? '—'}/4</b></span></div>
            <div className="risk-bar" aria-label="Weather risk distribution">{summary ? Object.entries(summary.risk_miles).map(([level, miles]) => <span key={level} style={{ width: `${miles / route.miles * 100}%`, background: colors[level as keyof typeof colors] }} title={`${level}: ${miles.toFixed(1)} miles`} />) : <span className="pending-bar" />}</div>
          </div>
        </button>
      })}
    </div>
    <p className="route-list-footnote">Select an option to explore its weather on the map.</p>
  </section>
}

export function CheckpointTable({ route, onFocus }: { route: Route; onFocus: (id: string) => void }) {
  return <section className="checkpoint-section" id="checkpoints" aria-labelledby="checkpoints-title">
    <div className="table-heading"><div><span className="eyebrow">Arrival-time forecasts</span><h2 id="checkpoints-title">Weather at each checkpoint</h2></div><span className="count">{route.checkpoints.length} checkpoints</span></div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Checkpoint weather table, scroll horizontally for all columns"><table><thead><tr><th>Checkpoint</th><th>Arrival · local</th><th>Wind</th><th>Rain</th><th>Snow</th><th>Risk at arrival</th></tr></thead><tbody>{route.checkpoints.map((point, index) => {
      const risk = point.risk || unknownRisk
      return <tr key={point.id}><td><button className="checkpoint-link" onClick={() => onFocus(point.id)}>{String(index + 1).padStart(2, '0')} <span>{point.mile.toFixed(1)} mi ↗</span></button></td><td>{new Date(point.eta).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {time(point.eta)}</td><td>{point.wind_mph?.toFixed(1) ?? '—'} <small>mph</small></td><td>{point.rain_in?.toFixed(2) ?? '—'} <small>in/hr</small></td><td>{point.snow_in?.toFixed(2) ?? '—'} <small>in/hr</small></td><td><span className="risk-label" title={risk.reason}><i style={{ background: colors[risk.level] }} />{risk.level}</span></td></tr>
    })}</tbody></table></div>
  </section>
}
