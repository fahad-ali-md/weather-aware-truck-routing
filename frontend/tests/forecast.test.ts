import assert from 'node:assert/strict'
import test from 'node:test'
import { corridorAt, forecastAt, forecastWeight, formatPrecipitation } from '../src/features/weather-map/forecast.ts'
import type { Checkpoint } from '../src/lib/api'

function point(frames: Checkpoint['frames']): Checkpoint {
  return { id: 'a', lat: 40, lon: -80, mile: 0, represented_miles: 5, eta: '2026-11-18T10:00:00Z', frames }
}

test('small nonzero precipitation never displays as zero', () => {
  assert.equal(formatPrecipitation(0), '0.000')
  assert.equal(formatPrecipitation(0.0003), '<0.001')
  assert.equal(formatPrecipitation(0.0123), '0.012')
  assert.equal(formatPrecipitation(null), '—')
})

test('slider selects hourly readings rather than the arrival forecast', () => {
  const checkpoint = point([[8, 0, 0, 'Low'], [19, 0.01, 0, 'Low'], [40, 0.3, 0, 'High']])
  assert.deepEqual(forecastAt(checkpoint, 1), { wind: 19, rain: 0.01, snow: 0, level: 'Low' })
  assert.equal(forecastAt(checkpoint, 2).level, 'High')
  assert.ok(forecastWeight(forecastAt(checkpoint, 1)) > forecastWeight(forecastAt(checkpoint, 0)))
})

test('missing hour stays unknown and does not fall back to arrival weather', () => {
  const checkpoint = point([[8, 0, 0, 'Low']])
  assert.equal(forecastAt(checkpoint, 48).level, 'Unknown')
  assert.equal(forecastWeight(forecastAt(checkpoint, 48)), 0)
  assert.equal(corridorAt([checkpoint], 48).wind, null)
})

test('route summary uses selected-hour maxima and reports incomplete coverage', () => {
  const checkpoints = [point([[10, 0, 0, 'Low'], [26, 0.2, 0, 'Moderate']]), point([[15, 0.1, 0, 'Moderate'], [44, 0.1, 0.2, 'High']]), point([])]
  assert.deepEqual(corridorAt(checkpoints, 1), { wind: 44, rain: 0.2, snow: 0.2, worst: 'High', known: 2, total: 3 })
  assert.equal(corridorAt(checkpoints, 0).wind, 15)
})

test('forecast inspection does not mutate ETA risk or ranking data', () => {
  const checkpoint = { ...point([[40, 0, 0, 'High']]), risk: { level: 'Low' as const, score: 0, reason: 'ETA' }, wind_mph: 5 }
  const original = structuredClone(checkpoint)
  forecastAt(checkpoint, 0)
  corridorAt([checkpoint], 0)
  assert.deepEqual(checkpoint, original)
})
