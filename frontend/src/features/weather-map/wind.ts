import type { Checkpoint } from '../../lib/api'

export function windVector(speed: unknown, direction: unknown) {
  if (typeof speed !== 'number' || typeof direction !== 'number' || !Number.isFinite(speed) || !Number.isFinite(direction) || speed < 0) return null
  const radians = direction * Math.PI / 180
  // Meteorological direction is where wind comes FROM; particles travel the opposite way.
  return { east: -speed * Math.sin(radians), north: -speed * Math.cos(radians) }
}

export function windSamples(points: Checkpoint[], hour: number) {
  return points.flatMap(point => {
    const frame = point.frames?.[hour]
    const vector = windVector(frame?.[0], frame?.[4])
    return vector && Math.hypot(vector.east, vector.north) >= 0.5
      ? [{ lon: point.lon, lat: point.lat, ...vector }] : []
  })
}
