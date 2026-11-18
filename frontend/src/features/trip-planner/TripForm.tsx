import { useState } from 'react'
import type { TripInput } from '../../lib/api'

function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function TripForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (input: TripInput) => void; onCancel: () => void }) {
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [departure, setDeparture] = useState(() => localDate(new Date(Date.now() + 3600000)))
  const [load, setLoad] = useState('30000')
  const [spacing, setSpacing] = useState<10 | 25 | 50>(25)
  const [dateBounds] = useState(() => ({ min: localDate(new Date()), max: localDate(new Date(Date.now() + 48 * 3600000)) }))
  return <form className="trip-form" onSubmit={event => {
    event.preventDefault()
    onSubmit({ origin, destination, departure: new Date(departure).toISOString(), load_lb: Number(load), spacing })
  }}>
    <div className="section-heading"><span className="eyebrow">Trip planner</span><span className="step-label">Up to 3 routes</span></div>
    <h1>Where’s your next haul?</h1>
    <p className="muted intro">Find the best route for your load and the weather ahead.</p>
    <button className="example-trip" type="button" disabled={busy} onClick={() => { setOrigin('Chicago, Illinois'); setDestination('Detroit, Michigan') }}>Try Chicago → Detroit</button>
    <fieldset disabled={busy}>
      <div className="locations">
        <label className="location-field"><span className="location-dot origin-dot" /><span>Origin<input required minLength={2} maxLength={180} placeholder="City or street address" value={origin} onChange={event => setOrigin(event.target.value)} autoComplete="off" /></span></label>
        <div className="location-connector" />
        <button className="swap-button" type="button" title="Swap origin and destination" aria-label="Swap origin and destination" onClick={() => { setOrigin(destination); setDestination(origin) }}>⇅</button>
        <label className="location-field"><span className="location-dot destination-dot" /><span>Destination<input required minLength={2} maxLength={180} placeholder="Where are you headed?" value={destination} onChange={event => setDestination(event.target.value)} autoComplete="off" /></span></label>
      </div>
      <div className="trip-input-row"><label className="field">Departure <span className="field-hint">Your local time</span><input required type="datetime-local" value={departure} min={dateBounds.min} max={dateBounds.max} onChange={event => setDeparture(event.target.value)} /></label>
      <label className="field">Cargo load<span className="input-unit"><input required type="number" min="0" max="100000" step="1" value={load} onChange={event => setLoad(event.target.value)} /><span>lb</span></span></label></div>
      <div className="field">Weather checkpoints<div className="segmented">{([10, 25, 50] as const).map(value => <button key={value} type="button" aria-pressed={spacing === value} className={spacing === value ? 'active' : ''} onClick={() => setSpacing(value)}>{value} <span>mi</span></button>)}</div></div>
      <p className="helper">Forecasts are matched to your arrival at each checkpoint.</p>
      <button className="primary-button" type="submit">{busy ? <><span className="spinner" /> Analyzing trip…</> : <>Compare routes <span aria-hidden="true">→</span></>}</button>
    </fieldset>
    {busy && <button className="text-button cancel" type="button" onClick={onCancel}>Cancel analysis</button>}
    <p className="truck-note">Cargo weight adjusts weather risk. It is not the truck’s gross weight.</p>
  </form>
}
