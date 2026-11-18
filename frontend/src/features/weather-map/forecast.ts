import type { Checkpoint, Level } from '../../lib/api'

const riskLevels: Level[] = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']

export function formatPrecipitation(value: number | null) {
  if (value === null) return '—'
  if (value > 0 && value < 0.0005) return '<0.001'
  return value.toFixed(3)
}

export function forecastAt(point: Checkpoint, hour: number) {
  const frame = point.frames?.[hour]
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  const level = riskLevels.includes(frame?.[3] as Level) ? frame[3] as Level : 'Unknown'
  return {
    wind: number(frame?.[0]), rain: number(frame?.[1]), snow: number(frame?.[2]), level,
  }
}

export function forecastWeight(weather: ReturnType<typeof forecastAt>) {
  if (weather.level === 'Unknown') return 0
  // Preserve changes within a risk band rather than giving all Low hours the same weight.
  return 0.05 + 0.95 * Math.min(1, Math.max(
    (weather.wind ?? 0) / 55, weather.rain ?? 0, (weather.snow ?? 0) / 3,
  ))
}

export function corridorAt(points: Checkpoint[], hour: number) {
  const samples = points.map(point => forecastAt(point, hour))
  const max = (key: 'wind' | 'rain' | 'snow') => {
    const values = samples.map(sample => sample[key]).filter((value): value is number => value !== null)
    return values.length ? Math.max(...values) : null
  }
  const known = samples.filter(sample => sample.level !== 'Unknown')
  const worst = known.reduce<Level>((level, sample) => riskLevels.indexOf(sample.level) > riskLevels.indexOf(level) ? sample.level : level, 'Unknown')
  return { wind: max('wind'), rain: max('rain'), snow: max('snow'), worst, known: known.length, total: samples.length }
}
