import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { colors, routeColors, time } from '../../lib/api'
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
    map.current.fitBounds(bounds, { padding: Math.min(56, map.current.getContainer().clientWidth * 0.1), duration: 800, maxZoom: 11 })
    // Fit on a new trip, not on each weather progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey, ready])

  useEffect(() => {
    if (!focusId || !map.current) return
    const point = plan?.routes.flatMap(route => route.checkpoints).find(point => point.id === focusId)
    if (point) map.current.flyTo({ center: [point.lon, point.lat], zoom: 9, duration: 800 })
  }, [focusId, plan])

  return <><div className="map-canvas" ref={container} aria-label="Map showing truck routes, weather checkpoints and forecast corridor" /><WindLayer mapRef={map} ready={ready} route={plan?.routes[selected]} hour={hour} weatherVisible={heatmap} />{mapError && <div className="map-error notice">Basemap unavailable. Route summaries and checkpoint forecasts remain available below.</div>}{!ready && <div className="map-loading"><span className="spinner" /> Loading map…</div>}</>
}

export function ForecastSlider({ departure, route, hour, setHour, heatmap, setHeatmap }: { departure?: string; route?: Route; hour: number; setHour: (hour: number) => void; heatmap: boolean; setHeatmap: (value: boolean) => void }) {
  const [playing, setPlaying] = useState(false)
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
    <div className="forecast-header"><div><span className="forecast-icon" aria-hidden="true">◷</span><div><h3>48-hour weather outlook</h3><p>{route ? 'Explore conditions along the selected route.' : 'Plan a trip to explore its hourly forecast.'}</p></div></div><button className={`layer-toggle ${heatmap ? 'enabled' : ''}`} type="button" aria-pressed={heatmap} onClick={() => { setPlaying(false); setHeatmap(!heatmap) }}><span>◉</span> Weather layer <i /></button></div>
    <div className="forecast-playback"><button className="forecast-play" type="button" disabled={!available} aria-label={playing ? 'Pause forecast animation' : 'Play 48-hour forecast'} onClick={() => { if (!playing && hour === 48) setHour(0); setHeatmap(true); setPlaying(!playing) }}>{playing ? 'Ⅱ Pause' : '▶ Play forecast'}</button><span>{route ? `${route.name} · ${hour} hours after departure` : 'Plan a trip to start'}</span></div>
    <div className="forecast-time"><span>{selectedTime ? `${selectedTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${time(selectedTime.toISOString())}` : 'Plan a trip to explore its forecast'}</span><strong>+{hour}h</strong></div>
    {forecast && <div className="forecast-readings" aria-live="polite"><span>Max wind <strong>{forecast.wind?.toFixed(1) ?? '—'} mph</strong></span><span>Max rain <strong>{forecast.rain?.toFixed(3) ?? '—'} in/hr</strong></span><span>Max snow <strong>{forecast.snow?.toFixed(3) ?? '—'} in/hr</strong></span><span>Highest risk <strong className="forecast-risk"><i style={{ background: colors[forecast.worst] }} />{forecast.worst}</strong></span></div>}
    {route && <><div className="forecast-chart-label">Wind outlook · tallest bar = strongest wind</div><div className="forecast-wind-chart" aria-label="Hourly maximum wind along the selected route">{Array.from({ length: 49 }, (_, index) => {
      const reading = corridorAt(route.checkpoints, index)
      return <button key={index} type="button" disabled={!reading.known} aria-label={`Hour ${index}: maximum wind ${reading.wind?.toFixed(1) ?? 'unavailable'} mph`} aria-pressed={index === hour} title={`+${index}h · ${reading.wind?.toFixed(1) ?? '—'} mph`} onClick={() => seek(index)}><i style={{ height: `${Math.max(8, Math.min(100, (reading.wind ?? 0) / 55 * 100))}%`, background: index === hour ? '#162b3a' : colors[reading.worst] }} /></button>
    })}</div></>}
    <input aria-label="Forecast hours after departure" type="range" min="0" max="48" step="1" value={hour} disabled={!departure} onChange={event => seek(Number(event.target.value))} />
    <div className="slider-ticks"><span>Departure</span><span>+12h</span><span>+24h</span><span>+36h</span><span>+48h</span></div>
    <details className="forecast-explainer"><summary>How this forecast relates to your route</summary><p>{forecast ? `${route?.name} · ${forecast.known}/${forecast.total} forecasts available. ${forecast.worst === 'Low' && forecast.known === forecast.total ? 'Conditions remain Low risk at this hour; readings can still change.' : 'Readings show maxima along this route at the selected hour.'} ` : ''}{heatmap ? 'Map dots and weather layer show the selected hour.' : 'Weather layer off; map dots show arrival-time weather.'} Route scores and the table keep arrival-time forecasts.</p></details>
  </section>
}
