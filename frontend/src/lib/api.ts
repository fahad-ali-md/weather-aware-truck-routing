import type { components } from './api.generated'

export type Risk = components['schemas']['Risk']
export type Level = Risk['level']
export type Forecast = components['schemas']['Forecast']
export type Checkpoint = components['schemas']['Checkpoint'] & Partial<Omit<Forecast, 'id'>>
export type Route = Omit<components['schemas']['Route'], 'checkpoints'> & { checkpoints: Checkpoint[]; summary?: components['schemas']['Summary'] }
export type Plan = Omit<components['schemas']['Plan'], 'routes'> & { routes: Route[]; recommended_index?: number | null }
export type TripInput = components['schemas']['TripInput']

export const levels: Level[] = ['Low', 'Moderate', 'High', 'Severe', 'No Travel', 'Unknown']
export const colors: Record<Level, string> = { Low: '#299b83', Moderate: '#d6a429', High: '#e78539', Severe: '#d55362', 'No Travel': '#8e384c', Unknown: '#94a3b8' }
export const routeColors = ['#347cdb', '#8167c6', '#dc9647']
export const unknownRisk: Risk = { level: 'Unknown', score: null, reason: 'Forecast unavailable' }

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}/`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}). Please retry.`)
  return result as T
}

export function time(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function duration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export async function analyze(input: TripInput, signal: AbortSignal, update: (plan: Plan, progress: string) => void): Promise<Plan> {
  const plan = await api<Plan>('routes', input, signal)
  update(structuredClone(plan), 'Routes found. Checking weather along the corridor…')
  // Share identical locations AND ETAs across overlapping routes; keep route checkpoint IDs.
  const groups = new Map<string, Checkpoint[]>()
  for (const point of plan.routes.flatMap(route => route.checkpoints)) {
    const key = `${point.lat.toFixed(4)},${point.lon.toFixed(4)},${point.eta}`
    groups.set(key, [...(groups.get(key) || []), point])
  }
  const points = [...groups.values()]
  let completed = 0
  const batches = Array.from({ length: Math.ceil(points.length / 12) }, (_, i) => points.slice(i * 12, i * 12 + 12))
  let weatherFailures = 0
  // Limit concurrency while allowing independent forecast batches to overlap.
  let next = 0
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++]
      try {
        const response = await api<{ checkpoints: Forecast[] }>('forecast', {
          departure: plan.departure, load_lb: plan.load_lb, checkpoints: batch.map(group => group[0]),
        }, signal)
        batch.forEach((group, i) => group.forEach(point => {
          const forecast = response.checkpoints[i]
          Object.assign(point, forecast, { id: point.id })
        }))
      } catch (error) {
        if (signal.aborted) throw error
        weatherFailures++
        batch.forEach(group => group.forEach(point => { point.risk = unknownRisk }))
      }
      completed += batch.length
      update(structuredClone(plan), `Weather checked at ${completed} of ${points.length} locations`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  if (weatherFailures) plan.warnings.push('Some forecasts could not be loaded. Affected routes cannot be recommended. Retry the trip to refresh them.')
  const ranked = await api<components['schemas']['Ranking']>('rank', {
    routes: plan.routes.map(route => ({ duration_seconds: route.duration_seconds,
      checkpoints: route.checkpoints.map(point => ({ represented_miles: point.represented_miles, risk: point.risk || unknownRisk })) })),
  }, signal)
  ranked.summaries.forEach((summary, index) => { plan.routes[index].summary = summary })
  plan.recommended_index = ranked.recommended_index
  return plan
}
