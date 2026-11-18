import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { colors, levels, routeColors, time } from '../../lib/api'
import type { Plan, Route } from '../../lib/api'
import { corridorAt, forecastAt, forecastWeight } from './forecast'
import { WindLayer } from './WindLayer'

// MapLibre 6 ships its worker separately. Let Vite bundle and serve its URL.
maplibregl.setWorkerUrl(mapWorkerUrl)

export function WeatherMap({ plan, selected, onSelect, focusId, hour, heatmap }: {
  plan: Plan | null; selected: number; onSelect: (index: number) => void; focusId: string | null; hour: number; heatmap: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const popup = useRef<maplibregl.Popup | null>(null)
  const [viewReset, setViewReset] = useState(0)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const latest = useRef({ plan, onSelect })
  useEffect(() => { latest.current = { plan, onSelect } }, [plan, onSelect])

  useEffect(() => {
    if (!container.current) return
    const instance = new maplibregl.Map({
      container: container.current, style: 'https://tiles.openfreemap.org/styles/positron',
      center: [-96.8, 38.4], zoom: 3.3, attributionControl: { compact: true },
    })
    map.current = instance
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    instance.addControl(new maplibregl.FullscreenControl({ container: container.current.closest<HTMLElement>('.map-section') ?? container.current }), 'top-right')
    const resize = new ResizeObserver(() => instance.resize())
    resize.observe(container.current)
    instance.on('error', event => { if (event.error.message.includes('style')) setMapError(true) })
    instance.on('load', () => {
      instance.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      instance.addSource('checkpoints', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      instance.addLayer({ id: 'corridor-heat', type: 'heatmap', source: 'checkpoints', paint: {
        'heatmap-weight': ['get', 'weight'], 'heatmap-intensity': 0.8,
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 24, 10, 65],
        'heatmap-opacity': 0.55,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(41,155,131,0)', 0.15, '#91cfac', 0.4, '#eacb63', 0.65, '#e78539', 0.85, '#d55362', 1, '#8e384c'],
      } })
      instance.addLayer({ id: 'route-outline', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['case', ['get', 'selected'], 9, 6], 'line-opacity': 0.9 } })
      instance.addLayer({ id: 'route-lines', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 5, 3], 'line-opacity': ['case', ['get', 'selected'], 1, 0.6] } })
      instance.addLayer({ id: 'route-hit', type: 'line', source: 'routes', paint: { 'line-width': 20, 'line-opacity': 0 } })
      instance.addLayer({ id: 'checkpoint-dots', type: 'circle', source: 'checkpoints', paint: { 'circle-radius': ['case', ['get', 'selected'], 5, 3], 'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })
      instance.addLayer({ id: 'endpoint-labels', type: 'symbol', source: 'checkpoints', filter: ['get', 'endpoint'], layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, -1.6], 'text-anchor': 'bottom', 'text-allow-overlap': true }, paint: { 'text-color': '#17312e', 'text-halo-color': '#fff', 'text-halo-width': 2 } })
      instance.on('click', 'route-hit', event => {
        const index = Number(event.features?.[0]?.properties?.index)
        if (Number.isInteger(index)) latest.current.onSelect(index)
      })
      instance.on('click', 'checkpoint-dots', event => {
        const props = event.features?.[0]?.properties
        if (!props) return
        const content = document.createElement('div')
        const title = document.createElement('strong')
        title.textContent = `${props.route} · Mile ${Number(props.mile).toFixed(1)}`
        content.append(title)
        const details = document.createElement('p')
        details.textContent = `${props.timeLabel} ${new Date(props.displayTime).toLocaleString()}\n${props.risk} · ${props.reason}\nWind ${props.wind} mph · Rain ${props.rain} in/hr · Snow ${props.snow} in/hr\nCheckpoint ETA ${new Date(props.eta).toLocaleString()}`
        details.style.whiteSpace = 'pre-line'
        content.append(details)
        popup.current?.remove()
        popup.current = new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(event.lngLat).setDOMContent(content).addTo(instance)
      })
      for (const layer of ['route-hit', 'checkpoint-dots']) {
        instance.on('mouseenter', layer, () => { instance.getCanvas().style.cursor = 'pointer' })
        instance.on('mouseleave', layer, () => { instance.getCanvas().style.cursor = '' })
      }
      setReady(true)
    })
    return () => { resize.disconnect(); popup.current?.remove(); instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return
    popup.current?.remove()
    const routes = (plan?.routes || []).map((route, index) => ({ type: 'Feature' as const, properties: { index, selected: selected === index, color: routeColors[index] }, geometry: { type: 'LineString' as const, coordinates: route.geometry } }))
    // Draw selected route last so it remains readable where alternatives overlap.
    routes.sort((a, b) => Number(a.properties.selected) - Number(b.properties.selected))
    ;(instance.getSource('routes') as GeoJSONSource).setData({ type: 'FeatureCollection', features: routes })
    const checkpoints = (plan?.routes || []).flatMap((route, index) => route.checkpoints.map((point, i) => {
      const weather = forecastAt(point, hour)
      const level = heatmap ? weather.level : point.risk?.level || 'Unknown'
      return { type: 'Feature' as const, properties: {
        selected: index === selected, color: colors[level], risk: level,
        weight: forecastWeight(weather),
        route: route.name, mile: point.mile, eta: point.eta,
        displayTime: heatmap && plan ? new Date(new Date(plan.departure).getTime() + hour * 3600000).toISOString() : point.eta,
        timeLabel: heatmap ? 'Forecast' : 'Arrival',
        wind: (heatmap ? weather.wind : point.wind_mph)?.toFixed(1) ?? '—', rain: (heatmap ? weather.rain : point.rain_in)?.toFixed(2) ?? '—', snow: (heatmap ? weather.snow : point.snow_in)?.toFixed(2) ?? '—',
        reason: heatmap ? `Departure +${hour}h` : point.risk?.reason || 'Forecast pending', endpoint: index === selected && (i === 0 || i === route.checkpoints.length - 1),
        label: i === 0 ? 'A · Origin' : 'B · Destination',
      }, geometry: { type: 'Point' as const, coordinates: [point.lon, point.lat] } }
    }))
    ;(instance.getSource('checkpoints') as GeoJSONSource).setData({ type: 'FeatureCollection', features: checkpoints })
    instance.setLayoutProperty('corridor-heat', 'visibility', heatmap ? 'visible' : 'none')
  }, [plan, selected, ready, hour, heatmap])

  const tripKey = plan ? `${plan.departure}:${plan.origin.lat}:${plan.destination.lon}` : ''
  useEffect(() => {
    if (!map.current || !ready || !plan) return
    const bounds = new maplibregl.LngLatBounds()
    plan.routes.forEach(route => route.geometry.forEach(point => bounds.extend([point[0], point[1]])))
    const height = map.current.getContainer().clientHeight
    const dock = container.current?.closest('.map-section')?.querySelector('.map-dock')?.getBoundingClientRect().height ?? 220
    map.current.fitBounds(bounds, { padding: { top: 120, bottom: Math.min(dock + 48, height * 0.48), left: 32, right: 64 }, duration: 800, maxZoom: 11 })
    // Fit on a new trip, not on each weather progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey, ready, viewReset])

  useEffect(() => {
    if (!focusId || !map.current) return
    const point = plan?.routes.flatMap(route => route.checkpoints).find(point => point.id === focusId)
    if (point) map.current.flyTo({ center: [point.lon, point.lat], zoom: 9, duration: 800 })
  }, [focusId, plan])

  return <><div className="map-canvas" ref={container} aria-label="Map showing truck routes, weather checkpoints and forecast corridor" /><button className="fit-route-button" type="button" disabled={!ready || !plan} onClick={() => setViewReset(value => value + 1)} aria-label="Fit all routes on the map" title="Fit routes"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg></button><WindLayer mapRef={map} ready={ready} route={plan?.routes[selected]} hour={hour} weatherVisible={heatmap} />{mapError && <div className="map-error notice">Basemap unavailable. Route summaries and checkpoint forecasts remain available below.</div>}{!ready && <div className="map-loading"><span className="spinner" /> Loading map…</div>}</>
}

export function ForecastSlider({ departure, route, hour, setHour, heatmap, setHeatmap }: { departure?: string; route?: Route; hour: number; setHour: (hour: number) => void; heatmap: boolean; setHeatmap: (value: boolean) => void }) {
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const selectedTime = departure ? new Date(new Date(departure).getTime() + hour * 3600000) : null
  const forecast = route ? corridorAt(route.checkpoints, hour) : null
  const available = !!departure && !!forecast?.known
  useEffect(() => {
    if (!playing || !heatmap || !available) return
    const timer = window.setTimeout(() => {
      setHour(Math.min(48, hour + 1))
      if (hour >= 47) setPlaying(false)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [playing, heatmap, available, hour, setHour])
  function seek(next: number) {
    setPlaying(false)
    setHour(next)
    setHeatmap(true)
  }
  return <section className={`forecast-panel ${route ? 'has-route' : 'is-empty'}`} aria-label="48 hour corridor weather forecast">
    <div className="forecast-summary">
      <div className="forecast-summary-title"><span className="forecast-live-dot" /><h3>Weather along your route</h3><span className="forecast-route-name">{route?.name ?? '48-hour outlook'}</span></div>
      {forecast ? <div className="forecast-readings" aria-live="polite"><div><span>Max wind</span><strong>{forecast.wind?.toFixed(1) ?? '—'} <small>mph</small></strong></div><div><span>Max rain</span><strong>{forecast.rain?.toFixed(3) ?? '—'} <small>in/hr</small></strong></div><div><span>Max snow</span><strong>{forecast.snow?.toFixed(3) ?? '—'} <small>in/hr</small></strong></div><div><span>Highest risk</span><strong className="forecast-risk"><i style={{ background: colors[forecast.worst] }} />{forecast.worst}</strong></div></div> : <p className="forecast-empty">Enter your stops to unlock arrival-time weather and a 48-hour forecast.</p>}
    </div>
    {route && <div className="forecast-timeline">
      <div className="timeline-heading"><div><span className="timeline-label">FORECAST TIMELINE</span><span className="timeline-date">{selectedTime ? `${selectedTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${time(selectedTime.toISOString())}` : 'Forecast pending'}<b>+{hour}h</b></span></div><button className={`layer-toggle ${heatmap ? 'enabled' : ''}`} type="button" aria-pressed={heatmap} onClick={() => { setPlaying(false); setHeatmap(!heatmap) }}>Weather layer <i /></button></div>
      <div className="timeline-track"><button className="forecast-play" type="button" disabled={!available} aria-label={playing ? 'Pause forecast animation' : 'Play 48-hour forecast'} onClick={() => { if (!playing && hour === 48) setHour(0); setHeatmap(true); setPlaying(!playing) }}>{playing ? 'Ⅱ' : '▶'}</button><div className="timeline-scrubber">
        <div className="forecast-wind-chart" aria-label="Hourly maximum wind along the selected route">{Array.from({ length: 49 }, (_, index) => {
          const reading = corridorAt(route.checkpoints, index)
          return <button key={index} type="button" tabIndex={-1} disabled={!reading.known} aria-label={`Hour ${index}: maximum wind ${reading.wind?.toFixed(1) ?? 'unavailable'} mph`} aria-pressed={index === hour} title={`+${index}h · ${reading.wind?.toFixed(1) ?? '—'} mph`} onClick={() => seek(index)}><i style={{ height: `${Math.max(10, Math.min(100, (reading.wind ?? 0) / 55 * 100))}%`, background: index === hour ? '#b8f2df' : colors[reading.worst] }} /></button>
        })}</div>
        <input aria-label="Forecast hours after departure" type="range" min="0" max="48" step="1" value={hour} disabled={!departure} onChange={event => seek(Number(event.target.value))} />
        <div className="slider-ticks"><span>Departure</span><span>+12h</span><span>+24h</span><span>+36h</span><span>+48h</span></div>
      </div></div>
      <div className="timeline-footer"><span>{heatmap ? `Map weather · departure +${hour}h` : 'Map weather · arrival time'}</span><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide details ↑' : 'Forecast details ↓'}</button></div>
      {expanded && <div className="forecast-details"><div className="map-legend" aria-label="Weather risk legend">{levels.map(level => <span key={level}><i style={{ background: colors[level] }} />{level}</span>)}</div><p>{forecast?.known}/{forecast?.total} checkpoints have weather at this hour. Bars show maximum wind. {heatmap ? 'Map dots and wind animation follow the selected hour.' : 'Map dots show weather at checkpoint arrival.'} Route rankings and the table always use arrival-time forecasts.</p></div>}
    </div>}
  </section>
}
